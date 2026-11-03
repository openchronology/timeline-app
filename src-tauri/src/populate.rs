// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! The file populator (#433): a new timeline of the files in folders the user picked, one
//! moment per file, dated as the user chose, its source the file itself (a `file:///` link the
//! desktop opens in the file's own app); and opening such a link, or showing it in its folder.
//!
//! The editor never names a path: it scans only the folders and files picked in the native
//! dialog (`Roots`), and opens only `file:` links, never anything the checks in `local_file`
//! refuse. Media dates come from the files' own metadata with nom-exif (EXIF for photos, the
//! track's creation date for video and audio), read without running anything.
use nom_exif::{ExifTag, MediaKind, MediaParser, MediaSource, TrackInfoTag};
use openchronology_store::{Document, Event};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map};
use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::SystemTime,
};

/// The most moments one population makes, half a timeline's limit.
pub const MOST_FILES: usize = 100_000;
/// The most directory entries one population looks at, so a huge tree ends rather than runs on.
const MOST_ENTRIES: usize = 1_000_000;

/// Photos: what EXIF is read from.
const PHOTOS: &[&str] = &[
    "jpg", "jpeg", "heic", "heif", "avif", "png", "webp", "tif", "tiff", "dng", "cr2", "cr3",
    "nef", "arw", "raf", "orf", "rw2", "iiq",
];
/// Videos: their track's creation date is read.
const VIDEOS: &[&str] = &["mp4", "m4v", "mov", "3gp", "mkv", "webm", "avi"];
/// Audio: likewise, where the format has one.
const AUDIO: &[&str] = &["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "mka"];

/// What a file is, by its extension: one of the media kinds, or `other`.
pub(crate) fn kind(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if PHOTOS.contains(&extension.as_str()) {
        "photo"
    } else if VIDEOS.contains(&extension.as_str()) {
        "video"
    } else if AUDIO.contains(&extension.as_str()) {
        "audio"
    } else {
        "other"
    }
}

/// When a file happened, by the file system: its creation (birth) or its last modification.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FileDate {
    Created,
    Modified,
}
/// When a media file happened: as the file system says, or as the file itself records (when the
/// photo was taken, the video or sound recorded).
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MediaDate {
    Created,
    Modified,
    Metadata,
}
/// Which files become moments, and the date each takes:
/// `anyFile { date: created | modified } | mediaFile { date: created | modified | metadata }`.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FileType {
    AnyFile { date: FileDate },
    MediaFile { date: MediaDate },
}
/// How a recorded time without a zone (most cameras' EXIF) is read.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Zone {
    /// This computer's zone at that date.
    #[default]
    Local,
    Utc,
}
/// The populator's choices, from its dialog.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub file_type: FileType,
    /// Whether folders are searched through their subfolders too.
    pub recursive: bool,
    #[serde(default)]
    pub zone: Zone,
    /// Whether a media file's recorded location (GPS) is added to its moment's metadata. Off
    /// unless chosen: it is the most personal part of a photo's metadata.
    #[serde(default)]
    pub location: bool,
}

/// How a population went, for the editor to report: the moments made, and the files left out,
/// counted by reason, with a few of each named.
#[derive(Debug, Default, Serialize, PartialEq)]
pub struct Report {
    pub added: usize,
    pub skipped: BTreeMap<String, Skipped>,
    /// Whether it stopped at MOST_FILES or MOST_ENTRIES, or was cancelled.
    pub truncated: bool,
}
#[derive(Debug, Default, Serialize, PartialEq)]
pub struct Skipped {
    pub count: usize,
    pub examples: Vec<String>,
}
impl Report {
    fn skip(&mut self, reason: &str, path: &Path) {
        let entry = self.skipped.entry(reason.to_string()).or_default();
        entry.count += 1;
        if entry.examples.len() < 5 {
            entry.examples.push(path.to_string_lossy().into_owned());
        }
    }
}

/// How far a population has got, sent as it goes.
#[derive(Clone, Serialize)]
pub struct Progress {
    pub scanned: usize,
    pub added: usize,
}

