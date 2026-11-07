// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Which files on this computer a timeline may make the app picture, show or open, and which
//! timelines the user trusted. A timeline names files by its `file:///` links, and a timeline can
//! come from anyone, so the page's word is never enough: a link is followed only when its file
//! is in a folder the user chose, or the timeline open is one the user trusted.
//!
//! - **Chosen folders:** the folders (and files) timelines were populated from, remembered
//!   across starts; and the folder of the timeline file open now, picked in the open or import
//!   dialog, for that timeline only.
//! - **Trusted timelines:** once the user trusts a timeline, in a native dialog the page can't
//!   answer (main.rs asks before opening one of its files, or showing one outside those
//!   folders), it may name files anywhere on this computer. Trust is remembered by the
//!   timeline file's path; a timeline made in the page, with no file, is trusted until another
//!   file opens.
//! - **Images from other sites** (the page's own concern: it holds them back until shown) are
//!   remembered here too, by the same path, since only this process knows which file is open.
//!
//! A link is checked on the path it writes before the file system is touched, so a link
//! elsewhere never reaches it: the page learns nothing of whether such a file exists, and no
//! automounter wakes (on macOS `/net/<host>` mounts a server's shares when first looked at). The
//! network automount folders are refused even in a trusted timeline. It is checked again on its
//! real path (canonical), so a link in a chosen folder can't leave it by a symbolic link.
//!
//! What was trusted, and the folders, are kept in `access.json` in the app's config folder,
//! readable only by the user: they name the user's folders and files.
use serde::{Deserialize, Serialize};
use std::{
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
/// The most folders remembered as populated from, and timelines remembered as trusted.
pub const MOST_FOLDERS: usize = 64;
pub const MOST_TIMELINES: usize = 256;
/// Folders where looking at a path mounts a server's shares (the `-hosts` automount map on macOS
/// and many Linux systems): never touched for a timeline, trusted or not.
#[cfg(unix)]
const NETWORK: &[&str] = &["/net", "/Network", "/System/Volumes/Data/net"];
#[cfg(not(unix))]
const NETWORK: &[&str] = &[];
/// A chosen folder (or file): as picked, which is how its files' links write it, and its real
/// path (canonical), which they must stay under.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Root {
    pub picked: PathBuf,
    pub real: PathBuf,
}
impl Root {
    /// `path` as a chosen folder or file; None when it can't be read.
    pub fn new(path: &Path) -> Option<Root> {
        Some(Root {
            picked: path.to_path_buf(),
            real: std::fs::canonicalize(path).ok()?,
        })
    }
}
/// Where the timeline open came from, and what the user trusted it with.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Origin {
    /// The timeline file picked in the open or import dialog (its real path), by which its
    /// trust is remembered; None for a timeline made here.
    pub file: Option<PathBuf>,
    /// That file's folder, whose files the timeline may name.
    pub folder: Option<Root>,
    /// Whether the user trusted it: it may name files anywhere.
    pub trusted: bool,
    /// Whether its images from other sites show.
    pub images: bool,
}
/// What is kept in `access.json`.
#[derive(Default, Serialize, Deserialize)]
struct Remembered {
    /// Folders and files timelines were populated from, the latest first.
    #[serde(default)]
    folders: Vec<Root>,
    /// Timeline files (real paths) the user trusted, the latest first.
    #[serde(default)]
    trusted: Vec<PathBuf>,
    /// Timeline files whose images from other sites the user chose to show, the latest first.
    #[serde(default)]
    images: Vec<PathBuf>,
}
/// Puts `item` first in `list`, once, keeping at most `most`.
fn remember<T: PartialEq>(list: &mut Vec<T>, item: T, most: usize) {
    list.retain(|known| *known != item);
    list.insert(0, item);
    list.truncate(most);
}
/// The access state, in Tauri's state.
#[derive(Default)]
pub struct Access {
    remembered: Mutex<Remembered>,
    /// Where `access.json` is kept (None in tests, and when the config folder is unknown).
    store: Mutex<Option<PathBuf>>,
    /// The timeline open in this process, and one opened but not yet accepted by the editor.
    current: Mutex<Origin>,
    pending: Mutex<Option<Origin>>,
    /// Whether the user trusted a timeline the page holds that this process has no file of (a
    /// new one, or one from a server), until a file is opened.
    page: Mutex<bool>,
}
/// Why a link isn't followed.
#[derive(Debug, PartialEq)]
pub enum Refusal {
    /// Outside the chosen folders, in a timeline not trusted: the user may trust it.
    Untrusted,
    /// Never followed: not a path on this computer, or in a network automount folder.
    Never,
    /// It isn't there, or can't be read.
    Missing,
}
impl Access {
    /// Reads what was remembered from `access.json` in `folder`, where changes are then kept.
    pub fn load(&self, folder: PathBuf) {
        let file = folder.join("access.json");
        if let Ok(bytes) = std::fs::read(&file) {
            let mut remembered: Remembered = serde_json::from_slice(&bytes).unwrap_or_default();
            remembered.folders.truncate(MOST_FOLDERS);
            remembered.trusted.truncate(MOST_TIMELINES);
            remembered.images.truncate(MOST_TIMELINES);
            if let Ok(mut known) = self.remembered.lock() {
                *known = remembered;
            }
        }
        if let Ok(mut store) = self.store.lock() {
            *store = Some(file);
        }
    }
    /// Writes what is remembered to `access.json`, readable only by the user. A failure only
    /// means it is asked again next time.
    fn keep(&self, remembered: &Remembered) {
        let Some(file) = self.store.lock().ok().and_then(|store| store.clone()) else {
            return;
        };
        if let (Some(folder), Ok(bytes)) = (file.parent(), serde_json::to_vec(remembered)) {
            let _ = std::fs::create_dir_all(folder);
            let _ = write_private(&file, &bytes);
        }
    }
    /// The timeline the page shows: the open file's when `open` (the editor named the file's
    /// current generation), else one the page holds alone.
    pub fn origin(&self, open: bool) -> Origin {
        if open {
            if let Ok(current) = self.current.lock() {
                return current.clone();
            }
        }
        Origin {
            trusted: self.page.lock().map(|page| *page).unwrap_or(false),
            images: true,
            ..Origin::default()
        }
    }
    /// A timeline file picked in the open or import dialog is about to open: trusted, and its
    /// images shown, as the user chose before.
    pub fn opening(&self, picked: &Path) {
        let file = std::fs::canonicalize(picked).unwrap_or_else(|_| picked.to_path_buf());
        let (trusted, images) = match self.remembered.lock() {
            Ok(known) => (
                known.trusted.contains(&file),
                known.trusted.contains(&file) || known.images.contains(&file),
            ),
            Err(_) => (false, false),
        };
        self.pend(Origin {
            folder: picked.parent().and_then(Root::new),
            file: Some(file),
            trusted,
            images,
        });
    }
    /// A timeline was populated from `roots`, which the user picked: remembered as chosen
    /// folders, and the timeline, the user's own, is trusted.
    pub fn populated(&self, roots: &[PathBuf]) {
        if let Ok(mut known) = self.remembered.lock() {
            for root in roots.iter().filter_map(|root| Root::new(root)) {
                remember(&mut known.folders, root, MOST_FOLDERS);
            }
            self.keep(&known);
        }
        self.pend(Origin {
            trusted: true,
            images: true,
            ..Origin::default()
        });
    }
    /// The page's own timeline moved into a file of this process's (desktop_stage): it keeps
    /// the trust it had.
    pub fn staged(&self) {
        let origin = self.origin(false);
        self.pend(origin);
    }
    fn pend(&self, origin: Origin) {
        if let Ok(mut pending) = self.pending.lock() {
            *pending = Some(origin);
        }
    }
    /// The editor accepted the pending timeline: it is the one open now. A timeline the page
    /// held alone is no longer trusted.
    pub fn accepted(&self) {
        let Some(origin) = self.pending.lock().ok().and_then(|mut p| p.take()) else {
            return;
        };
        if let Ok(mut current) = self.current.lock() {
            *current = origin;
        }
        if let Ok(mut page) = self.page.lock() {
            *page = false;
        }
    }
    /// The timeline `origin` was saved to `path`, which is now the file open: what the user
    /// trusted it with is remembered for that file too.
    pub fn saved(&self, origin: Origin, path: &Path) {
        let file = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if let Ok(mut known) = self.remembered.lock() {
            if origin.trusted {
                remember(&mut known.trusted, file.clone(), MOST_TIMELINES);
            }
            if origin.images {
                remember(&mut known.images, file.clone(), MOST_TIMELINES);
            }
            if origin.trusted || origin.images {
                self.keep(&known);
            }
        }
        let folder = origin.folder.or_else(|| path.parent().and_then(Root::new));
        if let Ok(mut current) = self.current.lock() {
            *current = Origin {
                file: Some(file),
                folder,
                ..origin
            };
        }
    }
    /// The user trusted the timeline the page shows (`open` as for `origin`): remembered for
    /// its file, or, for one the page holds alone, until a file opens.
    pub fn trust(&self, open: bool) {
        if !open {
            if let Ok(mut page) = self.page.lock() {
                *page = true;
            }
            return;
        }
        let file = match self.current.lock() {
            Ok(mut current) => {
                current.trusted = true;
                current.images = true;
                current.file.clone()
            }
            Err(_) => return,
        };
        if let (Some(file), Ok(mut known)) = (file, self.remembered.lock()) {
            remember(&mut known.trusted, file.clone(), MOST_TIMELINES);
            remember(&mut known.images, file, MOST_TIMELINES);
            self.keep(&known);
        }
    }
    /// The user chose to show the images from other sites of the timeline file open: remembered.
    pub fn show_images(&self) {
        let file = match self.current.lock() {
            Ok(mut current) => {
                current.images = true;
                current.file.clone()
            }
            Err(_) => return,
        };
        if let (Some(file), Ok(mut known)) = (file, self.remembered.lock()) {
            remember(&mut known.images, file, MOST_TIMELINES);
            self.keep(&known);
        }
    }
    /// The real path of the file at `path` (from a timeline's link), if `origin` may name it:
    /// in a chosen folder, or anywhere but the network automount folders once trusted. `path`
    /// is checked before the file system is touched, and its real path after.
    pub fn allows(&self, origin: &Origin, path: &Path) -> Result<PathBuf, Refusal> {
        let folders = self
            .remembered
            .lock()
            .map(|known| known.folders.clone())
            .unwrap_or_default();
        let roots: Vec<&Root> = folders.iter().chain(origin.folder.as_ref()).collect();
        allowed(&roots, origin.trusted, path)
    }
}
/// Whether `path` may be followed (see `Access::allows`), against the chosen `roots`, and
/// anywhere once `trusted`.
fn allowed(roots: &[&Root], trusted: bool, path: &Path) -> Result<PathBuf, Refusal> {
    // Only whole paths, and none that climb: links are written plainly. The text is checked
    // too, because in a Windows verbatim path (`\\?\C:\...`) a `/../` is not a component of
    // its own, yet opening the path still climbs.
    let climbs = path
        .to_string_lossy()
        .split(['/', '\\'])
        .any(|part| part == ".." || part == ".");
    if !path.is_absolute()
        || climbs
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err(Refusal::Never);
    }
    let network = |path: &Path| NETWORK.iter().any(|folder| path.starts_with(folder));
    let chosen = roots
        .iter()
        .any(|root| path.starts_with(&root.picked) || path.starts_with(&root.real));
    if !chosen && network(path) {
        return Err(Refusal::Never);
    }
    if !chosen && !trusted {
        return Err(Refusal::Untrusted);
    }
    let real = std::fs::canonicalize(path).map_err(|_| Refusal::Missing)?;
    if roots.iter().any(|root| real.starts_with(&root.real)) || (trusted && !network(&real)) {
        Ok(real)
    } else if trusted {
        Err(Refusal::Never)
    } else {
        Err(Refusal::Untrusted)
    }
}
/// Writes `bytes` to `path`, readable only by the user from the start (0600 on Unix).
fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("och-access-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::canonicalize(dir).unwrap()
    }

    /// An untrusted timeline names files only in the folders chosen; a trusted one anywhere but
    /// the network automount folders; and the path is checked before anything is read.
    #[test]
    fn links_are_followed_only_in_chosen_folders_or_trusted_timelines() {
        let dir = folder("roots");
        let (photos, elsewhere) = (dir.join("photos"), dir.join("elsewhere"));
        fs::create_dir_all(photos.join("trip")).unwrap();
        fs::create_dir_all(&elsewhere).unwrap();
        let (inside, outside) = (photos.join("trip/a.jpg"), elsewhere.join("b.jpg"));
        fs::write(&inside, b"a").unwrap();
        fs::write(&outside, b"b").unwrap();
        let root = Root::new(&photos).unwrap();
        let roots = [&root];
        assert_eq!(allowed(&roots, false, &inside), Ok(inside.clone()));
        assert_eq!(allowed(&roots, false, &outside), Err(Refusal::Untrusted));
        assert_eq!(allowed(&roots, true, &outside), Ok(outside.clone()));
        // A sibling whose name only starts the same isn't inside.
        let sibling = dir.join("photos-old/c.jpg");
        assert_eq!(allowed(&roots, false, &sibling), Err(Refusal::Untrusted));
        // Missing files are told apart only where the timeline may look.
        assert_eq!(
            allowed(&roots, false, &photos.join("gone.jpg")),
            Err(Refusal::Missing)
        );
        assert_eq!(
            allowed(&roots, false, &elsewhere.join("gone.jpg")),
            Err(Refusal::Untrusted)
        );
        // Never relative or climbing, and never the network automount folders.
        assert_eq!(
            allowed(&roots, true, Path::new("photos/a.jpg")),
            Err(Refusal::Never)
        );
        assert_eq!(
            allowed(&roots, true, &photos.join("../elsewhere/b.jpg")),
            Err(Refusal::Never)
        );
        #[cfg(unix)]
        {
            for path in [
                "/net/attacker.example/share/a.jpg",
                "/Network/Servers/x/a.jpg",
            ] {
                assert_eq!(allowed(&roots, true, Path::new(path)), Err(Refusal::Never));
                assert_eq!(allowed(&roots, false, Path::new(path)), Err(Refusal::Never));
            }
            // A symbolic link in a chosen folder doesn't lead out of it.
            let link = photos.join("out.jpg");
            std::os::unix::fs::symlink(&outside, &link).unwrap();
            assert_eq!(allowed(&roots, false, &link), Err(Refusal::Untrusted));
            assert_eq!(allowed(&roots, true, &link), Ok(outside.clone()));
            // A folder chosen through a symbolic link: its links write the path as picked.
            let alias = dir.join("alias");
            std::os::unix::fs::symlink(&photos, &alias).unwrap();
            let aliased = Root::new(&alias).unwrap();
            assert_eq!(
                allowed(&[&aliased], false, &alias.join("trip/a.jpg")),
                Ok(inside.clone())
            );
            assert_eq!(allowed(&[&aliased], false, &inside), Ok(inside.clone()));
        }
        fs::remove_dir_all(dir).unwrap();
    }

    /// A file opened lets its timeline name files in its folder; trust, given once, is
    /// remembered for the file across starts, and so is showing images; a populated timeline
    /// is trusted and its folders chosen for every timeline.
    #[test]
    fn trust_is_remembered_per_timeline_file() {
        let dir = folder("trust");
        let (config, downloads, pictures) = (
            dir.join("config"),
            dir.join("Downloads"),
            dir.join("Pictures"),
        );
        for folder in [&downloads, &pictures] {
            fs::create_dir_all(folder).unwrap();
        }
        let timeline = downloads.join("shared.och");
        let (beside, photo) = (downloads.join("a.jpg"), pictures.join("b.jpg"));
        for file in [&timeline, &beside, &photo] {
            fs::write(file, b"x").unwrap();
        }
        let access = Access::default();
        access.load(config.clone());
        access.opening(&timeline);
        // Not open until accepted.
        assert_eq!(access.origin(true), Origin::default());
        access.accepted();
        let origin = access.origin(true);
        assert_eq!(origin.file.as_deref(), Some(timeline.as_path()));
        assert!(!origin.trusted && !origin.images);
        assert_eq!(access.allows(&origin, &beside), Ok(beside.clone()));
        assert_eq!(access.allows(&origin, &photo), Err(Refusal::Untrusted));
        // A timeline the page holds alone (another view) is not this file's.
        assert!(!access.origin(false).trusted);
        assert_eq!(
            access.allows(&access.origin(false), &beside),
            Err(Refusal::Untrusted)
        );
        // Images shown, then trusted: both remembered, here and in access.json.
        access.show_images();
        assert!(access.origin(true).images && !access.origin(true).trusted);
        access.trust(true);
        assert!(access.origin(true).trusted);
        assert_eq!(
            access.allows(&access.origin(true), &photo),
            Ok(photo.clone())
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(config.join("access.json"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        let later = Access::default();
        later.load(config.clone());
        later.opening(&timeline);
        later.accepted();
        assert!(later.origin(true).trusted && later.origin(true).images);
        // Another file in the same folder is a timeline of its own.
        let other = downloads.join("other.och");
        fs::write(&other, b"x").unwrap();
        later.opening(&other);
        later.accepted();
        assert!(!later.origin(true).trusted && !later.origin(true).images);
        // Populating chooses the folder for every timeline, and trusts the new one.
        later.populated(std::slice::from_ref(&pictures));
        later.accepted();
        assert!(later.origin(true).trusted && later.origin(true).file.is_none());
        later.opening(&other);
        later.accepted();
        assert_eq!(later.allows(&later.origin(true), &photo), Ok(photo.clone()));
        // Saving a trusted timeline elsewhere trusts the copy.
        later.populated(&[]);
        later.accepted();
        let copy = dir.join("copy.och");
        fs::write(&copy, b"x").unwrap();
        later.saved(later.origin(true), &copy);
        assert_eq!(later.origin(true).file.as_deref(), Some(copy.as_path()));
        let again = Access::default();
        again.load(config);
        again.opening(&copy);
        again.accepted();
        assert!(again.origin(true).trusted);
        // A timeline the page holds alone is trusted once asked, until a file opens.
        again.trust(false);
        assert!(again.origin(false).trusted);
        again.opening(&other);
        again.accepted();
        assert!(!again.origin(false).trusted);
        fs::remove_dir_all(dir).unwrap();
    }
}
