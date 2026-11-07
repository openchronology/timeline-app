// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Thumbnails of photos and videos on this computer (#440, #442), for moments whose source is
//! one (#433): a small JPEG, turned the way the photo says it was taken, as a `data:` URL the page
//! shows as the moment's marker (the desktop's content policy allows `data:` images and no local
//! files).
//!
//! A photo's thumbnail is its own EXIF thumbnail where it has one (most cameras' and phones'
//! JPEGs and many raw files do), or else the photo scaled down. A video's is the cover picture
//! it carries, where it has one. Failing those (videos, and HEIC, AVIF or raw photos this app
//! can't decode), the system makes one (system_thumbnails.rs). They are kept in the app's cache
//! folder, named by a hash of the file's path, size and modification time, so a changed file
//! gets a new one. They are never sent anywhere: the page holds them only to draw them.
//!
//! Timelines come from anyone, and name whatever files they like, so the system's thumbnailers
//! (separate programs with decoders for every format, run with the user's rights) are used only
//! for files the user chose: in folders the user populated a timeline from, or in a timeline the
//! user trusted by opening one of its files. Other files get only what this app reads itself, in
//! Rust, and thumbnails a file manager already keeps.
//!
//! The cache folder is the user's alone (0700 on Unix) and so are its thumbnails (0600), as the
//! freedesktop thumbnail specification asks, since they show the user's private pictures.
use base64::Engine;
use image::{codecs::jpeg::JpegEncoder, DynamicImage, ImageFormat, ImageReader, Limits};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// The longest side of a thumbnail, in pixels: twice a large marker's 32 CSS pixels, and more.
const SIDE: u32 = 160;
/// The largest photo scaled down; a bigger one has no thumbnail unless it carries its own.
const MOST_BYTES: u64 = 256 * 1024 * 1024;
/// The most thumbnails asked for at once.
pub const MOST_AT_ONCE: usize = 64;

/// The largest cover picture read from a video.
const MOST_COVER_BYTES: u64 = 16 * 1024 * 1024;

/// The photo or video a `file:` link names, when a thumbnail can be made of it: an existing
/// regular file with a photo's or a video's extension (populate::kind), and which it is.
fn picturable(link: &str) -> Option<(PathBuf, fs::Metadata, &'static str)> {
    let path = fs::canonicalize(crate::populate::local_path(link).ok()?).ok()?;
    let metadata = fs::metadata(&path).ok()?;
    let kind = crate::populate::kind(&path);
    (metadata.is_file() && (kind == "photo" || kind == "video")).then_some((path, metadata, kind))
}
/// The cache file of a photo's thumbnail: FNV-1a of its path, size and modification time.
fn cache_name(path: &Path, metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let bytes = path.as_os_str().as_encoded_bytes().iter().copied();
    for byte in bytes
        .chain(metadata.len().to_le_bytes())
        .chain(modified.to_le_bytes())
    {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}.jpg")
}
/// Whether `path` (canonical) is in one of `folders` (canonical), or is one: the folders and
/// files the user populated timelines from, whose files the system's thumbnailers may read.
pub fn chosen(path: &Path, folders: &[PathBuf]) -> bool {
    folders.iter().any(|folder| path.starts_with(folder))
}
/// The thumbnail of the photo or video `link` names, as a `data:image/jpeg;base64,…` URL, from
/// `cache` or made and kept there; None when it isn't one on this computer or none can be made.
/// `system` says whether the system's thumbnailers may be run on the file (its canonical path):
/// only for files the user chose. A thumbnail not made for want of them isn't remembered, so it
/// is made once they may be run.
pub fn thumbnail(cache: &Path, link: &str, system: &dyn Fn(&Path) -> bool) -> Option<String> {
    let (path, metadata, kind) = picturable(link)?;
    let kept = cache.join(cache_name(&path, &metadata));
    let jpeg = match fs::read(&kept) {
        Ok(jpeg) => jpeg,
        Err(_) => {
            let jpeg = make(&path, metadata.len(), kind, system(&path))?;
            // Written whole, then renamed, so a half-written file is never read back.
            if private_folder(cache).is_ok() {
                let partial = kept.with_extension(format!("{}.part", std::process::id()));
                if write_private(&partial, &jpeg).is_err() || fs::rename(&partial, &kept).is_err() {
                    let _ = fs::remove_file(&partial);
                }
            }
            jpeg
        }
    };
    Some(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(jpeg)
    ))
}
/// Makes a thumbnail: a photo's own EXIF thumbnail or the photo scaled down, turned upright; a
/// video's cover picture; or else the system's (already upright; made by its thumbnailers only
/// when `system`); at most SIDE pixels a side; as a JPEG.
fn make(path: &Path, size: u64, kind: &str, system: bool) -> Option<Vec<u8>> {
    let own = if kind == "video" {
        cover(path)
    } else {
        let exif = read_exif(path);
        exif.thumbnail
            .and_then(|bytes| image::load_from_memory_with_format(&bytes, ImageFormat::Jpeg).ok())
            .or_else(|| (size <= MOST_BYTES).then(|| decode(path)).flatten())
            .map(|mut picture| {
                if let Some(orientation) = exif
                    .orientation
                    .and_then(image::metadata::Orientation::from_exif)
                {
                    picture.apply_orientation(orientation);
                }
                picture
            })
    };
    let mut picture = own.or_else(|| crate::system_thumbnails::thumbnail(path, system))?;
    // Shrunk, never enlarged: a small embedded thumbnail stays as it is.
    if picture.width() > SIDE || picture.height() > SIDE {
        picture = picture.thumbnail(SIDE, SIDE);
    }
    let picture = DynamicImage::ImageRgb8(picture.to_rgb8());
    let mut jpeg = Vec::new();
    picture
        .write_with_encoder(JpegEncoder::new_with_quality(&mut jpeg, 80))
        .ok()?;
    Some(jpeg)
}

