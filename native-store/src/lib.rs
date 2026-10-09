// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
mod intervals;
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
/// A standalone duration. Each endpoint is an exact time string or `{"moment": id}`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Duration {
    pub id: String,
    pub start: Value,
    pub end: Value,
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
fn identifier(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
}
/// Splits an endpoint into (time, moment); exactly one is present.
fn endpoint(value: &Value) -> Result<(Option<&str>, Option<&str>), String> {
    match value {
        Value::String(time) if !time.is_empty() && time.len() <= 65536 => Ok((Some(time), None)),
        Value::Object(o) if o.len() == 1 => match o.get("moment").and_then(Value::as_str) {
            Some(id) if identifier(id) => Ok((None, Some(id))),
            _ => Err("Invalid duration anchor".into()),
        },
        _ => Err("A duration endpoint is an exact time or a moment anchor".into()),
    }
}
/// Version-1 files stored durations as links in their start moment's metadata. They become
/// standalone durations anchored to both original moments.
pub fn convert_legacy_durations(doc: &mut Document) -> Result<(), String> {
    for event in &mut doc.events {
        let Some(value) = event.metadata.remove("durations") else {
            continue;
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
            doc.durations.push(Duration {
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
    }
    doc.durations.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(())
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
        || db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('timeline_settings','timeline_plugins','timeline_extras','durations','relationships') AND type!='table'", &[])? != "0" {
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
        if e.metadata.contains_key("durations") {
            return Err("Durations are stored separately from moments".into());
        }
        for key in ["title", "description"] {
            if e.metadata.get(key).is_some_and(|v| !v.is_string()) {
                return Err(format!("Event {key} must be text"));
            }
        }
    }
    if doc.durations.len() > 200000 {
        return Err("Use at most 200000 durations per timeline".into());
    }
    let mut durations = HashSet::new();
    for d in &doc.durations {
        if !identifier(&d.id) || !durations.insert(&d.id) {
            return Err("Duration IDs must be unique ASCII identifiers".into());
        }
        for value in [&d.start, &d.end] {
            if let (_, Some(moment)) = endpoint(value)? {
                if !ids.contains(&moment.to_string()) {
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
    if doc.relationships.len() > 200000 {
        return Err("Use at most 200000 relationships per timeline".into());
    }
    for r in &doc.relationships {
        let (a, b) = (entity_ref(&r.a)?, entity_ref(&r.b)?);
        if a == b {
            return Err("An entity cannot be related to itself".into());
        }
        for (kind, id) in [a, b] {
            let exists = if kind == "moment" {
                ids.contains(&id.to_string())
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
pub fn save(path: &Path, doc: &Document) -> Result<(), String> {
    let mut doc = doc.clone();
    convert_legacy_durations(&mut doc)?;
    let doc = &doc;
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
            "durations",
            "relationships",
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
        create_duration_table(&db)?;
        for duration in &doc.durations {
            insert_duration(&db, duration)?;
        }
        rebuild_duration_index(&db)?;
        create_relationship_table(&db)?;
        for r in &doc.relationships {
            relate(&db, r, true)?;
        }
        rebuild_edge_index(&db)?;
        intervals::set_layout(&db, &intervals::token())?;
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
    db.execute("COMMIT", &[])?;
    Ok(doc)
}
fn create_duration_table(db: &Connection) -> Result<(), String> {
    // Exactly one of time/moment per endpoint; fixed times are canonical exact rationals.
    db.execute("CREATE TABLE IF NOT EXISTS durations(id TEXT PRIMARY KEY,start_time TEXT COLLATE RATIONAL_V1 CHECK(start_time IS NULL OR q_is_canonical(start_time)=1),start_moment TEXT,end_time TEXT COLLATE RATIONAL_V1 CHECK(end_time IS NULL OR q_is_canonical(end_time)=1),end_moment TEXT,metadata TEXT NOT NULL,CHECK((start_time IS NULL)<>(start_moment IS NULL)),CHECK((end_time IS NULL)<>(end_moment IS NULL))) STRICT", &[])?;
    // Durations anchored to a moment move with it.
    db.execute(
        "CREATE INDEX IF NOT EXISTS durations_start_moment ON durations(start_moment)",
        &[],
    )?;
    db.execute(
        "CREATE INDEX IF NOT EXISTS durations_end_moment ON durations(end_moment)",
        &[],
    )
}
pub(crate) fn insert_duration(db: &Connection, d: &Duration) -> Result<(), String> {
    let (start_time, start_moment) = endpoint(&d.start)?;
    let (end_time, end_moment) = endpoint(&d.end)?;
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
fn has_any_tag(metadata: &Map<String, Value>, tags: &[String]) -> bool {
    metadata
        .get("tags")
        .and_then(Value::as_array)
        .is_some_and(|list| {
            list.iter()
                .any(|t| t.as_str().is_some_and(|t| tags.iter().any(|w| w == t)))
        })
}
/// What puts an entity on the upper side of a separation.
pub enum Membership {
    /// Any of these (normalized) tags.
    Tags(Vec<String>),
    /// This entity ("m:<id>" or "d:<id>") and its relations: direct, or all reachable.
    Related { start: String, direct: bool },
}
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
        Membership::Tags(_) => None,
        Membership::Related { start, direct } => {
            let mut graph: std::collections::HashMap<String, Vec<String>> = Default::default();
            for r in &doc.relationships {
                if let (Some(a), Some(b)) = (ref_key(&r.a), ref_key(&r.b)) {
                    graph.entry(a.clone()).or_default().push(b.clone());
                    graph.entry(b).or_default().push(a);
                }
            }
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
    let keep = |key: String, metadata: &Map<String, Value>| {
        let inside = match (&related, membership) {
            (Some(set), _) => set.contains(&key),
            (None, Membership::Tags(tags)) => has_any_tag(metadata, tags),
            _ => false,
        };
        inside == any
    };
    doc.events
        .retain(|e| keep(format!("m:{}", e.id), &e.metadata));
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
pub(crate) fn migrate_durations(db: &Connection) -> Result<(), String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='durations' AND type='table'",
        &[],
    )? != "0"
    {
        return Ok(());
    }
    create_duration_table(db)?;
    if db.scalar("SELECT count(*) FROM events s,json_each(s.metadata,'$.durations') d WHERE json_extract(d.value,'$.endId')=s.id", &[])? != "0" {
        return Err("Duration endpoints must be distinct existing moments".into());
    }
    db.execute("INSERT INTO durations(id,start_time,start_moment,end_time,end_moment,metadata) SELECT json_extract(d.value,'$.id'),NULL,s.id,NULL,json_extract(d.value,'$.endId'),COALESCE(json(json_extract(d.value,'$.metadata')),'{}') FROM events s,json_each(s.metadata,'$.durations') d", &[])?;
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

/// Rebuild the interval index entirely in SQLite; anchored endpoints resolve to moment times.
fn rebuild_duration_index(db: &Connection) -> Result<(), String> {
    migrate_durations(db)?;
    create_duration_table(db)?;
    db.execute("DROP TABLE IF EXISTS duration_nodes", &[])?;
    db.execute("DROP TABLE IF EXISTS duration_intervals", &[])?;
    db.execute("CREATE TABLE duration_intervals(ord INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,start_json TEXT NOT NULL,end_json TEXT NOT NULL,start_time TEXT NOT NULL COLLATE RATIONAL_V1,end_time TEXT NOT NULL COLLATE RATIONAL_V1,first TEXT NOT NULL COLLATE RATIONAL_V1,last TEXT NOT NULL COLLATE RATIONAL_V1,metadata TEXT NOT NULL,extent TEXT COLLATE RATIONAL_V1)", &[])?;
    if db.scalar("SELECT count(*) FROM durations d WHERE (d.start_moment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events e WHERE e.id=d.start_moment)) OR (d.end_moment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events e WHERE e.id=d.end_moment))", &[])? != "0" {
        return Err("Duration anchors must name existing moments".into());
    }
    db.execute("WITH r AS (SELECT d.id,CASE WHEN d.start_moment IS NULL THEN json_quote(d.start_time) ELSE json_object('moment',d.start_moment) END AS sj,CASE WHEN d.end_moment IS NULL THEN json_quote(d.end_time) ELSE json_object('moment',d.end_moment) END AS ej,COALESCE(d.start_time,(SELECT e.time FROM events e WHERE e.id=d.start_moment)) AS s,COALESCE(d.end_time,(SELECT e.time FROM events e WHERE e.id=d.end_moment)) AS e,d.metadata FROM durations d) INSERT INTO duration_intervals(ord,id,start_json,end_json,start_time,end_time,first,last,metadata) SELECT row_number() OVER (ORDER BY q_min(s,e) COLLATE RATIONAL_V1,id),id,sj,ej,s,e,q_min(s,e),q_max(s,e),metadata FROM r", &[])?;
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
pub(crate) fn create_start_index(db: &Connection) -> Result<(), String> {
    db.execute(
        "CREATE INDEX IF NOT EXISTS duration_intervals_first ON duration_intervals(first COLLATE RATIONAL_V1)",
        &[],
    )
}
/// Balanced augmented nodes over an intervals table ordered by `ord`, with AVL heights. Subtree summaries
/// (largest start, count, extent bounds) let short intervals collapse without enumerating
/// dense clusters; see duration_summaries.
fn build_interval_nodes(
    db: &Connection,
    intervals: &'static str,
    nodes: &'static str,
) -> Result<(), String> {
    db.execute(&format!("DROP TABLE IF EXISTS {nodes}"), &[])?;
    let sql = "CREATE TABLE duration_nodes(id INTEGER PRIMARY KEY,left_id INTEGER,right_id INTEGER,min_time TEXT NOT NULL COLLATE RATIONAL_V1,max_time TEXT NOT NULL COLLATE RATIONAL_V1,max_first TEXT NOT NULL COLLATE RATIONAL_V1,cnt INTEGER NOT NULL,min_extent TEXT NOT NULL COLLATE RATIONAL_V1,max_extent TEXT NOT NULL COLLATE RATIONAL_V1,height INTEGER NOT NULL)";
    db.execute(&sql.replace("duration_nodes", nodes), &[])?;
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
pub(crate) fn rebuild_edge_index(db: &Connection) -> Result<(), String> {
    create_relationship_table(db)?;
    // Deleting an entity removes its links.
    db.execute("DELETE FROM relationships WHERE (a_kind='moment' AND a_id NOT IN (SELECT id FROM events)) OR (b_kind='moment' AND b_id NOT IN (SELECT id FROM events)) OR (a_kind='duration' AND a_id NOT IN (SELECT id FROM durations)) OR (b_kind='duration' AND b_id NOT IN (SELECT id FROM durations))", &[])?;
    db.execute("DROP TABLE IF EXISTS edge_intervals", &[])?;
    db.execute("CREATE TABLE edge_intervals(ord INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,start_json TEXT NOT NULL,end_json TEXT NOT NULL,start_time TEXT NOT NULL COLLATE RATIONAL_V1,end_time TEXT NOT NULL COLLATE RATIONAL_V1,first TEXT NOT NULL COLLATE RATIONAL_V1,last TEXT NOT NULL COLLATE RATIONAL_V1,metadata TEXT NOT NULL,extent TEXT COLLATE RATIONAL_V1)", &[])?;
    db.execute("WITH places(kind,id,time) AS (SELECT 'moment',id,time FROM events UNION ALL SELECT 'duration',id,start_time FROM duration_intervals), r AS (SELECT CASE r.a_kind WHEN 'moment' THEN 'm:' ELSE 'd:' END||r.a_id||'~'||CASE r.b_kind WHEN 'moment' THEN 'm:' ELSE 'd:' END||r.b_id AS id,pa.time AS s,pb.time AS e FROM relationships r JOIN places pa ON pa.kind=r.a_kind AND pa.id=r.a_id JOIN places pb ON pb.kind=r.b_kind AND pb.id=r.b_id) INSERT INTO edge_intervals(ord,id,start_json,end_json,start_time,end_time,first,last,metadata,extent) SELECT row_number() OVER (ORDER BY q_min(s,e) COLLATE RATIONAL_V1,id),id,'null','null',s,e,q_min(s,e),q_max(s,e),'{}',q_sub(q_max(s,e),q_min(s,e)) FROM r", &[])?;
    build_interval_nodes(db, "edge_intervals", "edge_nodes")
}
/// Arcs touching [lower, upper] that are at least as long as the threshold.
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
pub(crate) const BAND_COLUMNS: &str = "d.id,d.start_json,d.end_json,d.first,d.last,(SELECT json_group_object(key,CASE key WHEN 'title' THEN substr(value,1,512) WHEN 'description' THEN substr(value,1,2000) ELSE value END) FROM json_each(d.metadata) WHERE type='text' AND (key IN ('title','description') OR length(value)<=256)),d.start_time,d.end_time";
fn band_json(row: &[Option<String>]) -> Result<Value, String> {
    let parse = |text: &Option<String>| -> Result<Value, String> {
        serde_json::from_str(text.as_deref().unwrap_or("null")).map_err(|e| e.to_string())
    };
    Ok(
        serde_json::json!({"id":row[0],"start":parse(&row[1])?,"end":parse(&row[2])?,"first":row[3],"last":row[4],"metadata":parse(&Some(row[5].clone().unwrap_or_else(|| "{}".into())))?,"startTime":row[6],"endTime":row[7]}),
    )
}
/// Viewport bands: durations at least as long as the threshold (shorter ones are summarized),
/// with a bounded projection of title, a notes preview, and short text fields.
fn duration_window(
    db: &Connection,
    lower: &str,
    upper: &str,
    threshold: &str,
) -> Result<Value, String> {
    let rows = interval_window(
        db,
        "duration_intervals",
        "duration_nodes",
        lower,
        upper,
        threshold,
    )?;
    let more = rows.len() > 256;
    let mut bands = Vec::new();
    for row in rows.into_iter().take(256) {
        bands.push(band_json(&row)?);
    }
    Ok(serde_json::json!({"durations":bands,"durationsTruncated":more}))
}
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
    let fits = |n: &str| {
        format!("{n}.min_time<=q(?1) COLLATE RATIONAL_V1 AND {n}.max_time>=q(?2) COLLATE RATIONAL_V1 AND (q_cmp(q(?3),q('0'))=0 OR q_cmp({n}.max_extent,q(?3))>=0)")
    };
    // kind 0: a subtree keyed by its earliest start; kind 1: one node keyed by (start, ID).
    let walk = format!("WITH RECURSIVE walk(kind,node,start,id,hit) AS (\
        SELECT 0,n.id,n.min_time,'',0 FROM {nodes} n WHERE n.id=(SELECT root FROM interval_roots WHERE name='{nodes}') AND {} \
        UNION ALL SELECT 0,c.id,c.min_time,'',0 FROM walk w JOIN {nodes} p ON p.id=w.node JOIN {nodes} c ON c.id IN (p.left_id,p.right_id) WHERE w.kind=0 AND {} \
        UNION ALL SELECT 1,d.ord,d.first,d.id,d.first<=q(?1) COLLATE RATIONAL_V1 AND d.last>=q(?2) COLLATE RATIONAL_V1 AND (q_cmp(q(?3),q('0'))=0 OR q_cmp(d.extent,q(?3))>=0) \
          FROM walk w JOIN {intervals} d ON d.ord=w.node WHERE w.kind=0 \
        ORDER BY 3 COLLATE RATIONAL_V1,1,4) \
      SELECT node FROM walk WHERE kind=1 AND hit LIMIT 257",
        fits("n"),
        fits("c")
    );
    let found: Vec<String> = db
        .query(&walk, &[upper, lower, threshold])?
        .into_iter()
        .filter_map(|r| r[0].clone())
        .collect();
    if found.is_empty() {
        return Ok(Vec::new());
    }
    let ords = serde_json::to_string(&found).map_err(|e| e.to_string())?;
    db.query_limited(
        &format!("SELECT {BAND_COLUMNS} FROM json_each(?1) f JOIN {intervals} d ON d.ord=CAST(f.value AS INTEGER) ORDER BY f.key"),
        &[&ords],
        257,
        8 * 1024 * 1024,
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
/// Durations wholly inside [lower, upper], in start order after an exact (start, ID) cursor.
pub(crate) fn duration_page(
    db: &Connection,
    lower: &str,
    upper: &str,
    after: Option<(&str, &str)>,
    limit: usize,
) -> Result<Value, String> {
    let take = (limit + 1).to_string();
    let (after_first, after_id) = after.unwrap_or(("", ""));
    let sql = format!("SELECT {BAND_COLUMNS} FROM duration_intervals d WHERE d.first>=q(?1) COLLATE RATIONAL_V1 AND d.last<=q(?2) COLLATE RATIONAL_V1 AND (?3='' OR q_cmp(d.first,q(?3))>0 OR (q_cmp(d.first,q(?3))=0 AND d.id>?4)) ORDER BY d.first COLLATE RATIONAL_V1,d.id LIMIT CAST(?5 AS INTEGER)");
    let rows = db.query_limited(
        &sql,
        &[lower, upper, after_first, after_id, &take],
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
/// Exact rational helpers evaluated by the sqlite-rational extension.
fn sign(db: &Connection, sql: &str, parameters: &[&str]) -> Result<i32, String> {
    db.scalar(sql, parameters)?
        .parse::<i32>()
        .map_err(|e| e.to_string())
}
/// (a - b) compared with t.
fn diff_cmp(db: &Connection, a: &str, b: &str, t: &str) -> Result<i32, String> {
    sign(db, "SELECT q_cmp(q_sub(q(?1),q(?2)),q(?3))", &[a, b, t])
}
fn later(db: &Connection, a: &str, b: &str) -> Result<String, String> {
    Ok(if sign(db, "SELECT q_cmp(q(?1),q(?2))", &[a, b])? > 0 {
        a
    } else {
        b
    }
    .to_string())
}
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
    pub first: String,
    pub last: String,
    pub count: u64,
    pub band: Option<Value>,
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
    let collapsed = "q_cmp(d.extent,q(?3))<0 AND q_cmp(d.last,q(?1))>=0 AND d.first<=q(?2)";
    let rows = db.query(
        &format!("WITH RECURSIVE anchors(a) AS (\
           SELECT (SELECT d.first FROM duration_intervals d WHERE d.first>=q_sub(q(?1),q(?3)) AND {collapsed} ORDER BY d.first LIMIT 1) \
           UNION ALL SELECT (SELECT d.first FROM duration_intervals d WHERE d.first>=q_add(a,q(?3)) AND {collapsed} ORDER BY d.first LIMIT 1) \
           FROM anchors WHERE a IS NOT NULL), \
         groups AS (SELECT a,count(*) AS cnt,max(d.last) AS last,min(d.ord) AS one FROM anchors \
           JOIN duration_intervals d ON d.first>=a AND d.first<q_add(a,q(?3)) AND {collapsed} \
           WHERE a IS NOT NULL GROUP BY a) \
         SELECT q(g.a),q(g.last),g.cnt,{BAND_COLUMNS} FROM groups g \
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
        let base = match &open {
            Some((anchor, _, _, _)) if diff_cmp(db, &min, anchor, threshold)? < 0 => anchor.clone(),
            _ => min.clone(),
        };
        let count: u64 = text(2).parse().map_err(|_| "Invalid duration count")?;
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
        });
    }
    Ok(out)
}
/// Merges adjacent summaries while the merged block spans less than the threshold; the same
/// rule as src/summaries.ts coalesceGroups. Groups are JSON frame groups in any order.
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
        out.push(merged);
    }
    Ok(out)
}
