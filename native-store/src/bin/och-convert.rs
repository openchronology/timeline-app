// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Converts SQLite timeline files for the server (server/files.mjs): `och-convert read FILE`
//! prints a file's document as JSON, and `och-convert write FILE` saves one from standard input.
//! Each conversion runs in its own process, under memory and CPU limits on Linux.
use openchronology_store::Document;
use std::{
    io::{self, Read},
    path::Path,
};
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
        // Reads at most 32 MiB plus one byte of JSON, so an oversized body is detected without
        // buffering all of it, then saves it as a SQLite timeline (validated by `save`).
        "write" => {
            let mut bytes = Vec::new();
            io::stdin()
                .take(32 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() > 32 * 1024 * 1024 {
                return Err("Timeline exceeds conversion limit".into());
            }
            let document: Document = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            openchronology_store::save(Path::new(&args[2]), &document)?;
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
    // written up to 32 MiB) and 9 RLIMIT_AS (512 MiB of address space). Soft and hard limits
    // are equal, so the process cannot raise them again.
    for (resource, size) in [(0, 20), (1, 32 * 1024 * 1024), (9, 512 * 1024 * 1024)] {
        let limit = Limit {
            current: size,
            maximum: size,
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
