// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Thumbnails the system makes (#442), for the files the app can't picture itself (thumbnails.rs):
//! videos without a cover picture, and HEIC, AVIF or raw photos without their own preview. No
//! video decoder is bundled; each system's own thumbnailers do it, as its file manager shows them:
//!
//! - Linux and the BSDs: the freedesktop thumbnail cache (`~/.cache/thumbnails`), when the file
//!   manager has made one for the file as it is now; else the thumbnailers installed under
//!   `share/thumbnailers` (ffmpegthumbnailer, totem's, gdk-pixbuf's with libheif and the like),
//!   run as the file manager would, for at most fifteen seconds.
//! - macOS: Quick Look (`qlmanage -t`).
//! - Windows: the Shell's thumbnail factory (IShellItemImageFactory), as Explorer shows them.
//!
//! None when the system has none for the file. The pictures go no further than thumbnails.rs,
//! which shrinks them and keeps them in the app's cache.
//!
//! The thumbnailers parse the file with the system's decoders, outside any sandbox, so they are
//! run only when thumbnails.rs says the user chose the file (`run`). Otherwise only a thumbnail
//! the file manager already keeps is used (Linux), read by this app.
use image::DynamicImage;
use std::path::Path;

/// The side asked of the system: more than a thumbnail's, so it can be shrunk.
#[allow(dead_code)]
const ASKED: u32 = 256;
/// The longest a system thumbnailer may take.
#[allow(dead_code)]
const MOST_SECONDS: u64 = 15;

/// The system's thumbnail of `path`, upright as the system shows it; made by its thumbnailers
/// only when `run`.
pub fn thumbnail(path: &Path, run: bool) -> Option<DynamicImage> {
    platform::thumbnail(path, run)
}

/// Runs `command` to its end, or kills it after MOST_SECONDS: whether it succeeded.
#[allow(dead_code)]
fn run(command: &mut std::process::Command) -> bool {
    use std::process::Stdio;
    use std::time::{Duration, Instant};
    let Ok(mut child) = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let until = Instant::now() + Duration::from_secs(MOST_SECONDS);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}
/// A new, empty folder for one thumbnailer's output, removed when dropped: readable only by the
/// user (0700 on Unix), since the thumbnail shows one of the user's pictures, and named
/// unpredictably, so another user can't take the name first and make thumbnails fail.
#[allow(dead_code)]
struct Scratch(std::path::PathBuf);
#[allow(dead_code)]
impl Scratch {
    fn new() -> Option<Self> {
        use std::hash::{BuildHasher, Hasher};
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        // A few tries, should a name somehow be taken.
        for _ in 0..4 {
            // RandomState's keys are random for each process, and hashing the counter and the
            // time with them gives a name no one else can guess.
            let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
            hasher.write_u64(NEXT.fetch_add(1, Ordering::Relaxed));
            hasher.write_u128(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_nanos()),
            );
            let dir = std::env::temp_dir().join(format!(
                "oc-thumbnail-{}-{:016x}",
                std::process::id(),
                hasher.finish()
            ));
            let mut builder = std::fs::DirBuilder::new();
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            if builder.create(&dir).is_ok() {
                return Some(Self(dir));
            }
        }
        None
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use super::{run, Scratch, ASKED};
    use image::DynamicImage;
    use md5::{Digest, Md5};
    use reqwest::Url;
    use std::{
        env, fs,
        path::{Path, PathBuf},
        process::Command,
        time::UNIX_EPOCH,
    };

