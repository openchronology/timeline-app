// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Disk-backed immutable editing baseline. Ordinary browsing never reads all events.
use super::{check_file, header_document, validate, Connection, Document, Duration, Event};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
const BUDGET: usize = 8 * 1024 * 1024;
#[derive(Serialize)]
pub struct Header {
    pub document: Document,
    pub event_count: String,
    pub first: Option<String>,
    pub last: Option<String>,
}
#[derive(Deserialize)]
pub struct Change {
    pub id: String,
    pub event: Option<Event>,
}
#[derive(Deserialize)]
pub struct DurationChange {
    pub id: String,
    pub duration: Option<Duration>,
}
#[derive(Deserialize)]
pub struct Patch {
    pub settings: Document,
    pub changes: Vec<Change>,
    #[serde(default, rename = "durationChanges")]
    pub duration_changes: Vec<DurationChange>,
}
#[derive(Deserialize)]
pub struct Cursor {
    pub time: String,
    pub id: String,
}
#[derive(Deserialize)]
pub struct Query {
    pub kind: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub lower: String,
    #[serde(default)]
    pub upper: String,
    #[serde(default)]
    pub threshold: String,
    #[serde(default)]
    pub after: Option<Cursor>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub metadata_keys: Vec<String>,
}
pub struct Snapshot {
    directory: PathBuf,
    path: PathBuf,
    query_gate: std::sync::Mutex<()>,
}
impl Drop for Snapshot {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}
impl Snapshot {
    pub fn open(source: &Path) -> Result<Self, String> {
        let directory = std::env::temp_dir().join(format!(
            "och-workspace-{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&directory).map_err(|e| e.to_string())?;
        let snapshot = Self {
            path: directory.join("baseline.och"),
            directory,
            query_gate: std::sync::Mutex::new(()),
        };
        let db = Connection::open(source, false)?;
        db.execute("BEGIN", &[])?;
        check_file(&db)?;
        if db.scalar("SELECT count(*) FROM sqlite_schema WHERE type='trigger'",&[])?!="0" || db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('points_nodes','points_meta') AND type='table'",&[])?!="2" {return Err("Timeline indexes must be data tables and must not contain executable triggers".into());}
        db.backup_to(&snapshot.path)?;
        db.execute("COMMIT", &[])?;
        // Require our real summary index, not a view or an arbitrary virtual-table module.
        let saved = Connection::open(&snapshot.path, true)?;
        let schema = saved.scalar(
            "SELECT sql FROM sqlite_schema WHERE name='points' AND type='table'",
            &[],
        )?;
        if schema
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
            != "create virtual table points using rational_index"
        {
            return Err("Unsupported SQLite rational index".into());
        }
        saved.execute(
            "CREATE INDEX IF NOT EXISTS events_time_id ON events(time COLLATE RATIONAL_V1,id)",
            &[],
        )?;
        super::rebuild_duration_index(&saved)?;
        snapshot.header()?;
        Ok(snapshot)
    }
    pub fn from_document(document: &Document) -> Result<Self, String> {
        // Stage explicit imports on disk before exposing a bounded, indexed baseline.
        let source = std::env::temp_dir().join(format!(
            "och-stage-{}-{}-{}.och",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let created = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&source)
            .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            created
                .set_permissions(std::fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        let result = (|| {
            super::save(&source, document)?;
            Self::open(&source)
        })();
        let _ = std::fs::remove_file(&source);
        result
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn header(&self) -> Result<Header, String> {
        let document = header_document(&self.path)?;
        let mut db = Connection::open(&self.path, false)?;
        db.limit_reads();
        let rows=db.query_limited("SELECT n.first,n.last,CAST(coalesce(n.count,0) AS TEXT) FROM points_meta m LEFT JOIN points_nodes n ON n.id=m.root WHERE m.singleton=1",&[],1,256*1024)?;
        let row = rows.first().ok_or("Missing rational index root")?;
        let count = row[2].clone().ok_or("Missing event count")?;
        count
            .parse::<u64>()
            .map_err(|_| "Invalid rational index count")?;
        if count != "0" && (row[0].is_none() || row[1].is_none()) {
            return Err("Invalid rational index bounds".into());
        }
        Ok(Header {
            document,
            event_count: count,
            first: row[0].clone(),
            last: row[1].clone(),
        })
    }
    pub fn document(&self) -> Result<Document, String> {
        let _gate = self.query_gate.lock().map_err(|e| e.to_string())?;
        super::open(&self.path)
    }
    pub fn query(&self, q: &Query) -> Result<Value, String> {
        let _gate = self.query_gate.lock().map_err(|e| e.to_string())?;
        for value in [&q.lower, &q.upper, &q.threshold] {
            if value.len() > 65536 {
                return Err("Viewport rational exceeds query budget".into());
            }
        }
        if q.metadata_keys.len() > 512
            || q.metadata_keys.iter().any(|key| {
                key.is_empty()
                    || key.len() > 64
                    || !key
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
            })
        {
            return Err("Invalid plugin metadata projection".into());
        }
        let metadata_keys = serde_json::to_string(&q.metadata_keys).map_err(|e| e.to_string())?;
        let mut db = Connection::open(&self.path, false)?;
        db.limit_reads();
        if q.kind == "duration" {
            let id = q.id.as_deref().ok_or("A duration lookup needs its ID")?;
            return Ok(json!({"duration": super::duration_by_id(&db, id)?}));
        }
        if db.scalar("SELECT q_cmp(q(?),q(?))", &[&q.lower, &q.upper])? == "1" {
            return Err("Reversed viewport bounds".into());
        }
        let result = match q.kind.as_str() {
            "overview" => {
                if db.scalar("SELECT q_cmp(q(?),q('0'))", &[&q.threshold])? == "-1" {
                    return Err("Negative grouping threshold".into());
                }
                let threshold = db.scalar(
                    "SELECT q_max(q(?),q_div(q_sub(q(?),q(?)),q('1024')))",
                    &[&q.threshold, &q.upper, &q.lower],
                )?;
                let rows=db.query_limited("SELECT p.time,p.last_time,p.weight,p.distinct_count,p.visited_nodes,e.id,CASE WHEN json_valid(e.metadata) THEN substr(json_extract(e.metadata,'$.title'),1,512) END,CASE WHEN length(CAST(e.metadata AS BLOB))<=2048 THEN e.metadata ELSE (SELECT CASE WHEN length(projected)<=2048 THEN projected ELSE '{}' END FROM (SELECT json_group_object(j.key,CASE WHEN j.type='text' THEN substr(j.value,1,CASE WHEN j.key='description' THEN 512 ELSE 10000 END) ELSE json(j.value) END) AS projected FROM json_each(e.metadata) j WHERE j.key IN (SELECT value FROM json_each(?)) AND (j.type='text' OR (j.type='array' AND length(j.value)<=2048)))) END FROM points p LEFT JOIN events e ON p.weight=1 AND e.time=p.time COLLATE RATIONAL_V1 WHERE p.lower=q(?) AND p.upper=q(?) AND p.include_upper=1 AND p.threshold=q(?) AND p.mode='span' ORDER BY p.time COLLATE RATIONAL_V1 LIMIT 1026",&[&metadata_keys,&q.lower,&q.upper,&threshold],1025,BUDGET)?;
                let mut groups = Vec::new();
                let mut visited = 0u64;
                for row in rows {
                    let mut group = json!({"first":row[0],"last":row[1],"count":row[2],"distinct":row[3].as_deref().unwrap_or("0").parse::<u64>().map_err(|e|e.to_string())?});
                    visited = visited.max(
                        row[4]
                            .as_deref()
                            .unwrap_or("0")
                            .parse::<u64>()
                            .map_err(|e| e.to_string())?,
                    );
                    if let Some(id) = &row[5] {
                        group["id"] = json!(id);
                        group["title"] = json!(row[6].as_deref().unwrap_or(""));
                        group["metadata"] = serde_json::from_str(row[7].as_deref().unwrap_or("{}"))
                            .map_err(|e| e.to_string())?;
                    }
                    groups.push(group);
                }
                {
                    let mut result = super::duration_window(&db, &q.lower, &q.upper)?;
                    result["groups"] = json!(groups);
                    result["visitedNodes"] = json!(visited);
                    result["threshold"] = json!(threshold);
                    result
                }
            }
            "events" if q.id.is_some() => {
                let id = q.id.as_deref().unwrap();
                if id.is_empty()
                    || id.len() > 128
                    || !id
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
                {
                    return Err("Invalid moment identifier".into());
                }
                let rows=db.query_limited("SELECT id,q(time),metadata FROM events WHERE id=? AND time=q(?) COLLATE RATIONAL_V1",&[id,&q.lower],1,BUDGET)?;
                let mut events = Vec::new();
                for row in rows {
                    events.push(Event {
                        id: row[0].clone().ok_or("Missing event id")?,
                        time: row[1].clone().ok_or("Missing event time")?,
                        metadata: serde_json::from_str(
                            row[2].as_deref().ok_or("Missing metadata")?,
                        )
                        .map_err(|e| e.to_string())?,
                    });
                }
                json!({"events":events,"next":null})
            }
            "events" => {
                let limit = q.limit.unwrap_or(100).clamp(1, 100);
                let cursor = q.after.as_ref();
                let time = cursor.map_or(q.lower.as_str(), |c| c.time.as_str());
                let id = cursor.map_or("", |c| c.id.as_str());
                if time.len() > 65536 || id.len() > 128 {
                    return Err("Event cursor exceeds query budget".into());
                }
                let take = (limit + 1).to_string();
                let rows=db.query_limited("SELECT id,q(time),metadata FROM events WHERE time>=q(?) COLLATE RATIONAL_V1 AND time<=q(?) COLLATE RATIONAL_V1 AND (time COLLATE RATIONAL_V1,id)>(q(?),?) ORDER BY time COLLATE RATIONAL_V1,id LIMIT CAST(? AS INTEGER)",&[&q.lower,&q.upper,time,id,&take],101,BUDGET)?;
                let more = rows.len() > limit;
                let mut events = Vec::new();
                for row in rows.into_iter().take(limit) {
                    events.push(Event {
                        id: row[0].clone().ok_or("Missing event id")?,
                        time: row[1].clone().ok_or("Missing event time")?,
                        metadata: serde_json::from_str(
                            row[2].as_deref().ok_or("Missing metadata")?,
                        )
                        .map_err(|e| e.to_string())?,
                    });
                }
                let next = if more {
                    events.last().map(|e| json!({"time":e.time,"id":e.id}))
                } else {
                    None
                };
                json!({"events":events,"next":next})
            }
            _ => return Err("Unsupported local timeline query".into()),
        };
        if result.to_string().len() * 2 > BUDGET {
            return Err("Viewport exceeds webview memory budget".into());
        }
        Ok(result)
    }
    pub fn save_patch(&self, target: &Path, patch: &Patch) -> Result<Self, String> {
        let _gate = self.query_gate.lock().map_err(|e| e.to_string())?;
        validate(&patch.settings)?;
        if !patch.settings.events.is_empty()
            || !patch.settings.durations.is_empty()
            || patch.changes.len() + patch.duration_changes.len() > 200000
        {
            return Err("Invalid sparse changes".into());
        }
        let staged = Self::open(&self.path)?;
        let db = Connection::open(&staged.path, true)?;
        db.execute("BEGIN IMMEDIATE", &[])?;
        let result = (|| {
            let schema = db.scalar("SELECT sql FROM sqlite_schema WHERE name='events'", &[])?;
            if schema.to_lowercase().contains("json_valid") {
                db.execute("CREATE TABLE _och_clean_events(id TEXT PRIMARY KEY,time TEXT NOT NULL COLLATE RATIONAL_V1 CHECK(q_is_canonical(time)=1),metadata TEXT NOT NULL) STRICT",&[])?;
                db.execute(
                    "INSERT INTO _och_clean_events SELECT id,q(time),metadata FROM events",
                    &[],
                )?;
                db.execute("DROP TABLE events", &[])?;
                db.execute("ALTER TABLE _och_clean_events RENAME TO events", &[])?;
                db.execute(
                    "CREATE INDEX events_time_id ON events(time COLLATE RATIONAL_V1,id)",
                    &[],
                )?;
            }
            let mut affected = std::collections::HashSet::new();
            let mut ids = std::collections::HashSet::new();
            // Saved times of deleted moments; durations that followed them keep these times.
            let mut retired = Vec::new();
            for change in patch.changes.iter().filter(|c| c.event.is_none()) {
                if let Some(time) = db
                    .query("SELECT time FROM events WHERE id=?", &[&change.id])?
                    .first()
                    .and_then(|r| r[0].clone())
                {
                    retired.push((change.id.clone(), time));
                }
            }
            let mut durations = std::collections::HashSet::new();
            for change in &patch.duration_changes {
                if !durations.insert(&change.id) {
                    return Err("Duplicate sparse duration change".into());
                }
                match &change.duration {
                    Some(duration) => {
                        if duration.id != change.id {
                            return Err("Mismatched sparse duration id".into());
                        }
                        let mut doc = patch.settings.clone();
                        doc.events = Vec::new();
                        doc.durations = vec![Duration {
                            // Anchors are checked against stored moments when the index rebuilds.
                            start: anchorless(&duration.start),
                            end: anchorless(&duration.end),
                            ..duration.clone()
                        }];
                        validate(&doc)?;
                        super::insert_duration(&db, duration)?;
                    }
                    None => db.execute("DELETE FROM durations WHERE id=?", &[&change.id])?,
                }
            }
            for change in &patch.changes {
                if !ids.insert(&change.id) {
                    return Err("Duplicate sparse change".into());
                }
                if let Some(old) = db
                    .query("SELECT time FROM events WHERE id=?", &[&change.id])?
                    .first()
                    .and_then(|r| r[0].clone())
                {
                    affected.insert(old);
                }
                if let Some(event) = &change.event {
                    if event.id != change.id {
                        return Err("Mismatched sparse event id".into());
                    }
                    let mut doc = patch.settings.clone();
                    doc.events = vec![event.clone()];
                    validate(&doc)?;
                    let time = db.scalar("SELECT q(?)", &[&event.time])?;
                    affected.insert(time.clone());
                    db.execute("INSERT INTO events(id,time,metadata) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET time=excluded.time,metadata=excluded.metadata",&[&event.id,&time,&serde_json::to_string(&event.metadata).map_err(|e|e.to_string())?])?;
                } else {
                    db.execute("DELETE FROM events WHERE id=?", &[&change.id])?;
                }
            }
            for (id, time) in &retired {
                if db.scalar("SELECT count(*) FROM events WHERE id=?", &[id])? == "0" {
                    db.execute("UPDATE durations SET start_time=?1,start_moment=NULL WHERE start_moment=?2", &[time, id])?;
                    db.execute(
                        "UPDATE durations SET end_time=?1,end_moment=NULL WHERE end_moment=?2",
                        &[time, id],
                    )?;
                }
            }
            super::rebuild_duration_index(&db)?;
            for time in affected {
                db.execute("DELETE FROM points WHERE time=q(?)", &[&time])?;
                db.execute("INSERT INTO points(time,value,weight) SELECT time,time,count(*) FROM events WHERE time=q(?) COLLATE RATIONAL_V1 GROUP BY time COLLATE RATIONAL_V1",&[&time])?;
            }
            for table in ["timeline_settings", "timeline_plugins", "timeline_extras"] {
                db.execute(&format!("DROP TABLE IF EXISTS {table}"), &[])?;
            }
            db.execute(
                "UPDATE timeline_meta SET title=?,description=? WHERE singleton=1",
                &[&patch.settings.title, &patch.settings.description],
            )?;
            db.execute("CREATE TABLE IF NOT EXISTS timeline_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),presentation TEXT NOT NULL)",&[])?;
            db.execute("DELETE FROM timeline_settings", &[])?;
            if let Some(value) = &patch.settings.presentation {
                db.execute(
                    "INSERT INTO timeline_settings VALUES(1,?)",
                    &[&value.to_string()],
                )?;
            }
            db.execute("CREATE TABLE IF NOT EXISTS timeline_plugins(singleton INTEGER PRIMARY KEY CHECK(singleton=1),plugins TEXT NOT NULL)",&[])?;
            db.execute("DELETE FROM timeline_plugins", &[])?;
            if let Some(value) = &patch.settings.plugins {
                db.execute(
                    "INSERT INTO timeline_plugins VALUES(1,?)",
                    &[&value.to_string()],
                )?;
            }
            db.execute("CREATE TABLE IF NOT EXISTS timeline_extras(singleton INTEGER PRIMARY KEY CHECK(singleton=1),extras TEXT NOT NULL)",&[])?;
            db.execute("DELETE FROM timeline_extras", &[])?;
            db.execute(
                "INSERT INTO timeline_extras VALUES(1,?)",
                &[&json!({"tags":patch.settings.tags,"assets":patch.settings.assets}).to_string()],
            )?;
            db.execute("COMMIT", &[])
        })();
        if result.is_err() {
            let _ = db.execute("ROLLBACK", &[]);
        }
        result?;
        let destination = Connection::open(target, true)?;
        let id = destination.scalar("PRAGMA application_id", &[])?;
        if id == super::APPLICATION_ID {
            check_file(&destination)?;
        } else if id != "0"
            || destination.scalar(
                "SELECT count(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
                &[],
            )? != "0"
        {
            return Err("Refusing to replace an unrelated SQLite database".into());
        }
        drop(destination);
        db.backup_to(target)?;
        Ok(staged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document() -> Document {
        serde_json::from_value(json!({"format":"openchronology","version":1,"title":"Viewport test","description":"","plugins":[],"events":[]})).unwrap()
    }
    fn query(kind: &str, lower: &str, upper: &str, threshold: &str) -> Query {
        serde_json::from_value(
            json!({"kind":kind,"lower":lower,"upper":upper,"threshold":threshold,"limit":100}),
        )
        .unwrap()
    }
    fn path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "och-workspace-test-{}-{}.och",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ))
    }
    #[test]
    fn sqlite_windows_are_opaque_bounded_and_refine_without_loading_document() {
        let path = path();
        let mut doc = document();
        for i in 0..20000 {
            doc.events.push(Event {
                id: format!("dense-{i:05}"),
                time: format!("{i}/1000000"),
                metadata: serde_json::from_value(
                    json!({"title":format!("Moment {i}"),"description":"x".repeat(4096)}),
                )
                .unwrap(),
            });
        }
        doc.events.push(Event {
            id: "far".into(),
            time: "1000000000".into(),
            metadata: serde_json::from_value(
                json!({"title":"Far away","icon":"https://example.com/icon.png"}),
            )
            .unwrap(),
        });
        super::super::save(&path, &doc).unwrap();
        let snapshot = Snapshot::open(&path).unwrap();
        let header = snapshot.header().unwrap();
        assert!(header.document.events.is_empty());
        assert_eq!(header.event_count, "20001");
        let coarse = snapshot
            .query(&query("overview", "0", "1000000000", "100000000"))
            .unwrap();
        assert_eq!(coarse["groups"].as_array().unwrap().len(), 2);
        assert_eq!(coarse["groups"][0]["count"], "20000");
        assert!(coarse["groups"][0].get("metadata").is_none());
        assert_eq!(
            coarse["groups"][1]["metadata"]["icon"],
            "https://example.com/icon.png"
        );
        assert!(coarse["visitedNodes"].as_u64().unwrap() < 200);
        let fine = snapshot
            .query(&query("overview", "0", "1/1000000", "0"))
            .unwrap();
        assert_eq!(fine["groups"].as_array().unwrap().len(), 2);
        assert_eq!(fine["groups"][0]["metadata"], json!({}));
        let bounded = snapshot.query(&query("overview", "0", "1", "0")).unwrap();
        assert!(bounded["groups"].as_array().unwrap().len() <= 1025);
        assert!(bounded.to_string().len() < 1024 * 1024);
        let page = snapshot.query(&query("events", "0", "1", "0")).unwrap();
        assert_eq!(page["events"].as_array().unwrap().len(), 100);
        assert_eq!(
            page["events"][0]["metadata"]["description"]
                .as_str()
                .unwrap()
                .len(),
            4096
        );
        let mut next = query("events", "0", "1", "0");
        next.after = Some(serde_json::from_value(page["next"].clone()).unwrap());
        let page2 = snapshot.query(&next).unwrap();
        assert_ne!(page["events"][0]["id"], page2["events"][0]["id"]);
        let directory = snapshot.directory.clone();
        drop(snapshot);
        assert!(!directory.exists());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn sparse_save_preserves_hidden_events_and_settings_and_failure_is_atomic() {
        let path = path();
        let mut doc = document();
        doc.events = vec![
            Event {
                id: "a".into(),
                time: "1/3".into(),
                metadata: serde_json::Map::new(),
            },
            Event {
                id: "b".into(),
                time: "2/3".into(),
                metadata: serde_json::Map::new(),
            },
            Event {
                id: "hidden".into(),
                time: "100000000000000000000".into(),
                metadata: serde_json::from_value(json!({"secret":"preserved"})).unwrap(),
            },
        ];
        super::super::save(&path, &doc).unwrap();
        let source = Snapshot::open(&path).unwrap();
        let mut settings = source.header().unwrap().document;
        settings.title = "Changed".into();
        settings.presentation = Some(json!({"mode":"custom","source":"custom printer"}));
        settings.plugins = Some(json!([{"script":"kept"}]));
        let patch:Patch=serde_json::from_value(json!({"settings":settings,"changes":[{"id":"a","event":{"id":"a","time":"2/3","metadata":{"title":"moved"}}},{"id":"b","event":null},{"id":"new","event":{"id":"new","time":"2/3","metadata":{}}}]})).unwrap();
        let updated = source.save_patch(&path, &patch).unwrap();
        assert_eq!(source.header().unwrap().document.title, "Viewport test");
        let saved = super::super::open(&path).unwrap();
        assert_eq!(saved.title, "Changed");
        assert_eq!(saved.events.len(), 3);
        assert!(saved
            .events
            .iter()
            .any(|e| e.id == "hidden" && e.metadata["secret"] == "preserved"));
        assert_eq!(saved.presentation, settings.presentation);
        assert_eq!(saved.plugins, settings.plugins);
        let groups = updated.query(&query("overview", "0", "1", "0")).unwrap();
        assert_eq!(groups["groups"][0]["count"], "2");
        let bad:Patch=serde_json::from_value(json!({"settings":settings,"changes":[{"id":"a","event":{"id":"a","time":"1/0","metadata":{}}}]})).unwrap();
        assert!(updated.save_patch(&path, &bad).is_err());
        assert_eq!(super::super::open(&path).unwrap(), saved);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn coincident_entries_paginate_by_id_and_excessive_metadata_is_rejected_before_ipc() {
        let path = path();
        let mut doc = document();
        for i in 0..105 {
            doc.events.push(Event {
                id: format!("id-{i:03}"),
                time: "1/2".into(),
                metadata: serde_json::Map::new(),
            });
        }
        super::super::save(&path, &doc).unwrap();
        let source = Snapshot::open(&path).unwrap();
        let first = source.query(&query("events", "1/2", "1/2", "0")).unwrap();
        let mut next = query("events", "1/2", "1/2", "0");
        next.after = Some(serde_json::from_value(first["next"].clone()).unwrap());
        let last = source.query(&next).unwrap();
        assert_eq!(last["events"].as_array().unwrap().len(), 5);
        assert!(last["next"].is_null());
        assert!(source.query(&query("overview", "1", "0", "0")).is_err());
        assert!(source.query(&query("overview", "0", "1", "-1")).is_err());
        doc.events[0]
            .metadata
            .insert("description".into(), json!("x".repeat(BUDGET + 1)));
        super::super::save(&path, &doc).unwrap();
        let large = Snapshot::open(&path).unwrap();
        assert!(large.query(&query("events", "0", "1", "0")).is_err());
        std::fs::remove_file(path).unwrap();
    }
}

#[cfg(test)]
mod legacy_tests {
    use super::*;
    #[test]
    fn staged_imports_and_legacy_json_constraints_remain_disk_backed() {
        let document:Document=serde_json::from_value(json!({"format":"openchronology","version":1,"title":"Imported","description":"","events":[{"id":"a","time":"1/7","metadata":{"title":"original"}}]})).unwrap();
        let baseline = Snapshot::from_document(&document).unwrap();
        let path = baseline.path().to_path_buf();
        let db = Connection::open(&path, true).unwrap();
        db.execute("ALTER TABLE events RENAME TO old_events", &[])
            .unwrap();
        db.execute("CREATE TABLE events(id TEXT PRIMARY KEY,time TEXT NOT NULL COLLATE RATIONAL_V1,metadata TEXT NOT NULL CHECK(json_valid(metadata)))",&[]).unwrap();
        db.execute("PRAGMA trusted_schema=ON", &[]).unwrap();
        db.execute("INSERT INTO events SELECT * FROM old_events", &[])
            .unwrap();
        db.execute("DROP TABLE old_events", &[]).unwrap();
        drop(db);
        let source = Snapshot::open(&path).unwrap();
        let header = source.header().unwrap();
        assert!(header.document.events.is_empty());
        let patch:Patch=serde_json::from_value(json!({"settings":header.document,"changes":[{"id":"a","event":{"id":"a","time":"2/7","metadata":{"title":"edited"}}}]})).unwrap();
        let target = baseline.directory.join("saved.och");
        let saved = source.save_patch(&target, &patch).unwrap();
        assert_eq!(saved.document().unwrap().events[0].time, "2/7");
        drop(saved);
        drop(source);
        drop(baseline);
        assert!(!path.exists());
    }
}

#[cfg(test)]
mod safety_tests {
    use super::*;
    #[test]
    fn snapshots_reject_executable_triggers_and_fake_index_shadow_tables() {
        let document:Document=serde_json::from_value(json!({"format":"openchronology","version":1,"title":"Safe","description":"","events":[]})).unwrap();
        let baseline = Snapshot::from_document(&document).unwrap();
        let path = baseline.path();
        let db = Connection::open(path, true).unwrap();
        db.execute(
            "CREATE TRIGGER injected AFTER INSERT ON events BEGIN DELETE FROM timeline_meta; END",
            &[],
        )
        .unwrap();
        assert!(Snapshot::open(path).is_err());
        db.execute("DROP TRIGGER injected", &[]).unwrap();
        db.execute("ALTER TABLE points_nodes RENAME TO real_nodes", &[])
            .unwrap();
        db.execute("CREATE VIEW points_nodes AS SELECT * FROM real_nodes", &[])
            .unwrap();
        assert!(Snapshot::open(path).is_err());
    }
}

#[cfg(test)]
mod duration_tests {
    use super::*;
    fn spans(snapshot: &Snapshot, query: &Query) -> Vec<(String, String, String)> {
        let frame = snapshot.query(query).unwrap();
        let mut bands: Vec<_> = frame["durations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| {
                (
                    b["id"].as_str().unwrap().to_string(),
                    b["first"].as_str().unwrap().to_string(),
                    b["last"].as_str().unwrap().to_string(),
                )
            })
            .collect();
        bands.sort();
        bands
    }
    #[test]
    fn legacy_links_convert_and_anchored_bands_follow_sparse_moment_edits() {
        let doc:Document=serde_json::from_value(json!({"format":"openchronology","version":1,"title":"Durations","description":"","events":[{"id":"a","time":"-100/1","metadata":{"durations":[{"id":"span","endId":"b","metadata":{"title":"Band","custom":true}}]}},{"id":"b","time":"100/1","metadata":{}}]})).unwrap();
        let snapshot = Snapshot::from_document(&doc).unwrap();
        let query: Query = serde_json::from_value(
            json!({"kind":"overview","lower":"0/1","upper":"1/1","threshold":"0/1"}),
        )
        .unwrap();
        let endpoint: Query = serde_json::from_value(
            json!({"kind":"events","id":"b","lower":"100/1","upper":"100/1"}),
        )
        .unwrap();
        assert_eq!(snapshot.query(&endpoint).unwrap()["events"][0]["id"], "b");
        let frame = snapshot.query(&query).unwrap();
        assert_eq!(frame["groups"].as_array().unwrap().len(), 0);
        assert_eq!(frame["durations"][0]["start"], json!({"moment":"a"}));
        assert_eq!(frame["durations"][0]["first"], "-100/1");
        assert_eq!(frame["durations"][0]["last"], "100/1");
        // Legacy links leave moment metadata and become standalone durations.
        let saved = snapshot.document().unwrap();
        assert!(!saved.events[0].metadata.contains_key("durations"));
        assert_eq!(saved.durations[0].metadata["custom"], true);
        let lookup: Query = serde_json::from_value(json!({"kind":"duration","id":"span"})).unwrap();
        assert_eq!(
            snapshot.query(&lookup).unwrap()["duration"]["end"],
            json!({"moment":"b"})
        );
        let settings = snapshot.header().unwrap().document;
        let patch:Patch=serde_json::from_value(json!({"settings":settings,"changes":[{"id":"b","event":{"id":"b","time":"1/3","metadata":{}}}]})).unwrap();
        let target = snapshot.directory.join("updated.och");
        let moved = snapshot.save_patch(&target, &patch).unwrap();
        assert_eq!(moved.query(&query).unwrap()["durations"][0]["last"], "1/3");
        // Deleting a moment pins the duration at the moment's last saved time.
        let deleted: Patch = serde_json::from_value(
            json!({"settings":settings,"changes":[{"id":"b","event":null}]}),
        )
        .unwrap();
        let removed = moved.save_patch(&target, &deleted).unwrap();
        assert_eq!(
            removed.query(&query).unwrap()["durations"][0]["last"],
            "1/3"
        );
        assert_eq!(removed.document().unwrap().durations[0].end, json!("1/3"));
        let mut invalid = doc.clone();
        invalid.events[0].metadata["durations"][0]["endId"] = json!("absent");
        assert!(Snapshot::from_document(&invalid).is_err());
    }
    #[test]
    fn standalone_durations_save_sparse_changes_and_reject_unknown_anchors() {
        let doc:Document=serde_json::from_value(json!({"format":"openchronology","version":1,"title":"Durations","description":"","events":[{"id":"a","time":"0/1","metadata":{}}],"durations":[{"id":"fixed","start":"-5/1","end":"1/3","metadata":{"title":"Fixed"}},{"id":"mixed","start":{"moment":"a"},"end":"2/1","metadata":{}}]})).unwrap();
        let snapshot = Snapshot::from_document(&doc).unwrap();
        let query: Query = serde_json::from_value(
            json!({"kind":"overview","lower":"-1/1","upper":"1/1","threshold":"0/1"}),
        )
        .unwrap();
        assert_eq!(
            spans(&snapshot, &query),
            vec![
                ("fixed".into(), "-5/1".into(), "1/3".into()),
                ("mixed".into(), "0/1".into(), "2/1".into())
            ]
        );
        assert_eq!(snapshot.document().unwrap().durations, doc.durations);
        let settings = snapshot.header().unwrap().document;
        let target = snapshot.directory.join("updated.och");
        let patch:Patch=serde_json::from_value(json!({"settings":settings,"changes":[],"durationChanges":[{"id":"fixed","duration":null},{"id":"new","duration":{"id":"new","start":"1/2","end":{"moment":"a"},"metadata":{"title":"New"}}}]})).unwrap();
        let updated = snapshot.save_patch(&target, &patch).unwrap();
        assert_eq!(
            spans(&updated, &query),
            vec![
                ("mixed".into(), "0/1".into(), "2/1".into()),
                ("new".into(), "0/1".into(), "1/2".into())
            ]
        );
        let unknown:Patch=serde_json::from_value(json!({"settings":settings,"changes":[],"durationChanges":[{"id":"bad","duration":{"id":"bad","start":{"moment":"absent"},"end":"1/1","metadata":{}}}]})).unwrap();
        assert!(updated.save_patch(&target, &unknown).is_err());
        let mut invalid = doc.clone();
        invalid.durations[0].start = json!("not a rational");
        assert!(Snapshot::from_document(&invalid).is_err());
        invalid.durations[0].start = json!({"moment":"absent"});
        assert!(Snapshot::from_document(&invalid).is_err());
    }
}
/// Validation placeholder for an anchor, so a single duration validates without its moments.
fn anchorless(endpoint: &Value) -> Value {
    if endpoint.is_object() {
        json!("0/1")
    } else {
        endpoint.clone()
    }
}
