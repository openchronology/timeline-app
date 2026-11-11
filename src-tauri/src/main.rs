#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! The desktop app (Tauri): the commands its editor calls to open, import, browse and save SQLite
//! timeline files through native-store, and to reach servers (server.rs).
//!
//! The editor (src/app.ts) calls these commands over Tauri's IPC with
//! `window.__TAURI__.core.invoke`. Every command returns `Result<_, String>`; an error string
//! rejects the editor's promise and is shown to the user, so errors are written as readable
//! sentences.
//!
//! State kept here, as Tauri-managed state:
//! - `Mutex<Files>`: the open timeline file, its disk-backed baseline (`Snapshot`), a file
//!   picked but not yet accepted, and the baselines kept for undoing changes made at once.
//!   Its `generation` counts every change of baseline; the editor passes the generation it
//!   last saw, and commands refuse to act on a baseline it has not seen.
//! - `server::Server`: the connected servers and their sign-ins (server.rs).
//! - `Population`: the folders and files picked for the file populator (populate.rs), the only
//!   paths it scans, whether the one running was cancelled, and the folders timelines were
//!   populated from (whose files the system's thumbnailers may read; thumbnails.rs).
//! - `access::Access`: which files on this computer the timeline open may make the app picture,
//!   show or open, and which timelines the user trusted (access.rs). The page names files only
//!   by a timeline's links, and every command that follows one asks it first.
//!
//! File work runs on Tauri's blocking thread pool (`spawn_blocking`), so long reads and saves
//! never stall the async runtime that serves IPC.
mod access;
mod populate;
mod server;
mod system_thumbnails;
mod thumbnails;
use openchronology_store::{Document, Header, Patch, Query, Snapshot};
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
/// Opens a public HTTPS link in the system browser rather than in the webview: image links
/// (the image field, the download menu's links) and help pages. Errors on any other kind of
/// URL (see `server::image_source`) or when no browser can be started.
#[tauri::command]
fn desktop_open_image(url: String) -> Result<(), String> {
    server::open_image(&url)
}
/// Where the latest release is read (#601): GitHub's API for the project's releases.
const LATEST_RELEASE: &str =
    "https://api.github.com/repos/openchronology/timeline-app/releases/latest";
/// The running release and, when `ask`, the latest published one (#601), for the editor's
/// update banner: `{"current": tag, "latest": tag, "notes": url}`. A build that is not a
/// release (no OCH_BUILD_VERSION when it was compiled) has `current` null and asks nothing.
/// The request carries nothing but itself; when GitHub cannot be reached or answers oddly,
/// `latest` is left out. Without `ask` it only says which release is running, so the editor
/// keeps to one request a day.
#[tauri::command]
async fn desktop_latest_release(ask: bool) -> Result<serde_json::Value, String> {
    let Some(current) = option_env!("OCH_BUILD_VERSION") else {
        return Ok(serde_json::json!({ "current": null }));
    };
    if !ask {
        return Ok(serde_json::json!({ "current": current }));
    }
    let read = async {
        let client = reqwest::Client::builder()
            .user_agent("OpenChronology")
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .ok()?;
        let reply = client
            .get(LATEST_RELEASE)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .ok()?;
        if !reply.status().is_success() {
            return None;
        }
        let body: serde_json::Value = reply.json().await.ok()?;
        let tag = body.get("tag_name")?.as_str()?;
        // A version tag (v1.2.3 and the like), short, so the editor shows nothing stranger.
        if tag.len() > 64
            || !tag
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
        {
            return None;
        }
        let notes = format!("https://github.com/openchronology/timeline-app/releases/tag/{tag}");
        Some((tag.to_string(), notes))
    };
    Ok(match read.await {
        Some((latest, notes)) => {
            serde_json::json!({ "current": current, "latest": latest, "notes": notes })
        }
        None => serde_json::json!({ "current": current }),
    })
}
/// The connected servers' origins, the one in use first, for the editor's server list.
#[tauri::command]
fn desktop_servers(state: tauri::State<'_, server::Server>) -> Result<Vec<String>, String> {
    state.servers()
}
/**
 * Remembers the connected servers (not their sign-ins) for the next start, in `servers.json`
 * in the app's config directory; `main`'s setup reads it back.
 */