/// Makes `folder` and any folders above it that are missing, readable only by the user (0700
/// on Unix), and makes it so if it already was there (older versions made it 0755).
pub fn private_folder(folder: &Path) -> std::io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
        builder.mode(0o700);
        builder.create(folder)?;
        fs::set_permissions(folder, fs::Permissions::from_mode(0o700))
    }
    #[cfg(not(unix))]
    builder.create(folder)
}
/// Writes `bytes` to a new file at `path`, readable only by the user from the start (0600 on
/// Unix): never created readable to others and narrowed after, when another user could open it.
pub fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(bytes)
}

/// A photo decoded by the image crate, within limits on its size and memory.
fn decode(path: &Path) -> Option<DynamicImage> {
    let mut reader = ImageReader::open(path).ok()?.with_guessed_format().ok()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(20_000);
    limits.max_image_height = Some(20_000);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().ok()
}

/// The cover picture an MP4 or QuickTime video carries, as phones' and editors' may: the JPEG or
/// PNG in moov/udta/meta/ilst/covr/data, decoded. None for other formats and videos without one.
fn cover(path: &Path) -> Option<DynamicImage> {
    let mut file = File::open(path).ok()?;
    let end = file.metadata().ok()?.len();
    let moov = find_box(&mut file, 0, end, b"moov")?;
    let udta = find_box(&mut file, moov.0, moov.1, b"udta")?;
    let meta = find_box(&mut file, udta.0, udta.1, b"meta")?;
    // MP4's meta is a full box (four bytes of version and flags before its children);
    // QuickTime's is not: its first child, hdlr, follows at once.
    let mut kind = [0u8; 4];
    file.seek(SeekFrom::Start(meta.0 + 4)).ok()?;
    file.read_exact(&mut kind).ok()?;
    let children = if &kind == b"hdlr" { meta.0 } else { meta.0 + 4 };
    let ilst = find_box(&mut file, children, meta.1, b"ilst")?;
    let covr = find_box(&mut file, ilst.0, ilst.1, b"covr")?;
    let data = find_box(&mut file, covr.0, covr.1, b"data")?;
    // The data box: its type (13 JPEG, 14 PNG) and locale, then the picture.
    let length = data.1.checked_sub(data.0 + 8)?;
    if length > MOST_COVER_BYTES {
        return None;
    }
    let mut picture = vec![0u8; length as usize];
    file.seek(SeekFrom::Start(data.0 + 8)).ok()?;
    file.read_exact(&mut picture).ok()?;
    image::load_from_memory(&picture).ok()
}
/// The first box of type `kind` between `start` and `end` of an MP4 or QuickTime file: where its
/// contents start and end. None when there is none, or the boxes there are malformed.
fn find_box(file: &mut File, start: u64, end: u64, kind: &[u8; 4]) -> Option<(u64, u64)> {
    let mut at = start;
    for _ in 0..10_000 {
        if at + 8 > end {
            return None;
        }
        let mut header = [0u8; 8];
        file.seek(SeekFrom::Start(at)).ok()?;
        file.read_exact(&mut header).ok()?;
        let (size, skip) = match u32::from_be_bytes([header[0], header[1], header[2], header[3]]) {
            // A 64-bit size follows the type.
            1 => {
                let mut large = [0u8; 8];
                file.read_exact(&mut large).ok()?;
                (u64::from_be_bytes(large), 16)
            }
            // To the end of its parent.
            0 => (end - at, 8),
            size => (size as u64, 8),
        };
        if size < skip || at.checked_add(size)? > end {
            return None;
        }
        if &header[4..] == kind {
            return Some((at + skip, at + size));
        }
        at += size;
    }
    None
}

