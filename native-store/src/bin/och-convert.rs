use openchronology_store::Document;
use std::{io::{self, Read}, path::Path};
fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 { return Err("Usage: och-convert read|write FILE".into()); }
    std::env::set_var("OCH_CONVERSION_LIMITS", "1");
    match args[1].as_str() {
        "read" => {
            let document = openchronology_store::open(Path::new(&args[2]))?;
            serde_json::to_writer(io::stdout(), &document).map_err(|e| e.to_string())?;
        }
        "write" => {
            let mut bytes = Vec::new();
            io::stdin().take(32 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            if bytes.len() > 32 * 1024 * 1024 { return Err("Timeline exceeds conversion limit".into()); }
            let document: Document = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            openchronology_store::save(Path::new(&args[2]), &document)?;
        }
        _ => return Err("Unknown conversion operation".into()),
    }
    Ok(())
}
fn main() { if let Err(error) = run() { eprintln!("{error}"); std::process::exit(1); } }
