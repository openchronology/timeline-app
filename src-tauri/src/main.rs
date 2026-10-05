#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod server;
use openchronology_store::Document;
use std::{path::PathBuf, sync::Mutex};
use tauri_plugin_dialog::DialogExt;
use tauri::Manager;
#[tauri::command]
fn desktop_server(state: tauri::State<'_, server::Server>) -> Result<Option<String>, String> { state.configured() }
#[tauri::command]
fn desktop_connect(app: tauri::AppHandle, state: tauri::State<'_, server::Server>, origin: Option<String>) -> Result<(), String> {
    state.configure(origin)?;
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    std::fs::write(directory.join("server.json"), serde_json::to_vec(&state.configured()?).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command]
async fn desktop_request(state: tauri::State<'_, server::Server>, path: String, method: String, data: Option<serde_json::Value>, csrf: Option<String>) -> Result<server::Reply, String> { state.request(&path, &method, data, csrf).await }
#[tauri::command]
async fn desktop_auth_start(state: tauri::State<'_, server::Server>) -> Result<serde_json::Value, String> { state.start_login().await }
#[tauri::command]
async fn desktop_auth_poll(state: tauri::State<'_, server::Server>) -> Result<serde_json::Value, String> { state.poll_login().await }
#[derive(serde::Serialize)]
struct Opened {
    document: Document,
    path: String,
}
#[derive(Default)]
struct Files {
    current: Option<PathBuf>,
    pending: Option<PathBuf>,
}
#[tauri::command]
async fn desktop_open(
    app: tauri::AppHandle,
    files: tauri::State<'_, Mutex<Files>>,
) -> Result<Option<Opened>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("OpenChronology SQLite timeline", &["och", "sqlite"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let reading = path.clone();
    let document =
        tauri::async_runtime::spawn_blocking(move || openchronology_store::open(&reading))
            .await
            .map_err(|e| e.to_string())??;
    // Frontend validation also checks presentation syntax. Keep its previous save target
    // until it has accepted the document, including those settings.
    files.lock().map_err(|e| e.to_string())?.pending = Some(path.clone());
    Ok(Some(Opened {
        document,
        path: path.to_string_lossy().into_owned(),
    }))
}
#[tauri::command]
fn desktop_accept_open(files: tauri::State<'_, Mutex<Files>>, path: String) -> Result<(), String> {
    let mut files = files.lock().map_err(|e| e.to_string())?;
    let pending = files.pending.as_ref().ok_or("No pending file to open")?;
    if pending.to_string_lossy() != path {
        return Err("Another file open superseded this request".into());
    }
    files.current = files.pending.take();
    Ok(())
}
#[tauri::command]
async fn desktop_save(
    app: tauri::AppHandle,
    files: tauri::State<'_, Mutex<Files>>,
    document: Document,
    save_as: bool,
) -> Result<Option<String>, String> {
    let existing = files.lock().map_err(|e| e.to_string())?.current.clone();
    let path = if !save_as && existing.is_some() {
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
        file.into_path().map_err(|e| e.to_string())?
    };
    let saving = path.clone();
    tauri::async_runtime::spawn_blocking(move || openchronology_store::save(&saving, &document))
        .await
        .map_err(|e| e.to_string())??;
    files.lock().map_err(|e| e.to_string())?.current = Some(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Files::default()))
        .manage(server::Server::new().expect("Invalid server configuration"))
        .setup(|app| {
            if let Ok(directory) = app.path().app_config_dir() {
                if let Ok(bytes) = std::fs::read(directory.join("server.json")) {
                    if let Ok(origin) = serde_json::from_slice::<Option<String>>(&bytes) { let _ = app.state::<server::Server>().configure(origin); }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_open,
            desktop_accept_open,
            desktop_save, desktop_server, desktop_connect, desktop_request, desktop_auth_start, desktop_auth_poll
        ])
        .run(tauri::generate_context!())
        .expect("Could not start OpenChronology");
}
