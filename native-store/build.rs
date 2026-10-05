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
    assert!(Command::new("cmake")
        .arg("-S")
        .arg(&source)
        .arg("-B")
        .arg(&build)
        .args([
            "-DBUILD_TESTING=OFF",
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_POSITION_INDEPENDENT_CODE=ON"
        ])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("cmake")
        .arg("--build")
        .arg(&build)
        .args(["--target", "sqlite_rational_static", "--parallel", "2"])
        .status()
        .unwrap()
        .success());
    println!("cargo:rustc-link-search=native={}", build.display());
    println!("cargo:rustc-link-lib=static=sqlite_rational_static");
    println!("cargo:rustc-link-lib=sqlite3");
    println!("cargo:rustc-link-lib=gmp");
}