/// An exact rational time string for seconds since the Unix epoch plus nanoseconds, in lowest
/// terms (`1700000000/1`, `3400000001/2`).
fn rational(seconds: i64, nanos: u32) -> String {
    let (mut n, mut d) = (
        seconds as i128 * 1_000_000_000 + nanos as i128,
        1_000_000_000i128,
    );
    let (mut a, mut b) = (n.abs(), d);
    while b != 0 {
        (a, b) = (b, a % b);
    }
    if a > 1 {
        n /= a;
        d /= a;
    }
    format!("{n}/{d}")
}
/// A file system time as a rational time string.
fn system_time(time: SystemTime) -> String {
    match time.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(after) => rational(after.as_secs() as i64, after.subsec_nanos()),
        Err(before) => {
            let before = before.duration();
            let (seconds, nanos) = (before.as_secs() as i64, before.subsec_nanos());
            if nanos == 0 {
                rational(-seconds, 0)
            } else {
                rational(-seconds - 1, 1_000_000_000 - nanos)
            }
        }
    }
}
/// A recorded date as a rational time string, reading a time without a zone in `zone`.
fn recorded(value: nom_exif::ExifDateTime, zone: Zone) -> Option<String> {
    use chrono::{Local, TimeZone, Utc};
    let utc = match value {
        nom_exif::ExifDateTime::Aware(time) => time.with_timezone(&Utc),
        nom_exif::ExifDateTime::Naive(time) => match zone {
            Zone::Utc => Utc.from_utc_datetime(&time),
            Zone::Local => Local
                .from_local_datetime(&time)
                .earliest()?
                .with_timezone(&Utc),
        },
    };
    // An unset date (a video's zero, 1904 or 1970) is no date.
    if utc.timestamp() <= 0 {
        return None;
    }
    Some(rational(utc.timestamp(), utc.timestamp_subsec_nanos()))
}

/// What a media file records about itself: when, and where.
#[derive(Debug, Default, PartialEq)]
struct Recorded {
    time: Option<String>,
    location: Option<(f64, f64)>,
}
/// Reads a media file's recorded date and location, as far as it has them; nothing on any error.
fn read_recorded(parser: &mut MediaParser, path: &Path, zone: Zone) -> Recorded {
    let Ok(source) = MediaSource::open(path) else {
        return Recorded::default();
    };
    let gps = |info: Option<&nom_exif::GPSInfo>| {
        info.and_then(|g| Some((g.latitude_decimal()?, g.longitude_decimal()?)))
            .filter(|(lat, lon)| lat.is_finite() && lon.is_finite() && (*lat, *lon) != (0.0, 0.0))
    };
    match source.kind() {
        MediaKind::Image => {
            let Ok(iter) = parser.parse_exif(source) else {
                return Recorded::default();
            };
            let exif: nom_exif::Exif = iter.into();
            let time = [ExifTag::DateTimeOriginal, ExifTag::CreateDate]
                .into_iter()
                .find_map(|tag| exif.get(tag).and_then(|v| v.as_datetime()))
                .and_then(|t| recorded(t, zone));
            Recorded {
                time,
                location: gps(exif.gps_info()),
            }
        }
        MediaKind::Track => {
            let Ok(info) = parser.parse_track(source) else {
                return Recorded::default();
            };
            let time = info
                .get(TrackInfoTag::CreateDate)
                .and_then(|v| v.as_datetime())
                .and_then(|t| recorded(t, zone));
            Recorded {
                time,
                location: gps(info.gps_info()),
            }
        }
    }
}

/// A moment ID for a file, the same each time the same path is populated: FNV-1a of its path.
fn file_id(path: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in path.as_os_str().as_encoded_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("file-{hash:016x}")
}