    pub fn thumbnail(path: &Path, run: bool) -> Option<DynamicImage> {
        let home = env::var_os("HOME").map(PathBuf::from);
        let cache = env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| home.as_ref().map(|h| h.join(".cache")))?;
        found(
            &cache.join("thumbnails"),
            &thumbnailer_dirs(home.as_deref()),
            path,
            run,
        )
    }
    /// The thumbnail a file manager kept under `root`, or else, when `run`, one made by a
    /// thumbnailer described in `dirs`.
    pub(super) fn found(
        root: &Path,
        dirs: &[PathBuf],
        path: &Path,
        run: bool,
    ) -> Option<DynamicImage> {
        let uri = Url::from_file_path(path).ok()?.to_string();
        let modified = fs::metadata(path)
            .ok()?
            .modified()
            .ok()?
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_secs();
        cached(root, &uri, modified).or_else(|| run.then(|| made(dirs, path, &uri)).flatten())
    }

    /// Where thumbnailers are described: `thumbnailers` in XDG_DATA_HOME, then in each of
    /// XDG_DATA_DIRS, as the freedesktop specifications have them.
    fn thumbnailer_dirs(home: Option<&Path>) -> Vec<PathBuf> {
        let data_home = env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| home.map(|h| h.join(".local/share")));
        let data_dirs = env::var("XDG_DATA_DIRS")
            .ok()
            .filter(|dirs| !dirs.is_empty())
            .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
        data_home
            .into_iter()
            .chain(env::split_paths(&data_dirs))
            .map(|dir| dir.join("thumbnailers"))
            .collect()
    }

    /// The thumbnail a file manager kept for `uri` under `root` (`~/.cache/thumbnails`), the
    /// largest first, if it was made of the file as it is now: its Thumb::URI and Thumb::MTime
    /// say so.
    pub(super) fn cached(root: &Path, uri: &str, modified: u64) -> Option<DynamicImage> {
        let name = format!("{:x}.png", Md5::digest(uri.as_bytes()));
        ["xx-large", "x-large", "large", "normal"]
            .iter()
            .find_map(|size| {
                let png = fs::read(root.join(size).join(&name)).ok()?;
                let text = png_text(&png);
                let current = text.iter().any(|(k, v)| k == "Thumb::URI" && v == uri)
                    && text
                        .iter()
                        .any(|(k, v)| k == "Thumb::MTime" && v.parse() == Ok(modified));
                current
                    .then(|| image::load_from_memory(&png).ok())
                    .flatten()
            })
    }
    /// A PNG's tEXt chunks, as (keyword, text).
    fn png_text(png: &[u8]) -> Vec<(String, String)> {
        let mut found = Vec::new();
        if !png.starts_with(b"\x89PNG\r\n\x1a\n") {
            return found;
        }
        let mut at = 8;
        while let Some(head) = png.get(at..at + 8) {
            let length = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as usize;
            let Some(data) = png.get(at + 8..at + 8 + length) else {
                break;
            };
            match &head[4..] {
                b"tEXt" => {
                    if let Some(nul) = data.iter().position(|b| *b == 0) {
                        found.push((
                            String::from_utf8_lossy(&data[..nul]).into_owned(),
                            String::from_utf8_lossy(&data[nul + 1..]).into_owned(),
                        ));
                    }
                }
                // The text that matters comes before the picture's data.
                b"IDAT" | b"IEND" => break,
                _ => {}
            }
            at += 12 + length;
        }
        found
    }

    /// A thumbnail made by the first thumbnailer in `dirs` (`*.thumbnailer` files) that takes
    /// this kind of file and is installed.
    pub(super) fn made(dirs: &[PathBuf], path: &Path, uri: &str) -> Option<DynamicImage> {
        let names = mime_types(path)?;
        for dir in dirs {
            let Ok(entries) = fs::read_dir(dir) else {
                continue;
            };
            let mut files: Vec<PathBuf> = entries
                .filter_map(|entry| Some(entry.ok()?.path()))
                .filter(|file| file.extension().is_some_and(|e| e == "thumbnailer"))
                .collect();
            files.sort();
            for file in files {
                let Some(entry) = fs::read_to_string(&file).ok().and_then(|t| parse_entry(&t))
                else {
                    continue;
                };
                let takes = entry.mime_types.iter().any(|m| names.contains(&m.as_str()));
                if !takes || !installed(&entry.try_exec) {
                    continue;
                }
                let scratch = Scratch::new()?;
                let output = scratch.0.join("thumbnail.png");
                let Some(args) = command_line(&entry.exec, path, uri, &output) else {
                    continue;
                };
                if run(Command::new(&args[0]).args(&args[1..])) {
                    if let Ok(picture) = image::open(&output) {
                        return Some(picture);
                    }
                }
            }
        }
        None
    }
    /// What a `.thumbnailer` file's [Thumbnailer Entry] says.
    pub(super) struct Entry {
        pub(super) try_exec: String,
        pub(super) exec: String,
        pub(super) mime_types: Vec<String>,
    }
    pub(super) fn parse_entry(text: &str) -> Option<Entry> {
        let mut section = false;
        let (mut try_exec, mut exec, mut mime_types) = (None, None, Vec::new());
        for line in text.lines().map(str::trim) {
            if line.starts_with('[') {
                section = line == "[Thumbnailer Entry]";
            } else if let (true, Some((key, value))) = (section, line.split_once('=')) {
                match key.trim() {
                    "TryExec" => try_exec = Some(value.trim().to_string()),
                    "Exec" => exec = Some(value.trim().to_string()),
                    "MimeType" => {
                        mime_types = value
                            .split(';')
                            .map(str::trim)
                            .filter(|m| !m.is_empty())
                            .map(String::from)
                            .collect()
                    }
                    _ => {}
                }
            }
        }
        let exec = exec?;
        Some(Entry {
            try_exec: try_exec.unwrap_or_else(|| {
                exec.split_whitespace()
                    .next()
                    .unwrap_or_default()
                    .to_string()
            }),
            exec,
            mime_types,
        })
    }
    /// Whether a program is installed: a path that exists, or a name found on PATH.
    fn installed(program: &str) -> bool {
        if program.is_empty() {
            return false;
        }
        if program.contains('/') {
            return Path::new(program).is_file();
        }
        env::var_os("PATH")
            .is_some_and(|paths| env::split_paths(&paths).any(|dir| dir.join(program).is_file()))
    }
    /// An Exec line as arguments, double-quoted ones kept whole, with its field codes filled
    /// in: %i the file, %u its URI, %o where the thumbnail goes, %s its size, %% a percent.
    /// None when it names no program or has an unknown code.
    pub(super) fn command_line(
        exec: &str,
        path: &Path,
        uri: &str,
        output: &Path,
    ) -> Option<Vec<std::ffi::OsString>> {
        let mut args = Vec::new();
        let (mut current, mut quoted, mut started) = (std::ffi::OsString::new(), false, false);
        let mut chars = exec.chars();
        while let Some(c) = chars.next() {
            match c {
                '"' => {
                    quoted = !quoted;
                    started = true;
                }
                '\\' if quoted => current.push(chars.next()?.to_string()),
                c if c.is_whitespace() && !quoted => {
                    if started {
                        args.push(std::mem::take(&mut current));
                        started = false;
                    }
                }
                '%' => {
                    started = true;
                    match chars.next()? {
                        'i' => current.push(path.as_os_str()),
                        'u' => current.push(uri),
                        'o' => current.push(output.as_os_str()),
                        's' => current.push(ASKED.to_string()),
                        '%' => current.push("%"),
                        _ => return None,
                    }
                }
                c => {
                    current.push(c.to_string());
                    started = true;
                }
            }
        }
        if started {
            args.push(current);
        }
        (!args.is_empty()).then_some(args)
    }
    /// The MIME types thumbnailers may know a file by, from its extension (a type and its
    /// aliases, as thumbnailers list one or another): the videos and photos the app can't picture
    /// itself.
    pub(super) fn mime_types(path: &Path) -> Option<&'static [&'static str]> {
        let extension = path.extension()?.to_str()?.to_ascii_lowercase();
        Some(match extension.as_str() {
            "mp4" => &["video/mp4"],
            "m4v" => &["video/x-m4v", "video/mp4"],
            "mov" => &["video/quicktime"],
            "3gp" => &["video/3gpp"],
            "mkv" => &["video/x-matroska", "video/matroska"],
            "webm" => &["video/webm"],
            "avi" => &["video/x-msvideo", "video/avi", "video/vnd.avi"],
            "heic" | "heif" => &["image/heif", "image/heic"],
            "avif" => &["image/avif"],
            "dng" => &["image/x-adobe-dng"],
            "cr2" => &["image/x-canon-cr2"],
            "cr3" => &["image/x-canon-cr3"],
            "nef" => &["image/x-nikon-nef"],
            "arw" => &["image/x-sony-arw"],
            "raf" => &["image/x-fuji-raf"],
            "orf" => &["image/x-olympus-orf"],
            "rw2" => &["image/x-panasonic-rw2"],
            "iiq" => &["image/x-phaseone-iiq"],
            "tif" | "tiff" => &["image/tiff"],
            _ => return None,
        })
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{run, Scratch, ASKED};
    use image::DynamicImage;
    use std::{path::Path, process::Command};

    /// Quick Look's thumbnail, which qlmanage writes as `<file name>.png` in the folder given;
    /// None unless `run`.
    pub fn thumbnail(path: &Path, run: bool) -> Option<DynamicImage> {
        if !run {
            return None;
        }
        let scratch = Scratch::new()?;
        let made = run(Command::new("/usr/bin/qlmanage")
            .arg("-t")
            .arg("-s")
            .arg(ASKED.to_string())
            .arg("-o")
            .arg(&scratch.0)
            .arg(path));
        if !made {
            return None;
        }
        let mut name = path.file_name()?.to_os_string();
        name.push(".png");
        image::open(scratch.0.join(name)).ok()
    }
}

