#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
mod server;
use openchronology_store::{Document, Header, Patch, Query, Snapshot};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
#[tauri::command]
fn desktop_open_image(url: String) -> Result<(), String> {
    server::open_image(&url)
}
#[tauri::command]
fn desktop_servers(state: tauri::State<'_, server::Server>) -> Result<Vec<String>, String> {
    state.servers()
}
/** Remembers the connected servers (not their sign-ins) for the next start. */
fn remember_servers(app: &tauri::AppHandle, state: &server::Server) -> Result<(), String> {
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    std::fs::write(
        directory.join("servers.json"),
        serde_json::to_vec(&state.servers()?).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
fn desktop_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, server::Server>,
    origin: String,
) -> Result<(), String> {
    state.connect(&origin)?;
    remember_servers(&app, &state)
}
#[tauri::command]
fn desktop_disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, server::Server>,
    origin: String,
) -> Result<(), String> {
    state.disconnect(&origin)?;
    remember_servers(&app, &state)
}
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
#[tauri::command]
async fn desktop_auth_start(
    state: tauri::State<'_, server::Server>,
    server: String,
) -> Result<serde_json::Value, String> {
    state.start_login(&server).await
}
#[tauri::command]
async fn desktop_auth_poll(
    state: tauri::State<'_, server::Server>,
    server: String,
) -> Result<serde_json::Value, String> {
    state.poll_login(&server).await
}
#[derive(serde::Serialize)]
struct Opened {
    #[serde(flatten)]
    header: Header,
    path: String,
    generation: u64,
}
#[derive(Clone, PartialEq)]
struct Stamp(Vec<Option<(u64, std::time::SystemTime)>>);
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
#[derive(Default)]
struct Files {
    current: Option<PathBuf>,
    baseline: Option<Arc<Snapshot>>,
    pending: Option<(PathBuf, Arc<Snapshot>, Stamp)>,
    stamp: Option<Stamp>,
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
#[derive(serde::Serialize)]
struct Staged {
    #[serde(flatten)]
    opened: Opened,
    /// The baselines before and after: what undo and redo take back to.
    before: u64,
    after: u64,
}
#[derive(Clone, serde::Serialize)]
struct Progress {
    done: usize,
    total: usize,
}
/// Applies `patch` to the open timeline at once, unsaved (#179): bulk edits such as deleting
/// everything in a view or shifting times, which would be too many to keep as edits in the
/// page. The file changes only when saved; until then undo can take the change back.
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
#[tauri::command]
async fn desktop_accept_open(app: tauri::AppHandle, path: String) -> Result<(), String> {
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
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
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
#[tauri::command]
async fn desktop_document(app: tauri::AppHandle, generation: u64) -> Result<Document, String> {
    tauri::async_runtime::spawn_blocking(move || baseline(&app, generation)?.document())
        .await
        .map_err(|e| e.to_string())?
}
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
