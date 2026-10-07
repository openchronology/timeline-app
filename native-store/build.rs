// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
use std::{env, path::PathBuf, process::Command};
fn main() {
    let source =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../vendor/sqlite-rational");
    let build = PathBuf::from(env::var("OUT_DIR").unwrap()).join("sqlite-rational");
    for file in [
        "src/rational.c",
        "src/index.c",
        "CMakeLists.txt",
        "include/sqlite_rational.h",
    ] {
        println!("cargo:rerun-if-changed={}", source.join(file).display());
    }
    for key in ["OCH_NATIVE_PREFIX", "OCH_NATIVE_STATIC"] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    let mut configure = Command::new("cmake");
    configure
        .arg("-S")
        .arg(&source)
        .arg("-B")
        .arg(&build)
        .args([
            "-DBUILD_TESTING=OFF",
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_POSITION_INDEPENDENT_CODE=ON",
        ]);
    let prefix = env::var_os("OCH_NATIVE_PREFIX").map(PathBuf::from);
    if let Some(path) = &prefix {
        configure
            .arg(format!("-DRATIONAL_NATIVE_PREFIX={}", path.display()))
            .arg(format!("-DCMAKE_PREFIX_PATH={}", path.display()));
        // Select the pinned static SQLite archive, including MSVC's .lib name.
        let sqlite = ["libsqlite3.a", "sqlite3.lib"]
            .iter()
            .map(|name| path.join("lib").join(name))
            .find(|path| path.is_file())
            .expect("Missing pinned SQLite archive");
        configure
            .arg(format!("-DSQLite3_LIBRARY={}", sqlite.display()))
            .arg(format!(
                "-DSQLite3_INCLUDE_DIR={}",
                path.join("include").display()
            ));
        println!(
            "cargo:rustc-link-search=native={}",
            path.join("lib").display()
        );
    }
    if env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default() == "msvc" {
        configure.args(["-A", "x64", "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL"]);
    }
    assert!(configure
        .status()
        .expect("CMake must be installed")
        .success());
    assert!(Command::new("cmake")
        .arg("--build")
        .arg(&build)
        .args([
            "--config",
            "Release",
            "--target",
            "sqlite_rational_static",
            "--parallel",
            "2"
        ])
        .status()
        .unwrap()
        .success());
    println!("cargo:rustc-link-search=native={}", build.display());
    println!("cargo:rustc-link-lib=static=sqlite_rational_static");
    let linkage = if env::var("OCH_NATIVE_STATIC").as_deref() == Ok("1") {
        "static="
    } else {
        ""
    };
    let gmp = if prefix
        .as_ref()
        .is_some_and(|p| p.join("lib/libgmp.lib").is_file())
    {
        "libgmp"
    } else {
        "gmp"
    };
    println!("cargo:rustc-link-lib={linkage}sqlite3");
    println!("cargo:rustc-link-lib={linkage}{gmp}");
}