fn remember_servers(app: &tauri::AppHandle, state: &server::Server) -> Result<(), String> {
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    std::fs::write(
        directory.join("servers.json"),
        serde_json::to_vec(&state.servers()?).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
/// Connects to the server at `origin` (or uses an already connected one), making it the one
/// in use, and remembers the list. Errors on an invalid origin, when eight servers are already
/// connected, or when the list cannot be written.
#[tauri::command]
fn desktop_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, server::Server>,
    origin: String,
) -> Result<(), String> {
    state.connect(&origin)?;
    remember_servers(&app, &state)
}
/// Disconnects from the server at `origin`, forgetting its sign-in, and remembers the list.
#[tauri::command]
fn desktop_disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, server::Server>,
    origin: String,
) -> Result<(), String> {
    state.disconnect(&origin)?;
    remember_servers(&app, &state)
}
/// Sends one API request to a connected server for the editor (src/transport.ts): `path`
/// under `/api/`, an HTTP `method`, an optional JSON body, and the CSRF token and
/// human-verification answer the server asked for. The session credential stays in this
/// process and never reaches the webview. Resolves to the status and JSON body, whatever the
/// status; errors when the request is refused locally, the server cannot be reached, or the
/// connection changed while it was in flight.
#[tauri::command]
async fn desktop_request(
    state: tauri::State<'_, server::Server>,
    server: String,
    path: String,
    method: String,
    data: Option<serde_json::Value>,
    csrf: Option<String>,
    challenge: Option<String>,
) -> Result<server::Reply, String> {
    state
        .request(&server, &path, &method, data, csrf, challenge)
        .await
}
/// Starts a device sign-in to `server`: the server issues a code, the sign-in page opens in
/// the system browser, and the reply (user code, verification URL, whether the browser opened)
/// tells the editor what to show. The editor then calls `desktop_auth_poll`.
#[tauri::command]
async fn desktop_auth_start(
    state: tauri::State<'_, server::Server>,
    server: String,
) -> Result<serde_json::Value, String> {
    state.start_login(&server).await
}
/// Asks `server` whether the pending device sign-in was confirmed. Resolves to
/// `{"pending": true}` while waiting, or the session once signed in (its credential kept here).
/// Errors when no sign-in is pending or it expired.
#[tauri::command]
async fn desktop_auth_poll(
    state: tauri::State<'_, server::Server>,
    server: String,
) -> Result<serde_json::Value, String> {
    state.poll_login(&server).await
}
/// What the editor receives for an opened, imported, staged or saved timeline: the header
/// (settings, moment count, time range), flattened into the reply.
#[derive(serde::Serialize)]
struct Opened {
    #[serde(flatten)]
    header: Header,
    /// The file's path (for an import or a staged document, its private disk copy's path).
    path: String,
    /// The generation to pass with later queries and saves of this baseline.
    generation: u64,
}
/// The size and modification time of a file and of its `-wal` file (None when missing), to
/// notice when another program changes a file while the app has it open.
#[derive(Clone, PartialEq)]
struct Stamp(Vec<Option<(u64, std::time::SystemTime)>>);
/// The current `Stamp` of the file at `path`. Errors when its metadata cannot be read.
fn stamp(path: &std::path::Path) -> Result<Stamp, String> {
    let mut files = Vec::new();
    for name in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.to_string_lossy())),
    ] {
        match std::fs::metadata(name) {
            Ok(meta) => files.push(Some((
                meta.len(),
                meta.modified().map_err(|e| e.to_string())?,
            ))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => files.push(None),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(Stamp(files))
}
/// The open timeline, behind a `Mutex` in Tauri's state.
#[derive(Default)]
struct Files {
    /// The file the editor has open and saves to (None before the first open).
    current: Option<PathBuf>,
    /// Its disk-backed baseline, which answers queries and takes saves. Shared with commands
    /// in flight through the `Arc`, so a slow query never holds the lock.
    baseline: Option<Arc<Snapshot>>,
    /// A file opened, imported or staged but not yet accepted by the editor: its path,
    /// baseline and stamp. `desktop_accept_open` makes it current.
    pending: Option<(PathBuf, Arc<Snapshot>, Stamp)>,
    /// The current file's stamp when last opened or saved, to detect outside changes.
    stamp: Option<Stamp>,
    /// Incremented whenever `baseline` changes (accept, save, staged change, undo/redo).
    generation: u64,
    /// The baseline's number among those changes made at once produced (#179), and the
    /// others still kept, so the editor can undo and redo them until the file is saved.
    baseline_id: u64,
    kept: Vec<(u64, Arc<Snapshot>)>,
    next_id: u64,
}
/// How many baselines changes made at once keep for undoing them.
const KEPT_BASELINES: usize = 8;
impl Files {
    /// Makes `baseline` the open timeline's, keeping the one before for undo; its number.
    fn replace_baseline(&mut self, baseline: Arc<Snapshot>, id: Option<u64>) -> u64 {
        if let Some(previous) = self.baseline.take() {
            self.kept.retain(|(n, _)| *n != self.baseline_id);
            self.kept.push((self.baseline_id, previous));
            if self.kept.len() > KEPT_BASELINES {
                self.kept.remove(0);
            }
        }
        let id = id.unwrap_or_else(|| {
            self.next_id += 1;
            self.next_id
        });
        self.kept.retain(|(n, _)| *n != id);
        self.baseline = Some(baseline);
        self.baseline_id = id;
        self.generation += 1;
        id
    }
    /// Forgets kept baselines: the file was saved, or another opened.
    fn forget_kept(&mut self) {
        self.kept.clear();
        self.next_id += 1;
        self.baseline_id = self.next_id;
    }
    /// The reply describing the current baseline and generation. Errors if none is open.
    fn opened(&self) -> Result<Opened, String> {
        Ok(Opened {
            header: self
                .baseline
                .as_ref()
                .ok_or("No timeline file is open")?
                .header()?,
            path: self
                .current
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default(),
            generation: self.generation,
        })
    }
}
/// The reply to a change made at once, or an undo or redo of one.
#[derive(serde::Serialize)]
struct Staged {
    #[serde(flatten)]
    opened: Opened,
    /// The baselines before and after: what undo and redo take back to.
    before: u64,
    after: u64,
}
/// How many of a staged patch's changes are applied, sent over a channel as it goes.
#[derive(Clone, serde::Serialize)]
struct Progress {
    done: usize,
    total: usize,
}
/// Applies `patch` to the open timeline at once, unsaved (#179): bulk edits such as deleting
/// everything in a view or shifting times, which would be too many to keep as edits in the
/// page. The file changes only when saved; until then undo can take the change back.
///
/// Inputs: the editor's `generation`, the `patch`, and a channel for progress reports.
/// Resolves to the new header and generation with the baseline numbers for undo and redo.
/// Errors when the patch is invalid or the open file changed meanwhile (checked before and
/// after applying, which runs without the lock held).
#[tauri::command]
async fn desktop_stage_patch(
    app: tauri::AppHandle,
    generation: u64,
    patch: Patch,
    progress: tauri::ipc::Channel<Progress>,
) -> Result<Staged, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let current = baseline(&app, generation)?;
        let staged = current.with_patch(&patch, &|done, total| {
            let _ = progress.send(Progress { done, total });
        })?;
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        if files.generation != generation {
            return Err("The open timeline file changed".into());
        }
        let before = files.baseline_id;
        let after = files.replace_baseline(Arc::new(staged), None);
        Ok(Staged {
            opened: files.opened()?,
            before,
            after,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Goes back (or forward again) to a baseline a change made at once left: undo and redo.
///
/// `baseline` is a number from an earlier `Staged` reply. Errors when the file changed or
/// that baseline is no longer kept (saved since, or more than eight changes ago).
#[tauri::command]
async fn desktop_restore_baseline(
    app: tauri::AppHandle,
    generation: u64,
    baseline: u64,
) -> Result<Staged, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        if files.generation != generation {
            return Err("The open timeline file changed".into());
        }
        let snapshot = files
            .kept
            .iter()
            .find(|(n, _)| *n == baseline)
            .map(|(_, s)| s.clone())
            .ok_or("That change can no longer be undone.")?;
        let before = files.baseline_id;
        let after = files.replace_baseline(snapshot, Some(baseline));
        Ok(Staged {
            opened: files.opened()?,
            before,
            after,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Lets the user pick a timeline file (`.och`, `.sqlite`) and copies it into a new baseline.
///
/// Opening has two steps so a file the editor rejects never replaces the open one: this
/// command leaves the new baseline pending and returns its header; the editor validates the
/// header and then calls `desktop_accept_open`, which answers with the generation it has. Resolves to
/// None when the dialog is cancelled. Errors when the file is not a valid timeline, or changed
/// while being copied (its stamp is compared before and after).
#[tauri::command]
async fn desktop_open(app: tauri::AppHandle) -> Result<Option<Opened>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("OpenChronology timeline", &["och", "sqlite"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let before = stamp(&path)?;
        let baseline = Arc::new(Snapshot::open(&path)?);
        if before != stamp(&path)? {
            return Err("The file changed while opening. Please retry.".into());
        }
        let header = baseline.header()?;
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        files.pending = Some((path.clone(), baseline, before));
        app.state::<access::Access>().opening(&path);
        Ok(Some(Opened {
            header,
            path: path.to_string_lossy().into_owned(),
            generation: files.generation + 1,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Lets the user pick a JSON timeline (`.ochx`, `.json`, at most 32 MiB) and stages it as a
/// pending baseline, as `desktop_open` does; its path is the private copy's, so the editor
/// saves it with Save As. Resolves to None when cancelled; errors on an oversized or invalid
/// document.
#[tauri::command]
async fn desktop_import(app: tauri::AppHandle) -> Result<Option<Opened>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("OpenChronology JSON timeline", &["ochx", "json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let input = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        if input.metadata().map_err(|e| e.to_string())?.len() > 32 * 1024 * 1024 {
            return Err(
                "JSON imports are limited to 32 MiB. Use .och for larger timelines.".into(),
            );
        }
        // Read one byte past the limit, so a file that grew after the size check fails to
        // parse instead of being read whole.
        let document: Document =
            serde_json::from_reader(std::io::BufReader::new(input).take(32 * 1024 * 1024 + 1))
                .map_err(|e| e.to_string())?;
        let baseline = Arc::new(Snapshot::from_document(&document)?);
        let picked = path;
        let path = baseline.path().to_path_buf();
        let before = stamp(&path)?;
        let header = baseline.header()?;
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        files.pending = Some((path.clone(), baseline, before));
        // Its trust, and the folder whose files it may name, are the picked file's.
        app.state::<access::Access>().opening(&picked);
        Ok(Some(Opened {
            header,
            path: path.to_string_lossy().into_owned(),
            generation: files.generation + 1,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
/// The file populator's picked folders and files (#433): the only paths it scans, chosen in the
/// native dialog so the page never names one; whether the population running was cancelled;
/// and the folders and files timelines were populated from (canonical, the latest
/// MOST_POPULATED), remembered across starts in `populated.json` in the app's config folder.
#[derive(Default)]
struct Population {
    roots: Mutex<Vec<PathBuf>>,
    cancel: AtomicBool,
    populated: Mutex<Vec<PathBuf>>,
}
/// The most folders remembered as populated from.
const MOST_POPULATED: usize = 64;
/// Remembers that timelines were populated from `roots`, here and in `populated.json`, the
/// latest first, so the system's thumbnailers may read their files (thumbnails.rs) this time
/// and next. The file is the user's alone (0600 on Unix): it names the user's folders.
fn remember_populated(app: &tauri::AppHandle, roots: &[PathBuf]) -> Result<(), String> {
    let state = app.state::<Population>();
    let mut populated = state.populated.lock().map_err(|e| e.to_string())?;
    for root in roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
    {
        populated.retain(|known| *known != root);
        populated.insert(0, root);
    }
    populated.truncate(MOST_POPULATED);
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    thumbnails::write_private(
        &directory.join("populated.json"),
        &serde_json::to_vec(&*populated).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
/// Adds folders (or, with `folders` false, files) picked in the native dialog to the file
/// populator's list, and resolves to the whole list. A cancelled dialog leaves it as it was.
#[tauri::command]
async fn desktop_populate_pick(
    app: tauri::AppHandle,
    folders: bool,
) -> Result<Vec<String>, String> {
    let dialog = app.dialog().file();
    let picked = if folders {
        dialog.blocking_pick_folders()
    } else {
        dialog.blocking_pick_files()
    };
    let state = app.state::<Population>();
    let mut roots = state.roots.lock().map_err(|e| e.to_string())?;
    for path in picked.unwrap_or_default() {
        let path = path.into_path().map_err(|e| e.to_string())?;
        if !roots.contains(&path) {
            roots.push(path);
        }
    }
    Ok(roots
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}
/// Empties the file populator's list of folders and files.
#[tauri::command]
fn desktop_populate_clear(state: tauri::State<'_, Population>) -> Result<(), String> {
    state.roots.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}
/// Stops the population running, which then stages what it made so far.
#[tauri::command]
fn desktop_populate_cancel(state: tauri::State<'_, Population>) {
    state
        .cancel
        .store(true, std::sync::atomic::Ordering::Relaxed);
}
/// What a population answers: the staged timeline, as `desktop_import`'s, and its report.
#[derive(serde::Serialize)]
struct Populated {
    #[serde(flatten)]
    opened: Opened,
    report: populate::Report,
}
/// Makes a new timeline of the picked folders' and files' files (populate.rs), one moment per
/// file, `template` giving its title, display and plugins, and stages it as `desktop_import`
/// does: the editor adopts it, unsaved, for Save As. Tells `progress` how far it has got.
/// Errors when nothing is picked or no file was found.
#[tauri::command]
async fn desktop_populate(
    app: tauri::AppHandle,
    settings: populate::Settings,
    template: Document,
    progress: tauri::ipc::Channel<populate::Progress>,
) -> Result<Populated, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Population>();
        let roots = state.roots.lock().map_err(|e| e.to_string())?.clone();
        if roots.is_empty() {
            return Err("Choose a folder or files to populate from.".into());
        }
        state
            .cancel
            .store(false, std::sync::atomic::Ordering::Relaxed);
        let (events, report) = populate::populate(&roots, &settings, &state.cancel, &|step| {
            let _ = progress.send(step);
        });
        if events.is_empty() {
            return Err("No files there matched. Check the folders and the kind of file.".into());
        }
        // Thumbnails of these files without it would lack videos and HEIC photos; failing to
        // remember them for next time is no reason to lose the timeline.
        let _ = remember_populated(&app, &roots);
        let baseline = Arc::new(Snapshot::from_document(&populate::document(
            template, events,
        ))?);
        let path = baseline.path().to_path_buf();
        let before = stamp(&path)?;
        let header = baseline.header()?;
        let files = app.state::<Mutex<Files>>();
        let mut files = files.lock().map_err(|e| e.to_string())?;
        files.pending = Some((path.clone(), baseline, before));
        // The user picked these folders: their files may be pictured and shown, in this
        // timeline and any other, and this timeline, the user's own, is trusted.
        app.state::<access::Access>().populated(&roots);
        Ok(Populated {
            opened: Opened {
                header,
                path: path.to_string_lossy().into_owned(),
                generation: files.generation + 1,
            },
            report,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Whether the editor shows the timeline file open here: it named the file's current
/// `generation`. Otherwise it shows a timeline it holds alone (new, or from a server).
fn showing_file(app: &tauri::AppHandle, generation: Option<u64>) -> bool {
    generation.is_some()
        && app
            .state::<Mutex<Files>>()
            .lock()
            .is_ok_and(|files| Some(files.generation) == generation)
}
/// `showing_file` on the blocking pool, as a save holds the file lock it takes.
async fn showing(app: &tauri::AppHandle, generation: Option<u64>) -> Result<bool, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || showing_file(&app, generation))
        .await
        .map_err(|e| e.to_string())
}
/// What the user trusted the timeline on screen with (access.rs), for the editor: whether it
/// may name files anywhere on this computer, and whether its images from other sites show.
#[derive(serde::Serialize)]
struct Trust {
    trusted: bool,
    images: bool,
}
impl From<access::Origin> for Trust {
    fn from(origin: access::Origin) -> Trust {
        Trust {
            trusted: origin.trusted,
            images: origin.images,
        }
    }
}
/// Asks the user, in a native dialog that the page can neither answer nor draw, whether to
/// trust the timeline on screen so as to `action` (such as "Open IMG_0042.JPG in its app?").
/// Runs on the blocking pool, since the dialog waits for the user. Resolves to the answer.
async fn ask_trust(app: &tauri::AppHandle, action: String) -> Result<bool, String> {
    use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(format!(
                "{action}\n\nOpen files from a timeline only when you trust where it came from. \
                 Trusting it lets it show pictures of the files on this computer it links to, \
                 wherever they are, and open them, and shows its images from other sites. \
                 You are asked once for each timeline."
            ))
            .title("Trust this timeline?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Trust it".into(),
                "Cancel".into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())
}
/// The name a link gives its file, for a question about it, read from the link alone.
fn file_name(path: &std::path::Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}
/// A link not followed, as the editor shows it.
fn refused(refusal: access::Refusal) -> String {
    match refusal {
        access::Refusal::Missing => "That file isn't on this computer, or can't be read.",
        access::Refusal::Never | access::Refusal::Untrusted => {
            "Files there aren't opened from a timeline."
        }
    }
    .into()
}
/// Opens a moment's `file:///` source in the system's app for that file (#433), once the user
/// trusts the timeline on screen (`generation` as for `showing_file`): asked here, natively,
/// the first time, and remembered for its file (access.rs). Refuses programs, scripts and
/// anything that isn't a file on this computer (populate::local_file). Resolves to the
/// timeline's trust, which a yes changes; after a no it opens nothing.
#[tauri::command]
async fn desktop_open_file(
    app: tauri::AppHandle,
    url: String,
    generation: Option<u64>,
) -> Result<Trust, String> {
    let path = populate::local_path(&url)?;
    let open = showing(&app, generation).await?;
    let access = app.state::<access::Access>();
    if !access.origin(open).trusted {
        if !ask_trust(&app, format!("Open {} in its app?", file_name(&path))).await? {
            return Ok(access.origin(open).into());
        }
        access.trust(open);
    }
    let origin = access.origin(open);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<access::Access>()
            .allows(&origin, &path)
            .map_err(refused)?;
        populate::open_file(&url)?;
        Ok(origin.into())
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Thumbnails of the photos `urls` (`file:///` links) name (#440), in order, each a `data:` URL
/// or null when it isn't a photo on this computer or can't be read, or the timeline on screen
/// (`generation` as for `showing_file`) may not name it (access.rs): it is outside the folders
/// the user chose, and the user hasn't trusted the timeline. Made in parallel, and kept in the
/// app's cache folder (thumbnails.rs). At most 64 at once. The system's thumbnailers are run
/// only on files in folders timelines were populated from, or on any once the timeline is
/// trusted.
#[tauri::command]
async fn desktop_thumbnails(
    app: tauri::AppHandle,
    urls: Vec<String>,
    generation: Option<u64>,
) -> Result<Vec<Option<String>>, String> {
    if urls.len() > thumbnails::MOST_AT_ONCE {
        return Err("Ask for at most 64 thumbnails at once.".into());
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    let populated = app
        .state::<Population>()
        .populated
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<access::Access>();
        let origin = access.origin(showing_file(&app, generation));
        let allowed = |url: &String| {
            populate::local_path(url)
                .ok()
                .is_some_and(|path| access.allows(&origin, &path).is_ok())
        };
        let system =
            |path: &std::path::Path| origin.trusted || thumbnails::chosen(path, &populated);
        let mut found = vec![None; urls.len()];
        std::thread::scope(|scope| {
            for (chunk, found) in urls.chunks(16).zip(found.chunks_mut(16)) {
                let (cache, allowed, system) = (&cache, &allowed, &system);
                scope.spawn(move || {
                    for (url, slot) in chunk.iter().zip(found) {
                        if allowed(url) {
                            *slot = thumbnails::thumbnail(cache, url, system);
                        }
                    }
                });
            }
        });
        found
    })
    .await
    .map_err(|e| e.to_string())
}
/// Shows a moment's `file:///` source in its folder, in the system's file manager: at once in a
/// folder the user chose, or once the user trusts the timeline on screen (`generation` as for
/// `showing_file`), asked here natively (access.rs). Resolves to the timeline's trust.
#[tauri::command]
async fn desktop_reveal_file(
    app: tauri::AppHandle,
    url: String,
    generation: Option<u64>,
) -> Result<Trust, String> {
    let path = populate::local_path(&url)?;
    let open = showing(&app, generation).await?;
    let access = app.state::<access::Access>();
    let origin = access.origin(open);
    let check = {
        let (app, origin, path) = (app.clone(), origin.clone(), path.clone());
        move || app.state::<access::Access>().allows(&origin, &path)
    };
    let origin = match tauri::async_runtime::spawn_blocking(check)
        .await
        .map_err(|e| e.to_string())?
    {
        Ok(_) => origin,
        Err(access::Refusal::Untrusted) => {
            if !ask_trust(&app, format!("Show {} in its folder?", file_name(&path))).await? {
                return Ok(origin.into());
            }
            access.trust(open);
            access.origin(open)
        }
        Err(refusal) => return Err(refused(refusal)),
    };
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<access::Access>()
            .allows(&origin, &path)
            .map_err(refused)?;
        populate::reveal_file(&url)?;
        Ok(origin.into())
    })
    .await
    .map_err(|e| e.to_string())?
}
/// What the user trusted the timeline on screen with (`generation` as for `showing_file`):
/// the editor holds back a timeline file's images from other sites until they may show. On the
/// blocking pool, like the next, as a save holds the file lock `showing_file` takes.
#[tauri::command]
async fn desktop_trust(app: tauri::AppHandle, generation: Option<u64>) -> Result<Trust, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let open = showing_file(&app, generation);
        app.state::<access::Access>().origin(open).into()
    })
    .await
    .map_err(|e| e.to_string())
}
/// Shows the images from other sites of the timeline file on screen from now on, as the user
/// chose (`generation` as for `showing_file`), remembered for its file. Images are the page's
/// to show; this only remembers the choice, so it asks nothing. Resolves to the trust.
#[tauri::command]
async fn desktop_show_images(
    app: tauri::AppHandle,
    generation: Option<u64>,
) -> Result<Trust, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let open = showing_file(&app, generation);
        let access = app.state::<access::Access>();
        if open {
            access.show_images();
        }
        access.origin(open).into()
    })
    .await
    .map_err(|e| e.to_string())
}
/// Moves a document the editor holds in the page into a disk-backed baseline, pending like
/// `desktop_open`'s: the editor does this when a timeline grows past 2048 moments, so it can
/// browse it with windowed queries. Errors when the document is invalid.
#[tauri::command]
async fn desktop_stage(app: tauri::AppHandle, document: Document) -> Result<Opened, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let baseline = Arc::new(Snapshot::from_document(&document)?);
        let path = baseline.path().to_path_buf();
        let before = stamp(&path)?;
        let header = baseline.header()?;
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        files.pending = Some((path.clone(), baseline, before));
        app.state::<access::Access>().staged();
        Ok(Opened {
            header,
            path: path.to_string_lossy().into_owned(),
            generation: files.generation + 1,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Makes the pending file (from `desktop_open`, `desktop_import` or `desktop_stage`) the open
/// one, once the editor has accepted its header. `path` must be the pending one's, so a reply
/// to an older open cannot accept a newer one. Bumps the generation and forgets the undo
/// baselines of the previous file. Resolves to the new generation: the one the open reply
/// gave is only a guess, since a save or restore of the previous file may finish in between
/// (#193).
#[tauri::command]
async fn desktop_accept_open(app: tauri::AppHandle, path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        let pending = files.pending.as_ref().ok_or("No pending file to open")?;
        if pending.0.to_string_lossy() != path {
            return Err("Another file open superseded this request".into());
        }
        let (path, baseline, stamp) = files.pending.take().unwrap();
        files.current = Some(path);
        files.baseline = Some(baseline);
        files.stamp = Some(stamp);
        files.generation += 1;
        files.forget_kept();
        app.state::<access::Access>().accepted();
        Ok(files.generation)
    })
    .await
    .map_err(|e| e.to_string())?
}
/// The open baseline, if the editor's `generation` is still current. The lock is released on
/// return, so the caller works on the shared `Arc` without holding it.
fn baseline(app: &tauri::AppHandle, generation: u64) -> Result<Arc<Snapshot>, String> {
    let state = app.state::<Mutex<Files>>();
    let files = state.lock().map_err(|e| e.to_string())?;
    if files.generation != generation {
        return Err("The open timeline file changed".into());
    }
    files
        .baseline
        .clone()
        .ok_or("No timeline file is open".into())
}
/// Answers one windowed query on the open baseline (`Snapshot::query`): overview frames,
/// moment and duration pages, single entities, search, tags and relations. Errors when the
/// generation is stale or the query is invalid or too large.
#[tauri::command]
async fn desktop_query(
    app: tauri::AppHandle,
    generation: u64,
    query: Query,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || baseline(&app, generation)?.query(&query))
        .await
        .map_err(|e| e.to_string())?
}
/// The open baseline's whole document, for operations that need every entity: the complete
/// document with unsaved edits applied (to export or upload it), and bulk deletes and time
/// mappings of a large file. Errors when the generation is stale.
#[tauri::command]
async fn desktop_document(app: tauri::AppHandle, generation: u64) -> Result<Document, String> {
    tauri::async_runtime::spawn_blocking(move || baseline(&app, generation)?.document())
        .await
        .map_err(|e| e.to_string())?
}
/// Saves the open timeline, as a whole `document` or as a sparse `patch` of the open
/// baseline (exactly one of the two).
///
/// Without `save_as`, it saves to the open file, which must still be `expected_path` (the file
/// the editor believes is open) and unchanged by other programs since it was opened or last
/// saved; otherwise, or with `save_as`, the user picks the destination (`.och` added when no
/// extension is given). The saved file becomes the open one with a new baseline and
/// generation, and undo baselines are forgotten. Resolves to None when the dialog is
/// cancelled. Errors when the generation is stale, the destination changed, the file was
/// changed elsewhere, or the save itself fails (the file is then left as it was).
#[tauri::command]
async fn desktop_save(
    app: tauri::AppHandle,
    document: Option<Document>,
    patch: Option<Patch>,
    generation: Option<u64>,
    save_as: bool,
    expected_path: Option<String>,
) -> Result<Option<Opened>, String> {
    let existing = app
        .state::<Mutex<Files>>()
        .lock()
        .map_err(|e| e.to_string())?
        .current
        .clone();
    let path = if !save_as && existing.is_some() {
        if existing.as_ref().map(|p| p.to_string_lossy().into_owned()) != expected_path {
            return Err("The active file changed. Use Save As to choose the destination.".into());
        }
        existing.unwrap()
    } else {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("OpenChronology timeline", &["och", "sqlite"])
            .set_file_name("timeline.och")
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let mut path = file.into_path().map_err(|e| e.to_string())?;
        if path.extension().is_none() {
            path.set_extension("och");
        }
        path
    };
    // The dialog ran without the lock, so check everything again under it, and keep the lock
    // for the whole save so no other command changes the baseline meanwhile.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        if let Some(generation) = generation {
            if files.generation != generation {
                return Err("The open timeline file changed before saving".into());
            }
        }
        if !save_as && files.current.as_ref() != Some(&path) {
            return Err("The save destination changed".into());
        }
        if files.current.as_ref() == Some(&path) && files.stamp.as_ref() != Some(&stamp(&path)?) {
            return Err(
                "This file was changed by another application. Use Save As to keep both versions."
                    .into(),
            );
        }
        let next = match (document, patch) {
            (None, Some(patch)) => files
                .baseline
                .as_ref()
                .ok_or("No timeline file is open")?
                .save_patch(&path, &patch)?,
            (Some(document), None) => {
                openchronology_store::save(&path, &document)?;
                Snapshot::open(&path)?
            }
            _ => return Err("Supply either a document or sparse changes".into()),
        };
        let header = next.header()?;
        files.baseline = Some(Arc::new(next));
        files.current = Some(path.clone());
        files.stamp = Some(stamp(&path)?);
        files.generation += 1;
        files.forget_kept();
        // The saved file is the timeline open now, trusted as the timeline saved was: the open
        // file's (its generation was checked above) or the page's own.
        let access = app.state::<access::Access>();
        access.saved(access.origin(generation.is_some()), &path);
        Ok(Some(Opened {
            header,
            path: path.to_string_lossy().into_owned(),
            generation: files.generation,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Starts the app: the dialog plugin, the file and server state, reconnecting to the servers
/// remembered from last time, and the commands the editor may invoke.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Files::default()))
        .manage(Population::default())
        .manage(access::Access::default())
        .manage(server::Server::new().expect("Invalid server configuration"))
        .setup(|app| {
            // The servers connected last time; before several, the one server (or none).
            let directory = app.path().app_config_dir().ok();
            // The folders chosen and the timelines trusted before (access.rs).
            if let Some(directory) = &directory {
                app.state::<access::Access>().load(directory.clone());
            }
            let read = |name: &str| {
                directory
                    .as_ref()
                    .and_then(|d| std::fs::read(d.join(name)).ok())
            };
            let servers = match read("servers.json") {
                Some(bytes) => serde_json::from_slice::<Vec<String>>(&bytes).unwrap_or_default(),
                None => match read("server.json") {
                    Some(bytes) => serde_json::from_slice::<Option<String>>(&bytes)
                        .ok()
                        .flatten()
                        .into_iter()
                        .collect(),
                    None => vec![server::Server::default_origin().to_owned()],
                },
            };
            // The folders timelines were populated from, whose files the system's
            // thumbnailers may read.
            if let Some(bytes) = read("populated.json") {
                let mut folders =
                    serde_json::from_slice::<Vec<PathBuf>>(&bytes).unwrap_or_default();
                folders.truncate(MOST_POPULATED);
                if let Ok(mut populated) = app.state::<Population>().populated.lock() {
                    *populated = folders;
                }
            }
            let state = app.state::<server::Server>();
            // Connecting puts a server first, so the one in use is connected last.
            for origin in servers.iter().take(server::SERVERS).rev() {
                let _ = state.connect(origin);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_open_image,
            desktop_latest_release,
            desktop_open_file,
            desktop_reveal_file,
            desktop_thumbnails,
            desktop_trust,
            desktop_show_images,
            desktop_populate_pick,
            desktop_populate_clear,
            desktop_populate_cancel,
            desktop_populate,
            desktop_open,
            desktop_accept_open,
            desktop_stage,
            desktop_import,
            desktop_query,
            desktop_document,
            desktop_save,
            desktop_stage_patch,
            desktop_restore_baseline,
            desktop_servers,
            desktop_connect,
            desktop_disconnect,
            desktop_request,
            desktop_auth_start,
            desktop_auth_poll
        ])
        .run(tauri::generate_context!())
        .expect("Could not start OpenChronology");
}
