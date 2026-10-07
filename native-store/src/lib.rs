// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
mod sqlite;
mod workspace;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlite::Connection;
use std::{collections::HashSet, path::Path};
pub use workspace::{Header, Patch, Query, Snapshot};
const APPLICATION_ID: &str = "1329812556"; // OCTL
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Event {
    pub id: String,
    pub time: String,
    pub metadata: Map<String, Value>,
}
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
    pub events: Vec<Event>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Group {
    pub first: String,
    pub last: String,
    pub count: String,
    pub distinct: u32,
    pub visited_nodes: u32,
}
fn check_file(db: &Connection) -> Result<(), String> {
    if db.scalar("PRAGMA application_id", &[])? != APPLICATION_ID
        || db.scalar("PRAGMA user_version", &[])? != "1"
    {
        return Err("This is not a supported OpenChronology SQLite timeline".into());
    }
    // These names must be data tables, never attacker-supplied SQL views.
    if db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('events','timeline_meta') AND type='table'", &[])? != "2"
        || db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('timeline_settings','timeline_plugins','timeline_extras') AND type!='table'", &[])? != "0" {
        return Err("Invalid timeline data tables".into());
    }
    Ok(())
}
fn validate(doc: &Document) -> Result<(), String> {
    if doc.format != "openchronology"
        || doc.version != 1
        || doc.title.encode_utf16().count() > 300
        || doc.description.encode_utf16().count() > 20000
        || doc.events.len() > 200000
    {
        return Err("Invalid timeline format, version, or document size".into());
    }
    let mut ids = HashSet::new();
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
    for e in &doc.events {
        if e.id.is_empty()
            || e.id.len() > 128
            || !e
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
            || !ids.insert(&e.id)
        {
            return Err("Event IDs must be unique ASCII identifiers".into());
        }
        if let Some(value) = e.metadata.get("durations") {
            let links = value.as_array().ok_or("Durations must be an array")?;
            if links.len() > 1000 {
                return Err("Use at most 1000 durations per moment".into());
            }
            for link in links {
                for key in ["id", "endId"] {
                    let id = link
                        .get(key)
                        .and_then(Value::as_str)
                        .ok_or("Invalid duration identifier")?;
                    if id.is_empty()
                        || id.len() > 128
                        || !id
                            .bytes()
                            .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
                    {
                        return Err("Invalid duration identifier".into());
                    }
                }
                let metadata = link
                    .get("metadata")
                    .and_then(Value::as_object)
                    .ok_or("Invalid duration metadata")?;
                for key in ["title", "description"] {
                    if metadata.get(key).is_some_and(|v| !v.is_string()) {
                        return Err("Duration titles and notes must be text".into());
                    }
                }
                if metadata.contains_key("durations") {
                    return Err("Durations cannot contain durations".into());
                }
            }
        }
        for key in ["title", "description"] {
            if e.metadata.get(key).is_some_and(|v| !v.is_string()) {
                return Err(format!("Event {key} must be text"));
            }
        }
    }
    Ok(())
}
pub fn save(path: &Path, doc: &Document) -> Result<(), String> {
    validate(doc)?;
    let db = Connection::open(path, true)?;
    let id = db.scalar("PRAGMA application_id", &[])?;
    if id != APPLICATION_ID {
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
        ] {
            db.execute(&format!("DROP TABLE IF EXISTS {table}"), &[])?;
        }
        db.execute("CREATE TABLE IF NOT EXISTS timeline_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),title TEXT NOT NULL,description TEXT NOT NULL)",&[])?;
        db.execute("CREATE TABLE IF NOT EXISTS timeline_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),presentation TEXT NOT NULL)", &[])?;
        db.execute("CREATE TABLE IF NOT EXISTS timeline_plugins(singleton INTEGER PRIMARY KEY CHECK(singleton=1),plugins TEXT NOT NULL)", &[])?;
        db.execute("CREATE TABLE IF NOT EXISTS timeline_extras(singleton INTEGER PRIMARY KEY CHECK(singleton=1),extras TEXT NOT NULL)", &[])?;
        db.execute("DELETE FROM timeline_extras", &[])?;
        let extras = serde_json::json!({"tags": doc.tags, "assets": doc.assets}).to_string();
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
        db.execute("CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,time TEXT NOT NULL COLLATE RATIONAL_V1 CHECK(q_is_canonical(time)=1),metadata TEXT NOT NULL) STRICT",&[])?;
        db.execute(
            "CREATE INDEX IF NOT EXISTS events_time ON events(time COLLATE RATIONAL_V1)",
            &[],
        )?;
        db.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS points USING rational_index",
            &[],
        )?;
        db.execute("DELETE FROM points", &[])?;
        db.execute("DELETE FROM events", &[])?;
        db.execute("INSERT INTO timeline_meta VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET title=excluded.title,description=excluded.description",&[&doc.title,&doc.description])?;
        for event in &doc.events {
            let metadata = serde_json::to_string(&event.metadata).map_err(|e| e.to_string())?;
            db.execute(
                "INSERT INTO events(id,time,metadata) VALUES(?,q(?),?)",
                &[&event.id, &event.time, &metadata],
            )?;
        }
        db.execute("INSERT INTO points(time,value,weight) SELECT time,time,count(*) FROM events GROUP BY time COLLATE RATIONAL_V1",&[])?;
        rebuild_duration_index(&db)?;
        db.execute("PRAGMA application_id=1329812556", &[])?;
        db.execute("PRAGMA user_version=1", &[])?;
        db.execute("COMMIT", &[])
    })();
    if result.is_err() {
        let _ = db.execute("ROLLBACK", &[]);
    }
    result
}
pub fn open(path: &Path) -> Result<Document, String> {
    read_document(path, true)
}
pub fn header_document(path: &Path) -> Result<Document, String> {
    read_document(path, false)
}
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
        events,
    };
    validate(&doc)?;
    db.execute("COMMIT", &[])?;
    Ok(doc)
}
pub fn overview(
    path: &Path,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Vec<Group>, String> {
    let db = Connection::open(path, false)?;
    check_file(&db)?;
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
#[cfg(test)]
mod tests {
    use super::*;
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
        save(&path, &document).unwrap();
        let reopened = open(&path).unwrap();
        assert_eq!(reopened.tags, document.tags);
        assert_eq!(reopened.assets, document.assets);
        assert_eq!(reopened.plugins, document.plugins);
        {
            let db = Connection::open(&path, true).unwrap();
            db.execute("DROP TABLE timeline_extras", &[]).unwrap();
        }
        let legacy = open(&path).unwrap();
        assert_eq!(legacy.tags, None);
        assert_eq!(legacy.assets, None);
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

/// Rebuild derived links entirely in SQLite; endpoint coordinates never enter the UI cache.
fn rebuild_duration_index(db: &Connection) -> Result<(), String> {
    db.execute("DROP TABLE IF EXISTS duration_nodes", &[])?;
    db.execute("DROP TABLE IF EXISTS duration_intervals", &[])?;
    db.execute("CREATE TABLE duration_intervals(ord INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,start_id TEXT NOT NULL,end_id TEXT NOT NULL,first TEXT NOT NULL COLLATE RATIONAL_V1,last TEXT NOT NULL COLLATE RATIONAL_V1,metadata TEXT NOT NULL)", &[])?;
    if db.scalar("SELECT count(*) FROM events s,json_each(s.metadata,'$.durations') d WHERE json_extract(d.value,'$.endId')=s.id OR NOT EXISTS(SELECT 1 FROM events e WHERE e.id=json_extract(d.value,'$.endId'))",&[])? != "0" { return Err("Duration endpoints must be distinct existing moments".into()); }
    db.execute("INSERT INTO duration_intervals SELECT row_number() OVER (ORDER BY q_min(s.time,e.time) COLLATE RATIONAL_V1,json_extract(d.value,'$.id')),json_extract(d.value,'$.id'),s.id,e.id,q_min(s.time,e.time),q_max(s.time,e.time),json_extract(d.value,'$.metadata') FROM events s,json_each(s.metadata,'$.durations') d JOIN events e ON e.id=json_extract(d.value,'$.endId') WHERE s.id<>e.id", &[])?;
    if db
        .scalar("SELECT count(*) FROM duration_intervals", &[])?
        .parse::<usize>()
        .map_err(|e| e.to_string())?
        > 200000
    {
        return Err("Use at most 200000 durations per timeline".into());
    }
    db.execute("CREATE TABLE duration_nodes(id INTEGER PRIMARY KEY,left_id INTEGER,right_id INTEGER,min_time TEXT NOT NULL COLLATE RATIONAL_V1,max_time TEXT NOT NULL COLLATE RATIONAL_V1)", &[])?;
    db.execute("WITH RECURSIVE ranges(lo,hi,mid) AS (SELECT 1,count(*),CAST((1+count(*))/2 AS INTEGER) FROM duration_intervals HAVING count(*)>0 UNION ALL SELECT r.lo,r.mid-1,CAST((r.lo+r.mid-1)/2 AS INTEGER) FROM ranges r WHERE r.lo<r.mid UNION ALL SELECT r.mid+1,r.hi,CAST((r.mid+1+r.hi)/2 AS INTEGER) FROM ranges r WHERE r.mid<r.hi) INSERT INTO duration_nodes SELECT mid,CASE WHEN lo<mid THEN CAST((lo+mid-1)/2 AS INTEGER) END,CASE WHEN mid<hi THEN CAST((mid+1+hi)/2 AS INTEGER) END,(SELECT first FROM duration_intervals WHERE ord=lo),(SELECT last FROM duration_intervals WHERE ord BETWEEN lo AND hi ORDER BY last COLLATE RATIONAL_V1 DESC LIMIT 1) FROM ranges", &[])?;
    Ok(())
}
fn duration_window(db: &Connection, lower: &str, upper: &str) -> Result<Value, String> {
    let rows=db.query_limited("WITH RECURSIVE visible AS (SELECT n.* FROM duration_nodes n WHERE id=(SELECT CAST((1+count(*))/2 AS INTEGER) FROM duration_intervals) AND min_time<=q(?) COLLATE RATIONAL_V1 AND max_time>=q(?) COLLATE RATIONAL_V1 UNION ALL SELECT n.* FROM visible p JOIN duration_nodes n ON n.id IN(p.left_id,p.right_id) WHERE n.min_time<=q(?) COLLATE RATIONAL_V1 AND n.max_time>=q(?) COLLATE RATIONAL_V1) SELECT d.id,d.start_id,d.end_id,d.first,d.last,(SELECT json_group_object(key,substr(value,1,512)) FROM json_each(d.metadata) WHERE key IN ('title','description') AND type='text'),s.time,e.time FROM visible v JOIN duration_intervals d ON d.ord=v.id JOIN events s ON s.id=d.start_id JOIN events e ON e.id=d.end_id WHERE d.first<=q(?) COLLATE RATIONAL_V1 AND d.last>=q(?) COLLATE RATIONAL_V1 LIMIT 257", &[upper,lower,upper,lower,upper,lower],257,8*1024*1024)?;
    let more = rows.len() > 256;
    let mut bands = Vec::new();
    for row in rows.into_iter().take(256) {
        let metadata: Value =
            serde_json::from_str(row[5].as_deref().unwrap_or("{}")).map_err(|e| e.to_string())?;
        bands.push(serde_json::json!({"id":row[0],"startId":row[1],"endId":row[2],"first":row[3],"last":row[4],"metadata":metadata,"startTime":row[6],"endTime":row[7]}));
    }
    Ok(serde_json::json!({"durations":bands,"durationsTruncated":more}))
}