#[cfg(windows)]
mod platform {
    use super::ASKED;
    use image::{DynamicImage, RgbImage};
    use std::{ffi::c_void, mem::size_of, path::Path};
    use windows::{
        core::HSTRING,
        Win32::{
            Foundation::SIZE,
            Graphics::Gdi::{
                DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
                BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
            },
            System::Com::{CoInitializeEx, COINIT_MULTITHREADED},
            UI::Shell::{
                IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK,
                SIIGBF_THUMBNAILONLY,
            },
        },
    };

    /// The Shell's thumbnail, as Explorer shows it; never the file type's icon. None unless
    /// `run`: the Shell's thumbnail handlers decode the file in this process.
    pub fn thumbnail(path: &Path, run: bool) -> Option<DynamicImage> {
        if !run {
            return None;
        }
        unsafe {
            // Each thread that asks joins the multithreaded apartment; joining again is harmless.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(&HSTRING::from(path.as_os_str()), None).ok()?;
            let size = SIZE {
                cx: ASKED as i32,
                cy: ASKED as i32,
            };
            let bitmap = factory
                .GetImage(size, SIIGBF_THUMBNAILONLY | SIIGBF_BIGGERSIZEOK)
                .ok()?;
            let picture = pixels(bitmap);
            let _ = DeleteObject(bitmap.into());
            picture
        }
    }
    /// A bitmap's pixels: 32-bit BGRA with premultiplied alpha, laid over white.
    unsafe fn pixels(bitmap: HBITMAP) -> Option<DynamicImage> {
        let mut info = BITMAP::default();
        let read = GetObjectW(
            bitmap.into(),
            size_of::<BITMAP>() as i32,
            Some(&mut info as *mut BITMAP as *mut c_void),
        );
        if read == 0 || info.bmWidth <= 0 || info.bmHeight == 0 {
            return None;
        }
        let (width, height) = (info.bmWidth, info.bmHeight.abs());
        let mut header = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                // Negative: rows from the top.
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bgra = vec![0u8; width as usize * height as usize * 4];
        let dc = GetDC(None);
        let rows = GetDIBits(
            dc,
            bitmap,
            0,
            height as u32,
            Some(bgra.as_mut_ptr() as *mut c_void),
            &mut header,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, dc);
        if rows == 0 {
            return None;
        }
        // An opaque thumbnail may leave alpha at zero throughout: then it is opaque.
        let alpha = bgra.chunks(4).any(|p| p[3] != 0);
        let rgb = bgra
            .chunks(4)
            .flat_map(|p| {
                let under = if alpha { 255 - p[3] } else { 0 };
                [
                    p[2].saturating_add(under),
                    p[1].saturating_add(under),
                    p[0].saturating_add(under),
                ]
            })
            .collect();
        RgbImage::from_raw(width as u32, height as u32, rgb).map(DynamicImage::ImageRgb8)
    }
}

