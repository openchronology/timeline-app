// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Thumbnails of photos on this computer (#440), for moments whose source is one (#433): a small
//! JPEG, turned the way the photo says it was taken, as a `data:` URL the page shows as the
//! moment's marker (the desktop's content policy allows `data:` images and no local files).
//!
//! A thumbnail is the photo's own EXIF thumbnail where it has one (most cameras' and phones'
//! JPEGs and many raw files do), or else the photo scaled down. They are kept in the app's cache
//! folder, named by a hash of the file's path, size and modification time, so a changed photo
//! gets a new one. They are never sent anywhere: the page holds them only to draw them.
use base64::Engine;
use image::{codecs::jpeg::JpegEncoder, DynamicImage, ImageFormat, ImageReader, Limits};
use std::{
    fs,
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

/// The photo a `file:` link names, when a thumbnail can be made of it: an existing regular file
/// with a photo's extension (populate::kind).
fn photo(link: &str) -> Option<(PathBuf, fs::Metadata)> {
    let path = fs::canonicalize(crate::populate::local_path(link).ok()?).ok()?;
    let metadata = fs::metadata(&path).ok()?;
    (metadata.is_file() && crate::populate::kind(&path) == "photo").then_some((path, metadata))
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
/// The thumbnail of the photo `link` names, as a `data:image/jpeg;base64,…` URL, from `cache` or
/// made and kept there; None when it isn't a photo on this computer or can't be read.
pub fn thumbnail(cache: &Path, link: &str) -> Option<String> {
    let (path, metadata) = photo(link)?;
    let kept = cache.join(cache_name(&path, &metadata));
    let jpeg = match fs::read(&kept) {
        Ok(jpeg) => jpeg,
        Err(_) => {
            let jpeg = make(&path, metadata.len())?;
            // Written whole, then renamed, so a half-written file is never read back.
            let _ = fs::create_dir_all(cache);
            let partial = kept.with_extension(format!("{}.part", std::process::id()));
            if fs::write(&partial, &jpeg).is_ok() && fs::rename(&partial, &kept).is_err() {
                let _ = fs::remove_file(&partial);
            }
            jpeg
        }
    };
    Some(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(jpeg)
    ))
}
/// Makes a photo's thumbnail: its own EXIF thumbnail, or else the photo scaled down; turned
/// upright; at most SIDE pixels a side; as a JPEG.
fn make(path: &Path, size: u64) -> Option<Vec<u8>> {
    let exif = read_exif(path);
    let decoded = exif
        .thumbnail
        .and_then(|bytes| image::load_from_memory_with_format(&bytes, ImageFormat::Jpeg).ok());
    let mut picture = match decoded {
        Some(picture) => picture,
        None if size <= MOST_BYTES => {
            let mut reader = ImageReader::open(path).ok()?.with_guessed_format().ok()?;
            let mut limits = Limits::default();
            limits.max_image_width = Some(20_000);
            limits.max_image_height = Some(20_000);
            limits.max_alloc = Some(512 * 1024 * 1024);
            reader.limits(limits);
            reader.decode().ok()?
        }
        None => return None,
    };
    if let Some(orientation) = exif
        .orientation
        .and_then(image::metadata::Orientation::from_exif)
    {
        picture.apply_orientation(orientation);
    }
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
        let small = picture(&thumbnail(&cache, &link(&wide)).unwrap());
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
        let own = picture(&thumbnail(&cache, &link(&camera)).unwrap());
        assert_eq!(own.dimensions(), (60, 80));
        let Rgb([r, _, b]) = own.to_rgb8().get_pixel(30, 40).to_owned();
        assert!(b > 150 && r < 100, "the embedded thumbnail");
        // Kept: a second asking reads the cache; a changed photo gets a new one.
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 2);
        assert!(thumbnail(&cache, &link(&camera)).is_some());
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 2);
        fs::write(&camera, jpeg_of(300, 300, [30, 200, 30])).unwrap();
        let changed = picture(&thumbnail(&cache, &link(&camera)).unwrap());
        assert_eq!(changed.dimensions(), (160, 160));
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 3);
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
            assert!(thumbnail(&cache, &refused).is_none(), "{refused}");
        }
        assert!(!cache.exists() || fs::read_dir(&cache).unwrap().count() == 0);
        fs::remove_dir_all(dir).unwrap();
    }
}