/// Makes the moments for the files under `roots` as `settings` say, telling `progress` as it
/// goes, until `cancel` is set. Hidden files and folders (named with a leading dot) are passed
/// over, and links are never followed, so a loop of links can't hold it up.
pub fn populate(
    roots: &[PathBuf],
    settings: &Settings,
    cancel: &AtomicBool,
    progress: &dyn Fn(Progress),
) -> (Vec<Event>, Report) {
    let mut report = Report::default();
    let mut events = Vec::new();
    let mut ids = HashSet::new();
    let mut parser = MediaParser::new();
    let mut scanned = 0usize;
    let media = matches!(settings.file_type, FileType::MediaFile { .. });
    'roots: for root in roots {
        let walk = walkdir::WalkDir::new(root)
            .follow_links(false)
            .max_depth(if settings.recursive { usize::MAX } else { 1 })
            .into_iter()
            .filter_entry(|entry| {
                entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
            });
        for entry in walk {
            if cancel.load(Ordering::Relaxed) || scanned >= MOST_ENTRIES {
                report.truncated = true;
                break 'roots;
            }
            scanned += 1;
            if scanned.is_multiple_of(256) {
                progress(Progress {
                    scanned,
                    added: events.len(),
                });
            }
            let Ok(entry) = entry else {
                report.skip("unreadable", root);
                continue;
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let file_kind = kind(path);
            if media && file_kind == "other" {
                continue;
            }
            if events.len() >= MOST_FILES {
                report.truncated = true;
                break 'roots;
            }
            let Ok(metadata) = entry.metadata() else {
                report.skip("unreadable", path);
                continue;
            };
            let read = if media
                && (settings.location
                    || settings.file_type
                        == (FileType::MediaFile {
                            date: MediaDate::Metadata,
                        }))
            {
                read_recorded(&mut parser, path, settings.zone)
            } else {
                Recorded::default()
            };
            let time = match settings.file_type {
                FileType::AnyFile {
                    date: FileDate::Created,
                }
                | FileType::MediaFile {
                    date: MediaDate::Created,
                } => metadata.created().ok().map(system_time),
                FileType::AnyFile {
                    date: FileDate::Modified,
                }
                | FileType::MediaFile {
                    date: MediaDate::Modified,
                } => metadata.modified().ok().map(system_time),
                FileType::MediaFile {
                    date: MediaDate::Metadata,
                } => read.time.clone(),
            };
            let Some(time) = time else {
                report.skip(
                    match settings.file_type {
                        FileType::MediaFile {
                            date: MediaDate::Metadata,
                        } => "no recorded date",
                        _ => "no file date",
                    },
                    path,
                );
                continue;
            };
            let Ok(source) = Url::from_file_path(path) else {
                report.skip("unreadable", path);
                continue;
            };
            let mut id = file_id(path);
            while !ids.insert(id.clone()) {
                id.push('x');
            }
            let mut fields = Map::new();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            fields.insert("title".into(), json!(name));
            fields.insert("sources".into(), json!([source.as_str()]));
            fields.insert("tags".into(), json!([format!("file:{file_kind}")]));
            if settings.location {
                if let Some((latitude, longitude)) = read.location {
                    fields.insert(
                        "location".into(),
                        json!({"latitude": latitude, "longitude": longitude}),
                    );
                }
            }
            events.push(Event {
                id,
                time,
                metadata: fields,
            });
        }
    }
    report.added = events.len();
    progress(Progress {
        scanned,
        added: events.len(),
    });
    (events, report)
}

/// The populated timeline: the editor's `template` (its title, display and plugins), holding
/// `events`.
pub fn document(mut template: Document, events: Vec<Event>) -> Document {
    template.events = events;
    template.durations.clear();
    template.relationships.clear();
    template
}