/// What a photo's EXIF says about its thumbnail: the embedded JPEG, and which way is up.
#[derive(Default)]
struct Exif {
    thumbnail: Option<Vec<u8>>,
    orientation: Option<u8>,
}
/// Reads the EXIF of a JPEG (its APP1 segment) or of a TIFF-based file (most raw formats, whose
/// whole file is TIFF), without decoding the picture.
fn read_exif(path: &Path) -> Exif {
    let Ok(mut file) = fs::File::open(path) else {
        return Exif::default();
    };
    let mut head = [0u8; 4];
    if file.read_exact(&mut head).is_err() {
        return Exif::default();
    }
    if head[..2] == [0xff, 0xd8] {
        // JPEG: the segments up to the picture's data, looking for APP1 "Exif".
        let mut at = 2u64;
        loop {
            let mut marker = [0u8; 4];
            if file.seek(SeekFrom::Start(at)).is_err() || file.read_exact(&mut marker).is_err() {
                return Exif::default();
            }
            if marker[0] != 0xff || marker[1] == 0xda || marker[1] == 0xd9 {
                return Exif::default();
            }
            let length = u16::from_be_bytes([marker[2], marker[3]]) as u64;
            if marker[1] == 0xe1 && length > 8 {
                let mut segment = vec![0u8; length as usize - 2];
                if file.read_exact(&mut segment).is_ok() && segment.starts_with(b"Exif\0\0") {
                    return tiff_exif(&segment[6..]);
                }
            }
            at += 2 + length;
        }
    }
    if &head == b"II*\0" || &head == b"MM\0*" {
        // The first megabytes hold the IFDs and the small thumbnail, in the raw formats that
        // keep one in IFD1.
        let mut start = Vec::new();
        let _ = file.seek(SeekFrom::Start(0));
        let _ = file.take(16 * 1024 * 1024).read_to_end(&mut start);
        return tiff_exif(&start);
    }
    Exif::default()
}
/// The orientation (IFD0's 0x0112) and the JPEG thumbnail (IFD1's 0x0201 offset and 0x0202
/// length) of a TIFF structure.
fn tiff_exif(tiff: &[u8]) -> Exif {
    let little = match tiff.get(..2) {
        Some(b"II") => true,
        Some(b"MM") => false,
        _ => return Exif::default(),
    };
    let u16_at = |at: usize| {
        let b = tiff.get(at..at + 2)?;
        Some(if little {
            u16::from_le_bytes([b[0], b[1]])
        } else {
            u16::from_be_bytes([b[0], b[1]])
        })
    };
    let u32_at = |at: usize| {
        let b = tiff.get(at..at + 4)?;
        Some(if little {
            u32::from_le_bytes([b[0], b[1], b[2], b[3]])
        } else {
            u32::from_be_bytes([b[0], b[1], b[2], b[3]])
        })
    };
    // An IFD's entries as (tag, value or offset), and where the next IFD is.
    let ifd = |at: usize| -> Option<(Vec<(u16, u32)>, usize)> {
        let count = u16_at(at)? as usize;
        let entries = (0..count.min(512))
            .map(|i| {
                let e = at + 2 + 12 * i;
                let kind = u16_at(e + 2)?;
                // A SHORT is in the value's first two bytes; a LONG fills all four.
                let value = if kind == 3 {
                    u16_at(e + 8)? as u32
                } else {
                    u32_at(e + 8)?
                };
                Some((u16_at(e)?, value))
            })
            .collect::<Option<Vec<_>>>()?;
        Some((entries, u32_at(at + 2 + 12 * count)? as usize))
    };
    let mut exif = Exif::default();
    let Some((ifd0, next)) = u32_at(4).and_then(|at| ifd(at as usize)) else {
        return exif;
    };
    exif.orientation = ifd0
        .iter()
        .find(|(tag, _)| *tag == 0x0112)
        .map(|(_, value)| *value as u8);
    if next != 0 {
        if let Some((ifd1, _)) = ifd(next) {
            let find = |tag: u16| ifd1.iter().find(|(t, _)| *t == tag).map(|(_, v)| *v);
            if let (Some(offset), Some(length)) = (find(0x0201), find(0x0202)) {
                exif.thumbnail = tiff
                    .get(offset as usize..offset as usize + length as usize)
                    .filter(|jpeg| jpeg.starts_with(&[0xff, 0xd8]))
                    .map(<[u8]>::to_vec);
            }
        }
    }
    exif
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, Rgb, RgbImage};
    use reqwest::Url;

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-thumbs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn jpeg_of(width: u32, height: u32, color: [u8; 3]) -> Vec<u8> {
        let mut out = Vec::new();
        DynamicImage::ImageRgb8(RgbImage::from_pixel(width, height, Rgb(color)))
            .write_with_encoder(JpegEncoder::new_with_quality(&mut out, 90))
            .unwrap();
        out
    }
    /// A JPEG of `main` with an APP1 EXIF segment holding `orientation` and `thumbnail`.
    fn with_exif(main: &[u8], orientation: u16, thumbnail: &[u8]) -> Vec<u8> {
        // Little-endian TIFF: IFD0 at 8 (one entry), IFD1 after it (two), then the thumbnail.
        let mut tiff = b"II*\0".to_vec();
        tiff.extend(8u32.to_le_bytes());
        let ifd1 = 8 + 2 + 12 + 4;
        let data = ifd1 + 2 + 24 + 4;
        tiff.extend(1u16.to_le_bytes());
        tiff.extend(0x0112u16.to_le_bytes());
        tiff.extend(3u16.to_le_bytes());
        tiff.extend(1u32.to_le_bytes());
        tiff.extend((orientation as u32).to_le_bytes());
        tiff.extend((ifd1 as u32).to_le_bytes());
        tiff.extend(2u16.to_le_bytes());
        for (tag, value) in [(0x0201u16, data as u32), (0x0202, thumbnail.len() as u32)] {
            tiff.extend(tag.to_le_bytes());
            tiff.extend(4u16.to_le_bytes());
            tiff.extend(1u32.to_le_bytes());
            tiff.extend(value.to_le_bytes());
        }
        tiff.extend(0u32.to_le_bytes());
        tiff.extend(thumbnail);
        let mut app1 = b"Exif\0\0".to_vec();
        app1.extend(tiff);
        let mut out = main[..2].to_vec();
        out.extend([0xff, 0xe1]);
        out.extend(((app1.len() + 2) as u16).to_be_bytes());
        out.extend(app1);
        out.extend(&main[2..]);
        out
    }
    fn picture(data_url: &str) -> DynamicImage {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_url.strip_prefix("data:image/jpeg;base64,").unwrap())
            .unwrap();
        image::load_from_memory(&bytes).unwrap()
    }
    fn link(path: &Path) -> String {
        Url::from_file_path(path).unwrap().to_string()
    }

    #[test]
    fn photos_shrink_or_use_their_own_upright_thumbnail() {
        let dir = folder("make");
        let cache = dir.join("cache");
        // Scaled down: a wide PNG keeps its shape.
        let wide = dir.join("wide.png");
        DynamicImage::ImageRgb8(RgbImage::from_pixel(800, 400, Rgb([200, 30, 30])))
            .save(&wide)
            .unwrap();
        let small = picture(&thumbnail(&cache, &link(&wide), &|_| true).unwrap());
        assert_eq!(small.dimensions(), (160, 80));
        // Its own: the blue EXIF thumbnail, not the red photo, turned upright (orientation 6
        // is a quarter turn clockwise), so the wide thumbnail stands tall.
        let camera = dir.join("IMG_0001.JPG");
        fs::write(
            &camera,
            with_exif(
                &jpeg_of(1200, 900, [200, 30, 30]),
                6,
                &jpeg_of(80, 60, [30, 30, 200]),
            ),
        )
        .unwrap();
        let own = picture(&thumbnail(&cache, &link(&camera), &|_| true).unwrap());
        assert_eq!(own.dimensions(), (60, 80));
        let Rgb([r, _, b]) = own.to_rgb8().get_pixel(30, 40).to_owned();
        assert!(b > 150 && r < 100, "the embedded thumbnail");
        // Kept: a second asking reads the cache; a changed photo gets a new one.
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 2);
        assert!(thumbnail(&cache, &link(&camera), &|_| true).is_some());
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 2);
        fs::write(&camera, jpeg_of(300, 300, [30, 200, 30])).unwrap();
        let changed = picture(&thumbnail(&cache, &link(&camera), &|_| true).unwrap());
        assert_eq!(changed.dimensions(), (160, 160));
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 3);
        fs::remove_dir_all(dir).unwrap();
    }

    /// An MP4 box: its size, type and contents.
    fn mp4_box(kind: &[u8; 4], contents: &[u8]) -> Vec<u8> {
        [
            &((contents.len() + 8) as u32).to_be_bytes()[..],
            kind,
            contents,
        ]
        .concat()
    }
    /// A video file holding `cover` as its cover picture, in MP4's layout (meta a full box) or
    /// QuickTime's, after a media data box.
    fn video_with_cover(cover: &[u8], quicktime: bool) -> Vec<u8> {
        let data = mp4_box(
            b"data",
            &[&13u32.to_be_bytes()[..], &[0; 4], cover].concat(),
        );
        let ilst = mp4_box(b"ilst", &mp4_box(b"covr", &data));
        let hdlr = mp4_box(b"hdlr", &[0; 24]);
        let meta = if quicktime {
            mp4_box(b"meta", &[hdlr, ilst].concat())
        } else {
            mp4_box(b"meta", &[&[0u8; 4][..], &hdlr, &ilst].concat())
        };
        let moov = mp4_box(
            b"moov",
            &[mp4_box(b"mvhd", &[0; 100]), mp4_box(b"udta", &meta)].concat(),
        );
        [
            mp4_box(b"ftyp", b"isom\0\0\0\0isom"),
            mp4_box(b"mdat", &[7; 4000]),
            moov,
        ]
        .concat()
    }

    #[test]
    fn videos_show_the_cover_they_carry() {
        let dir = folder("cover");
        let cache = dir.join("cache");
        for (name, quicktime) in [("clip.mp4", false), ("clip.mov", true)] {
            let video = dir.join(name);
            fs::write(
                &video,
                video_with_cover(&jpeg_of(320, 180, [30, 30, 200]), quicktime),
            )
            .unwrap();
            let cover = picture(&thumbnail(&cache, &link(&video), &|_| true).unwrap());
            assert_eq!(cover.dimensions(), (160, 90), "{name}");
            let Rgb([r, _, b]) = cover.to_rgb8().get_pixel(80, 45).to_owned();
            assert!(b > 150 && r < 100, "{name}: the cover");
        }
        // Boxes that run past their parent are refused, not followed.
        let mut broken = video_with_cover(&jpeg_of(32, 32, [30, 30, 200]), false);
        let at = broken.windows(4).position(|w| w == b"covr").unwrap() - 4;
        broken[at..at + 4].copy_from_slice(&u32::MAX.to_be_bytes());
        let video = dir.join("broken.mp4");
        fs::write(&video, broken).unwrap();
        assert!(cover(&video).is_none());
        // Without one, a video's cover is none.
        let plain = dir.join("plain.mp4");
        fs::write(
            &plain,
            [
                mp4_box(b"ftyp", b"isom"),
                mp4_box(b"moov", &mp4_box(b"mvhd", &[0; 100])),
            ]
            .concat(),
        )
        .unwrap();
        assert!(cover(&plain).is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn only_readable_photos_on_this_computer() {
        let dir = folder("refuse");
        let cache = dir.join("cache");
        let notes = dir.join("notes.txt");
        fs::write(&notes, b"text").unwrap();
        let broken = dir.join("broken.jpg");
        fs::write(&broken, b"not a picture").unwrap();
        for refused in [
            link(&notes),
            link(&broken),
            link(&dir),
            link(&dir.join("missing.jpg")),
            "https://example.org/a.jpg".to_string(),
            "file://server/share/a.jpg".to_string(),
        ] {
            assert!(
                thumbnail(&cache, &refused, &|_| true).is_none(),
                "{refused}"
            );
        }
        assert!(!cache.exists() || fs::read_dir(&cache).unwrap().count() == 0);
        fs::remove_dir_all(dir).unwrap();
    }

    /// The system's thumbnailers are asked only about files the user chose, and the cache keeps
    /// thumbnails where only the user can read them.
    #[test]
    fn chosen_files_and_private_cache() {
        let dir = folder("chosen");
        let photos = fs::canonicalize(&dir).unwrap().join("photos");
        fs::create_dir_all(photos.join("trip")).unwrap();
        let folders = [photos.clone()];
        assert!(chosen(&photos.join("trip/clip.mkv"), &folders));
        assert!(chosen(&photos, &folders));
        assert!(!chosen(&dir.join("photos-elsewhere/clip.mkv"), &folders));
        assert!(!chosen(
            Path::new("/home/someone/Downloads/clip.mkv"),
            &folders
        ));
        assert!(!chosen(&photos.join("clip.mkv"), &[]));
        // Whether the system may be asked is decided by the file's real path.
        let clip = photos.join("trip/clip.mkv");
        fs::write(&clip, b"not really a video").unwrap();
        let asked = std::cell::RefCell::new(Vec::new());
        let ask = |path: &Path| {
            asked.borrow_mut().push(path.to_path_buf());
            false
        };
        assert!(thumbnail(&dir.join("cache"), &link(&clip), &ask).is_none());
        assert_eq!(*asked.borrow(), [clip.clone()]);
        // Made private, and narrowed when an older version made it open to others.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let cache = dir.join("cache/thumbnails");
            fs::create_dir_all(&cache).unwrap();
            fs::set_permissions(&cache, fs::Permissions::from_mode(0o755)).unwrap();
            let wide = dir.join("wide.png");
            DynamicImage::ImageRgb8(RgbImage::from_pixel(320, 200, Rgb([200, 30, 30])))
                .save(&wide)
                .unwrap();
            assert!(thumbnail(&cache, &link(&wide), &|_| false).is_some());
            let mode = |path: &Path| fs::metadata(path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode(&cache), 0o700);
            let kept: Vec<_> = fs::read_dir(&cache)
                .unwrap()
                .map(|e| e.unwrap().path())
                .collect();
            assert_eq!(kept.len(), 1);
            assert_eq!(mode(&kept[0]), 0o600);
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
