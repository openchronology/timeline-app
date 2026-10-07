// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
use openchronology_store::Document;
use std::{
    io::{self, Read},
    path::Path,
};
fn run() -> Result<(), String> {
    resource_limits()?;
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: och-convert read|write FILE".into());
    }
    std::env::set_var("OCH_CONVERSION_LIMITS", "1");
    match args[1].as_str() {
        "read" => {
            let document = openchronology_store::open(Path::new(&args[2]))?;
            serde_json::to_writer(io::stdout(), &document).map_err(|e| e.to_string())?;
        }
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
#[cfg(not(target_os = "linux"))]
fn resource_limits() -> Result<(), String> {
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
