// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Writes benchmark seed files: `och-seed IN.ochx OUT.och` saves a JSON timeline as a
//! SQLite timeline through the same path the desktop app uses. Unlike och-convert, it has
//! no upload-size limits, so it can write the largest benchmark timelines.
use openchronology_store::Document;
use std::path::Path;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: och-seed IN.ochx OUT.och");
        std::process::exit(2);
    }
    let result = std::fs::read(&args[1])
        .map_err(|e| e.to_string())
        .and_then(|bytes| serde_json::from_slice::<Document>(&bytes).map_err(|e| e.to_string()))
        .and_then(|document| {
            let _ = std::fs::remove_file(&args[2]);
            openchronology_store::save(Path::new(&args[2]), &document)
        });
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
