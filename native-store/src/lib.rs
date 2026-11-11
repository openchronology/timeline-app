// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! The native store: timeline documents in SQLite files with exact rational times
//! (sqlite-rational), saving, opening and checking them, and the window, summary and filter
//! queries the desktop app browses with (workspace.rs).
//!
//! # File format
//!
//! A timeline file (`.och`) is an ordinary SQLite database marked with
//! `PRAGMA application_id=1329812556` ("OCTL") and `PRAGMA user_version=1`. Times are exact
//! rationals stored as canonical `n/d` TEXT and ordered with sqlite-rational's `RATIONAL_V1`
//! collation (plain text order is not numeric order). Its tables:
//!
//! - `timeline_meta`, `timeline_settings`, `timeline_plugins`, `timeline_extras`: one-row
//!   tables (`singleton=1`) for the title and description, presentation settings JSON, plugin
//!   list JSON, and `{"tags","assets","view","views","measures"}` JSON. The last three may be
//!   missing from older files, and their keys from older extras.
//! - `events`: the moments, one row each, with their metadata JSON. Indexed by time.
//! - `points`: a `rational_index` virtual table (shadow tables `points_nodes`, `points_meta`)
//!   with one row per distinct moment time, weighted by how many moments share it, and
//!   carrying the sums of their measures' values (#574), one per declared measure in name
//!   order. Its augmented tree answers viewport overviews (groups of nearby moments, with
//!   their totals) without reading every moment.
//! - `durations`: standalone durations; each endpoint is a fixed time or a moment it follows,
//!   and an end with neither is ongoing: it ends "now" (#537).
//! - `duration_intervals` + `duration_nodes`: durations with endpoints resolved to times, and
//!   a persistent AVL interval tree over them (intervals.rs), for viewport bands and summaries.
//!   An ongoing duration is resolved to a point at its start, and queries given a `now` end
//!   it there instead.
//! - `relationships`: undirected links between moments and durations, stored once each.
//! - `edge_intervals` + `edge_nodes`: the links as arcs between their endpoints' times, in the
//!   same kind of interval tree.
//! - `interval_roots`, `index_layout`: each tree's root node, and the index layout version
//!   and save token that tell the desktop app a file matches its disk copy (workspace.rs).
//!
//! Files come from anyone (uploads, downloads), so every connection runs with
//! `trusted_schema=OFF` and readers check that the tables they query are real tables, not
//! views or triggers that would run SQL from the file (`check_file`, `Snapshot::open`).
mod intervals;
mod sqlite;
mod workspace;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlite::Connection;
use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    path::Path,
};
pub use workspace::{Header, Patch, Query, Snapshot};
/// `PRAGMA application_id` of a timeline file, as SQLite prints it: the ASCII bytes "OCTL"
/// read as a big-endian 32-bit integer.
const APPLICATION_ID: &str = "1329812556"; // OCTL
/// A moment, as in the editor's documents (src/core.ts).
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Event {
    /// Unique among the document's moments: 1 to 128 ASCII letters, digits or `_.:-`.
    pub id: String,
    /// An exact rational such as `3/4` or `-12/1`; saving canonicalizes it with `q()`.
    pub time: String,
    /// Free-form fields; `title` and `description`, when present, must be strings.
    pub metadata: Map<String, Value>,
}
/// A standalone duration. Each endpoint is an exact time string or `{"moment": id}`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Duration {
    pub id: String,
    pub start: Value,
    pub end: Value,
    pub metadata: Map<String, Value>,
}
/// A whole timeline document, in the JSON shape the editor and server use (`.ochx` files).
/// `format` is always `"openchronology"` and `version` 1 (see `validate`).
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Document {
    pub format: String,
    pub version: u32,
    pub title: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub presentation: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assets: Option<Value>,
    /// How the timeline opens (#416): `{"separation": ...}`, validated by the editor
    /// (src/default-view.ts) and kept as it is here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view: Option<Value>,
    /// Views saved in the file (#550), kept as they are here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub views: Option<Value>,
    /// The quantities its entities carry (#572): `{name: {"type", "label"?}}`, validated by
    /// the editor (src/measures.ts) and kept as it is here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub measures: Option<Value>,
    pub events: Vec<Event>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub durations: Vec<Duration>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships: Vec<Relationship>,
}
/// An undirected link between two entities, each `{"moment": id}` or `{"duration": id}`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Relationship {
    pub a: Value,
    pub b: Value,
}
/// (kind, id) of an entity reference.
pub(crate) fn entity_ref(value: &Value) -> Result<(&'static str, &str), String> {
    let o = value
        .as_object()
        .filter(|o| o.len() == 1)
        .ok_or("Invalid relationship endpoint")?;
    let (kind, id) = if let Some(id) = o.get("moment").and_then(Value::as_str) {
        ("moment", id)
    } else if let Some(id) = o.get("duration").and_then(Value::as_str) {
        ("duration", id)
    } else {
        return Err("Invalid relationship endpoint".into());
    };
    if !identifier(id) {
        return Err("Invalid relationship endpoint".into());
    }
    Ok((kind, id))
}
/// Whether `id` is a valid moment or duration ID: 1 to 128 ASCII letters, digits or `_.:-`.
fn identifier(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
}
/// Splits an endpoint into (time, moment): one of them, or neither for an ongoing end, whose
/// time is "now" (`{"ongoing": true}`, #537).
fn endpoint(value: &Value) -> Result<(Option<&str>, Option<&str>), String> {
    match value {
        Value::String(time) if !time.is_empty() && time.len() <= 65536 => Ok((Some(time), None)),
        Value::Object(o) if o.len() == 1 && o.get("ongoing") == Some(&Value::Bool(true)) => {
            Ok((None, None))
        }
        Value::Object(o) if o.len() == 1 => match o.get("moment").and_then(Value::as_str) {
            Some(id) if identifier(id) => Ok((None, Some(id))),
            _ => Err("Invalid duration anchor".into()),
        },
        _ => Err("A duration endpoint is an exact time, a moment anchor or ongoing".into()),
    }
}
/// The stored form of an ongoing end, as `duration_intervals.end_json` and bands carry it.
pub(crate) const ONGOING_JSON: &str = "{\"ongoing\":true}";
/// Version-1 files stored durations as links in their start moment's metadata. They become
/// standalone durations anchored to both original moments.
pub fn convert_legacy_durations(doc: &mut Document) -> Result<(), String> {
    for event in &mut doc.events {
        legacy_durations(event, &mut doc.durations)?;
    }
    doc.durations.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(())
}
/// One moment's part of `convert_legacy_durations`: removes its `durations` links, if any,
/// and adds the standalone durations they become to `durations`.
fn legacy_durations(event: &mut Event, durations: &mut Vec<Duration>) -> Result<(), String> {
    let Some(value) = event.metadata.remove("durations") else {
        return Ok(());
    };
    let links = value.as_array().ok_or("Durations must be an array")?;
    if links.len() > 1000 {
        return Err("Use at most 1000 durations per moment".into());
    }
    for link in links {
        let id = link.get("id").and_then(Value::as_str).unwrap_or_default();
        let end = link
            .get("endId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !identifier(id) || !identifier(end) {
            return Err("Invalid duration identifier".into());
        }
        if end == event.id {
            return Err("Duration endpoints must be distinct existing moments".into());
        }
        durations.push(Duration {
            id: id.into(),
            start: serde_json::json!({"moment": event.id}),
            end: serde_json::json!({"moment": end}),
            metadata: link
                .get("metadata")
                .and_then(Value::as_object)
                .cloned()
                .ok_or("Invalid duration metadata")?,
        });
    }
    Ok(())
}
/// One group of nearby moments from the `points` overview (see `overview`).
#[derive(Debug, Serialize, Deserialize)]
pub struct Group {
    /// The earliest and latest moment times in the group.
    pub first: String,
    pub last: String,
    /// How many moments the group holds, as decimal text (it can exceed `u32`).
    pub count: String,
    /// How many distinct times the group holds.
    pub distinct: u32,
    /// Tree nodes the index visited to answer the query (a cost diagnostic).
    pub visited_nodes: u32,
}
/// Refuses anything that is not a version-1 OpenChronology timeline, and any file whose
/// data tables have been replaced by views or other schema objects: with `trusted_schema=OFF`
/// a view still runs its own SQL when read, so a crafted file could otherwise substitute
/// arbitrary queries for the tables the store reads. Generated (and other hidden) columns
/// are refused in every ordinary table for the same reason: SQLite computes them from the
/// file's own expression whenever the column is read. The store never makes one.
fn check_file(db: &Connection) -> Result<(), String> {
    if db.scalar("PRAGMA application_id", &[])? != APPLICATION_ID
        || db.scalar("PRAGMA user_version", &[])? != "1"
    {
        return Err("This is not a supported OpenChronology SQLite timeline".into());
    }
    // These names must be data tables, never attacker-supplied SQL views. The first count
    // requires both mandatory tables to exist as tables; the second allows the optional ones
    // to be missing (older files) but never to exist as anything other than a table.
    if db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('events','timeline_meta') AND type='table'", &[])? != "2"
        || db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('timeline_settings','timeline_plugins','timeline_extras','durations','relationships') AND type!='table'", &[])? != "0" {
        return Err("Invalid timeline data tables".into());
    }
    // pragma_table_list names each table's kind from the parsed schema; virtual tables are
    // left out, since their columns are the module's (rational_index has hidden inputs), and
    // listing a virtual table's columns would connect it.
    for row in db.query(
        "SELECT name FROM pragma_table_list WHERE schema='main' AND type IN ('table','shadow')",
        &[],
    )? {
        let name = row.into_iter().next().flatten().unwrap_or_default();
        if db.scalar(
            "SELECT count(*) FROM pragma_table_xinfo(?1,'main') WHERE hidden<>0",
            &[&name],
        )? != "0"
        {
            return Err("Timeline tables must not have generated or hidden columns".into());
        }
    }
    Ok(())
}
/// Checks a document against the format's rules and size limits before it is saved, and
/// again after it is read: format and version, title (300 UTF-16 units) and description
/// (20000), at most 200000 moments, durations and relationships, presentation and plugin JSON
/// up to 128 KiB (at most 32 plugins), up to 40 tags, embedded images up to 9 MiB, unique
/// IDs, text titles and notes, duration anchors naming existing moments, and relationships
/// between distinct existing entities. Lengths are counted in UTF-16 units to match the
/// editor's JavaScript limits. Returns the first problem found as a readable message.
fn validate(doc: &Document) -> Result<(), String> {
    if doc.events.len() > MAX_EVENTS {
        return Err(TOO_LARGE.into());
    }
    validate_settings(doc)?;
    let types = measure_types(doc.measures.as_ref())?;
    let mut ids = HashSet::new();
    for e in &doc.events {
        event_problem(e, |id| ids.insert(id))?;
        measure_values_problem(&e.metadata, &types)
            .map_err(|problem| format!("Moment {}: {problem}", e.id))?;
    }
    for d in &doc.durations {
        measure_values_problem(&d.metadata, &types)
            .map_err(|problem| format!("Duration {}: {problem}", d.id))?;
    }
    ongoing_needs_calendar(doc, &doc.durations)?;
    validate_entities(&doc.durations, &doc.relationships, |id| ids.contains(id))
}
/// Only timelines with the Gregorian display have a "now", so only they may hold ongoing
/// durations (#537), as src/core.ts validateDocument also requires.
fn ongoing_needs_calendar(doc: &Document, durations: &[Duration]) -> Result<(), String> {
    let gregorian = doc
        .presentation
        .as_ref()
        .and_then(|p| p.get("mode"))
        .and_then(Value::as_str)
        == Some("gregorian");
    if !gregorian && durations.iter().any(|d| d.end.get("ongoing").is_some()) {
        return Err(
            "Only timelines with the Gregorian time display can have ongoing durations".into(),
        );
    }
    Ok(())
}
/// The most measures a timeline declares, and values an entity gives (#572).
const MEASURE_LIMIT: usize = 32;
/// The longest measure value, as text (src/measures.ts MEASURE_TEXT_LIMIT).
const MEASURE_TEXT_LIMIT: usize = 2200;
/// Whether `name` is a measure name: lowercase letters, digits and underscores, starting with a
/// letter, at most 40 (src/measures.ts MEASURE_NAME).
fn measure_name(name: &str) -> bool {
    (1..=40).contains(&name.len())
        && name.starts_with(|c: char| c.is_ascii_lowercase())
        && name
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
}
/// A timeline's measures (#588), checked as src/measures.ts validateMeasures checks them, as
/// each name's type ("mpz" or "mpq"). Their presentations are the editor's to check; here only
/// their size is bounded.
fn measure_types(measures: Option<&Value>) -> Result<HashMap<String, String>, String> {
    let mut types = HashMap::new();
    let Some(measures) = measures else {
        return Ok(types);
    };
    let invalid = || "Invalid measures".to_string();
    let object = measures.as_object().ok_or_else(invalid)?;
    if object.len() > MEASURE_LIMIT {
        return Err(format!(
            "A timeline declares at most {MEASURE_LIMIT} measures"
        ));
    }
    for (name, declaration) in object {
        let d = declaration.as_object().ok_or_else(invalid)?;
        let kind = d.get("type").and_then(Value::as_str);
        let label = d.get("label");
        if !measure_name(name)
            || !matches!(kind, Some("mpz" | "mpq"))
            || d.keys()
                .any(|k| !["type", "label", "presentation"].contains(&k.as_str()))
            || label.is_some_and(|l| {
                l.as_str()
                    .is_none_or(|l| l.trim().is_empty() || l.encode_utf16().count() > 80)
            })
            || d.get("presentation")
                .is_some_and(|p| !p.is_object() || p.to_string().len() > 4096)
        {
            return Err(format!("Invalid measure {name}"));
        }
        types.insert(name.clone(), kind.unwrap().to_string());
    }
    Ok(types)
}
/// What is wrong with an entity's measure values (#588), as src/measures.ts would refuse them:
/// an object of at most MEASURE_LIMIT values of declared measures, each a canonical integer
/// (`1250`) or fraction (`3/2`, never `n/1`), whole for `mpz`, never zero. Whether a fraction
/// is in lowest terms needs exact arithmetic: `reduced_measures` checks it where it is written.
fn measure_values_problem(
    metadata: &Map<String, Value>,
    types: &HashMap<String, String>,
) -> Result<(), String> {
    let Some(values) = metadata.get("measures") else {
        return Ok(());
    };
    let values = values
        .as_object()
        .ok_or("Measures must be an object of values by name")?;
    if values.len() > MEASURE_LIMIT {
        return Err(format!(
            "An entity has at most {MEASURE_LIMIT} measure values"
        ));
    }
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit());
    let positive = |s: &str| digits(s) && !s.starts_with('0');
    for (name, value) in values {
        let kind = types
            .get(name)
            .ok_or_else(|| format!("The timeline declares no measure named {name}"))?;
        let text = value
            .as_str()
            .filter(|t| t.len() <= MEASURE_TEXT_LIMIT)
            .ok_or_else(|| format!("{name} must be exact text"))?;
        let unsigned = text.strip_prefix('-').unwrap_or(text);
        let canonical = match unsigned.split_once('/') {
            None => positive(unsigned),
            Some((n, d)) => positive(n) && positive(d) && d != "1",
        };
        if !canonical {
            return Err(format!("{name}: {text} is not a canonical nonzero value"));
        }
        if kind == "mpz" && unsigned.contains('/') {
            return Err(format!("{name} is a whole number; {text} isn't one"));
        }
    }
    Ok(())
}
/// Whether an entity's fractions are in lowest terms (#588), through the rational extension:
/// a canonical fraction is its own canonical form.
pub(crate) fn reduced_measures(
    db: &Connection,
    metadata: &Map<String, Value>,
) -> Result<(), String> {
    for (name, value) in metadata
        .get("measures")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if let Some(text) = value.as_str().filter(|t| t.contains('/')) {
            if db.scalar("SELECT q(?1)", &[text])? != text {
                return Err(format!("{name}: {text} is not in lowest terms"));
            }
        }
    }
    Ok(())
}
/// The most moments a timeline holds.
const MAX_EVENTS: usize = 200000;
const TOO_LARGE: &str = "Invalid timeline format, version, or document size";
/// validate's checks of everything but the entities: format and version, title, description,
/// presentation, plugins, tags and embedded images.
fn validate_settings(doc: &Document) -> Result<(), String> {
    if doc.format != "openchronology"
        || doc.version != 1
        || doc.title.encode_utf16().count() > 300
        || doc.description.encode_utf16().count() > 20000
    {
        return Err(TOO_LARGE.into());
    }
    if let Some(presentation) = &doc.presentation {
        if !presentation.is_object() || presentation.to_string().len() > 131072 {
            return Err("Invalid or oversized presentation settings".into());
        }
    }
    if let Some(plugins) = &doc.plugins {
        if !plugins.is_array()
            || plugins.as_array().unwrap().len() > 32
            || plugins.to_string().len() > 131072
        {
            return Err("Invalid or oversized plugin settings".into());
        }
    }
    if let Some(tags) = &doc.tags {
        if tags.len() > 40
            || tags.iter().any(|tag| {
                tag.is_empty()
                    || tag.encode_utf16().count() > 64
                    || tag.chars().any(|c| c.is_control() || c == ',')
            })
        {
            return Err("Invalid timeline tags".into());
        }
    }
    if let Some(assets) = &doc.assets {
        if !assets.is_object()
            || assets.as_object().unwrap().len() > 200
            || assets.to_string().len() > 9 * 1024 * 1024
        {
            return Err("Invalid or oversized embedded images".into());
        }
    }
    Ok(())
}
/// validate's checks of one moment: a valid ID that `insert` reports as new (false for one
/// already seen), no legacy `durations` links, and text titles and notes.
fn event_problem<'a>(e: &'a Event, insert: impl FnOnce(&'a str) -> bool) -> Result<(), String> {
    if !identifier(&e.id) || !insert(&e.id) {
        return Err("Event IDs must be unique ASCII identifiers".into());
    }
    if e.metadata.contains_key("durations") {
        return Err("Durations are stored separately from moments".into());
    }
    for key in ["title", "description"] {
        if e.metadata.get(key).is_some_and(|v| !v.is_string()) {
            return Err(format!("Event {key} must be text"));
        }
    }
    Ok(())
}
/// validate's checks of durations and relationships, given whether a moment ID exists.
fn validate_entities(
    durations_list: &[Duration],
    relationships: &[Relationship],
    moment: impl Fn(&str) -> bool,
) -> Result<(), String> {
    if durations_list.len() > 200000 {
        return Err("Use at most 200000 durations per timeline".into());
    }
    let mut durations = HashSet::new();
    for d in durations_list {
        if !identifier(&d.id) || !durations.insert(&d.id) {
            return Err("Duration IDs must be unique ASCII identifiers".into());
        }
        if endpoint(&d.start)? == (None, None) {
            return Err("A duration's start cannot be ongoing".into());
        }
        for value in [&d.start, &d.end] {
            if let (_, Some(anchor)) = endpoint(value)? {
                if !moment(anchor) {
                    return Err("Duration anchors must name existing moments".into());
                }
            }
        }
        for key in ["title", "description"] {
            if d.metadata.get(key).is_some_and(|v| !v.is_string()) {
                return Err("Duration titles and notes must be text".into());
            }
        }
        if d.metadata.contains_key("durations") {
            return Err("Durations cannot contain durations".into());
        }
    }
    if relationships.len() > 200000 {
        return Err("Use at most 200000 relationships per timeline".into());
    }
    for r in relationships {
        let (a, b) = (entity_ref(&r.a)?, entity_ref(&r.b)?);
        if a == b {
            return Err("An entity cannot be related to itself".into());
        }
        for (kind, id) in [a, b] {
            let exists = if kind == "moment" {
                moment(id)
            } else {
                durations.contains(&id.to_string())
            };
            if !exists {
                return Err("Relationships must connect existing moments and durations".into());
            }
        }
    }
    Ok(())
}
/// Writes a whole document to the SQLite timeline file at `path`, creating the file if needed.
///
/// The document is validated first (after converting version-1 legacy durations). An existing
/// file must be an OpenChronology timeline or an empty SQLite database; anything else is
/// refused so a mistaken path cannot overwrite an unrelated database. Every table is then
/// replaced inside one `BEGIN IMMEDIATE` transaction, which takes the write lock up front so no
/// other writer can interleave; on any error the transaction is rolled back and the file is
/// left exactly as it was. The indexes (moment overview, duration and arc trees) are rebuilt
/// from scratch and stamped with a new save token.
pub fn save(path: &Path, doc: &Document) -> Result<(), String> {
    // Only a document with legacy links is copied to convert them (#202): a large one held
    // twice took twice the memory.
    let converted;
    let doc = if doc
        .events
        .iter()
        .any(|e| e.metadata.contains_key("durations"))
    {
        let mut copy = doc.clone();
        convert_legacy_durations(&mut copy)?;
        converted = copy;
        &converted
    } else {
        doc
    };
    validate(doc)?;
    write(path, doc, doc.events.iter().map(|e| Ok(Cow::Borrowed(e))))
}
/// `save` with the moments supplied one at a time instead of in `settings.events` (which is
/// ignored), so a large document need not be held whole: och-convert parses each moment's
/// metadata only as it is written (#202). The settings are checked first; each moment as it
/// comes, legacy links converted; the durations and relationships last. A problem anywhere
/// rolls the save back, leaving an existing file as it was (a new one stays empty).
pub fn save_streamed(
    path: &Path,
    settings: &Document,
    events: impl Iterator<Item = Result<Event, String>>,
) -> Result<(), String> {
    validate_settings(settings)?;
    write(path, settings, events.map(|e| e.map(Cow::Owned)))
}
/// save's writing, from `doc`'s settings, durations and relationships and the `events` given,
/// checking each moment (and then the entities) as validate does.
fn write<'a>(
    path: &Path,
    doc: &Document,
    mut events: impl Iterator<Item = Result<Cow<'a, Event>, String>>,
) -> Result<(), String> {
    let db = Connection::open(path, true)?;
    let id = db.scalar("PRAGMA application_id", &[])?;
    if id != APPLICATION_ID {
        // A new or empty file has application_id 0 and no schema objects of its own.
        let tables = db.scalar(
            "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            &[],
        )?;
        if id != "0" || tables != "0" {
            return Err("Refusing to replace an unrelated SQLite database".into());
        }
    } else {
        check_file(&db)?;
    }
    db.execute("BEGIN IMMEDIATE", &[])?;
    let result = (|| {
        // JSON is serialized and validated by serde_json on both write and read.
        // Older system SQLite builds reject json_valid() in CHECK constraints
        // with trusted_schema=OFF. Recreate these fully replaced data tables so
        // existing files with those checks can also be saved without trusting SQL.
        for table in [
            "timeline_settings",
            "timeline_plugins",
            "timeline_extras",
            "events",
            "durations",
            "relationships",
        ] {
            db.execute(&format!("DROP TABLE IF EXISTS {table}"), &[])?;
        }
        // One-row tables (the CHECK allows only singleton=1): the title and description, the
        // presentation settings JSON, the plugin list JSON, and the tags and embedded images.
        // timeline_meta is kept rather than dropped and its row is upserted below.
        db.execute("CREATE TABLE IF NOT EXISTS timeline_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),title TEXT NOT NULL,description TEXT NOT NULL)",&[])?;
        db.execute("CREATE TABLE IF NOT EXISTS timeline_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),presentation TEXT NOT NULL)", &[])?;
        db.execute("CREATE TABLE IF NOT EXISTS timeline_plugins(singleton INTEGER PRIMARY KEY CHECK(singleton=1),plugins TEXT NOT NULL)", &[])?;
        db.execute("CREATE TABLE IF NOT EXISTS timeline_extras(singleton INTEGER PRIMARY KEY CHECK(singleton=1),extras TEXT NOT NULL)", &[])?;
        db.execute("DELETE FROM timeline_extras", &[])?;
        // Always written, with nulls when absent; settings and plugins rows are written only
        // when present, and a missing row reads back as None.
        let extras = serde_json::json!({"tags": doc.tags, "assets": doc.assets, "view": doc.view, "views": doc.views, "measures": doc.measures})
            .to_string();
        if extras.len() > 10 * 1024 * 1024 {
            return Err("Timeline extras exceed 10 MiB".into());
        }
        db.execute("INSERT INTO timeline_extras VALUES(1,?)", &[&extras])?;
        db.execute("DELETE FROM timeline_plugins", &[])?;
        if let Some(plugins) = &doc.plugins {
            let json = serde_json::to_string(plugins).map_err(|e| e.to_string())?;
            db.execute("INSERT INTO timeline_plugins VALUES(1,?)", &[&json])?;
        }
        db.execute("DELETE FROM timeline_settings", &[])?;
        if let Some(presentation) = &doc.presentation {
            let json = serde_json::to_string(presentation).map_err(|e| e.to_string())?;
            db.execute("INSERT INTO timeline_settings VALUES(1,?)", &[&json])?;
        }
        // Moments. The time column sorts by rational value (RATIONAL_V1) and must hold the
        // canonical reduced form, so equal times are equal strings; STRICT rejects non-TEXT
        // values. events_time serves ordered range scans by time (the workspace adds
        // events_time_id on (time, id) for paging).
        db.execute("CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,time TEXT NOT NULL COLLATE RATIONAL_V1 CHECK(q_is_canonical(time)=1),metadata TEXT NOT NULL) STRICT",&[])?;
        db.execute(
            "CREATE INDEX IF NOT EXISTS events_time ON events(time COLLATE RATIONAL_V1)",
            &[],
        )?;
        // The moment overview index: sqlite-rational's augmented tree with one row per
        // distinct time (value = that time, weight = the moments there), which summarizes a
        // viewport in a bounded number of node visits. It is emptied and refilled, not dropped.
        db.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS points USING rational_index",
            &[],
        )?;
        // An index made before it kept measures' totals (#574) is made again with them.
        if !points_have_sums(&db)? {
            db.execute("DROP TABLE points", &[])?;
            db.execute("CREATE VIRTUAL TABLE points USING rational_index", &[])?;
        }
        db.execute("DELETE FROM points", &[])?;
        db.execute("DELETE FROM events", &[])?;
        // Upsert the single metadata row: inserted in a new file, updated in an existing one.
        db.execute("INSERT INTO timeline_meta VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET title=excluded.title,description=excluded.description",&[&doc.title,&doc.description])?;
        // q(?) parses and canonicalizes each time (2/4 becomes 1/2) and fails on malformed
        // input or a zero denominator, which aborts the save.
        let (mut ids, mut legacy, mut count) = (HashSet::new(), Vec::new(), 0);
        let types = measure_types(doc.measures.as_ref())?;
        for event in events.by_ref() {
            let mut event = event?;
            if event.metadata.contains_key("durations") {
                legacy_durations(event.to_mut(), &mut legacy)?;
            }
            count += 1;
            if count > MAX_EVENTS {
                return Err(TOO_LARGE.into());
            }
            event_problem(&event, |id| ids.insert(id.to_string()))?;
            measure_values_problem(&event.metadata, &types)
                .map_err(|problem| format!("Moment {}: {problem}", event.id))?;
            reduced_measures(&db, &event.metadata)?;
            let metadata = serde_json::to_string(&event.metadata).map_err(|e| e.to_string())?;
            db.execute(
                "INSERT INTO events(id,time,metadata) VALUES(?,q(?),?)",
                &[&event.id, &event.time, &metadata],
            )?;
        }
        // Fill the overview index: one bucket per distinct time, weighted by its moment count.
        // Overview groups join back to events by time (workspace.rs) to show single moments.
        // The emptied index takes the buckets appended, unlinked, and builds its tree once from
        // them sorted, writing each node once (#199); inserting them one by one walked and
        // rebalanced the tree for each, too slow for och-convert's CPU limit on large files.
        // Appended a range of 5000 times per statement, so each stays well within the
        // instruction budget (a statement for 200,000 came within 6% of it).
        let times = db.query(
            "SELECT time FROM events GROUP BY time COLLATE RATIONAL_V1 ORDER BY time COLLATE RATIONAL_V1",
            &[],
        )?;
        // Each bucket's measure values added, one per declared measure (#574).
        let sums = sums_sql(&measure_names(doc.measures.as_ref()));
        for range in times.chunks(5000) {
            let bound = |row: &Vec<Option<String>>| row.first().cloned().flatten();
            let (Some(first), Some(last)) = (bound(&range[0]), bound(&range[range.len() - 1]))
            else {
                return Err("Missing moment time".into());
            };
            db.execute(&format!("INSERT INTO points(time,value,weight,sums,mode) SELECT time,time,count(*),{sums},'append' FROM events WHERE time>=?1 COLLATE RATIONAL_V1 AND time<=?2 COLLATE RATIONAL_V1 GROUP BY time COLLATE RATIONAL_V1"),&[&first,&last])?;
        }
        db.execute("INSERT INTO points(mode) VALUES('build')", &[])?;
        // Durations from legacy links join the document's, in ID order as convert_legacy_durations
        // leaves them.
        let durations: Cow<[Duration]> = if legacy.is_empty() {
            Cow::Borrowed(&doc.durations)
        } else {
            let mut all = doc.durations.clone();
            all.extend(legacy);
            all.sort_by(|a, b| a.id.cmp(&b.id));
            Cow::Owned(all)
        };
        ongoing_needs_calendar(doc, &durations)?;
        validate_entities(&durations, &doc.relationships, |id| ids.contains(id))?;
        for d in durations.iter() {
            measure_values_problem(&d.metadata, &types)
                .map_err(|problem| format!("Duration {}: {problem}", d.id))?;
        }
        create_duration_table(&db)?;
        for duration in durations.iter() {
            insert_duration(&db, duration)?;
        }
        rebuild_duration_index(&db)?;
        create_relationship_table(&db)?;
        for r in &doc.relationships {
            relate(&db, r, true)?;
        }
        rebuild_edge_index(&db)?;
        // A fresh token: no open desktop baseline matches this file any more, so their next
        // save writes the whole file rather than patching it in place (workspace.rs).
        intervals::set_layout(&db, &intervals::token())?;
        // Mark the file as an OpenChronology timeline, format version 1 (see check_file).
        db.execute("PRAGMA application_id=1329812556", &[])?;
        db.execute("PRAGMA user_version=1", &[])?;
        db.execute("COMMIT", &[])
    })();
    if result.is_err() {
        let _ = db.execute("ROLLBACK", &[]);
    }
    result
}
/// Reads a whole timeline file (every moment, duration and relationship) as a document,
/// validated as on save. Used by `och-convert read`, the desktop app's full-document reads
/// and the tests. Errors when the file is not a valid timeline.
pub fn open(path: &Path) -> Result<Document, String> {
    read_document(path, true)
}
/// Reads only a file's settings (title, description, presentation, plugins, tags, images),
/// with empty moment, duration and relationship lists, under the browsing read limits. The
/// desktop app's `Snapshot::header` uses it, so opening a large file never loads its moments.
pub fn header_document(path: &Path) -> Result<Document, String> {
    read_document(path, false)
}
/// Reads a document from `path`, with or without its entities. All reads happen in one read
/// transaction, so they see a single consistent state even if another process writes the file
/// meanwhile. Lists are read one row past their limit (`LIMIT 200001`) so an oversized file
/// fails validation instead of being silently truncated. Optional tables that older files lack
/// read as absent.
fn read_document(path: &Path, include_events: bool) -> Result<Document, String> {
    let mut db = Connection::open(path, false)?;
    if !include_events {
        db.limit_reads();
    }
    check_file(&db)?;
    db.execute("BEGIN", &[])?;
    let metadata = db.query_limited(
        "SELECT title,description FROM timeline_meta WHERE singleton=1",
        &[],
        1,
        128 * 1024,
    )?;
    let meta = metadata.first().ok_or("Missing timeline metadata")?;
    // Every moment in time order (then ID). q(time) returns the canonical form, so a file
    // whose CHECK was bypassed still yields valid times or fails.
    let rows = if include_events {
        db.query(
        "SELECT id,q(time),metadata FROM events ORDER BY time COLLATE RATIONAL_V1,id LIMIT 200001",
        &[],
    )?
    } else {
        Vec::new()
    };
    let mut events = Vec::new();
    for row in rows {
        events.push(Event {
            id: row[0].clone().ok_or("Missing event ID")?,
            time: row[1].clone().ok_or("Missing event time")?,
            metadata: serde_json::from_str(row[2].as_deref().ok_or("Missing event metadata")?)
                .map_err(|e| e.to_string())?,
        });
    }
    // Each optional one-row table is read only if it exists as a table; check_file has already
    // ensured these names are not views.
    let extras: Value = if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='timeline_extras' AND type='table'",
        &[],
    )? == "0"
    {
        Value::Null
    } else {
        let rows = db.query_limited(
            "SELECT extras FROM timeline_extras WHERE singleton=1",
            &[],
            1,
            10 * 1024 * 1024,
        )?;
        rows.first()
            .map(|row| {
                serde_json::from_str(row[0].as_deref().ok_or("Missing timeline extras")?)
                    .map_err(|e| e.to_string())
            })
            .transpose()?
            .unwrap_or(Value::Null)
    };
    let doc = Document {
        tags: extras
            .get("tags")
            .filter(|v| !v.is_null())
            .map(|v| serde_json::from_value(v.clone()).map_err(|e| e.to_string()))
            .transpose()?,
        assets: extras.get("assets").filter(|v| !v.is_null()).cloned(),
        view: extras.get("view").filter(|v| !v.is_null()).cloned(),
        views: extras.get("views").filter(|v| !v.is_null()).cloned(),
        measures: extras.get("measures").filter(|v| !v.is_null()).cloned(),
        format: "openchronology".into(),
        version: 1,
        title: meta[0].clone().ok_or("Missing title")?,
        description: meta[1].clone().ok_or("Missing description")?,
        presentation: if db.scalar(
            "SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='timeline_settings'",
            &[],
        )? == "0"
        {
            None // Files written before presentation settings remain readable.
        } else {
            let settings = db.query_limited(
                "SELECT presentation FROM timeline_settings WHERE singleton=1",
                &[],
                1,
                128 * 1024,
            )?;
            settings
                .first()
                .map(|row| {
                    serde_json::from_str(row[0].as_deref().ok_or("Missing presentation settings")?)
                        .map_err(|e| e.to_string())
                })
                .transpose()?
        },
        plugins: if db.scalar(
            "SELECT count(*) FROM sqlite_schema WHERE name='timeline_plugins' AND type='table'",
            &[],
        )? == "0"
        {
            None
        } else {
            let rows = db.query_limited(
                "SELECT plugins FROM timeline_plugins WHERE singleton=1",
                &[],
                1,
                128 * 1024,
            )?;
            rows.first()
                .map(|row| {
                    serde_json::from_str(row[0].as_deref().ok_or("Missing plugin settings")?)
                        .map_err(|e| e.to_string())
                })
                .transpose()?
        },
        durations: if include_events
            && db.scalar(
                "SELECT count(*) FROM sqlite_schema WHERE name='durations' AND type='table'",
                &[],
            )? != "0"
        {
            read_durations(&db, None)?
        } else {
            Vec::new()
        },
        relationships: if include_events
            && db.scalar(
                "SELECT count(*) FROM sqlite_schema WHERE name='relationships' AND type='table'",
                &[],
            )? != "0"
        {
            // Every link in primary-key order, so the document lists them deterministically.
            db.query("SELECT a_kind,a_id,b_kind,b_id FROM relationships ORDER BY a_kind,a_id,b_kind,b_id LIMIT 200001", &[])?
                .into_iter()
                .map(|r| {
                    let side = |k: &Option<String>, i: &Option<String>| serde_json::json!({ k.clone().unwrap_or_default(): i.clone().unwrap_or_default() });
                    Relationship { a: side(&r[0], &r[1]), b: side(&r[2], &r[3]) }
                })
                .collect()
        } else {
            Vec::new()
        },
        events,
    };
    let mut doc = doc;
    convert_legacy_durations(&mut doc)?;
    validate(&doc)?;
    // Ends the read transaction; nothing was written.
    db.execute("COMMIT", &[])?;
    Ok(doc)
}
/// The `durations` table: exactly one of time/moment for a start, and at most one for an end,
/// where neither is an ongoing end (#537); fixed times are canonical exact rationals.
const DURATIONS_TABLE: &str = "CREATE TABLE durations(id TEXT PRIMARY KEY,start_time TEXT COLLATE RATIONAL_V1 CHECK(start_time IS NULL OR q_is_canonical(start_time)=1),start_moment TEXT,end_time TEXT COLLATE RATIONAL_V1 CHECK(end_time IS NULL OR q_is_canonical(end_time)=1),end_moment TEXT,metadata TEXT NOT NULL,CHECK((start_time IS NULL)<>(start_moment IS NULL)),CHECK(end_time IS NULL OR end_moment IS NULL)) STRICT";
/// Files written before ongoing durations (#537) required an end's time or moment. Their
/// `durations` table is copied into one that allows neither, the first time one is saved.
pub(crate) fn allow_ongoing(db: &Connection) -> Result<(), String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='durations' AND type='table' AND instr(sql,'(end_time IS NULL)<>(end_moment IS NULL)')>0",
        &[],
    )? == "0"
    {
        return Ok(());
    }
    db.execute(
        &DURATIONS_TABLE.replace("TABLE durations", "TABLE durations_ongoing"),
        &[],
    )?;
    db.execute("INSERT INTO durations_ongoing SELECT id,start_time,start_moment,end_time,end_moment,metadata FROM durations", &[])?;
    db.execute("DROP TABLE durations", &[])?;
    db.execute("ALTER TABLE durations_ongoing RENAME TO durations", &[])?;
    create_duration_table(db)
}
/// Creates the `durations` table and its anchor indexes if missing.
///
/// Each row is one standalone duration as the document stores it: `start_time`/`end_time`
/// hold a fixed endpoint (canonical rational) and `start_moment`/`end_moment` the ID of the
/// moment an anchored endpoint follows; `metadata` is its JSON. Written by `save`,
/// `insert_duration` and sparse saves (workspace.rs); read by `read_durations` and when
/// resolving `duration_intervals`.
fn create_duration_table(db: &Connection) -> Result<(), String> {
    db.execute(
        &DURATIONS_TABLE.replace("TABLE durations", "TABLE IF NOT EXISTS durations"),
        &[],
    )?;
    // Durations anchored to a moment move with it. These indexes serve the lookups of the
    // durations following a moment that changed time or was deleted (workspace.rs).
    db.execute(
        "CREATE INDEX IF NOT EXISTS durations_start_moment ON durations(start_moment)",
        &[],
    )?;
    db.execute(
        "CREATE INDEX IF NOT EXISTS durations_end_moment ON durations(end_moment)",
        &[],
    )
}
/// Inserts a duration, or replaces the stored one with the same ID (upsert on the primary
/// key). Fixed endpoint times are canonicalized with `q()`. Only the `durations` table changes;
/// callers update `duration_intervals` and its tree afterwards. Errors on an invalid endpoint.
pub(crate) fn insert_duration(db: &Connection, d: &Duration) -> Result<(), String> {
    let (start_time, start_moment) = endpoint(&d.start)?;
    let (end_time, end_moment) = endpoint(&d.end)?;
    if start_time.is_none() && start_moment.is_none() {
        return Err("A duration's start cannot be ongoing".into());
    }
    if end_time.is_none() && end_moment.is_none() {
        allow_ongoing(db)?;
    }
    reduced_measures(db, &d.metadata)?;
    let metadata = serde_json::to_string(&d.metadata).map_err(|e| e.to_string())?;
    // Empty strings stand in for NULL; the wrapper binds text parameters only.
    db.execute(
        "INSERT INTO durations(id,start_time,start_moment,end_time,end_moment,metadata) VALUES(?1,CASE WHEN ?2='' THEN NULL ELSE q(?2) END,NULLIF(?3,''),CASE WHEN ?4='' THEN NULL ELSE q(?4) END,NULLIF(?5,''),?6) ON CONFLICT(id) DO UPDATE SET start_time=excluded.start_time,start_moment=excluded.start_moment,end_time=excluded.end_time,end_moment=excluded.end_moment,metadata=excluded.metadata",
        &[
            &d.id,
            start_time.unwrap_or(""),
            start_moment.unwrap_or(""),
            end_time.unwrap_or(""),
            end_moment.unwrap_or(""),
            &metadata,
        ],
    )
}
/// Reads stored durations back into document form: one by ID (primary-key lookup, at most
/// 8 MiB), or all of them in ID order with one row past the 200000 limit for validation to
/// catch. Fixed times come back canonical via `q()`.
fn read_durations(db: &Connection, id: Option<&str>) -> Result<Vec<Duration>, String> {
    let rows = match id {
        Some(id) => db.query_limited("SELECT id,q(start_time),start_moment,q(end_time),end_moment,metadata FROM durations WHERE id=?", &[id], 1, 8 * 1024 * 1024)?,
        None => db.query("SELECT id,q(start_time),start_moment,q(end_time),end_moment,metadata FROM durations ORDER BY id LIMIT 200001", &[])?,
    };
    rows.into_iter()
        .map(|row| {
            let side = |time: &Option<String>, moment: &Option<String>| match (time, moment) {
                (Some(t), None) => Ok(Value::String(t.clone())),
                (None, Some(m)) => Ok(serde_json::json!({"moment": m})),
                (None, None) => Ok(serde_json::json!({"ongoing": true})),
                _ => Err("Invalid stored duration endpoint".to_string()),
            };
            Ok(Duration {
                id: row[0].clone().ok_or("Missing duration ID")?,
                start: side(&row[1], &row[2])?,
                end: side(&row[3], &row[4])?,
                metadata: serde_json::from_str(
                    row[5].as_deref().ok_or("Missing duration metadata")?,
                )
                .map_err(|e| e.to_string())?,
            })
        })
        .collect()
}
/// Whether an entity's `tags` metadata array contains any of `tags` (exact string match;
/// callers pass normalized tags).
fn has_any_tag(metadata: &Map<String, Value>, tags: &[String]) -> bool {
    metadata
        .get("tags")
        .and_then(Value::as_array)
        .is_some_and(|list| {
            list.iter()
                .any(|t| t.as_str().is_some_and(|t| tags.iter().any(|w| w == t)))
        })
}
/// A disjoin or a union (#549): the track it leaves or joins (`None`: the main timeline) and
/// the entities at or after its time.
pub type Join = (Option<usize>, HashSet<String>);
/// Which entities a separation takes: those with any of its tags, or (#552) an entity and its
/// related or connected set, by reference key ("m:<id>", "d:<id>").
#[derive(Clone, Debug)]
pub enum SeparationMatch {
    Tags(Vec<String>),
    Members(HashSet<String>),
}
/// One of several separations (#549): which entities it takes; when it disjoins, its
/// disjoins; and its unions, earliest first.
pub type SeparationTrack = (SeparationMatch, Option<Vec<Join>>, Vec<Join>);
/// What puts an entity on the upper side of a separation.
pub enum Membership {
    /// Any of these (normalized) tags.
    Tags(Vec<String>),
    /// This entity ("m:<id>" or "d:<id>") and its relations: direct, or all reachable.
    Related { start: String, direct: bool },
    /// One track (`None`: the rest) of several separations, each its tags, disjoins and unions,
    /// taken in `order`: each after those it disjoins from (#549). `key` names the view.
    Tracks {
        separations: Vec<SeparationTrack>,
        order: Vec<usize>,
        track: Option<usize>,
        key: String,
    },
}
/// The order separations are taken in (src/tags.ts separationOrder): each after those it
/// disjoins from; None when they disjoin from each other in a circle.
pub fn separation_order(disjoins: &[Vec<Option<usize>>]) -> Option<Vec<usize>> {
    fn visit(
        i: usize,
        disjoins: &[Vec<Option<usize>>],
        state: &mut Vec<u8>,
        order: &mut Vec<usize>,
    ) -> bool {
        match state[i] {
            2 => return true,
            1 => return false,
            _ => {}
        }
        state[i] = 1;
        for from in disjoins[i].iter().flatten() {
            if *from >= disjoins.len() || !visit(*from, disjoins, state, order) {
                return false;
            }
        }
        state[i] = 2;
        order.push(i);
        true
    }
    let mut state = vec![0u8; disjoins.len()];
    let mut order = Vec::new();
    for i in 0..disjoins.len() {
        if !visit(i, disjoins, &mut state, &mut order) {
            return None;
        }
    }
    Some(order)
}
/// The tracks an entity is on among several separations (src/tags.ts separationTracks).
fn entity_tracks(
    separations: &[SeparationTrack],
    order: &[usize],
    key: &str,
    metadata: &Map<String, Value>,
) -> HashSet<Option<usize>> {
    // Where an entity taken by separation `i` is: there, or where its latest union passed
    // goes, followed on (and stopped where unions go round).
    let unite = |i: usize| -> Option<usize> {
        let mut seen = HashSet::new();
        let mut current = Some(i);
        while let Some(c) = current {
            if !seen.insert(c) {
                break;
            }
            match separations[c]
                .2
                .iter()
                .rev()
                .find(|(_, after)| after.contains(key))
            {
                Some((into, _)) => current = *into,
                None => break,
            }
        }
        current
    };
    // Each in order: without disjoins a separation takes the entity beside its tracks; with
    // them, it takes it from a track it is on (the main one when on none) once that track's
    // disjoin has come, and it leaves that track.
    let mut on: HashSet<Option<usize>> = HashSet::new();
    for &i in order {
        let (matches, disjoins, _) = &separations[i];
        let takes = match matches {
            SeparationMatch::Tags(tags) => has_any_tag(metadata, tags),
            SeparationMatch::Members(set) => set.contains(key),
        };
        if !takes {
            continue;
        }
        let Some(disjoins) = disjoins else {
            on.insert(unite(i));
            continue;
        };
        let home: HashSet<Option<usize>> = if on.is_empty() {
            HashSet::from([None])
        } else {
            on.clone()
        };
        let leaving: Vec<Option<usize>> = disjoins
            .iter()
            .filter(|(from, after)| home.contains(from) && after.contains(key))
            .map(|(from, _)| *from)
            .collect();
        on = home;
        if !leaving.is_empty() {
            on.retain(|t| !leaving.contains(t));
            on.insert(unite(i));
        }
    }
    if on.is_empty() {
        on.insert(None);
    }
    on
}
/// The "m:<id>" or "d:<id>" key of an entity reference, or None if it is invalid.
fn ref_key(value: &Value) -> Option<String> {
    let (kind, id) = entity_ref(value).ok()?;
    Some(format!(
        "{}:{}",
        if kind == "moment" { "m" } else { "d" },
        id
    ))
}
/// One side of a separation. Durations resolve to fixed endpoints first, because the
/// moments they follow may be on the other side; links between entities that are both on
/// this side remain. Mirrors src/tags.ts filterDocument.
pub fn filter_document(mut doc: Document, membership: &Membership, any: bool) -> Document {
    let times: std::collections::HashMap<String, String> = doc
        .events
        .iter()
        .map(|e| (e.id.clone(), e.time.clone()))
        .collect();
    let related: Option<HashSet<String>> = match membership {
        Membership::Tags(_) | Membership::Tracks { .. } => None,
        Membership::Related { start, direct } => {
            let mut graph: std::collections::HashMap<String, Vec<String>> = Default::default();
            for r in &doc.relationships {
                if let (Some(a), Some(b)) = (ref_key(&r.a), ref_key(&r.b)) {
                    graph.entry(a.clone()).or_default().push(b.clone());
                    graph.entry(b).or_default().push(a);
                }
            }
            // Breadth-first search over the undirected links from the start entity; with
            // `direct` it stops after the first ring of neighbours.
            let mut found: HashSet<String> = HashSet::from([start.clone()]);
            let mut frontier = vec![start.clone()];
            while !frontier.is_empty() {
                let mut next = Vec::new();
                for key in frontier {
                    for neighbour in graph.get(&key).into_iter().flatten() {
                        if found.insert(neighbour.clone()) {
                            next.push(neighbour.clone());
                        }
                    }
                }
                frontier = if *direct { Vec::new() } else { next };
            }
            Some(found)
        }
    };
    // An entity stays when its membership matches the side asked for (`any`: inside, or
    // not `any`: outside).
    let keep = |key: String, metadata: &Map<String, Value>| {
        if let Membership::Tracks {
            separations,
            order,
            track,
            ..
        } = membership
        {
            return entity_tracks(separations, order, &key, metadata).contains(track);
        }
        let inside = match (&related, membership) {
            (Some(set), _) => set.contains(&key),
            (None, Membership::Tags(tags)) => has_any_tag(metadata, tags),
            _ => false,
        };
        inside == any
    };
    doc.events
        .retain(|e| keep(format!("m:{}", e.id), &e.metadata));
    // Anchors become the anchor moment's time, taken from the full document, since that
    // moment may have been filtered out. A duration whose anchor is missing is dropped.
    let resolve = |endpoint: &Value| match endpoint {
        Value::String(_) => Some(endpoint.clone()),
        _ => endpoint
            .get("moment")
            .and_then(Value::as_str)
            .and_then(|m| times.get(m))
            .map(|t| Value::String(t.clone())),
    };
    doc.durations = doc
        .durations
        .into_iter()
        .filter(|d| keep(format!("d:{}", d.id), &d.metadata))
        .filter_map(|d| {
            Some(Duration {
                start: resolve(&d.start)?,
                end: resolve(&d.end)?,
                ..d
            })
        })
        .collect();
    let kept: HashSet<String> = doc
        .events
        .iter()
        .map(|e| format!("m:{}", e.id))
        .chain(doc.durations.iter().map(|d| format!("d:{}", d.id)))
        .collect();
    doc.relationships.retain(|r| {
        ref_key(&r.a).is_some_and(|k| kept.contains(&k))
            && ref_key(&r.b).is_some_and(|k| kept.contains(&k))
    });
    doc
}
/// Moves legacy links out of moment metadata in a writable working copy.
///
/// Runs only when the file has no `durations` table yet (a file written before standalone
/// durations). Each `{"id","endId","metadata"}` entry of a moment's `metadata.durations` array
/// becomes a duration anchored from that moment to `endId`, and the array is removed from the
/// moment. The SQL equivalent of `convert_legacy_durations`, done in place so the moments never
/// have to be loaded. Errors if a legacy link ends at its own start moment.
pub(crate) fn migrate_durations(db: &Connection) -> Result<(), String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='durations' AND type='table'",
        &[],
    )? != "0"
    {
        return Ok(());
    }
    create_duration_table(db)?;
    // json_each expands each moment's legacy array into one row per link (no rows when the
    // moment has none); a link ending at its own moment is invalid.
    if db.scalar("SELECT count(*) FROM events s,json_each(s.metadata,'$.durations') d WHERE json_extract(d.value,'$.endId')=s.id", &[])? != "0" {
        return Err("Duration endpoints must be distinct existing moments".into());
    }
    // One anchored duration per legacy link: from the moment holding it to its endId, with
    // the link's metadata re-serialized by json() (an empty object when missing).
    db.execute("INSERT INTO durations(id,start_time,start_moment,end_time,end_moment,metadata) SELECT json_extract(d.value,'$.id'),NULL,s.id,NULL,json_extract(d.value,'$.endId'),COALESCE(json(json_extract(d.value,'$.metadata')),'{}') FROM events s,json_each(s.metadata,'$.durations') d", &[])?;
    // Then strip the legacy key from just the moments that had it.
    db.execute("UPDATE events SET metadata=json_remove(metadata,'$.durations') WHERE json_type(metadata,'$.durations') IS NOT NULL", &[])?;
    Ok(())
}
/// A single standalone duration with its full metadata, for opening it in the editor.
pub(crate) fn duration_by_id(db: &Connection, id: &str) -> Result<Option<Duration>, String> {
    if !identifier(id) {
        return Err("Invalid duration identifier".into());
    }
    Ok(read_durations(db, Some(id))?.into_iter().next())
}
/// Groups of moments in the viewport [lower, upper] (both ends included), read directly from a
/// saved file's `points` index: each group gathers the moments within `threshold` of its first
/// time ("span" mode; a zero threshold gives one group per distinct time). Only moments, not
/// the duration bands and arcs the desktop app's `Snapshot::query` adds; the tests use it.
pub fn overview(
    path: &Path,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Vec<Group>, String> {
    let db = Connection::open(path, false)?;
    check_file(&db)?;
    // A summary query on the rational_index virtual table: the hidden lower/upper/threshold/
    // mode columns take equality constraints as inputs, and each row is one group with its
    // first and last time, total weight (moments), distinct times and nodes visited.
    let rows=db.query("SELECT time,last_time,weight,distinct_count,visited_nodes FROM points WHERE lower=q(?) AND upper=q(?) AND include_upper=1 AND threshold=q(?) AND mode='span' ORDER BY time",&[lower,upper,threshold])?;
    rows.into_iter()
        .map(|row| {
            Ok(Group {
                first: row[0].clone().ok_or("Missing group time")?,
                last: row[1].clone().ok_or("Missing last time")?,
                count: row[2].clone().ok_or("Missing count")?,
                distinct: row[3]
                    .as_ref()
                    .ok_or("Missing distinct count")?
                    .parse::<u32>()
                    .map_err(|e| e.to_string())?,
                visited_nodes: row[4]
                    .as_ref()
                    .ok_or("Missing visit count")?
                    .parse::<u32>()
                    .map_err(|e| e.to_string())?,
            })
        })
        .collect()
}
/// Whole-file save and open: round trips, atomic failures, legacy schemas, and files crafted
/// to run SQL or replace unrelated databases.
#[cfg(test)]
mod tests {
    use super::*;
    /// Measures (#588): declarations and values are checked as the editor checks them, on
    /// whole saves; a file with valid ones keeps them.
    #[test]
    fn measure_declarations_and_values_are_validated() {
        let with = |measures: Value, values: Value| -> Document {
            serde_json::from_value(serde_json::json!({
                "format":"openchronology","version":1,"title":"Measured","description":"",
                "measures":measures,
                "events":[{"id":"a","time":"1/1","metadata":{"measures":values}}],
                "durations":[{"id":"d","start":"1/1","end":"2/1","metadata":{"measures":{"hours":"1/2"}}}]
            }))
            .unwrap()
        };
        let measures =
            serde_json::json!({"cost":{"type":"mpz","label":"Cost"},"hours":{"type":"mpq"}});
        let path = file("measures");
        let good = with(
            measures.clone(),
            serde_json::json!({"cost":"-1250","hours":"7/2"}),
        );
        save(&path, &good).unwrap();
        assert_eq!(
            open(&path).unwrap().events[0].metadata["measures"]["hours"],
            "7/2"
        );
        for (values, problem) in [
            (
                serde_json::json!({"price":"1"}),
                "declares no measure named price",
            ),
            (serde_json::json!({"cost":"1/2"}), "whole number"),
            (serde_json::json!({"cost":1250}), "exact text"),
            (serde_json::json!({"cost":"0"}), "canonical"),
            (serde_json::json!({"cost":"012"}), "canonical"),
            (serde_json::json!({"hours":"6/4"}), "lowest terms"),
            (serde_json::json!({"hours":"3/1"}), "canonical"),
            (serde_json::json!({"hours":"1.5"}), "canonical"),
        ] {
            let error = save(&path, &with(measures.clone(), values.clone())).unwrap_err();
            assert!(error.contains(problem), "{values}: {error}");
        }
        for bad in [
            serde_json::json!({"Cost":{"type":"mpz"}}),
            serde_json::json!({"cost":{"type":"f64"}}),
            serde_json::json!({"cost":{"type":"mpz","unit":"$"}}),
            serde_json::json!(["cost"]),
        ] {
            assert!(
                save(&path, &with(bad.clone(), serde_json::json!({}))).is_err(),
                "{bad}"
            );
        }
        // An undeclared value on a duration is refused too.
        let mut duration = good.clone();
        duration.measures = Some(serde_json::json!({"cost":{"type":"mpz"}}));
        duration.events[0].metadata.remove("measures");
        assert!(save(&path, &duration).unwrap_err().contains("Duration d"));
        fs::remove_file(path).unwrap();
    }
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };
    fn file(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "openchronology-{}-{}-{name}.sqlite",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    fn doc() -> Document {
        Document {
            format: "openchronology".into(),
            version: 1,
            title: "Exact moments".into(),
            description: "".into(),
            presentation: None,
            plugins: None,
            tags: None,
            assets: None,
            view: None,
            views: None,
            measures: None,
            events: vec![
                Event {
                    id: "first".into(),
                    time: "2/4".into(),
                    metadata: Map::new(),
                },
                Event {
                    id: "second".into(),
                    time: "1/2".into(),
                    metadata: Map::new(),
                },
                Event {
                    id: "third".into(),
                    time: "1/1".into(),
                    metadata: Map::new(),
                },
            ],
            durations: Vec::new(),
            relationships: Vec::new(),
        }
    }
    #[test]
    fn file_roundtrip_bounds_and_atomic_failure() {
        let path = file("roundtrip");
        let mut document = doc();
        save(&path, &document).unwrap();
        assert_eq!(&fs::read(&path).unwrap()[..16], b"SQLite format 3\0");
        let reopened = open(&path).unwrap();
        assert_eq!(reopened.events[0].time, "1/2");
        let groups = overview(&path, "1/2", "1", "0").unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].count, "2");
        document.events[0].time = "1/0".into();
        assert!(save(&path, &document).is_err());
        assert_eq!(open(&path).unwrap(), reopened);
        // An externally modified file must validate time before becoming the active desktop file.
        {
            let db = Connection::open(&path, true).unwrap();
            db.execute("PRAGMA ignore_check_constraints=ON", &[])
                .unwrap();
            db.execute("UPDATE events SET time='1/0' WHERE id='first'", &[])
                .unwrap();
        }
        assert!(open(&path).is_err());
        save(&path, &reopened).unwrap();
        assert_eq!(open(&path).unwrap(), reopened);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn streamed_saves_check_each_moment_and_match_whole_ones() {
        // The moments one at a time (och-convert, #202): the same file as a whole save.
        let (whole, streamed) = (file("whole"), file("streamed"));
        let mut document = doc();
        document.events[2].metadata.insert(
            "durations".into(),
            serde_json::json!([{"id": "span", "endId": "first", "metadata": {"title": "Span"}}]),
        );
        save(&whole, &document).unwrap();
        let settings = Document {
            events: Vec::new(),
            ..document.clone()
        };
        save_streamed(
            &streamed,
            &settings,
            document.events.clone().into_iter().map(Ok),
        )
        .unwrap();
        let read = open(&streamed).unwrap();
        assert_eq!(read, open(&whole).unwrap());
        assert_eq!(read.durations.len(), 1, "legacy links become a duration");
        // A problem in any moment, or with the entities, rolls the save back.
        let mut bad = document.events.clone();
        bad[1].id = "first".into();
        assert_eq!(
            save_streamed(&streamed, &settings, bad.into_iter().map(Ok)),
            Err("Event IDs must be unique ASCII identifiers".into())
        );
        let failing = document
            .events
            .clone()
            .into_iter()
            .map(Ok)
            .chain([Err("Bad moment".into())]);
        assert_eq!(
            save_streamed(&streamed, &settings, failing),
            Err("Bad moment".into())
        );
        let mut dangling = settings.clone();
        dangling.relationships.push(Relationship {
            a: serde_json::json!({"moment": "first"}),
            b: serde_json::json!({"moment": "missing"}),
        });
        assert!(save_streamed(
            &streamed,
            &dangling,
            document.events.clone().into_iter().map(Ok)
        )
        .is_err());
        assert_eq!(open(&streamed).unwrap(), read);
        // At most 200,000 moments.
        let many = (0..=MAX_EVENTS).map(|i| {
            Ok(Event {
                id: format!("m{i}"),
                time: format!("{i}/1"),
                metadata: Map::new(),
            })
        });
        assert_eq!(
            save_streamed(&streamed, &doc(), many),
            Err(TOO_LARGE.into())
        );
        assert_eq!(open(&streamed).unwrap(), read);
        fs::remove_file(whole).unwrap();
        fs::remove_file(streamed).unwrap();
    }
    #[test]
    fn legacy_json_checks_can_be_saved_without_trusting_the_schema() {
        let path = file("legacy_json_checks");
        let document = doc();
        save(&path, &document).unwrap();
        let canonical = open(&path).unwrap();
        {
            let db = Connection::open(&path, true).unwrap();
            // Construct a known legacy schema; production never enables trust.
            db.execute("PRAGMA trusted_schema=ON", &[]).unwrap();
            db.execute("ALTER TABLE events RENAME TO old_events", &[])
                .unwrap();
            db.execute("CREATE TABLE events(id TEXT PRIMARY KEY,time TEXT NOT NULL COLLATE RATIONAL_V1 CHECK(q_is_canonical(time)=1),metadata TEXT NOT NULL CHECK(json_valid(metadata))) STRICT", &[]).unwrap();
            db.execute("INSERT INTO events SELECT * FROM old_events", &[])
                .unwrap();
            db.execute("DROP TABLE old_events", &[]).unwrap();
        }
        assert_eq!(open(&path).unwrap(), canonical);
        save(&path, &document).unwrap();
        assert_eq!(open(&path).unwrap(), canonical);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn uploaded_database_tables_cannot_be_replaced_by_executable_views() {
        let path = file("malicious-view");
        save(&path, &doc()).unwrap();
        {
            let db = Connection::open(&path, true).unwrap();
            db.execute("DROP TABLE events", &[]).unwrap();
            db.execute(
                "CREATE VIEW events AS SELECT 'id' AS id,'1/1' AS time,'{}' AS metadata",
                &[],
            )
            .unwrap();
        }
        assert!(open(&path)
            .unwrap_err()
            .contains("Invalid timeline data tables"));
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn presentation_settings_roundtrip_and_legacy_files() {
        let path = file("presentation");
        let mut document = doc();
        document.presentation = Some(serde_json::json!({
            "version": 1, "mode": "custom", "significantDigits": 6, "unit": "minutes",
            "scale": "60/1", "origin": "0/1", "offsetMinutes": 0,
            "ruler": { "kind": "steps", "steps": ["1/1", "60/1", "3600/1", "86400/1"] },
            "source": "function print(time, api) { return api.exact(time); } function parse(text, api) { return api.rational(text); }"
        }));
        save(&path, &document).unwrap();
        let reopened = open(&path).unwrap();
        assert_eq!(reopened.presentation, document.presentation);
        assert_eq!(reopened.events[0].time, "1/2");
        let mut invalid = document.clone();
        invalid.presentation = None;
        invalid.events[0].time = "1/0".into();
        assert!(save(&path, &invalid).is_err());
        assert_eq!(open(&path).unwrap(), reopened);
        document.presentation = None;
        save(&path, &document).unwrap();
        assert_eq!(open(&path).unwrap().presentation, None);
        // Simulate a pre-settings version-1 file, opened without writing or migrating it.
        {
            let db = Connection::open(&path, true).unwrap();
            db.execute("DROP TABLE timeline_settings", &[]).unwrap();
        }
        let legacy = open(&path).unwrap();
        assert_eq!(legacy.presentation, None);
        assert_eq!(legacy.events.len(), document.events.len());
        save(&path, &reopened).unwrap();
        assert_eq!(open(&path).unwrap(), reopened);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn tags_assets_and_custom_code_roundtrip() {
        let path = file("extras");
        let mut document = doc();
        document.tags = Some(vec!["science".into(), "custom".into()]);
        document.assets = Some(
            serde_json::json!({"https://images.example/a.png":"data:image/png;base64,aGVsbG8="}),
        );
        document.plugins = Some(
            serde_json::json!([{"manifest":{"apiVersion":1,"id":"status","version":1,"name":"Status","description":"Custom","fields":[],"source":"function render(m,api) { return api.shape(\"diamond\"); }"},"enabled":true}]),
        );
        // The default view (#416) is kept as the editor sent it.
        document.view = Some(serde_json::json!({"separation":{"tags":["science"]}}));
        document.views = Some(
            serde_json::json!([{"id":"v1","title":"Science","separation":{"tags":["science"]}}]),
        );
        // Measures (#572) are kept as the editor sent them.
        document.measures = Some(serde_json::json!({"cost":{"type":"mpz","label":"Cost"}}));
        save(&path, &document).unwrap();
        let reopened = open(&path).unwrap();
        assert_eq!(reopened.tags, document.tags);
        assert_eq!(reopened.assets, document.assets);
        assert_eq!(reopened.plugins, document.plugins);
        assert_eq!(reopened.view, document.view);
        assert_eq!(reopened.views, document.views);
        assert_eq!(reopened.measures, document.measures);
        {
            let db = Connection::open(&path, true).unwrap();
            db.execute("DROP TABLE timeline_extras", &[]).unwrap();
        }
        let legacy = open(&path).unwrap();
        assert_eq!(legacy.tags, None);
        assert_eq!(legacy.assets, None);
        assert_eq!(legacy.view, None);
        assert_eq!(legacy.measures, None);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn plugin_settings_roundtrip_and_legacy_files() {
        let path = file("plugins");
        let mut document = doc();
        document.plugins = Some(serde_json::json!([{
            "manifest": { "apiVersion": 1, "id": "moment-icons", "version": 1,
                "name": "Moment icons", "description": "Images", "fields": [{"kind": "image-url", "metadataKey": "iconUrl", "label": "Icon"}],
                "marker": {"kind": "image", "metadataKey": "iconUrl"}}, "enabled": true
        }]));
        document.events[0].metadata.insert(
            "iconUrl".into(),
            Value::String("https://images.example/icon.png".into()),
        );
        save(&path, &document).unwrap();
        let reopened = open(&path).unwrap();
        assert_eq!(reopened.plugins, document.plugins);
        assert_eq!(
            reopened.events[0].metadata.get("iconUrl"),
            document.events[0].metadata.get("iconUrl")
        );
        let mut bad = document.clone();
        bad.plugins = Some(serde_json::json!({"script":"no"}));
        assert!(save(&path, &bad).is_err());
        assert_eq!(open(&path).unwrap(), reopened);
        document.plugins = None;
        save(&path, &document).unwrap();
        assert_eq!(open(&path).unwrap().plugins, None);
        {
            let db = Connection::open(&path, true).unwrap();
            db.execute("DROP TABLE timeline_plugins", &[]).unwrap();
        }
        assert_eq!(open(&path).unwrap().plugins, None);
        save(&path, &reopened).unwrap();
        assert_eq!(open(&path).unwrap(), reopened);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn huge_components_remain_exact() {
        let path = file("huge");
        let mut document = doc();
        document.events[0].time = format!(
            "{}/{}",
            "9".repeat(5000),
            "1".to_owned() + &"0".repeat(5000)
        );
        save(&path, &document).unwrap();
        assert_eq!(
            open(&path)
                .unwrap()
                .events
                .iter()
                .find(|e| e.id == "first")
                .unwrap()
                .time,
            document.events[0].time
        );
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn cached_overview_survives_reopening_and_refines_at_strict_boundaries() {
        let path = file("dense");
        let mut document = doc();
        document.events = (0..5000).map(|i| Event {
            id: format!("dense-{i:05}"), time: format!("{i}/1000000000"),
            metadata: serde_json::from_value(serde_json::json!({"title": format!("Point {i}"), "custom": {"items": [true, "a", null]}})).unwrap()
        }).collect();
        save(&path, &document).unwrap();
        let groups = overview(&path, "0", "1", "1").unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].count, "5000");
        assert!(groups[0].visited_nodes < 50); // Bounded seeks plus cached subtree folding.
        let details = overview(&path, "0", "3/1000000000", "1/1000000000").unwrap();
        assert_eq!(details.len(), 4); // Exact threshold equality does not merge points.
        assert!(details.iter().all(|group| group.count == "1"));
        assert_eq!(
            open(&path).unwrap().events[100].metadata,
            document.events[100].metadata
        );
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn unrelated_files_are_preserved() {
        let path = file("foreign");
        fs::write(&path, b"{\"format\":\"openchronology\"}").unwrap();
        assert!(open(&path).is_err());
        assert!(save(&path, &doc()).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{\"format\":\"openchronology\"}");
        fs::remove_file(path).unwrap();
    }
}

/// Rebuild the interval index entirely in SQLite; anchored endpoints resolve to moment times.
///
/// Used by `save` and when the desktop app opens a file with an older index layout. Migrates
/// legacy durations first, then recreates `duration_intervals` from `durations` and builds a
/// balanced `duration_nodes` tree over it. Must run inside the caller's transaction (or on a
/// private copy). Errors when an anchor names a missing moment or there are over 200000
/// durations.
fn rebuild_duration_index(db: &Connection) -> Result<(), String> {
    migrate_durations(db)?;
    create_duration_table(db)?;
    db.execute("DROP TABLE IF EXISTS duration_nodes", &[])?;
    db.execute("DROP TABLE IF EXISTS duration_intervals", &[])?;
    // One row per duration with its endpoints resolved to times:
    // - ord: the ID of its node in duration_nodes. A rebuild numbers rows densely in
    //   (first, id) order; later sparse saves assign fresh IDs (intervals.rs), so after edits
    //   ords are neither dense nor in order.
    // - id: the duration's ID; start_json/end_json: its endpoints as the document has them
    //   (a time string, or {"moment": id}), returned to the editor unchanged.
    // - start_time/end_time: the resolved endpoint times; first/last: the earlier and later of
    //   the two (an end may precede its start); extent: last - first, its length.
    // - metadata: the duration's metadata JSON.
    db.execute("CREATE TABLE duration_intervals(ord INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,start_json TEXT NOT NULL,end_json TEXT NOT NULL,start_time TEXT NOT NULL COLLATE RATIONAL_V1,end_time TEXT NOT NULL COLLATE RATIONAL_V1,first TEXT NOT NULL COLLATE RATIONAL_V1,last TEXT NOT NULL COLLATE RATIONAL_V1,metadata TEXT NOT NULL,extent TEXT COLLATE RATIONAL_V1)", &[])?;
    // Every anchor must name a stored moment (primary-key probes into events).
    if db.scalar("SELECT count(*) FROM durations d WHERE (d.start_moment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events e WHERE e.id=d.start_moment)) OR (d.end_moment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events e WHERE e.id=d.end_moment))", &[])? != "0" {
        return Err("Duration anchors must name existing moments".into());
    }
    // r: each duration with its endpoint JSON (json_quote makes a fixed time a JSON string)
    // and its resolved times s and e (an anchored endpoint takes its moment's time). The
    // window function numbers the rows by (earlier endpoint, id) to give each its ord.
    db.execute("WITH r AS (SELECT d.id,CASE WHEN d.start_moment IS NULL THEN json_quote(d.start_time) ELSE json_object('moment',d.start_moment) END AS sj,CASE WHEN d.end_moment IS NOT NULL THEN json_object('moment',d.end_moment) WHEN d.end_time IS NOT NULL THEN json_quote(d.end_time) ELSE json('{\"ongoing\":true}') END AS ej,COALESCE(d.start_time,(SELECT e.time FROM events e WHERE e.id=d.start_moment)) AS s,COALESCE(d.end_time,(SELECT e.time FROM events e WHERE e.id=d.end_moment),CASE WHEN d.end_moment IS NULL THEN COALESCE(d.start_time,(SELECT e.time FROM events e WHERE e.id=d.start_moment)) END) AS e,d.metadata FROM durations d) INSERT INTO duration_intervals(ord,id,start_json,end_json,start_time,end_time,first,last,metadata) SELECT row_number() OVER (ORDER BY q_min(s,e) COLLATE RATIONAL_V1,id),id,sj,ej,s,e,q_min(s,e),q_max(s,e),metadata FROM r", &[])?;
    // Each duration's exact length, compared with the zoom threshold to decide whether it is
    // drawn as a band or summarized.
    db.execute(
        "UPDATE duration_intervals SET extent=q_sub(last,first)",
        &[],
    )?;
    if db
        .scalar("SELECT count(*) FROM duration_intervals", &[])?
        .parse::<usize>()
        .map_err(|e| e.to_string())?
        > 200000
    {
        return Err("Use at most 200000 durations per timeline".into());
    }
    create_start_index(db)?;
    build_interval_nodes(db, "duration_intervals", "duration_nodes")
}
/// Summaries range-scan durations by start (see duration_summaries).
///
/// `duration_intervals_first` orders intervals by their earlier endpoint, so the summary
/// query's "first collapsed start at or after X" probes and its per-group range joins are
/// index seeks rather than scans. Created if missing, including on files saved before it.
pub(crate) fn create_start_index(db: &Connection) -> Result<(), String> {
    db.execute(
        "CREATE INDEX IF NOT EXISTS duration_intervals_first ON duration_intervals(first COLLATE RATIONAL_V1)",
        &[],
    )?;
    // The ongoing durations (#537), which the tree holds as points at their starts and every
    // window query reads to resolve at the current time.
    db.execute(
        "CREATE INDEX IF NOT EXISTS duration_intervals_ongoing ON duration_intervals(first COLLATE RATIONAL_V1,id) WHERE end_json='{\"ongoing\":true}'",
        &[],
    )
}
/// Balanced augmented nodes over an intervals table ordered by `ord`, with AVL heights. Subtree summaries
/// (largest start, count, extent bounds) let short intervals collapse without enumerating
/// dense clusters; see duration_summaries.
///
/// Table names are `'static` constants, never input, so splicing them into SQL is safe.
fn build_interval_nodes(
    db: &Connection,
    intervals: &'static str,
    nodes: &'static str,
) -> Result<(), String> {
    db.execute(&format!("DROP TABLE IF EXISTS {nodes}"), &[])?;
    // One row per tree node, with the same ID as its interval's ord. Each holds summaries of
    // its whole subtree: min_time (earliest start), max_time (latest end), max_first (latest
    // start), cnt (intervals), min_extent/max_extent (shortest and longest), and its AVL
    // height. Window and summary queries prune whole subtrees with them.
    let sql = "CREATE TABLE duration_nodes(id INTEGER PRIMARY KEY,left_id INTEGER,right_id INTEGER,min_time TEXT NOT NULL COLLATE RATIONAL_V1,max_time TEXT NOT NULL COLLATE RATIONAL_V1,max_first TEXT NOT NULL COLLATE RATIONAL_V1,cnt INTEGER NOT NULL,min_extent TEXT NOT NULL COLLATE RATIONAL_V1,max_extent TEXT NOT NULL COLLATE RATIONAL_V1,height INTEGER NOT NULL)";
    db.execute(&sql.replace("duration_nodes", nodes), &[])?;
    // Builds the balanced tree in one statement. ranges(lo, hi, mid) recursively splits the
    // ord range [1, n] at its midpoint: mid becomes the node for that subrange, and its children
    // are the midpoints of [lo, mid-1] and [mid+1, hi]. A node's summaries come from its
    // subrange: min_time is the first of ord lo and max_first the first of ord hi (ords are in
    // start order), while max_time and the extent bounds are scanned over the subrange (an
    // ord range on the primary key), O(n log n) in all. HEIGHT is replaced with the subrange's
    // bit length, the height of a perfectly balanced subtree. The HAVING clause yields no row,
    // and so no tree, for an empty table.
    let sql = "WITH RECURSIVE ranges(lo,hi,mid) AS (SELECT 1,count(*),CAST((1+count(*))/2 AS INTEGER) FROM duration_intervals HAVING count(*)>0 UNION ALL SELECT r.lo,r.mid-1,CAST((r.lo+r.mid-1)/2 AS INTEGER) FROM ranges r WHERE r.lo<r.mid UNION ALL SELECT r.mid+1,r.hi,CAST((r.mid+1+r.hi)/2 AS INTEGER) FROM ranges r WHERE r.mid<r.hi) INSERT INTO duration_nodes SELECT mid,CASE WHEN lo<mid THEN CAST((lo+mid-1)/2 AS INTEGER) END,CASE WHEN mid<hi THEN CAST((mid+1+hi)/2 AS INTEGER) END,(SELECT first FROM duration_intervals WHERE ord=lo),(SELECT last FROM duration_intervals WHERE ord BETWEEN lo AND hi ORDER BY last COLLATE RATIONAL_V1 DESC LIMIT 1),(SELECT first FROM duration_intervals WHERE ord=hi),hi-lo+1,(SELECT extent FROM duration_intervals WHERE ord BETWEEN lo AND hi ORDER BY extent COLLATE RATIONAL_V1 LIMIT 1),(SELECT extent FROM duration_intervals WHERE ord BETWEEN lo AND hi ORDER BY extent COLLATE RATIONAL_V1 DESC LIMIT 1),HEIGHT FROM ranges";
    db.execute(
        &sql.replace("HEIGHT", &intervals::balanced_height("(hi-lo+1)"))
            .replace("duration_nodes", nodes)
            .replace("duration_intervals", intervals),
        &[],
    )?;
    // A balanced build is also a valid AVL tree; saves continue from it (see intervals.rs).
    let count = db.scalar(&format!("SELECT count(*) FROM {intervals}"), &[])?;
    let count = count.parse::<i64>().map_err(|e| e.to_string())?;
    intervals::set_root(db, nodes, (count > 0).then_some((1 + count) / 2))
}
/// Creates the `relationships` table if missing: one row per undirected link between two
/// entities (kind 'moment' or 'duration', and ID), stored once in canonical order (see
/// `relate`). The primary key on (a_kind, a_id, b_kind, b_id) serves lookups by the first
/// endpoint and makes repeated links no-ops; the CHECK forbids linking an entity to itself.
/// `relationships_b` serves lookups by the second endpoint, so finding every link of an
/// entity is two index seeks.
pub(crate) fn create_relationship_table(db: &Connection) -> Result<(), String> {
    db.execute("CREATE TABLE IF NOT EXISTS relationships(a_kind TEXT NOT NULL CHECK(a_kind IN ('moment','duration')),a_id TEXT NOT NULL,b_kind TEXT NOT NULL CHECK(b_kind IN ('moment','duration')),b_id TEXT NOT NULL,PRIMARY KEY(a_kind,a_id,b_kind,b_id),CHECK(a_kind<>b_kind OR a_id<>b_id)) STRICT", &[])?;
    db.execute(
        "CREATE INDEX IF NOT EXISTS relationships_b ON relationships(b_kind,b_id)",
        &[],
    )
}
/// Adds or removes a link, stored once in canonical order ("m:" < "d:" style key order).
pub(crate) fn relate(db: &Connection, r: &Relationship, related: bool) -> Result<(), String> {
    let (mut a, mut b) = (entity_ref(&r.a)?, entity_ref(&r.b)?);
    if a == b {
        return Err("An entity cannot be related to itself".into());
    }
    let key = |(k, i): (&str, &str)| format!("{}:{}", if k == "moment" { "m" } else { "d" }, i);
    if key(a) > key(b) {
        std::mem::swap(&mut a, &mut b);
    }
    // INSERT OR IGNORE: linking an already linked pair changes nothing.
    if related {
        db.execute(
            "INSERT OR IGNORE INTO relationships VALUES(?,?,?,?)",
            &[a.0, a.1, b.0, b.1],
        )
    } else {
        db.execute(
            "DELETE FROM relationships WHERE a_kind=? AND a_id=? AND b_kind=? AND b_id=?",
            &[a.0, a.1, b.0, b.1],
        )
    }
}
/// Relationship arcs as fixed intervals between endpoint times (a duration's start), in the
/// same augmented tree as duration bands. Requires the duration index.
///
/// Recreates `edge_intervals` (same columns as `duration_intervals`; `id` is the arc key
/// "m:a~d:x", the endpoint JSON is `null` and metadata `{}`) and builds `edge_nodes` over it.
pub(crate) fn rebuild_edge_index(db: &Connection) -> Result<(), String> {
    create_relationship_table(db)?;
    // Deleting an entity removes its links: drop every link with an endpoint that no longer
    // exists (NOT IN subqueries over the events and durations primary keys).
    db.execute("DELETE FROM relationships WHERE (a_kind='moment' AND a_id NOT IN (SELECT id FROM events)) OR (b_kind='moment' AND b_id NOT IN (SELECT id FROM events)) OR (a_kind='duration' AND a_id NOT IN (SELECT id FROM durations)) OR (b_kind='duration' AND b_id NOT IN (SELECT id FROM durations))", &[])?;
    db.execute("DROP TABLE IF EXISTS edge_intervals", &[])?;
    db.execute("CREATE TABLE edge_intervals(ord INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,start_json TEXT NOT NULL,end_json TEXT NOT NULL,start_time TEXT NOT NULL COLLATE RATIONAL_V1,end_time TEXT NOT NULL COLLATE RATIONAL_V1,first TEXT NOT NULL COLLATE RATIONAL_V1,last TEXT NOT NULL COLLATE RATIONAL_V1,metadata TEXT NOT NULL,extent TEXT COLLATE RATIONAL_V1)", &[])?;
    // places: where each entity sits on the time axis (a moment's time, a duration's start).
    // r: each link joined to both endpoints' places, keyed "m:<id>~d:<id>" in stored order.
    // Rows are numbered by (earlier time, key) for ord, as for durations.
    db.execute("WITH places(kind,id,time) AS (SELECT 'moment',id,time FROM events UNION ALL SELECT 'duration',id,start_time FROM duration_intervals), r AS (SELECT CASE r.a_kind WHEN 'moment' THEN 'm:' ELSE 'd:' END||r.a_id||'~'||CASE r.b_kind WHEN 'moment' THEN 'm:' ELSE 'd:' END||r.b_id AS id,pa.time AS s,pb.time AS e FROM relationships r JOIN places pa ON pa.kind=r.a_kind AND pa.id=r.a_id JOIN places pb ON pb.kind=r.b_kind AND pb.id=r.b_id) INSERT INTO edge_intervals(ord,id,start_json,end_json,start_time,end_time,first,last,metadata,extent) SELECT row_number() OVER (ORDER BY q_min(s,e) COLLATE RATIONAL_V1,id),id,'null','null',s,e,q_min(s,e),q_max(s,e),'{}',q_sub(q_max(s,e),q_min(s,e)) FROM r", &[])?;
    build_interval_nodes(db, "edge_intervals", "edge_nodes")
}
/// Arcs touching [lower, upper] that are at least as long as the threshold.
///
/// Returns `{"edges": [...], "edgesTruncated": bool}` with at most 256 arcs, each with its key,
/// both endpoints as entity references, its time span and each endpoint's time. Files without
/// an arc index (it is created by every save and on open) yield no arcs.
pub(crate) fn edge_window(
    db: &Connection,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Value, String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='edge_nodes' AND type='table'",
        &[],
    )? == "0"
    {
        return Ok(serde_json::json!({"edges":[],"edgesTruncated":false}));
    }
    let rows = interval_window(db, "edge_intervals", "edge_nodes", lower, upper, threshold)?;
    let more = rows.len() > 256;
    let mut edges = Vec::new();
    for row in rows.into_iter().take(256) {
        let id = row[0].clone().unwrap_or_default();
        let (a, b) = id.split_once('~').ok_or("Invalid arc identifier")?;
        let side = |key: &str| {
            let (k, i) = key.split_at(2);
            serde_json::json!({ if k == "m:" { "moment" } else { "duration" }: i })
        };
        edges.push(serde_json::json!({"id":id,"a":side(a),"b":side(b),"first":row[3],"last":row[4],"aTime":row[6],"bTime":row[7]}));
    }
    Ok(serde_json::json!({"edges":edges,"edgesTruncated":more}))
}
/// The columns of one duration band, selected from an intervals table aliased `d`: ID,
/// endpoint JSON, first and last time, a bounded metadata projection, and resolved endpoint
/// times. The projection keeps the title (cut to 512 characters), the notes (cut to 2000),
/// other text fields of at most 256 characters, web addresses (http or https) of at most 1024
/// such as background images (#365), toggles that are on (`true`, such as a presumptive
/// duration, #325), and arrays of at most 1024 characters as JSON (such as
/// relationship arrows, #326), so a band never carries large metadata to the webview.
/// `band_json` turns a row into JSON.
pub(crate) const BAND_COLUMNS: &str = "d.id,d.start_json,d.end_json,d.first,d.last,(SELECT json_group_object(key,CASE WHEN type='true' THEN json('true') WHEN type IN ('array','object') THEN json(value) WHEN key='title' THEN substr(value,1,512) WHEN key='description' THEN substr(value,1,2000) ELSE value END) FROM json_each(d.metadata) WHERE type='true' OR (type='text' AND (key IN ('title','description') OR length(value)<=256 OR (length(value)<=1024 AND (value LIKE 'http://%' OR value LIKE 'https://%')))) OR (type='array' AND key NOT IN ('tags','content_labels') AND length(value)<=1024) OR (type='object' AND key='measures')),d.start_time,d.end_time";
/// One duration band as JSON from a row of `BAND_COLUMNS`, in the shape the editor draws:
/// `{id, start, end, first, last, metadata, startTime, endTime}`.
fn band_json(row: &[Option<String>]) -> Result<Value, String> {
    let parse = |text: &Option<String>| -> Result<Value, String> {
        serde_json::from_str(text.as_deref().unwrap_or("null")).map_err(|e| e.to_string())
    };
    Ok(
        serde_json::json!({"id":row[0],"start":parse(&row[1])?,"end":parse(&row[2])?,"first":row[3],"last":row[4],"metadata":parse(&Some(row[5].clone().unwrap_or_else(|| "{}".into())))?,"startTime":row[6],"endTime":row[7]}),
    )
}
/// Viewport bands: durations at least as long as the threshold (shorter ones are summarized),
/// with a bounded projection of title, a notes preview, and short text fields. A dense window
/// keeps its 256 longest (#316), as src/durations.ts durationWindow and the PostgreSQL store
/// do: the walk's matches (here in start order; PostgreSQL's walk goes a level at a time) up
/// to one past DURATION_COUNT_CAP (which counts them), ranked longest first, then by start and
/// ID, returned in start order.
fn duration_window(
    db: &Connection,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Value, String> {
    let walk = format!(
        "{} SELECT node FROM walk WHERE kind=1 AND hit LIMIT {}",
        interval_walk("duration_intervals", "duration_nodes"),
        DURATION_COUNT_CAP + 1
    );
    let found: Vec<String> = db
        .query(&walk, &[upper, lower, threshold])?
        .into_iter()
        .filter_map(|r| r[0].clone())
        .collect();
    let total = found.len();
    let mut bands = Vec::new();
    if total > 0 {
        let ords = serde_json::to_string(&found).map_err(|e| e.to_string())?;
        let rows = db.query_limited(
            &format!("SELECT * FROM (SELECT {BAND_COLUMNS} FROM json_each(?1) f JOIN duration_intervals d ON d.ord=CAST(f.value AS INTEGER) ORDER BY d.extent COLLATE RATIONAL_V1 DESC,d.first COLLATE RATIONAL_V1,d.id LIMIT 256) ORDER BY 4 COLLATE RATIONAL_V1,1"),
            &[&ords],
            256,
            8 * 1024 * 1024,
        )?;
        for row in rows {
            bands.push(band_json(&row)?);
        }
    }
    let mut result = serde_json::json!({"durations":bands,"durationsTruncated":total > 256});
    // How many touch the window, when some were left out.
    if total > 256 {
        result["durationsTotal"] = serde_json::json!(total.min(DURATION_COUNT_CAP));
        if total > DURATION_COUNT_CAP {
            result["durationsTotalMore"] = serde_json::json!(true);
        }
    }
    Ok(result)
}
/// How far a window's durations are counted past the bands sent (src/durations.ts
/// DURATION_COUNT_CAP): a count at the cap reads as "10,000+".
pub(crate) const DURATION_COUNT_CAP: usize = 10000;
/// Rows of an interval tree touching [lower, upper] and at least as long as the threshold, in
/// start order (then ID, as the browser lists them), at most 257 (callers report truncation
/// past 256).
///
/// The tree is walked in order with SQLite's ordered recursion queue: a subtree is queued at
/// its earliest start and expanded into its children and its own node, and nodes come out
/// in (start, ID) order. Subtrees that cannot hold a match are never queued, and the walk
/// stops at the 257th match, so the cost follows the rows returned, not every match.
pub(crate) fn interval_window(
    db: &Connection,
    intervals: &str,
    nodes: &str,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Vec<Vec<Option<String>>>, String> {
    let walk = format!(
        "{} SELECT node FROM walk WHERE kind=1 AND hit LIMIT 257",
        interval_walk(intervals, nodes)
    );
    let found: Vec<String> = db
        .query(&walk, &[upper, lower, threshold])?
        .into_iter()
        .filter_map(|r| r[0].clone())
        .collect();
    if found.is_empty() {
        return Ok(Vec::new());
    }
    // Fetch the bands for the found ords, passed as one JSON array and expanded with
    // json_each; ordering by the array index (f.key) keeps the walk's order.
    let ords = serde_json::to_string(&found).map_err(|e| e.to_string())?;
    db.query_limited(
        &format!("SELECT {BAND_COLUMNS} FROM json_each(?1) f JOIN {intervals} d ON d.ord=CAST(f.value AS INTEGER) ORDER BY f.key"),
        &[&ords],
        257,
        8 * 1024 * 1024,
    )
}
/// The recursive walk interval_window and interval_count follow with their SELECT: a CTE
/// `walk(kind, node, start, id, hit)` over tree `nodes` of table `intervals`, with upper
/// (?1), lower (?2) and the threshold (?3) as parameters.
fn interval_walk(intervals: &str, nodes: &str) -> String {
    // Whether a subtree may hold a match: its earliest start is at or before upper (?1), its
    // latest end at or after lower (?2), and, unless the threshold (?3) is zero, its longest
    // interval reaches the threshold.
    let fits = |n: &str| {
        format!("{n}.min_time<=q(?1) COLLATE RATIONAL_V1 AND {n}.max_time>=q(?2) COLLATE RATIONAL_V1 AND (q_cmp(q(?3),q('0'))=0 OR q_cmp({n}.max_extent,q(?3))>=0)")
    };
    // kind 0: a subtree keyed by its earliest start; kind 1: one node keyed by (start, ID).
    // The anchor row is the root (from interval_roots) if it fits. Each subtree row yields
    // its children that fit, as subtree rows, and its own interval as a node row, with `hit`
    // telling whether that interval itself matches (the same test as `fits`, on one
    // interval). The ORDER BY makes the queue a priority queue on (start, kind, ID): at equal
    // starts subtrees come out before nodes, so a subtree is expanded before any node that
    // might sort after its contents. Only hits are returned.
    format!("WITH RECURSIVE walk(kind,node,start,id,hit) AS (\
        SELECT 0,n.id,n.min_time,'',0 FROM {nodes} n WHERE n.id=(SELECT root FROM interval_roots WHERE name='{nodes}') AND {} \
        UNION ALL SELECT 0,c.id,c.min_time,'',0 FROM walk w JOIN {nodes} p ON p.id=w.node JOIN {nodes} c ON c.id IN (p.left_id,p.right_id) WHERE w.kind=0 AND {} \
        UNION ALL SELECT 1,d.ord,d.first,d.id,d.first<=q(?1) COLLATE RATIONAL_V1 AND d.last>=q(?2) COLLATE RATIONAL_V1 AND (q_cmp(q(?3),q('0'))=0 OR q_cmp(d.extent,q(?3))>=0) \
          FROM walk w JOIN {intervals} d ON d.ord=w.node WHERE w.kind=0 \
        ORDER BY 3 COLLATE RATIONAL_V1,1,4)",
        fits("n"),
        fits("c")
    )
}
/// The previous single recursive query, kept as a reference for interval_window.
#[cfg(test)]
pub(crate) fn interval_window_query(
    db: &Connection,
    intervals: &str,
    nodes: &str,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Vec<Vec<Option<String>>>, String> {
    let sql = format!("WITH RECURSIVE visible AS (SELECT n.* FROM {nodes} n WHERE id=(SELECT root FROM interval_roots WHERE name='{nodes}') AND min_time<=q(?1) COLLATE RATIONAL_V1 AND max_time>=q(?2) COLLATE RATIONAL_V1 UNION ALL SELECT n.* FROM visible p JOIN {nodes} n ON n.id IN(p.left_id,p.right_id) WHERE n.min_time<=q(?1) COLLATE RATIONAL_V1 AND n.max_time>=q(?2) COLLATE RATIONAL_V1 AND (q_cmp(q(?3),q('0'))=0 OR q_cmp(n.max_extent,q(?3))>=0)) SELECT {BAND_COLUMNS} FROM visible v JOIN {intervals} d ON d.ord=v.id WHERE d.first<=q(?1) COLLATE RATIONAL_V1 AND d.last>=q(?2) COLLATE RATIONAL_V1 AND (q_cmp(q(?3),q('0'))=0 OR q_cmp(d.extent,q(?3))>=0) LIMIT 257");
    db.query_limited(&sql, &[upper, lower, threshold], 257, 8 * 1024 * 1024)
}
/// The durations touching [lower, upper] and at least `threshold` long, as the bands drawn
/// there (#316): `limit` from `offset`, optionally only those whose title contains `text`
/// (ignoring ASCII case), longest first ("extent"), by start ("start") or by title
/// ("title"), with how many match counted up to DURATION_COUNT_CAP: `{durations, next,
/// total, totalMore?}`, `next` being the next page's offset.
#[allow(clippy::too_many_arguments)]
pub(crate) fn duration_list(
    db: &Connection,
    lower: &str,
    upper: &str,
    threshold: &str,
    text: &str,
    sort: &str,
    offset: usize,
    limit: usize,
    now: Option<&str>,
) -> Result<Value, String> {
    let intervals = resolved_intervals("?7");
    let now = now.unwrap_or("");
    let order = match sort {
        "start" => "d.first COLLATE RATIONAL_V1,d.id",
        "title" => "lower(coalesce(json_extract(d.metadata,'$.title'),'')),d.first COLLATE RATIONAL_V1,d.id",
        _ => "d.extent COLLATE RATIONAL_V1 DESC,d.first COLLATE RATIONAL_V1,d.id",
    };
    // Touching the window (?1 lower, ?2 upper), reaching the threshold (?3) unless it is zero,
    // and, given text (?4), with a title containing it.
    let filter = "d.first<=q(?2) COLLATE RATIONAL_V1 AND d.last>=q(?1) COLLATE RATIONAL_V1 \
        AND (q_cmp(q(?3),q('0'))=0 OR q_cmp(d.extent,q(?3))>=0) \
        AND (?4='' OR instr(lower(coalesce(json_extract(d.metadata,'$.title'),'')),lower(?4))>0)";
    let take = (limit + 1).to_string();
    let skip = offset.to_string();
    let rows = db.query_limited(
        &format!("SELECT {BAND_COLUMNS} FROM {intervals} d WHERE {filter} ORDER BY {order} LIMIT CAST(?5 AS INTEGER) OFFSET CAST(?6 AS INTEGER)"),
        &[lower, upper, threshold, text, &take, &skip, now],
        limit + 1,
        8 * 1024 * 1024,
    )?;
    let total: usize = db
        .scalar(
            &format!(
                "SELECT count(*) FROM (SELECT 1 FROM {intervals} d WHERE {filter} LIMIT {})",
                DURATION_COUNT_CAP + 1
            ),
            &[lower, upper, threshold, text, "", "", now],
        )?
        .parse()
        .map_err(|e: std::num::ParseIntError| e.to_string())?;
    let more = rows.len() > limit;
    let mut durations = Vec::new();
    for row in rows.into_iter().take(limit) {
        durations.push(band_json(&row)?);
    }
    let mut result = serde_json::json!({
        "durations": durations,
        "next": if more { Some(offset + limit) } else { None },
        "total": total.min(DURATION_COUNT_CAP),
    });
    if total > DURATION_COUNT_CAP {
        result["totalMore"] = serde_json::json!(true);
    }
    Ok(result)
}
/// Durations wholly inside [lower, upper], in start order after an exact (start, ID) cursor.
pub(crate) fn duration_page(
    db: &Connection,
    lower: &str,
    upper: &str,
    after: Option<(&str, &str)>,
    limit: usize,
    now: Option<&str>,
) -> Result<Value, String> {
    let intervals = resolved_intervals("?6");
    let take = (limit + 1).to_string();
    let (after_first, after_id) = after.unwrap_or(("", ""));
    // Keyset pagination: durations starting at or after lower (?1) and ending at or before
    // upper (?2), strictly after the cursor (?3, ?4) in (first, id) order; an empty cursor
    // starts at the beginning. The range on `first` can use duration_intervals_first. One row
    // past the limit tells whether there is a next page.
    let sql = format!("SELECT {BAND_COLUMNS} FROM {intervals} d WHERE d.first>=q(?1) COLLATE RATIONAL_V1 AND d.last<=q(?2) COLLATE RATIONAL_V1 AND (?3='' OR q_cmp(d.first,q(?3))>0 OR (q_cmp(d.first,q(?3))=0 AND d.id>?4)) ORDER BY d.first COLLATE RATIONAL_V1,d.id LIMIT CAST(?5 AS INTEGER)");
    let rows = db.query_limited(
        &sql,
        &[
            lower,
            upper,
            after_first,
            after_id,
            &take,
            now.unwrap_or(""),
        ],
        limit + 1,
        8 * 1024 * 1024,
    )?;
    let more = rows.len() > limit;
    let mut durations = Vec::new();
    for row in rows.into_iter().take(limit) {
        durations.push(band_json(&row)?);
    }
    let next = if more {
        durations
            .last()
            .map(|b| serde_json::json!({"first":b["first"],"id":b["id"]}))
    } else {
        None
    };
    Ok(serde_json::json!({"durations":durations,"next":next}))
}
/// `duration_intervals` with its ongoing durations (#537), which it holds as points at their
/// starts, ending at the time in parameter `now` instead (never before their starts), when
/// that parameter is not empty: what a list or page of durations reads, so its filters, order
/// and offsets see them as they are drawn. SQLite flattens it into the query, which keeps the
/// table's indexes.
fn resolved_intervals(now: &str) -> String {
    let ongoing = format!("d.end_json='{ONGOING_JSON}' AND {now}<>''");
    format!("(SELECT d.ord,d.id,d.start_json,d.end_json,d.start_time,d.first,d.metadata,CASE WHEN {ongoing} THEN q_max(d.first,q({now})) ELSE d.end_time END AS end_time,CASE WHEN {ongoing} THEN q_max(d.first,q({now})) ELSE d.last END AS last,CASE WHEN {ongoing} THEN q_sub(q_max(d.first,q({now})),d.first) ELSE d.extent END AS extent FROM duration_intervals d)")
}
/// The ongoing durations (#537) as bands ending at `now` (never before their starts), in
/// start order, at most DURATION_COUNT_CAP: read through `duration_intervals_ongoing`.
pub(crate) fn ongoing_bands(db: &Connection, now: &str) -> Result<Vec<Value>, String> {
    let intervals = resolved_intervals("?1");
    db.query_limited(
        &format!("SELECT {BAND_COLUMNS} FROM {intervals} d WHERE d.end_json='{ONGOING_JSON}' ORDER BY d.first COLLATE RATIONAL_V1,d.id LIMIT {DURATION_COUNT_CAP}"),
        &[now],
        DURATION_COUNT_CAP,
        8 * 1024 * 1024,
    )?
    .iter()
    .map(|row| band_json(row))
    .collect()
}
/// Exact rational helpers evaluated by the sqlite-rational extension.
///
/// `sign` runs a query returning one `q_cmp` result (-1, 0 or 1) and parses it.
fn sign(db: &Connection, sql: &str, parameters: &[&str]) -> Result<i32, String> {
    db.scalar(sql, parameters)?
        .parse::<i32>()
        .map_err(|e| e.to_string())
}
/// (a - b) compared with t.
fn diff_cmp(db: &Connection, a: &str, b: &str, t: &str) -> Result<i32, String> {
    sign(db, "SELECT q_cmp(q_sub(q(?1),q(?2)),q(?3))", &[a, b, t])
}
/// The later of two exact times (`b` when they are equal).
fn later(db: &Connection, a: &str, b: &str) -> Result<String, String> {
    Ok(if sign(db, "SELECT q_cmp(q(?1),q(?2))", &[a, b])? > 0 {
        a
    } else {
        b
    }
    .to_string())
}
/// The group being gathered by `duration_summaries_walk`: its anchor (first start), latest
/// end, duration count, and the band when it holds a single duration.
#[cfg(test)]
type OpenSummary = Option<(String, String, u64, Option<Value>)>;
/// Adds an entry or whole subtree to the open cluster, closing it first when the start no
/// longer fits within the threshold of the cluster's anchor.
#[allow(clippy::too_many_arguments)]
#[cfg(test)]
fn join_summary(
    db: &Connection,
    open: &mut OpenSummary,
    out: &mut Vec<DurationSummary>,
    threshold: &str,
    first: &str,
    last: &str,
    n: u64,
    band: Option<Value>,
) -> Result<(), String> {
    if let Some((anchor, _, _, _)) = open.as_ref() {
        if diff_cmp(db, first, anchor, threshold)? >= 0 {
            let (first, last, count, band) = open.take().unwrap();
            out.push(DurationSummary {
                first,
                last,
                count,
                band: if count == 1 { band } else { None },
                totals: None,
            });
        }
    }
    match open {
        None => {
            *open = Some((
                first.into(),
                last.into(),
                n,
                if n == 1 { band } else { None },
            ))
        }
        Some((_, end, count, single)) => {
            *end = later(db, last, end)?;
            *count += n;
            *single = None;
        }
    }
    Ok(())
}
/// One summarized cluster of collapsed durations.
pub(crate) struct DurationSummary {
    /// The group's anchor (its first start) and its latest end.
    pub first: String,
    pub last: String,
    /// How many durations it collapses.
    pub count: u64,
    /// The duration's band when the group holds exactly one, so the editor can still open it.
    pub band: Option<Value>,
    /// Its durations' measure totals (#576), each counted where it starts: by name.
    pub totals: Option<Value>,
}
/// Anchored-span summaries of durations shorter than the threshold that intersect
/// [lower, upper], keyed by start: a group starts at the first collapsed start and takes every
/// collapsed duration starting less than the threshold after it. Same results as
/// src/durations.ts durationSummaries and the PostgreSQL oc_duration_overview.
///
/// One statement: each group's anchor is the first collapsed start at or after the previous
/// anchor plus the threshold, found by a range scan of the `first` index, so the cost follows
/// the durations starting in [lower − threshold, upper] and the number of groups, not the
/// timeline. (A collapsed duration intersecting the window starts after lower − threshold.)
pub(crate) fn duration_summaries(
    db: &Connection,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Vec<DurationSummary>, String> {
    if sign(db, "SELECT q_cmp(q(?1),q('0'))", &[threshold])? <= 0 {
        return Ok(Vec::new());
    }
    // A collapsed duration is shorter than the threshold (?3) and intersects the window: it
    // ends at or after lower (?1) and starts at or before upper (?2).
    let collapsed = "q_cmp(d.extent,q(?3))<0 AND q_cmp(d.last,q(?1))>=0 AND d.first<=q(?2)";
    // anchors: the first anchor is the earliest collapsed start at or after lower - threshold;
    // each next one is the earliest collapsed start at or after the previous anchor plus the
    // threshold, until none is left (a NULL ends the recursion). Each is an ORDER BY ... LIMIT
    // 1 seek on duration_intervals_first. groups: for each anchor, the collapsed durations
    // starting in [anchor, anchor + threshold), counted, with their latest end and the
    // smallest ord (the duration itself when the group holds one). The final join attaches
    // that single duration's band columns; larger groups get NULLs there.
    // Each group's measure totals (#576): its durations' values added per declared measure,
    // each duration's counted in the group holding its start.
    let names = file_measure_names(db)?;
    let sums = sums_sql(&names);
    let rows = db.query(
        &format!("WITH RECURSIVE anchors(a) AS (\
           SELECT (SELECT d.first FROM duration_intervals d WHERE d.first>=q_sub(q(?1),q(?3)) AND {collapsed} ORDER BY d.first LIMIT 1) \
           UNION ALL SELECT (SELECT d.first FROM duration_intervals d WHERE d.first>=q_add(a,q(?3)) AND {collapsed} ORDER BY d.first LIMIT 1) \
           FROM anchors WHERE a IS NOT NULL), \
         groups AS (SELECT a,count(*) AS cnt,max(d.last) AS last,min(d.ord) AS one,{sums} AS sums FROM anchors \
           JOIN duration_intervals d ON d.first>=a AND d.first<q_add(a,q(?3)) AND {collapsed} \
           WHERE a IS NOT NULL GROUP BY a) \
         SELECT q(g.a),q(g.last),g.cnt,{BAND_COLUMNS},g.sums FROM groups g \
         LEFT JOIN duration_intervals d ON g.cnt=1 AND d.ord=g.one ORDER BY g.a COLLATE RATIONAL_V1"),
        &[lower, upper, threshold],
    )?;
    rows.into_iter()
        .map(|r| {
            let count: u64 = r[2]
                .as_deref()
                .unwrap_or("0")
                .parse()
                .map_err(|_| "Invalid duration count")?;
            Ok(DurationSummary {
                first: r[0].clone().ok_or("Missing summary start")?,
                last: r[1].clone().ok_or("Missing summary end")?,
                count,
                band: if count == 1 {
                    Some(band_json(&r[3..])?)
                } else {
                    None
                },
                totals: named_totals(&names, r[11].as_deref()),
            })
        })
        .collect()
}
/// The previous tree walk over duration_nodes, kept as a reference for the set-based query:
/// fully collapsed, in-window subtrees whose starts fit the open group are consumed whole.
#[cfg(test)]
pub(crate) fn duration_summaries_walk(
    db: &Connection,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Vec<DurationSummary>, String> {
    let mut out = Vec::new();
    if sign(db, "SELECT q_cmp(q(?1),q('0'))", &[threshold])? <= 0 {
        return Ok(out);
    }
    let root = db.scalar(
        "SELECT coalesce((SELECT root FROM interval_roots WHERE name='duration_nodes'),0)",
        &[],
    )?;
    let mut stack: Vec<(String, bool)> = if root == "0" {
        Vec::new()
    } else {
        vec![(root, false)]
    };
    let mut open: OpenSummary = None;
    while let Some((id, point)) = stack.pop() {
        let row = db.query(
            &format!("SELECT n.left_id,n.right_id,n.cnt,q(n.min_time),q(n.max_time),q(n.max_first),\
             q_cmp(n.max_time,q(?1))<0 OR q_cmp(n.min_time,q(?2))>0,\
             q_cmp(n.min_extent,q(?3))>=0,\
             q_cmp(n.max_extent,q(?3))<0 AND q_cmp(n.min_time,q(?1))>=0 AND q_cmp(n.max_first,q(?2))<=0,\
             q_cmp(d.last,q(?1))>=0 AND q_cmp(d.first,q(?2))<=0 AND q_cmp(d.extent,q(?3))<0,\
             {BAND_COLUMNS} FROM duration_nodes n JOIN duration_intervals d ON d.ord=n.id WHERE n.id=CAST(?4 AS INTEGER)"),
            &[lower, upper, threshold, &id],
        )?;
        // Columns 6 to 9 are flags: 6, the subtree lies outside the window; 7, every duration
        // in it is long enough to be drawn (none collapse); 8, every duration in it collapses
        // and all its starts lie in the window; 9, this node's own duration collapses and
        // intersects the window. Band columns start at 10 (first and last at 13 and 14).
        let r = row.first().ok_or("Broken duration index")?;
        let flag = |i: usize| r[i].as_deref() == Some("1");
        let text = |i: usize| r[i].clone().unwrap_or_default();
        let band = || band_json(&r[10..]);
        if point {
            if flag(9) {
                join_summary(
                    db,
                    &mut open,
                    &mut out,
                    threshold,
                    &text(13),
                    &text(14),
                    1,
                    Some(band()?),
                )?;
            }
            continue;
        }
        if flag(6) || flag(7) {
            continue;
        }
        let (min, max, max_first) = (text(3), text(4), text(5));
        // The anchor the subtree's starts are measured from: the open group's, if the subtree's
        // first start still joins it, else the subtree's own first start.
        let base = match &open {
            Some((anchor, _, _, _)) if diff_cmp(db, &min, anchor, threshold)? < 0 => anchor.clone(),
            _ => min.clone(),
        };
        let count: u64 = text(2).parse().map_err(|_| "Invalid duration count")?;
        // A wholly collapsed subtree whose starts all fit in one group is consumed whole,
        // without visiting its nodes; otherwise visit left subtree, node, right subtree in order.
        if flag(8) && diff_cmp(db, &max_first, &base, threshold)? < 0 {
            let single = if count == 1 { Some(band()?) } else { None };
            join_summary(
                db, &mut open, &mut out, threshold, &min, &max, count, single,
            )?;
            continue;
        }
        if let Some(right) = &r[1] {
            stack.push((right.clone(), false));
        }
        stack.push((id.clone(), true));
        if let Some(left) = &r[0] {
            stack.push((left.clone(), false));
        }
    }
    if let Some((first, last, count, band)) = open {
        out.push(DurationSummary {
            first,
            last,
            count,
            band: if count == 1 { band } else { None },
            totals: None,
        });
    }
    Ok(out)
}
/// Merges adjacent summaries while the merged block spans less than the threshold; the same
/// rule as src/summaries.ts coalesceGroups. Groups are JSON frame groups in any order.
/// The measures a timeline declares (#572), sorted by name: the positions of the sums the
/// points index keeps for them (#574). Names the editor would refuse are left out, so they
/// can be written into SQL.
pub(crate) fn measure_names(measures: Option<&Value>) -> Vec<String> {
    let mut names: Vec<String> = measures
        .and_then(|m| m.as_object())
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    names.retain(|n| {
        n.len() <= 40
            && n.starts_with(|c: char| c.is_ascii_lowercase())
            && n.bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
    });
    names.sort();
    names
}
/// The measures declared in a file's settings, as `measure_names` gives them.
pub(crate) fn file_measure_names(db: &Connection) -> Result<Vec<String>, String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='timeline_extras' AND type='table'",
        &[],
    )? == "0"
    {
        return Ok(Vec::new());
    }
    let extras = db.query("SELECT extras FROM timeline_extras WHERE singleton=1", &[])?;
    let value: Option<Value> = extras
        .first()
        .and_then(|row| row[0].as_deref())
        .and_then(|text| serde_json::from_str(text).ok());
    Ok(measure_names(
        value.as_ref().and_then(|v| v.get("measures")),
    ))
}
/// SQL (over `events` rows grouped by time) for a bucket's sums: each measure's values added
/// (q_sum), joined by ';' in `names`' order, or NULL without measures.
pub(crate) fn sums_sql(names: &[String]) -> String {
    if names.is_empty() {
        return "NULL".into();
    }
    names
        .iter()
        .map(|n| format!("q_sum(json_extract(metadata,'$.measures.{n}'))"))
        .collect::<Vec<_>>()
        .join("||';'||")
}
/// Whether the points index keeps sums (#574): files from before have no such columns.
pub(crate) fn points_have_sums(db: &Connection) -> Result<bool, String> {
    Ok(db.scalar(
        "SELECT count(*) FROM pragma_table_info('points_nodes') WHERE name IN ('sums','total')",
        &[],
    )? == "2")
}
/// A group's totals by measure name (#574) from the index's sums (canonical rationals joined
/// by ';', in `names`' order): integers without "/1", zeros left out; None when all are zero.
pub(crate) fn named_totals(names: &[String], sums: Option<&str>) -> Option<Value> {
    let mut totals = serde_json::Map::new();
    for (name, value) in names.iter().zip(sums?.split(';')) {
        if value.is_empty() || value == "0/1" {
            continue;
        }
        let text = value.strip_suffix("/1").unwrap_or(value);
        totals.insert(name.clone(), Value::String(text.to_string()));
    }
    (!totals.is_empty()).then_some(Value::Object(totals))
}
/// Rebuilds the points index from `events` with the file's measures' sums: for files whose
/// index predates them, or whose measures changed names (#574).
pub(crate) fn rebuild_point_index(db: &Connection) -> Result<(), String> {
    db.execute("DROP TABLE IF EXISTS points", &[])?;
    db.execute("CREATE VIRTUAL TABLE points USING rational_index", &[])?;
    let sums = sums_sql(&file_measure_names(db)?);
    db.execute(&format!("INSERT INTO points(time,value,weight,sums,mode) SELECT time,time,count(*),{sums},'append' FROM events GROUP BY time COLLATE RATIONAL_V1"), &[])?;
    db.execute("INSERT INTO points(mode) VALUES('build')", &[])
}
/// Two groups' totals added (#574), exactly, through the rational extension.
fn add_totals(db: &Connection, a: &Value, b: &Value) -> Result<Option<Value>, String> {
    let (Some(a), Some(b)) = (a.as_object(), b.as_object()) else {
        return Ok(if a.is_object() {
            Some(a.clone())
        } else if b.is_object() {
            Some(b.clone())
        } else {
            None
        });
    };
    let mut sum = a.clone();
    for (name, value) in b {
        let value = value.as_str().unwrap_or("0");
        let total = match sum.get(name).and_then(|v| v.as_str()) {
            Some(previous) => db.scalar("SELECT q_add(q(?1),q(?2))", &[previous, value])?,
            None => db.scalar("SELECT q(?1)", &[value])?,
        };
        if total == "0/1" {
            sum.remove(name);
        } else {
            sum.insert(
                name.clone(),
                Value::String(total.strip_suffix("/1").unwrap_or(&total).to_string()),
            );
        }
    }
    Ok((!sum.is_empty()).then_some(Value::Object(sum)))
}
pub(crate) fn coalesce_groups(
    db: &Connection,
    mut groups: Vec<Value>,
    threshold: &str,
) -> Result<Vec<Value>, String> {
    let text = |g: &Value, k: &str| g[k].as_str().unwrap_or("0").to_string();
    // Order by start, moments before durations at the same start.
    let mut keyed = Vec::new();
    for g in groups.drain(..) {
        keyed.push(g);
    }
    let mut i = 1;
    while i < keyed.len() {
        // Insertion sort with exact comparisons; groups are already nearly ordered.
        let mut j = i;
        while j > 0 {
            let order = sign(
                db,
                "SELECT q_cmp(q(?1),q(?2))",
                &[&text(&keyed[j - 1], "first"), &text(&keyed[j], "first")],
            )?;
            let moments_first = |g: &Value| text(g, "count") != "0";
            if order > 0
                || (order == 0 && !moments_first(&keyed[j - 1]) && moments_first(&keyed[j]))
            {
                keyed.swap(j - 1, j);
                j -= 1;
            } else {
                break;
            }
        }
        i += 1;
    }
    // Merge each group into the previous output group when they share a first time or the
    // merged block would span less than the threshold. Counts add up; distinct times add up
    // less one when the two blocks of moments meet at a shared time.
    let mut out: Vec<Value> = Vec::new();
    for g in keyed {
        let merge = match out.last() {
            Some(prev) => {
                text(&g, "first") == text(prev, "first")
                    || diff_cmp(db, &text(&g, "last"), &text(prev, "first"), threshold)? < 0
            }
            None => false,
        };
        if !merge {
            out.push(g);
            continue;
        }
        let prev = out.pop().unwrap();
        let num = |g: &Value, k: &str| -> Result<u128, String> {
            text(g, k)
                .parse::<u128>()
                .map_err(|_| "Invalid group count".to_string())
        };
        let distinct = |g: &Value| g["distinct"].as_u64().unwrap_or(0);
        let overlap =
            distinct(&prev) > 0 && distinct(&g) > 0 && text(&prev, "last") == text(&g, "first");
        let durations = num(&prev, "durationCount")? + num(&g, "durationCount")?;
        let mut merged = serde_json::json!({
            "first": prev["first"],
            "last": later(db, &text(&g, "last"), &text(&prev, "last"))?,
            "count": (num(&prev, "count")? + num(&g, "count")?).to_string(),
            "distinct": distinct(&prev) + distinct(&g) - u64::from(overlap),
        });
        if durations > 0 {
            merged["durationCount"] = Value::String(durations.to_string());
        }
        if let Some(totals) = add_totals(db, &prev["totals"], &g["totals"])? {
            merged["totals"] = totals;
        }
        out.push(merged);
    }
    Ok(out)
}
