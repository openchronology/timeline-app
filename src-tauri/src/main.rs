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
fn desktop_server(state: tauri::State<'_, server::Server>) -> Result<Option<String>, String> {
    state.configured()
}
#[tauri::command]
fn desktop_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, server::Server>,
    origin: Option<String>,
) -> Result<(), String> {
    state.configure(origin)?;
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    std::fs::write(
        directory.join("server.json"),
        serde_json::to_vec(&state.configured()?).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn desktop_request(
    state: tauri::State<'_, server::Server>,
    path: String,
    method: String,
    data: Option<serde_json::Value>,
    csrf: Option<String>,
) -> Result<server::Reply, String> {
    state.request(&path, &method, data, csrf).await
}
#[tauri::command]
async fn desktop_auth_start(
    state: tauri::State<'_, server::Server>,
) -> Result<serde_json::Value, String> {
    state.start_login().await
}
#[tauri::command]
async fn desktop_auth_poll(
    state: tauri::State<'_, server::Server>,
) -> Result<serde_json::Value, String> {
    state.poll_login().await
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
}
#[tauri::command]
async fn desktop_open(app: tauri::AppHandle) -> Result<Option<Opened>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("OpenChronology SQLite timeline", &["och", "sqlite"])
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
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn baseline(app: &tauri::AppHandle, generation: u64) -> Result<Arc<Snapshot>, String> {
    let state = app.state::<Mutex<Files>>();
    let files = state.lock().map_err(|e| e.to_string())?;
    if files.generation != generation {
        return Err("The active SQLite timeline changed".into());
    }
    files
        .baseline
        .clone()
        .ok_or("No SQLite timeline is open".into())
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
            return Err(
                "The active file changed. Use Save SQLite as to choose the destination.".into(),
            );
        }
        existing.unwrap()
    } else {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("OpenChronology SQLite timeline", &["och", "sqlite"])
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
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<Mutex<Files>>();let mut files=state.lock().map_err(|e|e.to_string())?;
        if let Some(generation)=generation{if files.generation!=generation{return Err("The active SQLite timeline changed before saving".into());}}
        if !save_as && files.current.as_ref()!=Some(&path){return Err("The save destination changed".into());}
        if files.current.as_ref()==Some(&path) && files.stamp.as_ref()!=Some(&stamp(&path)?){return Err("This file was changed by another application. Use Save SQLite as to keep both versions.".into());}
        let next=match (document,patch){
            (None,Some(patch))=>files.baseline.as_ref().ok_or("No SQLite timeline is open")?.save_patch(&path,&patch)?,
            (Some(document),None)=>{openchronology_store::save(&path,&document)?;Snapshot::open(&path)?},
            _=>return Err("Supply either a document or sparse changes".into())
        };
        let header=next.header()?;files.baseline=Some(Arc::new(next));files.current=Some(path.clone());files.stamp=Some(stamp(&path)?);files.generation+=1;
        Ok(Some(Opened{header,path:path.to_string_lossy().into_owned(),generation:files.generation}))
    }).await.map_err(|e|e.to_string())?
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Files::default()))
        .manage(server::Server::new().expect("Invalid server configuration"))
        .setup(|app| {
            if let Ok(directory) = app.path().app_config_dir() {
                if let Ok(bytes) = std::fs::read(directory.join("server.json")) {
                    if let Ok(origin) = serde_json::from_slice::<Option<String>>(&bytes) {
                        let _ = app.state::<server::Server>().configure(origin);
                    }
                }
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
            desktop_server,
            desktop_connect,
            desktop_request,
            desktop_auth_start,
            desktop_auth_poll
        ])
        .run(tauri::generate_context!())
        .expect("Could not start OpenChronology");
}
