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
//!
//! File work runs on Tauri's blocking thread pool (`spawn_blocking`), so long reads and saves
//! never stall the async runtime that serves IPC.
mod server;
use openchronology_store::{Document, Header, Patch, Query, Snapshot};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
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
        let input = std::fs::File::open(path).map_err(|e| e.to_string())?;
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
        let path = baseline.path().to_path_buf();
        let before = stamp(&path)?;
        let header = baseline.header()?;
        let state = app.state::<Mutex<Files>>();
        let mut files = state.lock().map_err(|e| e.to_string())?;
        files.pending = Some((path.clone(), baseline, before));
        Ok(Some(Opened {
            header,
            path: path.to_string_lossy().into_owned(),
            generation: files.generation + 1,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
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
        .manage(server::Server::new().expect("Invalid server configuration"))
        .setup(|app| {
            // The servers connected last time; before several, the one server (or none).
            let directory = app.path().app_config_dir().ok();
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
            let state = app.state::<server::Server>();
            // Connecting puts a server first, so the one in use is connected last.
            for origin in servers.iter().take(server::SERVERS).rev() {
                let _ = state.connect(origin);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_open_image,
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
