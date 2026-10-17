// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Converts SQLite timeline files for the server (server/files.mjs): `och-convert read FILE`
//! prints a file's document as JSON, and `och-convert write FILE` saves one from standard input.
//! Each conversion runs in its own process, under memory and CPU limits on Linux.
use openchronology_store::{Document, Duration, Event, Relationship};
use serde::Deserialize;
use serde_json::{value::RawValue, Map, Value};
use std::{
    io::{self, Read},
    path::Path,
};
/// The largest file a conversion reads or writes, in bytes: OCH_FILE_BYTES (server/files.mjs
/// passes TIMELINE_FILE_BYTES), from 1 MiB to 1 GiB; 64 MiB when unset or invalid (#202).
fn file_bytes() -> u64 {
    std::env::var("OCH_FILE_BYTES")
        .ok()
        .and_then(|text| text.parse::<u64>().ok())
        .filter(|bytes| (1 << 20..=1 << 30).contains(bytes))
        .unwrap_or(64 << 20)
}
/// A document as `write` reads it: each moment's metadata kept as its JSON text until that
/// moment is saved, so the parsed document is not held whole (#202). The other fields are
/// those of `Document`.
#[derive(Deserialize)]
struct RawDocument {
    format: String,
    version: u32,
    title: String,
    description: String,
    #[serde(default)]
    presentation: Option<Value>,
    #[serde(default)]
    plugins: Option<Value>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    assets: Option<Value>,
    events: Vec<RawEvent>,
    #[serde(default)]
    durations: Vec<Duration>,
    #[serde(default)]
    relationships: Vec<Relationship>,
}
#[derive(Deserialize)]
struct RawEvent {
    id: String,
    time: String,
    metadata: Box<RawValue>,
}
/// Parses `read|write FILE` and performs the conversion. Limits are applied first, before any
/// input is read. Errors are printed by `main`, which exits with status 1.
fn run() -> Result<(), String> {
    resource_limits()?;
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: och-convert read|write FILE".into());
    }
    // Makes every SQLite connection this process opens apply size limits and an instruction
    // budget (sqlite.rs Connection::open), since the file is untrusted.
    std::env::set_var("OCH_CONVERSION_LIMITS", "1");
    match args[1].as_str() {
        // Opens and validates the whole document (events, durations, relationships) and
        // writes it to standard output as JSON in the editor's document shape.
        "read" => {
            let document = openchronology_store::open(Path::new(&args[2]))?;
            serde_json::to_writer(io::stdout(), &document).map_err(|e| e.to_string())?;
        }
        // Reads at most file_bytes() plus one byte of JSON, so an oversized body is detected
        // without buffering all of it, then saves it as a SQLite timeline (validated by
        // `save_streamed`), parsing each moment's metadata only as the moment is written.
        "write" => {
            let limit = file_bytes();
            let mut bytes = Vec::new();
            io::stdin()
                .take(limit + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 > limit {
                return Err("Timeline exceeds conversion limit".into());
            }
            let raw: RawDocument = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            drop(bytes);
            let settings = Document {
                format: raw.format,
                version: raw.version,
                title: raw.title,
                description: raw.description,
                presentation: raw.presentation,
                plugins: raw.plugins,
                tags: raw.tags,
                assets: raw.assets,
                events: Vec::new(),
                durations: raw.durations,
                relationships: raw.relationships,
            };
            let events = raw.events.into_iter().map(|e| {
                let metadata: Map<String, Value> =
                    serde_json::from_str(e.metadata.get()).map_err(|e| e.to_string())?;
                Ok(Event {
                    id: e.id,
                    time: e.time,
                    metadata,
                })
            });
            openchronology_store::save_streamed(Path::new(&args[2]), &settings, events)?;
        }
        _ => return Err("Unknown conversion operation".into()),
    }
    Ok(())
}
// Conversion of uploaded files runs in its own process. GMP arithmetic also needs
// a process memory/CPU ceiling, since SQLite's instruction budget cannot stop it.
#[cfg(target_os = "linux")]
fn resource_limits() -> Result<(), String> {
    use std::os::raw::{c_int, c_ulong};
    #[repr(C)]
    struct Limit {
        current: c_ulong,
        maximum: c_ulong,
    }
    unsafe extern "C" {
        fn setrlimit(resource: c_int, limit: *const Limit) -> c_int;
    }
    // Linux resource numbers: 0 RLIMIT_CPU (20 seconds of CPU time), 1 RLIMIT_FSIZE (files
    // written up to file_bytes(), as the server's limit) and 9 RLIMIT_AS (address space: 512
    // MiB, or eight times file_bytes() when that is more, since reading a file back as JSON
    // takes about 4.5 times its size). Soft and hard limits are equal, so the process cannot
    // raise them again. A limit reached stops the process with a signal (SIGXCPU, SIGXFSZ) or
    // a failed allocation (SIGABRT), which server/files.mjs reports as that limit.
    let memory = (512 << 20).max(8 * file_bytes());
    for (resource, size) in [(0, 20), (1, file_bytes()), (9, memory)] {
        let limit = Limit {
            current: size as c_ulong,
            maximum: size as c_ulong,
        };
        if unsafe { setrlimit(resource, &limit) } != 0 {
            return Err("Could not apply conversion resource limits".into());
        }
    }
    Ok(())
}
/// Other platforms rely on SQLite's own limits only; the server runs conversions on Linux.
#[cfg(not(target_os = "linux"))]
fn resource_limits() -> Result<(), String> {
    Ok(())
}
/// Runs the conversion and reports a failure on standard error with exit status 1, which
/// server/files.mjs turns into a rejected upload or download.
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