/// Extensions never handed to the system to open, on any platform: programs, scripts,
/// installers, launchers and shortcuts, which opening would run.
const UNSAFE: &[&str] = &[
    "exe",
    "com",
    "bat",
    "cmd",
    "ps1",
    "psm1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "wsf",
    "wsh",
    "msi",
    "msp",
    "mst",
    "scr",
    "pif",
    "cpl",
    "hta",
    "lnk",
    "reg",
    "jar",
    "app",
    "command",
    "tool",
    "workflow",
    "action",
    "desktop",
    "sh",
    "bash",
    "zsh",
    "csh",
    "ksh",
    "fish",
    "run",
    "bin",
    "appimage",
    "deb",
    "rpm",
    "pkg",
    "mpkg",
    "dmg",
    "apk",
    "py",
    "pyw",
    "pl",
    "rb",
    "php",
    "msc",
    "url",
    "inf",
    "scf",
    "gadget",
    "application",
    "xbap",
    "settingcontent-ms",
    "library-ms",
    "appref-ms",
    "ws",
    "diagcab",
    "elf",
    "out",
    "so",
    "dll",
    "dylib",
    "kext",
    "service",
    "terminal",
    "scpt",
    "applescript",
    "osascript",
    "webloc",
    "inetloc",
    "fileloc",
    "iso",
    "img",
    "vhd",
    "vhdx",
];
/// The file a `file:` link names, when it may be opened in its own app: a regular file that
/// exists, isn't a program or script (by its name or its target's, see UNSAFE), and, on Linux and
/// macOS, isn't executable unless it is a photo, video or sound (as files on a memory card often
/// are). Errors say why not.
pub fn local_file(link: &str) -> Result<PathBuf, String> {
    let path = local_path(link)?;
    let target = std::fs::canonicalize(&path)
        .map_err(|_| "That file isn't on this computer, or can't be read.".to_string())?;
    let metadata = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Only files can be opened. Use Show in folder for a folder.".into());
    }
    for name in [&path, &target] {
        let extension = name
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();
        if UNSAFE.contains(&extension.as_str()) {
            return Err(format!(
                "Programs and scripts (.{extension}) aren't opened from a timeline. Use Show in folder instead."
            ));
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 != 0 && kind(&target) == "other" {
            return Err(
                "This file can run as a program, so it isn't opened from a timeline. Use Show in folder instead."
                    .into(),
            );
        }
    }
    Ok(target)
}
/// The path a `file:` link names: `file:///…` (or `file://localhost/…`), absolute.
pub fn local_path(link: &str) -> Result<PathBuf, String> {
    let url = Url::parse(link).map_err(|_| "That isn't a file link.".to_string())?;
    if url.scheme() != "file"
        || !matches!(url.host_str(), None | Some("") | Some("localhost"))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only file:/// links to this computer can be opened.".into());
    }
    url.to_file_path()
        .map_err(|_| "That isn't a file link.".to_string())
}
/// Opens the file a `file:` link names in the system's app for it, if local_file allows it.
pub fn open_file(link: &str) -> Result<(), String> {
    let path = local_file(link)?;
    launch(&path, false)
}
/// Shows the file a `file:` link names in its folder (the file manager, with it selected where
/// the platform can), or the folder itself when the link names one.
pub fn reveal_file(link: &str) -> Result<(), String> {
    let path = local_path(link)?;
    let target = std::fs::canonicalize(&path)
        .map_err(|_| "That file isn't on this computer, or can't be read.".to_string())?;
    launch(&target, true)
}
/// Starts the platform's opener without waiting for it, the path passed as one argument, never
/// through a shell. `reveal` shows it in its folder instead of opening it.
fn launch(path: &Path, reveal: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let result = {
        // The file manager opens the folder; selecting the file isn't portable on Linux.
        let target = if reveal && !path.is_dir() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        std::process::Command::new("xdg-open").arg(target).spawn()
    };
    #[cfg(target_os = "macos")]
    let result = if reveal {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
    } else {
        std::process::Command::new("open").arg(path).spawn()
    };
    #[cfg(target_os = "windows")]
    let result = if reveal {
        let mut select = std::ffi::OsString::from("/select,");
        select.push(path.as_os_str());
        std::process::Command::new("explorer.exe")
            .arg(select)
            .spawn()
    } else {
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(path)
            .spawn()
    };
    result
        .map(|_| ())
        .map_err(|_| "Could not start the app for this file.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-populate-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn run(roots: &[PathBuf], settings: Settings) -> (Vec<Event>, Report) {
        populate(roots, &settings, &AtomicBool::new(false), &|_| {})
    }
    fn settings(file_type: FileType, recursive: bool) -> Settings {
        Settings {
            file_type,
            recursive,
            zone: Zone::Utc,
            location: false,
        }
    }
    /// A JPEG holding only EXIF (and a comment): DateTimeOriginal `when`, with OffsetTimeOriginal `offset` when
    /// given, and a GPS position when `gps`.
    fn jpeg(when: &str, offset: Option<&str>, gps: bool) -> Vec<u8> {
        // Little-endian TIFF: IFD0 points to the Exif IFD (and the GPS IFD).
        let mut tiff: Vec<u8> = b"II*\0".to_vec();
        tiff.extend(8u32.to_le_bytes());
        let ifd0_entries: u16 = if gps { 2 } else { 1 };
        let ifd0_size = 2 + 12 * ifd0_entries as u32 + 4;
        let exif_at = 8 + ifd0_size;
        let exif_entries: u16 = if offset.is_some() { 2 } else { 1 };
        let exif_size = 2 + 12 * exif_entries as u32 + 4;
        let gps_at = exif_at + exif_size;
        let gps_size = 2 + 12 * 4 + 4;
        let data_at = gps_at + if gps { gps_size } else { 0 };
        let entry = |tag: u16, kind: u16, count: u32, value: u32| {
            let mut e = tag.to_le_bytes().to_vec();
            e.extend(kind.to_le_bytes());
            e.extend(count.to_le_bytes());
            e.extend(value.to_le_bytes());
            e
        };
        let mut data: Vec<u8> = Vec::new();
        let at = |bytes: &[u8], data: &mut Vec<u8>| {
            let offset = data_at + data.len() as u32;
            data.extend(bytes);
            offset
        };
        tiff.extend(ifd0_entries.to_le_bytes());
        tiff.extend(entry(0x8769, 4, 1, exif_at));
        if gps {
            tiff.extend(entry(0x8825, 4, 1, gps_at));
        }
        tiff.extend(0u32.to_le_bytes());
        let when = format!("{when}\0");
        let when_at = at(when.as_bytes(), &mut data);
        tiff.extend(exif_entries.to_le_bytes());
        tiff.extend(entry(0x9003, 2, when.len() as u32, when_at));
        if let Some(offset) = offset {
            let offset = format!("{offset}\0");
            let offset_at = at(offset.as_bytes(), &mut data);
            tiff.extend(entry(0x9011, 2, offset.len() as u32, offset_at));
        }
        tiff.extend(0u32.to_le_bytes());
        if gps {
            // 51° 30' 0" N, 0° 7' 30" W.
            let rationals = |values: [(u32, u32); 3]| {
                values
                    .iter()
                    .flat_map(|(n, d)| [n.to_le_bytes(), d.to_le_bytes()].concat())
                    .collect::<Vec<u8>>()
            };
            let lat_at = at(&rationals([(51, 1), (30, 1), (0, 1)]), &mut data);
            let lon_at = at(&rationals([(0, 1), (7, 1), (30, 1)]), &mut data);
            tiff.extend(4u16.to_le_bytes());
            tiff.extend(entry(1, 2, 2, u32::from_le_bytes(*b"N\0\0\0")));
            tiff.extend(entry(2, 5, 3, lat_at));
            tiff.extend(entry(3, 2, 2, u32::from_le_bytes(*b"W\0\0\0")));
            tiff.extend(entry(4, 5, 3, lon_at));
            tiff.extend(0u32.to_le_bytes());
        }
        tiff.extend(data);
        let mut app1 = b"Exif\0\0".to_vec();
        app1.extend(tiff);
        let mut jpeg = vec![0xff, 0xd8, 0xff, 0xe1];
        jpeg.extend(((app1.len() + 2) as u16).to_be_bytes());
        jpeg.extend(app1);
        // A comment's worth of padding: the parser reads ahead, as a real photo's size allows.
        jpeg.extend([0xff, 0xfe, 0x10, 0x02]);
        jpeg.extend([b' '; 0x1000]);
        jpeg.extend([0xff, 0xd9]);
        jpeg
    }
    /// An MP4 whose movie header records `seconds` since 1904 as its creation time.
    fn mp4(seconds: u32) -> Vec<u8> {
        let atom = |kind: &[u8], body: Vec<u8>| {
            let mut a = ((body.len() + 8) as u32).to_be_bytes().to_vec();
            a.extend(kind);
            a.extend(body);
            a
        };
        let mut ftyp = b"isom".to_vec();
        ftyp.extend(0x200u32.to_be_bytes());
        ftyp.extend(b"isommp41");
        let mut mvhd = vec![0u8; 4];
        mvhd.extend(seconds.to_be_bytes());
        mvhd.extend(seconds.to_be_bytes());
        mvhd.extend(1000u32.to_be_bytes());
        mvhd.extend(0u32.to_be_bytes());
        mvhd.extend(0x0001_0000u32.to_be_bytes());
        mvhd.extend(0x0100u16.to_be_bytes());
        mvhd.extend([0u8; 10]);
        for v in [0x0001_0000u32, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000] {
            mvhd.extend(v.to_be_bytes());
        }
        mvhd.extend([0u8; 24]);
        mvhd.extend(2u32.to_be_bytes());
        let mut file = atom(b"ftyp", ftyp);
        file.extend(atom(b"moov", atom(b"mvhd", mvhd)));
        file
    }

    #[test]
    fn rationals_are_exact_and_in_lowest_terms() {
        assert_eq!(rational(1_700_000_000, 0), "1700000000/1");
        assert_eq!(rational(1_700_000_000, 500_000_000), "3400000001/2");
        assert_eq!(rational(-1, 999_999_999), "-1/1000000000");
        assert_eq!(
            system_time(SystemTime::UNIX_EPOCH - std::time::Duration::from_millis(1500)),
            "-3/2"
        );
    }

    #[test]
    fn photos_and_videos_are_dated_as_they_record() {
        let dir = folder("recorded");
        fs::write(
            dir.join("zoned.jpg"),
            jpeg("2024:05:06 07:08:09", Some("+02:00"), true),
        )
        .unwrap();
        fs::write(
            dir.join("naive.jpg"),
            jpeg("2024:05:06 07:08:09", None, false),
        )
        .unwrap();
        // 2024-02-03T15:05:38Z is 3789817538 seconds after 1904.
        fs::write(dir.join("clip.mp4"), mp4(3_789_817_538)).unwrap();
        fs::write(dir.join("undated.jpg"), b"not really a photo").unwrap();
        fs::write(dir.join("notes.txt"), b"not media").unwrap();
        let mut chosen = settings(
            FileType::MediaFile {
                date: MediaDate::Metadata,
            },
            false,
        );
        let (events, report) = run(std::slice::from_ref(&dir), chosen.clone());
        let time = |name: &str| {
            events
                .iter()
                .find(|e| e.metadata["title"] == name)
                .map(|e| e.time.clone())
        };
        // 2024-05-06T05:08:09Z, and in UTC 07:08:09Z.
        assert_eq!(time("zoned.jpg").as_deref(), Some("1714972089/1"));
        assert_eq!(time("naive.jpg").as_deref(), Some("1714979289/1"));
        assert_eq!(time("clip.mp4").as_deref(), Some("1706972738/1"));
        assert_eq!(time("notes.txt"), None, "not a media file");
        assert_eq!(report.added, 3);
        assert_eq!(report.skipped["no recorded date"].count, 1);
        let photo = events
            .iter()
            .find(|e| e.metadata["title"] == "zoned.jpg")
            .unwrap();
        assert_eq!(photo.metadata["tags"], json!(["file:photo"]));
        assert_eq!(
            photo.metadata["sources"],
            json!([Url::from_file_path(dir.join("zoned.jpg")).unwrap().as_str()])
        );
        assert!(
            photo.metadata.get("location").is_none(),
            "no location unless asked"
        );
        chosen.location = true;
        let (events, _) = run(std::slice::from_ref(&dir), chosen);
        let photo = events
            .iter()
            .find(|e| e.metadata["title"] == "zoned.jpg")
            .unwrap();
        let location = &photo.metadata["location"];
        assert!((location["latitude"].as_f64().unwrap() - 51.5).abs() < 1e-9);
        assert!((location["longitude"].as_f64().unwrap() + 0.125).abs() < 1e-9);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn any_file_by_its_file_dates_through_subfolders() {
        let dir = folder("any");
        fs::create_dir_all(dir.join("trip/day 1")).unwrap();
        fs::create_dir_all(dir.join(".hidden")).unwrap();
        fs::write(dir.join("a.txt"), b"a").unwrap();
        fs::write(dir.join("trip/day 1/b.pdf"), b"b").unwrap();
        fs::write(dir.join(".hidden/c.txt"), b"c").unwrap();
        fs::write(dir.join(".dotfile"), b"d").unwrap();
        let when = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_600_000_000);
        fs::File::options()
            .write(true)
            .open(dir.join("a.txt"))
            .unwrap()
            .set_modified(when)
            .unwrap();
        let modified = settings(
            FileType::AnyFile {
                date: FileDate::Modified,
            },
            true,
        );
        let (events, _) = run(std::slice::from_ref(&dir), modified.clone());
        let mut titles: Vec<_> = events.iter().map(|e| e.metadata["title"].clone()).collect();
        titles.sort_by_key(|t| t.to_string());
        assert_eq!(
            titles,
            [json!("a.txt"), json!("b.pdf")],
            "hidden ones passed over"
        );
        let a = events
            .iter()
            .find(|e| e.metadata["title"] == "a.txt")
            .unwrap();
        assert_eq!(a.time, "1600000000/1");
        assert_eq!(a.metadata["tags"], json!(["file:other"]));
        // Not through subfolders; and the same IDs each time.
        let (shallow, _) = run(
            std::slice::from_ref(&dir),
            Settings {
                recursive: false,
                ..modified.clone()
            },
        );
        assert_eq!(shallow.len(), 1);
        assert_eq!(shallow[0].id, a.id);
        assert!(a.id.starts_with("file-") && a.id.len() == 21);
        // Created, where the file system keeps it.
        let (created, report) = run(
            std::slice::from_ref(&dir),
            settings(
                FileType::AnyFile {
                    date: FileDate::Created,
                },
                true,
            ),
        );
        assert_eq!(
            created.len() + report.skipped.get("no file date").map_or(0, |s| s.count),
            2
        );
        // Cancelled, it stops and says so.
        let (none, report) = populate(
            std::slice::from_ref(&dir),
            &modified,
            &AtomicBool::new(true),
            &|_| {},
        );
        assert!(none.is_empty() && report.truncated);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn only_safe_local_files_open() {
        let dir = folder("open");
        let photo = dir.join("photo one.jpg");
        fs::write(&photo, b"x").unwrap();
        let link = Url::from_file_path(&photo).unwrap().to_string();
        assert!(link.contains("photo%20one.jpg"));
        assert_eq!(
            local_file(&link).unwrap(),
            fs::canonicalize(&photo).unwrap()
        );
        assert!(local_file(&link.replace("file:///", "file://localhost/")).is_ok());
        for refused in [
            "https://example.com/a.jpg",
            "file://server/share/a.jpg",
            "file:///nowhere/at/all.jpg",
            "not a link",
        ] {
            assert!(local_file(refused).is_err(), "{refused}");
        }
        for name in ["run.sh", "setup.EXE", "launch.desktop", "Thing.app"] {
            let path = dir.join(name);
            fs::write(&path, b"x").unwrap();
            let link = Url::from_file_path(&path).unwrap().to_string();
            assert!(local_file(&link).is_err(), "{name}");
            assert!(
                local_path(&link).is_ok(),
                "{name} can still be shown in its folder"
            );
        }
        let folder_link = Url::from_file_path(&dir).unwrap().to_string();
        assert!(local_file(&folder_link).is_err(), "folders aren't opened");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let program = dir.join("program");
            fs::write(&program, b"x").unwrap();
            fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();
            let link = Url::from_file_path(&program).unwrap().to_string();
            assert!(local_file(&link).is_err(), "executable");
            // A photo from a memory card, executable as such files often are, still opens.
            fs::set_permissions(&photo, fs::Permissions::from_mode(0o777)).unwrap();
            assert!(local_file(Url::from_file_path(&photo).unwrap().as_ref()).is_ok());
            // A link named like a photo, pointing at a script, is judged by its target too.
            let script = dir.join("real.sh");
            fs::write(&script, b"x").unwrap();
            std::os::unix::fs::symlink(&script, dir.join("innocent.jpg")).unwrap();
            let link = Url::from_file_path(dir.join("innocent.jpg"))
                .unwrap()
                .to_string();
            assert!(local_file(&link).is_err(), "a link to a script");
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