#[cfg(test)]
mod tests {
    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn freedesktop_thumbnails_kept_and_made() {
        use super::platform::{cached, command_line, found, made, mime_types, parse_entry};
        use image::{codecs::png::PngEncoder, ImageEncoder, Rgb, RgbImage};
        use md5::{Digest, Md5};
        use std::{fs, os::unix::fs::PermissionsExt, path::Path};

        let dir = std::env::temp_dir().join(format!("oc-system-thumbs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let png = |color: [u8; 3], text: &[(&str, &str)]| {
            let mut out = Vec::new();
            PngEncoder::new(&mut out)
                .write_image(
                    &RgbImage::from_pixel(64, 48, Rgb(color)),
                    64,
                    48,
                    image::ExtendedColorType::Rgb8,
                )
                .unwrap();
            // tEXt chunks after IHDR (8 + 25 bytes), as GLib writes them.
            let mut chunks = Vec::new();
            for (key, value) in text {
                let data = [key.as_bytes(), b"\0", value.as_bytes()].concat();
                chunks.extend((data.len() as u32).to_be_bytes());
                chunks.extend(b"tEXt");
                chunks.extend(&data);
                chunks.extend([0u8; 4]);
            }
            [&out[..33], &chunks, &out[33..]].concat()
        };

        // Kept by a file manager: used while its URI and modification time match.
        let uri = "file:///home/someone/clip.mp4";
        let root = dir.join("thumbnails");
        fs::create_dir_all(root.join("large")).unwrap();
        let name = format!("{:x}.png", Md5::digest(uri.as_bytes()));
        fs::write(
            root.join("large").join(&name),
            png(
                [30, 30, 200],
                &[("Thumb::URI", uri), ("Thumb::MTime", "1700000000")],
            ),
        )
        .unwrap();
        assert!(cached(&root, uri, 1_700_000_000).is_some());
        assert!(
            cached(&root, uri, 1_700_000_001).is_none(),
            "the file changed since"
        );
        assert!(cached(&root, "file:///other.mp4", 1_700_000_000).is_none());

        // Made by an installed thumbnailer, as its Exec line says.
        let entry = parse_entry(
            "[Thumbnailer Entry]\nTryExec=/bin/sh\nExec=sh -c \"cp \\\"$0\\\" \\\"$1\\\"\" %i %o\nMimeType=video/mp4;video/quicktime;\n",
        )
        .unwrap();
        assert_eq!(entry.mime_types, ["video/mp4", "video/quicktime"]);
        assert_eq!(entry.try_exec, "/bin/sh");
        let args = command_line(
            &entry.exec,
            Path::new("/a b/clip.mp4"),
            uri,
            Path::new("/out.png"),
        )
        .unwrap();
        assert_eq!(
            args,
            ["sh", "-c", "cp \"$0\" \"$1\"", "/a b/clip.mp4", "/out.png"]
                .map(std::ffi::OsString::from)
        );
        assert!(command_line("thumb %x", Path::new("/a"), uri, Path::new("/b")).is_none());
        // HEIC as libheif's thumbnailer lists it, image/heif.
        assert!(mime_types(Path::new("/x/IMG_1.HEIC"))
            .unwrap()
            .contains(&"image/heif"));
        assert_eq!(mime_types(Path::new("/x/a.txt")), None);

        // A "thumbnailer" that copies a red picture, for MP4 videos only.
        let thumbnailers = dir.join("share/thumbnailers");
        fs::create_dir_all(&thumbnailers).unwrap();
        let red = dir.join("red.png");
        fs::write(&red, png([200, 30, 30], &[])).unwrap();
        let script = dir.join("fake-thumbnailer");
        fs::write(
            &script,
            format!("#!/bin/sh\ncp '{}' \"$2\"\n", red.display()),
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(
            thumbnailers.join("fake.thumbnailer"),
            format!(
                "[Thumbnailer Entry]\nTryExec={0}\nExec={0} %i %o %s\nMimeType=video/mp4;\n",
                script.display()
            ),
        )
        .unwrap();
        // One whose program is missing is passed over.
        fs::write(
            thumbnailers.join("absent.thumbnailer"),
            "[Thumbnailer Entry]\nTryExec=/nonexistent/thumbnailer\nExec=/nonexistent/thumbnailer %i %o\nMimeType=video/mp4;\n",
        )
        .unwrap();
        let clip = dir.join("clip.mp4");
        fs::write(&clip, b"not really a video").unwrap();
        let picture = made(std::slice::from_ref(&thumbnailers), &clip, uri).unwrap();
        assert_eq!(picture.to_rgb8().get_pixel(10, 10).0, [200, 30, 30]);
        // Run only for a file the user chose; otherwise only a kept thumbnail is used.
        let dirs = std::slice::from_ref(&thumbnailers);
        assert!(found(&root, dirs, &clip, false).is_none());
        assert!(found(&root, dirs, &clip, true).is_some());
        // Not for a kind it doesn't take.
        let film = dir.join("film.mkv");
        fs::write(&film, b"not really a video").unwrap();
        assert!(made(&[thumbnailers], &film, uri).is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    /// Scratch folders are the user's alone, and each has its own name.
    #[cfg(unix)]
    #[test]
    fn scratch_folders_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let (a, b) = (
            super::Scratch::new().unwrap(),
            super::Scratch::new().unwrap(),
        );
        assert_ne!(a.0, b.0);
        let mode = std::fs::metadata(&a.0).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700);
        let path = a.0.clone();
        drop(a);
        assert!(!path.exists());
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn the_system_makes_thumbnails() {
        use image::{DynamicImage, GenericImageView, Rgb, RgbImage};
        let dir = std::env::temp_dir().join(format!("oc-system-thumbs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // A picture every system's thumbnailer takes.
        let file = dir.join("wide.png");
        DynamicImage::ImageRgb8(RgbImage::from_pixel(600, 300, Rgb([30, 160, 30])))
            .save(&file)
            .unwrap();
        assert!(
            super::thumbnail(&file, false).is_none(),
            "only for files the user chose"
        );
        let picture = super::thumbnail(&file, true).expect("the system's thumbnail");
        let (width, height) = picture.dimensions();
        assert!(width > height, "{width}×{height}");
        let Rgb([r, g, b]) = *picture.to_rgb8().get_pixel(width / 2, height / 2);
        assert!(g > 100 && r < 100 && b < 100, "{r},{g},{b}");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
