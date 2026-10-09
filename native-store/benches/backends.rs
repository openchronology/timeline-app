// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! SQLite latency benchmarks through the API the desktop app calls (Tauri IPC excluded).
//! Seed first with `node bench/seed.mjs`; then `cargo bench --manifest-path
//! native-store/Cargo.toml --bench backends`. BENCH_SIZES and BENCH_DATA_DIR match the
//! Node harness; BENCH_TIME is the measurement time per benchmark in milliseconds.
//! Results land in target/criterion/<operation>/sqlite/<size>/new/estimates.json.
use criterion::{BenchmarkId, Criterion};
use openchronology_store::{Header, Patch, Query, Snapshot};
use serde_json::{json, Value};
use std::{path::PathBuf, time::Duration};

fn env(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.into())
}
fn data_dir() -> PathBuf {
    // Relative paths resolve from the repository root, as they do for the Node harness.
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    root.join(env("BENCH_DATA_DIR", "bench/data"))
}
fn query(value: Value) -> Query {
    serde_json::from_value(value).expect("query")
}
fn main() {
    let sizes: Vec<usize> = env("BENCH_SIZES", "1000,10000,100000,200000")
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();
    let time = Duration::from_millis(env("BENCH_TIME", "1000").parse().unwrap_or(1000));
    let mut criterion = Criterion::default()
        .sample_size(10)
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(time)
        .configure_from_args();
    let scratch = std::env::temp_dir().join(format!("och-bench-{}", std::process::id()));
    std::fs::create_dir_all(&scratch).expect("scratch directory");
    for size in sizes {
        let dir = data_dir();
        let file = dir.join(format!("timeline-{size}.och"));
        let work: Value = serde_json::from_slice(
            &std::fs::read(dir.join(format!("workload-{size}.json")))
                .expect("run node bench/seed.mjs first"),
        )
        .expect("workload");
        let snapshot = Snapshot::open(&file).expect("open seeded timeline");
        let Header {
            document: settings, ..
        } = snapshot.header().expect("header");
        let target = work["target"].clone();
        let overview = |window: &Value| {
            query(
                json!({"kind":"overview","lower":window["lower"],"upper":window["upper"],"threshold":window["threshold"]}),
            )
        };
        let full = overview(&work["full"]);
        let zoomed = overview(&work["zoomed"]);
        let page = query(
            json!({"kind":"events","lower":work["page"]["lower"],"upper":work["page"]["upper"],"limit":100}),
        );
        let read = query(
            json!({"kind":"events","id":target["id"],"lower":target["time"],"upper":target["time"]}),
        );
        // Saves write a patched copy of the immutable baseline, as the desktop app does.
        let patch = |changes: Value| -> Patch {
            serde_json::from_value(json!({"settings":settings,"changes":changes})).expect("patch")
        };
        let created = patch(
            json!([{"id":"bench-new","event":{"id":"bench-new","time":target["time"],"metadata":{"title":"New"}}}]),
        );
        let mut updated_target = target.clone();
        updated_target["metadata"]["title"] = json!("Updated");
        let updated = patch(json!([{"id":target["id"],"event":updated_target}]));
        let deleted = patch(json!([{"id":target["id"],"event":null}]));
        let output = scratch.join(format!("saved-{size}.och"));
        let reads: [(&str, &Query); 4] = [
            ("overview-full", &full),
            ("overview-zoomed", &zoomed),
            ("events-page", &page),
            ("read", &read),
        ];
        for (name, q) in reads {
            criterion.benchmark_group(name).bench_with_input(
                BenchmarkId::new("sqlite", size),
                q,
                |b, q| b.iter(|| snapshot.query(q).expect("query")),
            );
        }
        let writes: [(&str, &Patch); 3] = [
            ("create", &created),
            ("update", &updated),
            ("delete", &deleted),
        ];
        for (name, p) in writes {
            criterion.benchmark_group(name).bench_with_input(
                BenchmarkId::new("sqlite", size),
                p,
                |b, p| b.iter(|| snapshot.save_patch(&output, p).expect("save")),
            );
        }
    }
    let _ = std::fs::remove_dir_all(&scratch);
    criterion.final_summary();
}
