// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Tauri's build step: generates the app's context from tauri.conf.json and capabilities/, and
// the permissions of the app's own commands, so a window may call only those its capability
// grants (capabilities/default.json) and any command added later is refused until granted.
const COMMANDS: &[&str] = &[
    "desktop_open_image",
    "desktop_open_file",
    "desktop_reveal_file",
    "desktop_thumbnails",
    "desktop_trust",
    "desktop_show_images",
    "desktop_populate_pick",
    "desktop_populate_clear",
    "desktop_populate_cancel",
    "desktop_populate",
    "desktop_open",
    "desktop_accept_open",
    "desktop_stage",
    "desktop_import",
    "desktop_query",
    "desktop_document",
    "desktop_save",
    "desktop_stage_patch",
    "desktop_restore_baseline",
    "desktop_servers",
    "desktop_connect",
    "desktop_disconnect",
    "desktop_request",
    "desktop_latest_release",
    "desktop_auth_start",
    "desktop_auth_poll",
];
fn main() {
    // A release build embeds its tag (main.rs, desktop_latest_release): build again when it changes.
    println!("cargo:rerun-if-env-changed=OCH_BUILD_VERSION");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("Could not run Tauri's build step");
}
