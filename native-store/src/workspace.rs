// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Disk-backed immutable editing baseline. Ordinary browsing never reads all events.
use super::{
    check_file, header_document, intervals, validate, Connection, Document, Duration, Event,
};
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
    #[serde(default, rename = "relationshipChanges")]
    pub relationship_changes: Vec<RelationshipChange>,
}
#[derive(Deserialize)]
pub struct RelationshipChange {
    pub a: Value,
    pub b: Value,
    pub related: bool,
}
#[derive(Deserialize, Clone)]
pub struct Cursor {
    /// Event pages use `time`; duration pages order by start and send `first`; related
    /// pages order by entity kind and send `kind`.
    #[serde(alias = "first", alias = "kind")]
    pub time: String,
    pub id: String,
}
/// One side of a tag separation: entities with any of the tags, or with none of them.
#[derive(Deserialize, Clone)]
pub struct ViewFilter {
    #[serde(default)]
    pub tags: Vec<String>,
    pub mode: String,
    /// Relationship separations: the entity and how far to follow links.
    #[serde(default)]
    pub related: Option<Value>,
    #[serde(default)]
    pub depth: Option<String>,
}
#[derive(Deserialize, Clone)]
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
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub page: Option<usize>,
    #[serde(default)]
    pub filter: Option<ViewFilter>,
    /// The entity of a `related` query.
    #[serde(default)]
    pub entity: Option<Value>,
}
/// A private temporary directory, removed with the last snapshot that uses it.
struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
pub struct Snapshot {
    directory: std::sync::Arc<Directory>,
    path: PathBuf,
    query_gate: std::sync::Mutex<()>,
    /// Derived indexes for tag separations, built from this baseline on first use.
    views: std::sync::Mutex<Vec<(String, std::sync::Arc<Snapshot>)>>,
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
            directory: std::sync::Arc::new(Directory(directory)),
            query_gate: std::sync::Mutex::new(()),
            views: std::sync::Mutex::new(Vec::new()),
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
        // Files saved with the current index layout open as exact copies, so later saves can
        // apply the same changes to the file in place. Older files get rebuilt indexes and a
        // token no file has; their first save writes the whole file.
        if !current_layout(&saved)? {
            super::rebuild_duration_index(&saved)?;
            super::rebuild_edge_index(&saved)?;
            intervals::set_layout(&saved, &format!("rebuilt-{}", intervals::token()))?;
        }
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
    #[cfg(test)]
    fn directory(&self) -> &Path {
        &self.directory.0
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
    /// The derived snapshot for one side of a tag separation. The baseline is immutable, so a
    /// view stays valid for the baseline's lifetime; the two most recent are kept.
    fn view(&self, filter: &ViewFilter) -> Result<std::sync::Arc<Snapshot>, String> {
        if !matches!(filter.mode.as_str(), "any" | "none") {
            return Err("A separation filter needs a mode".into());
        }
        let membership = if let Some(entity) = &filter.related {
            let (kind, id) = super::entity_ref(entity)?;
            let direct = match filter.depth.as_deref() {
                Some("direct") => true,
                Some("all") => false,
                _ => return Err("A relationship filter needs a depth".into()),
            };
            super::Membership::Related {
                start: format!("{}:{}", if kind == "moment" { "m" } else { "d" }, id),
                direct,
            }
        } else {
            let mut tags: Vec<String> = filter
                .tags
                .iter()
                .map(|t| t.trim().to_lowercase())
                .collect();
            tags.sort();
            tags.dedup();
            if tags.is_empty() || tags.len() > 40 {
                return Err("A tag filter needs one to forty tags and a mode".into());
            }
            super::Membership::Tags(tags)
        };
        let key = match &membership {
            super::Membership::Tags(tags) => format!("{}:{}", filter.mode, tags.join(",")),
            super::Membership::Related { start, direct } => format!(
                "{}:related:{}:{}",
                filter.mode,
                if *direct { "direct" } else { "all" },
                start
            ),
        };
        if let Some((_, view)) = self
            .views
            .lock()
            .map_err(|e| e.to_string())?
            .iter()
            .find(|(k, _)| *k == key)
        {
            return Ok(view.clone());
        }
        let document = super::filter_document(self.document()?, &membership, filter.mode == "any");
        let view = std::sync::Arc::new(Self::from_document(&document)?);
        let mut views = self.views.lock().map_err(|e| e.to_string())?;
        views.retain(|(k, _)| *k != key);
        views.push((key, view.clone()));
        if views.len() > 2 {
            views.remove(0);
        }
        Ok(view)
    }
    pub fn query(&self, q: &Query) -> Result<Value, String> {
        if let Some(filter) = &q.filter {
            let view = self.view(filter)?;
            return view.query(&Query {
                filter: None,
                ..q.clone()
            });
        }
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
        if q.kind == "search" {
            return search(&db, &q.text, q.page.unwrap_or(1));
        }
        if q.kind == "tags" {
            let rows = db.query_limited("SELECT t.value,count(*) FROM (SELECT metadata FROM events UNION ALL SELECT metadata FROM durations) e,json_each(e.metadata,'$.tags') t WHERE json_type(e.metadata,'$.tags')='array' AND t.type='text' GROUP BY t.value ORDER BY count(*) DESC,t.value LIMIT 200", &[], 200, BUDGET)?;
            let tags: Vec<Value> = rows
                .into_iter()
                .map(|r| json!({"tag": r[0], "count": r[1].as_deref().unwrap_or("0").parse::<u64>().unwrap_or(0)}))
                .collect();
            return Ok(json!({ "tags": tags }));
        }
        if q.kind == "related" {
            let entity = q.entity.as_ref().ok_or("A related query needs an entity")?;
            let (kind, id) = super::entity_ref(entity)?;
            let after = q.after.as_ref();
            return related(
                &db,
                kind,
                id,
                after.map(|c| (c.time.as_str(), c.id.as_str())),
                q.limit.unwrap_or(25).clamp(1, 100),
            );
        }
        if q.kind == "durations" {
            let after = q.after.as_ref();
            if after.is_some_and(|c| c.id.len() > 128 || c.time.len() > 65536) {
                return Err("Duration cursor exceeds query budget".into());
            }
            return super::duration_page(
                &db,
                &q.lower,
                &q.upper,
                after.map(|c| (c.time.as_str(), c.id.as_str())),
                q.limit.unwrap_or(25).clamp(1, 100),
            );
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
                    let mut result = super::duration_window(&db, &q.lower, &q.upper, &threshold)?;
                    let arcs = super::edge_window(&db, &q.lower, &q.upper, &threshold)?;
                    result["edges"] = arcs["edges"].clone();
                    result["edgesTruncated"] = arcs["edgesTruncated"].clone();
                    let clusters = super::duration_summaries(&db, &q.lower, &q.upper, &threshold)?;
                    if !clusters.is_empty() {
                        for c in clusters {
                            let mut group = json!({"first":c.first,"last":c.last,"count":"0","distinct":0,"durationCount":c.count.to_string()});
                            if let Some(band) = c.band {
                                group["duration"] = band;
                            }
                            groups.push(group);
                        }
                        groups = super::coalesce_groups(&db, groups, &threshold)?;
                    }
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
    /// Saves sparse changes to `target` and returns the new baseline. When `target` holds
    /// exactly this baseline's saved state (same index layout and save token), the changes
    /// are applied to the file and then to the baseline in place, in time proportional to
    /// the change; otherwise a changed copy of the baseline replaces the file.
    pub fn save_patch(&self, target: &Path, patch: &Patch) -> Result<Self, String> {
        let _gate = self.query_gate.lock().map_err(|e| e.to_string())?;
        validate(&patch.settings)?;
        if !patch.settings.events.is_empty()
            || !patch.settings.durations.is_empty()
            || patch.changes.len() + patch.duration_changes.len() > 200000
        {
            return Err("Invalid sparse changes".into());
        }
        let token = intervals::token();
        let baseline = intervals::layout(&Connection::open(&self.path, false)?)?;
        if let Some(destination) = matching_file(target, baseline.map(|(_, t)| t))? {
            apply(&destination, patch, &token)?;
            drop(destination);
            let db = Connection::open(&self.path, true)?;
            if apply(&db, patch, &token).is_err() {
                // The file is saved; take a fresh baseline from it.
                drop(db);
                return Self::open(target);
            }
            return Ok(Self {
                directory: self.directory.clone(),
                path: self.path.clone(),
                query_gate: std::sync::Mutex::new(()),
                views: std::sync::Mutex::new(Vec::new()),
            });
        }
        let staged = Self::open(&self.path)?;
        let db = Connection::open(&staged.path, true)?;
        apply(&db, patch, &token)?;
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
/// Whether a file's interval indexes use the current layout.
fn current_layout(db: &Connection) -> Result<bool, String> {
    Ok(intervals::layout(db)?.is_some_and(|(version, _)| version == intervals::LAYOUT)
        && db.scalar(
            "SELECT count(*) FROM sqlite_schema WHERE name IN ('interval_roots','duration_nodes','edge_nodes','duration_intervals','edge_intervals') AND type='table'",
            &[],
        )? == "5")
}
/// The target, opened for writing, if it is a valid timeline holding the baseline's state.
fn matching_file(target: &Path, token: Option<String>) -> Result<Option<Connection>, String> {
    let Some(token) = token else { return Ok(None) };
    if token.starts_with("rebuilt-") || !target.is_file() {
        return Ok(None);
    }
    let db = Connection::open(target, true)?;
    if db.scalar("PRAGMA application_id", &[])? != super::APPLICATION_ID
        || check_file(&db).is_err()
        || db.scalar("SELECT count(*) FROM sqlite_schema WHERE type='trigger'", &[])? != "0"
        || db.scalar("SELECT count(*) FROM sqlite_schema WHERE name IN ('points_nodes','points_meta') AND type='table'", &[])? != "2"
        || !current_layout(&db)?
        || intervals::layout(&db)?.map(|(_, t)| t) != Some(token)
    {
        return Ok(None);
    }
    Ok(Some(db))
}
/// Applies sparse changes in one transaction, updating the moment index per changed time
/// and the duration and arc trees per changed interval; nothing else is rebuilt.
fn apply(db: &Connection, patch: &Patch, token: &str) -> Result<(), String> {
    db.execute("BEGIN IMMEDIATE", &[])?;
    let result = apply_changes(db, patch, token).and_then(|()| db.execute("COMMIT", &[]));
    if result.is_err() {
        let _ = db.execute("ROLLBACK", &[]);
    }
    result
}
fn apply_changes(db: &Connection, patch: &Patch, token: &str) -> Result<(), String> {
    use std::collections::{BTreeMap, BTreeSet};
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
    let mut affected = BTreeSet::new();
    let mut ids = std::collections::HashSet::new();
    // Moments whose time changed or that were deleted: their durations and arcs move.
    let mut moved = BTreeSet::new();
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
    let mut durations = BTreeSet::new();
    for change in &patch.duration_changes {
        if !durations.insert(change.id.clone()) {
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
                    // Anchors are checked against stored moments below.
                    start: anchorless(&duration.start),
                    end: anchorless(&duration.end),
                    ..duration.clone()
                }];
                validate(&doc)?;
                super::insert_duration(db, duration)?;
            }
            None => db.execute("DELETE FROM durations WHERE id=?", &[&change.id])?,
        }
    }
    for change in &patch.changes {
        if !ids.insert(&change.id) {
            return Err("Duplicate sparse change".into());
        }
        let old = db
            .query("SELECT time FROM events WHERE id=?", &[&change.id])?
            .first()
            .and_then(|r| r[0].clone());
        if let Some(old) = &old {
            affected.insert(old.clone());
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
            if old.as_ref().is_some_and(|old| *old != time) {
                moved.insert(change.id.clone());
            }
            db.execute("INSERT INTO events(id,time,metadata) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET time=excluded.time,metadata=excluded.metadata",&[&event.id,&time,&serde_json::to_string(&event.metadata).map_err(|e|e.to_string())?])?;
        } else {
            if old.is_some() {
                moved.insert(change.id.clone());
            }
            db.execute("DELETE FROM events WHERE id=?", &[&change.id])?;
        }
    }
    // Durations to place again: changed ones and those anchored to moved moments.
    for moment in &moved {
        for row in db.query(
            "SELECT id FROM durations WHERE start_moment=?1 UNION SELECT id FROM durations WHERE end_moment=?1",
            &[moment],
        )? {
            durations.insert(row[0].clone().ok_or("Missing duration ID")?);
        }
    }
    for (id, time) in &retired {
        if db.scalar("SELECT count(*) FROM events WHERE id=?", &[id])? == "0" {
            db.execute(
                "UPDATE durations SET start_time=?1,start_moment=NULL WHERE start_moment=?2",
                &[time, id],
            )?;
            db.execute(
                "UPDATE durations SET end_time=?1,end_moment=NULL WHERE end_moment=?2",
                &[time, id],
            )?;
        }
    }
    let mut tree = intervals::Tree::open(db, "duration_intervals", "duration_nodes")?;
    // Durations whose start (where their arcs attach) moved, or that were deleted.
    let mut moved_durations = BTreeSet::new();
    for id in &durations {
        let before = db
            .query(
                "SELECT start_time FROM duration_intervals WHERE id=?1",
                &[id],
            )?
            .first()
            .and_then(|r| r[0].clone());
        tree.remove(id)?;
        let rows = db.query("SELECT CASE WHEN d.start_moment IS NULL THEN json_quote(d.start_time) ELSE json_object('moment',d.start_moment) END,CASE WHEN d.end_moment IS NULL THEN json_quote(d.end_time) ELSE json_object('moment',d.end_moment) END,COALESCE(d.start_time,(SELECT e.time FROM events e WHERE e.id=d.start_moment)),COALESCE(d.end_time,(SELECT e.time FROM events e WHERE e.id=d.end_moment)),d.metadata FROM durations d WHERE d.id=?1", &[id])?;
        let after = match rows.first() {
            Some(r) => {
                let (Some(start), Some(end)) = (&r[2], &r[3]) else {
                    return Err("Duration anchors must name existing moments".into());
                };
                let text = |i: usize| r[i].clone().ok_or("Invalid stored duration");
                tree.insert(&intervals::Interval {
                    id,
                    start_json: &text(0)?,
                    end_json: &text(1)?,
                    start,
                    end,
                    metadata: &text(4)?,
                })?;
                Some(db.scalar(
                    "SELECT start_time FROM duration_intervals WHERE id=?1",
                    &[id],
                )?)
            }
            None => None,
        };
        if before.is_some() && before != after {
            moved_durations.insert(id.clone());
        }
    }
    if tree.size()? > 200000 {
        return Err("Use at most 200000 durations per timeline".into());
    }
    tree.flush()?;
    // Links: deleted entities lose theirs, then the patch's own changes (the last one wins).
    super::create_relationship_table(db)?;
    let key = |a: (&str, &str), b: (&str, &str)| {
        let side =
            |(k, i): (&str, &str)| format!("{}:{}", if k == "moment" { "m" } else { "d" }, i);
        format!("{}~{}", side(a), side(b))
    };
    let mut touched = BTreeSet::new();
    let removed = moved
        .iter()
        .map(|m| ("moment", m.clone()))
        .chain(moved_durations.iter().map(|d| ("duration", d.clone())))
        .collect::<Vec<_>>();
    let mut placed = BTreeMap::new();
    for (kind, id) in &removed {
        let exists = if *kind == "moment" {
            db.scalar("SELECT count(*) FROM events WHERE id=?1", &[id])? != "0"
        } else {
            db.scalar("SELECT count(*) FROM durations WHERE id=?1", &[id])? != "0"
        };
        let links = db.query(
            "SELECT a_kind,a_id,b_kind,b_id FROM relationships WHERE a_kind=?1 AND a_id=?2 UNION SELECT a_kind,a_id,b_kind,b_id FROM relationships WHERE b_kind=?1 AND b_id=?2",
            &[kind, id],
        )?;
        for r in links {
            let text = |i: usize| r[i].clone().unwrap_or_default();
            let (a, b) = ((text(0), text(1)), (text(2), text(3)));
            let k = key((&a.0, &a.1), (&b.0, &b.1));
            if !exists {
                db.execute(
                    "DELETE FROM relationships WHERE a_kind=? AND a_id=? AND b_kind=? AND b_id=?",
                    &[&a.0, &a.1, &b.0, &b.1],
                )?;
            }
            touched.insert(k.clone());
            placed.insert(k, (a, b));
        }
    }
    for change in &patch.relationship_changes {
        let link = super::Relationship {
            a: change.a.clone(),
            b: change.b.clone(),
        };
        let (mut a, mut b) = (super::entity_ref(&link.a)?, super::entity_ref(&link.b)?);
        if key(a, b) > key(b, a) {
            std::mem::swap(&mut a, &mut b);
        }
        // Like a full rebuild, links to entities that do not exist are dropped.
        let exists = |(k, i): (&str, &str)| -> Result<bool, String> {
            Ok(db.scalar(
                if k == "moment" {
                    "SELECT count(*) FROM events WHERE id=?1"
                } else {
                    "SELECT count(*) FROM durations WHERE id=?1"
                },
                &[i],
            )? != "0")
        };
        let related = change.related && exists(a)? && exists(b)?;
        super::relate(db, &link, related)?;
        let k = key(a, b);
        touched.insert(k.clone());
        placed.insert(k, ((a.0.into(), a.1.into()), (b.0.into(), b.1.into())));
    }
    // Arcs of touched links are removed and, for links that remain, placed again.
    let mut edges = intervals::Tree::open(db, "edge_intervals", "edge_nodes")?;
    for k in &touched {
        edges.remove(k)?;
        let ((ak, ai), (bk, bi)) = &placed[k];
        if db.scalar(
            "SELECT count(*) FROM relationships WHERE a_kind=? AND a_id=? AND b_kind=? AND b_id=?",
            &[ak, ai, bk, bi],
        )? == "0"
        {
            continue;
        }
        let place = |kind: &str, id: &str| {
            db.scalar(
                if kind == "moment" {
                    "SELECT time FROM events WHERE id=?1"
                } else {
                    "SELECT start_time FROM duration_intervals WHERE id=?1"
                },
                &[id],
            )
        };
        edges.insert(&intervals::Interval {
            id: k,
            start_json: "null",
            end_json: "null",
            start: &place(ak, ai)?,
            end: &place(bk, bi)?,
            metadata: "{}",
        })?;
    }
    edges.flush()?;
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
    intervals::set_layout(db, token)
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
        let directory = snapshot.directory().to_path_buf();
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
        // The file was saved with the current layout, so the save applied in place: the new
        // baseline is the same disk copy (the desktop app discards the old handle).
        assert_eq!(updated.path(), source.path());
        assert_eq!(updated.header().unwrap().document.title, "Changed");
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
        assert_eq!(updated.document().unwrap(), saved);
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
        let target = baseline.directory().join("saved.och");
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
mod relationship_tests {
    use super::*;
    fn doc() -> Document {
        serde_json::from_value(json!({
            "format":"openchronology","version":1,"title":"Links","description":"",
            "events":[
                {"id":"a","time":"0/1","metadata":{"title":"A"}},
                {"id":"b","time":"100/1","metadata":{"title":"B"}},
                {"id":"c","time":"200/1","metadata":{"title":"C"}},
                {"id":"lone","time":"300/1","metadata":{"title":"Lone"}}
            ],
            "durations":[{"id":"x","start":"50/1","end":"60/1","metadata":{"title":"X"}}],
            "relationships":[
                {"a":{"duration":"x"},"b":{"moment":"a"}},
                {"a":{"moment":"a"},"b":{"moment":"b"}},
                {"a":{"moment":"b"},"b":{"moment":"c"}}
            ]
        }))
        .unwrap()
    }
    fn query(snapshot: &Snapshot, value: Value) -> Value {
        snapshot
            .query(&serde_json::from_value(value).unwrap())
            .unwrap()
    }
    #[test]
    fn relationships_round_trip_draw_arcs_page_and_follow_edits() {
        let snapshot = Snapshot::from_document(&doc()).unwrap();
        assert_eq!(snapshot.document().unwrap().relationships.len(), 3);
        // Arcs run between moment times and a duration's start; short ones collapse.
        let frame = query(
            &snapshot,
            json!({"kind":"overview","lower":"-10/1","upper":"400/1","threshold":"1/1"}),
        );
        let mut arcs: Vec<String> = frame["edges"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                format!(
                    "{} {} {}",
                    e["id"].as_str().unwrap(),
                    e["first"].as_str().unwrap(),
                    e["last"].as_str().unwrap()
                )
            })
            .collect();
        arcs.sort();
        assert_eq!(
            arcs,
            vec![
                "d:x~m:a 0/1 50/1",
                "m:a~m:b 0/1 100/1",
                "m:b~m:c 100/1 200/1"
            ]
        );
        let coarse = query(
            &snapshot,
            json!({"kind":"overview","lower":"-10/1","upper":"400/1","threshold":"60/1"}),
        );
        assert_eq!(
            coarse["edges"].as_array().unwrap().len(),
            2,
            "The 50-unit arc collapses"
        );
        // Related pages from both link directions, with the transitive count first.
        let related = query(
            &snapshot,
            json!({"kind":"related","entity":{"moment":"a"},"limit":1}),
        );
        assert_eq!(
            related["related"][0],
            json!({"kind":"duration","id":"x","first":"50/1","last":"60/1","title":"X"})
        );
        assert_eq!(related["reachable"], 3);
        let next = query(
            &snapshot,
            json!({"kind":"related","entity":{"moment":"a"},"limit":1,"after":related["next"]}),
        );
        assert_eq!(next["related"][0]["id"], "b");
        assert!(next.get("reachable").is_none());
        assert_eq!(
            query(
                &snapshot,
                json!({"kind":"related","entity":{"moment":"lone"}})
            )["reachable"],
            0
        );
        // Separations by relationship: direct relations or everything connected.
        let ids = |filter: Value| -> Vec<String> {
            query(&snapshot, json!({"kind":"events","lower":"-10/1","upper":"400/1","limit":100,"filter":filter}))["events"]
                .as_array().unwrap().iter().map(|e| e["id"].as_str().unwrap().to_string()).collect()
        };
        assert_eq!(
            ids(json!({"related":{"moment":"a"},"depth":"direct","mode":"any"})),
            vec!["a", "b"]
        );
        assert_eq!(
            ids(json!({"related":{"moment":"a"},"depth":"all","mode":"any"})),
            vec!["a", "b", "c"]
        );
        assert_eq!(
            ids(json!({"related":{"moment":"a"},"depth":"all","mode":"none"})),
            vec!["lone"]
        );
        // Sparse saves add and remove links; deleting an entity removes its links.
        let settings = snapshot.header().unwrap().document;
        let target = snapshot.directory().join("updated.och");
        let patch: Patch = serde_json::from_value(json!({"settings":settings,"changes":[{"id":"b","event":null}],"relationshipChanges":[{"a":{"moment":"lone"},"b":{"moment":"c"},"related":true},{"a":{"duration":"x"},"b":{"moment":"a"},"related":false}]})).unwrap();
        let updated = snapshot.save_patch(&target, &patch).unwrap();
        let mut links: Vec<String> = updated
            .document()
            .unwrap()
            .relationships
            .iter()
            .map(|r| format!("{}-{}", r.a, r.b))
            .collect();
        links.sort();
        assert_eq!(links, vec![r#"{"moment":"c"}-{"moment":"lone"}"#]);
        let mut invalid = doc();
        invalid.relationships.push(super::super::Relationship {
            a: json!({"moment":"a"}),
            b: json!({"moment":"a"}),
        });
        assert!(Snapshot::from_document(&invalid).is_err());
        let mut missing = doc();
        missing.relationships.push(super::super::Relationship {
            a: json!({"moment":"a"}),
            b: json!({"duration":"absent"}),
        });
        assert!(Snapshot::from_document(&missing).is_err());
    }
}
#[cfg(test)]
mod view_tests {
    use super::*;
    #[test]
    fn tag_views_partition_entities_and_keep_cross_side_durations_placed() {
        let doc: Document = serde_json::from_value(json!({
            "format":"openchronology","version":1,"title":"Views","description":"",
            "events":[
                {"id":"a","time":"1/1","metadata":{"title":"A","tags":["war"]}},
                {"id":"b","time":"2/1","metadata":{"title":"B","tags":["trade","war"]}},
                {"id":"c","time":"3/1","metadata":{"title":"C"}},
                {"id":"d","time":"4/1","metadata":{"title":"D","tags":["art"]}}
            ],
            "durations":[
                {"id":"x","start":{"moment":"c"},"end":"9/1","metadata":{"tags":["war"]}},
                {"id":"y","start":"0/1","end":{"moment":"a"},"metadata":{}}
            ]
        }))
        .unwrap();
        let snapshot = Snapshot::from_document(&doc).unwrap();
        let ids = |filter: Value| -> (Vec<String>, Vec<Value>) {
            let events = snapshot
                .query(&serde_json::from_value(json!({"kind":"events","lower":"0/1","upper":"10/1","limit":100,"filter":filter})).unwrap())
                .unwrap();
            let frame = snapshot
                .query(&serde_json::from_value(json!({"kind":"overview","lower":"0/1","upper":"10/1","threshold":"1/1024","filter":filter})).unwrap())
                .unwrap();
            (
                events["events"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|e| e["id"].as_str().unwrap().to_string())
                    .collect(),
                frame["durations"].as_array().unwrap().clone(),
            )
        };
        let (tagged, tagged_bands) = ids(json!({"tags":["War","trade"],"mode":"any"}));
        let (rest, rest_bands) = ids(json!({"tags":["war","trade"],"mode":"none"}));
        assert_eq!(tagged, vec!["a", "b"]);
        assert_eq!(rest, vec!["c", "d"]);
        // "x" follows "c", which is not tagged; it keeps c's time as a fixed start.
        assert_eq!(tagged_bands.len(), 1);
        assert_eq!(tagged_bands[0]["id"], "x");
        assert_eq!(tagged_bands[0]["start"], "3/1");
        assert_eq!(rest_bands[0]["id"], "y");
        assert_eq!(rest_bands[0]["end"], "1/1");
        let tags = snapshot
            .query(&serde_json::from_value(json!({"kind":"tags"})).unwrap())
            .unwrap();
        assert_eq!(
            tags["tags"],
            json!([{"tag":"war","count":3},{"tag":"art","count":1},{"tag":"trade","count":1}])
        );
        assert!(snapshot
            .query(&serde_json::from_value(json!({"kind":"events","lower":"0/1","upper":"1/1","filter":{"tags":[],"mode":"any"}})).unwrap())
            .is_err());
    }
}
#[cfg(test)]
mod summary_tests {
    use super::*;
    fn gcd(a: i64, b: i64) -> i64 {
        if b == 0 {
            a.abs()
        } else {
            gcd(b, a % b)
        }
    }
    /// Canonical text of k/8.
    fn q(k: i64) -> String {
        let g = gcd(k, 8).max(1);
        format!("{}/{}", k / g, 8 / g)
    }
    #[derive(Debug, PartialEq)]
    struct G {
        first: i64,
        last: i64,
        count: u64,
        distinct: u64,
        durations: u64,
    }
    /// Brute-force reference: anchored spans of moments and of collapsed duration starts,
    /// then coalescing while a merged block spans less than the threshold.
    fn reference(
        moments: &[i64],
        spans: &[(i64, i64)],
        lo: i64,
        hi: i64,
        t: i64,
    ) -> (Vec<G>, Vec<usize>) {
        let mut points: Vec<i64> = moments
            .iter()
            .copied()
            .filter(|m| *m >= lo && *m <= hi)
            .collect();
        points.sort();
        let mut groups: Vec<G> = Vec::new();
        for p in points {
            match groups.last_mut() {
                Some(g) if p - g.first < t => {
                    if p != g.last {
                        g.distinct += 1;
                    }
                    g.last = p;
                    g.count += 1;
                }
                _ => groups.push(G {
                    first: p,
                    last: p,
                    count: 1,
                    distinct: 1,
                    durations: 0,
                }),
            }
        }
        let mut short: Vec<(i64, i64)> = spans
            .iter()
            .copied()
            .filter(|(a, b)| b - a < t && *b >= lo && *a <= hi)
            .collect();
        short.sort();
        let mut clusters: Vec<G> = Vec::new();
        for (a, b) in short {
            match clusters.last_mut() {
                Some(c) if a - c.first < t => {
                    c.last = c.last.max(b);
                    c.durations += 1;
                }
                _ => clusters.push(G {
                    first: a,
                    last: b,
                    count: 0,
                    distinct: 0,
                    durations: 1,
                }),
            }
        }
        let mut all: Vec<G> = groups.into_iter().chain(clusters).collect();
        all.sort_by(|x, y| {
            x.first
                .cmp(&y.first)
                .then((y.count > 0).cmp(&(x.count > 0)))
        });
        let mut out: Vec<G> = Vec::new();
        for g in all {
            match out.last_mut() {
                Some(p) if g.first == p.first || g.last - p.first < t => {
                    let overlap = p.distinct > 0 && g.distinct > 0 && p.last == g.first;
                    p.last = p.last.max(g.last);
                    p.count += g.count;
                    p.distinct = p.distinct + g.distinct - u64::from(overlap);
                    p.durations += g.durations;
                }
                _ => out.push(g),
            }
        }
        let bands = spans
            .iter()
            .enumerate()
            .filter(|(_, (a, b))| b - a >= t && *b >= lo && *a <= hi)
            .map(|(i, _)| i)
            .collect();
        (out, bands)
    }
    #[test]
    fn native_summaries_match_a_brute_force_reference() {
        let mut seed: u64 = 20261008;
        let mut next = |n: i64| {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((seed >> 33) % n as u64) as i64
        };
        let mut checked = 0;
        let mut mixed = 0;
        for _ in 0..4 {
            let moments: Vec<i64> = (0..60 + next(80)).map(|_| next(3000)).collect();
            let spans: Vec<(i64, i64)> = (0..40 + next(120))
                .map(|_| {
                    let a = next(3000);
                    (a, a + if next(10) < 8 { next(40) } else { next(1500) })
                })
                .collect();
            let doc: Document = serde_json::from_value(json!({
                "format":"openchronology","version":1,"title":"Oracle","description":"",
                "events": moments.iter().enumerate().map(|(i, m)| json!({"id":format!("m{i:03}"),"time":q(*m),"metadata":{}})).collect::<Vec<_>>(),
                "durations": spans.iter().enumerate().map(|(i, (a, b))| json!({"id":format!("d{i:03}"),"start":q(*a),"end":q(*b),"metadata":{"title":format!("D{i}")}})).collect::<Vec<_>>(),
            })).unwrap();
            let snapshot = Snapshot::from_document(&doc).unwrap();
            for _ in 0..12 {
                let lo = next(3200) - 100;
                let hi = lo + 1 + next(3000);
                // At least span/1024, the native minimum display threshold.
                let t = ((hi - lo) / 1024 + 1).max(next(200) + 1);
                let frame = snapshot
                    .query(
                        &serde_json::from_value(
                            json!({"kind":"overview","lower":q(lo),"upper":q(hi),"threshold":q(t)}),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                let (expected, bands) = reference(&moments, &spans, lo, hi, t);
                let actual: Vec<G> = frame["groups"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|g| {
                        let k = |s: &str| -> i64 {
                            let (n, d) = s.split_once('/').unwrap();
                            n.parse::<i64>().unwrap() * (8 / d.parse::<i64>().unwrap())
                        };
                        G {
                            first: k(g["first"].as_str().unwrap()),
                            last: k(g["last"].as_str().unwrap()),
                            count: g["count"].as_str().unwrap().parse().unwrap(),
                            distinct: g["distinct"].as_u64().unwrap(),
                            durations: g["durationCount"].as_str().unwrap_or("0").parse().unwrap(),
                        }
                    })
                    .collect();
                assert_eq!(actual, expected, "window {lo}..{hi} threshold {t}");
                mixed += expected
                    .iter()
                    .filter(|g| g.count > 0 && g.durations > 0)
                    .count();
                let mut ids: Vec<usize> = frame["durations"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|b| b["id"].as_str().unwrap()[1..].parse().unwrap())
                    .collect();
                ids.sort();
                if bands.len() <= 256 {
                    assert_eq!(ids, bands);
                }
                checked += 1;
            }
        }
        assert!(mixed > 0, "The oracle exercised mixed groups");
        assert_eq!(checked, 48);
    }
}
#[cfg(test)]
mod search_tests {
    use super::*;
    #[test]
    fn search_matches_titles_notes_stacks_and_durations_with_pages() {
        let mut events = vec![
            json!({"id":"late","time":"5/1","metadata":{"title":"Harbor survey","description":"Later notes"}}),
            json!({"id":"early","time":"1/1","metadata":{"title":"Notes","description":"A harbor visit"}}),
            json!({"id":"stack","time":"2/1","metadata":{"title":"Parent","stack":[{"id":"c","metadata":{"title":"Nested HARBOR entry"}}]}}),
        ];
        for i in 0..30 {
            events.push(json!({"id":format!("m{i:02}"),"time":format!("{}/1",10+i),"metadata":{"title":format!("Filler {i}"),"description":"routine"}}));
        }
        let doc:Document=serde_json::from_value(json!({"format":"openchronology","version":1,"title":"Search","description":"","events":events,"durations":[{"id":"span","start":"3/1","end":{"moment":"late"},"metadata":{"title":"Harbor works"}}]})).unwrap();
        let snapshot = Snapshot::from_document(&doc).unwrap();
        let search = |text: &str, page: usize| {
            snapshot
                .query(
                    &serde_json::from_value(json!({"kind":"search","text":text,"page":page}))
                        .unwrap(),
                )
                .unwrap()
        };
        let found = search("harbor", 1);
        assert_eq!(found["total"], "4");
        let ids: Vec<_> = found["results"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r["id"].as_str().unwrap())
            .collect();
        // Title matches first, then earlier coordinates; nested entries count for their parent.
        assert_eq!(ids, vec!["span", "late", "early", "stack"]);
        assert_eq!(found["results"][0]["kind"], "duration");
        assert_eq!(found["results"][0]["first"], "3/1");
        assert_eq!(found["results"][0]["last"], "5/1");
        assert_eq!(search("HARBOR survey", 1)["total"], "1");
        assert_eq!(
            search("routine", 1)["results"].as_array().unwrap().len(),
            25
        );
        assert_eq!(search("routine", 2)["results"].as_array().unwrap().len(), 5);
        assert_eq!(search("routine", 2)["total"], "30");
        assert_eq!(search("  ,.; ", 1)["total"], "0");
        assert_eq!(search("absent", 1)["total"], "0");
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
        let target = snapshot.directory().join("updated.och");
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
        let target = snapshot.directory().join("updated.och");
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
/// Words of letters and digits, lowercased; matches the web editor's normalization.
fn search_terms(text: &str) -> Vec<String> {
    let mut terms: Vec<String> = Vec::new();
    for term in text
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
    {
        let term: String = term.chars().take(64).collect();
        if !terms.contains(&term) {
            terms.push(term);
        }
        if terms.len() == 8 {
            break;
        }
    }
    terms
}
/// Every term must occur in the title or notes (including nested entries such as stacks).
/// SQLite's lower() folds ASCII only, so non-ASCII matching is case-sensitive here.
fn search(db: &Connection, text: &str, page: usize) -> Result<Value, String> {
    if text.len() > 800 || !(1..=4000).contains(&page) {
        return Err("Search needs text of at most 200 characters and a page".into());
    }
    let terms = search_terms(text);
    if terms.is_empty() {
        return Ok(json!({"results":[],"total":"0","page":page}));
    }
    let filter = terms
        .iter()
        .enumerate()
        .map(|(i, _)| format!("instr(hay,?{})>0", i + 1))
        .collect::<Vec<_>>()
        .join(" AND ");
    let title_hit = terms
        .iter()
        .enumerate()
        .map(|(i, _)| format!("instr(lower(title),?{})>0", i + 1))
        .collect::<Vec<_>>()
        .join(" AND ");
    let offset = ((page - 1) * 25).to_string();
    let n = terms.len();
    let sql = format!(
        "WITH entities AS (         SELECT 'moment' AS kind,e.id,e.time AS first,e.time AS last,coalesce(json_extract(e.metadata,'$.title'),'') AS title,         coalesce(json_extract(e.metadata,'$.description'),'')||' '||coalesce((SELECT group_concat(coalesce(json_extract(n.value,'$.metadata.title'),'')||' '||coalesce(json_extract(n.value,'$.metadata.description'),''),' ') FROM json_each(e.metadata) a,json_each(a.value) n WHERE a.type='array'),'') AS body FROM events e          UNION ALL SELECT 'duration',d.id,d.first,d.last,coalesce(json_extract(d.metadata,'$.title'),''),coalesce(json_extract(d.metadata,'$.description'),'') FROM duration_intervals d),         hits AS (SELECT *,lower(title||' '||body) AS hay FROM entities)          SELECT kind,id,q(first),q(last),title,substr(trim(body),1,300),count(*) OVER() FROM hits WHERE {filter}          ORDER BY ({title_hit}) DESC,first COLLATE RATIONAL_V1,kind,id LIMIT 25 OFFSET ?{}",
        n + 1
    );
    let mut parameters: Vec<&str> = terms.iter().map(String::as_str).collect();
    parameters.push(&offset);
    let rows = db.query_limited(&sql, &parameters, 25, BUDGET)?;
    let total = rows
        .first()
        .and_then(|r| r[6].clone())
        .unwrap_or_else(|| "0".into());
    let results: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            let body = r[5].clone().unwrap_or_default();
            let snippet = if body.chars().count() > 240 {
                body.chars().take(239).collect::<String>() + "…"
            } else {
                body
            };
            json!({"kind":r[0],"id":r[1],"first":r[2],"last":r[3],"title":r[4].clone().unwrap_or_default(),"snippet":snippet})
        })
        .collect();
    Ok(json!({"results":results,"total":total,"page":page}))
}
/// Directly related entities (both link directions) with titles and times, paged by
/// (kind, id). The first page also counts everything reachable through any links.
fn related(
    db: &Connection,
    kind: &str,
    id: &str,
    after: Option<(&str, &str)>,
    limit: usize,
) -> Result<Value, String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='relationships' AND type='table'",
        &[],
    )? == "0"
    {
        return Ok(json!({"related":[],"next":null,"reachable":0,"direct":0}));
    }
    let (after_kind, after_id) = after.unwrap_or(("", ""));
    let take = (limit + 1).to_string();
    let rows = db.query_limited(
        "WITH links(kind,id) AS (SELECT b_kind,b_id FROM relationships WHERE a_kind=?1 AND a_id=?2 UNION SELECT a_kind,a_id FROM relationships WHERE b_kind=?1 AND b_id=?2), \
         shown AS (SELECT l.kind,l.id,q(e.time) AS first,q(e.time) AS last,coalesce(json_extract(e.metadata,'$.title'),'') AS title FROM links l JOIN events e ON l.kind='moment' AND e.id=l.id \
         UNION ALL SELECT l.kind,l.id,q(d.first),q(d.last),coalesce(json_extract(d.metadata,'$.title'),'') FROM links l JOIN duration_intervals d ON l.kind='duration' AND d.id=l.id) \
         SELECT kind,id,first,last,title FROM shown WHERE ?3='' OR kind>?3 OR (kind=?3 AND id>?4) ORDER BY kind,id LIMIT CAST(?5 AS INTEGER)",
        &[kind, id, after_kind, after_id, &take],
        limit + 1,
        BUDGET,
    )?;
    let more = rows.len() > limit;
    let page: Vec<Value> = rows
        .iter()
        .take(limit)
        .map(|r| json!({"kind":r[0],"id":r[1],"first":r[2],"last":r[3],"title":r[4]}))
        .collect();
    let next = if more {
        page.last().map(|p| json!({"kind":p["kind"],"id":p["id"]}))
    } else {
        None
    };
    let mut result = json!({"related":page,"next":next});
    if after.is_none() {
        // Everything connected through any number of links (an undirected closure).
        let count = db.scalar(
            "WITH RECURSIVE reach(kind,id) AS (SELECT ?1,?2 UNION SELECT CASE WHEN r.a_kind=x.kind AND r.a_id=x.id THEN r.b_kind ELSE r.a_kind END,CASE WHEN r.a_kind=x.kind AND r.a_id=x.id THEN r.b_id ELSE r.a_id END FROM reach x JOIN relationships r ON (r.a_kind=x.kind AND r.a_id=x.id) OR (r.b_kind=x.kind AND r.b_id=x.id)) SELECT count(*)-1 FROM reach",
            &[kind, id],
        )?;
        result["reachable"] = json!(count.parse::<u64>().unwrap_or(0));
        let direct = db.scalar(
            "SELECT count(*) FROM relationships WHERE (a_kind=?1 AND a_id=?2) OR (b_kind=?1 AND b_id=?2)",
            &[kind, id],
        )?;
        result["direct"] = json!(direct.parse::<u64>().unwrap_or(0));
    }
    Ok(result)
}
#[cfg(test)]
mod incremental_tests {
    //! Oracle: random sparse saves applied in place match a model of the document and a
    //! rebuild of the saved document, and leave both interval trees valid AVL trees.
    use super::*;
    use std::collections::{BTreeMap, BTreeSet};
    struct Random(u64);
    impl Random {
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            self.0 >> 33
        }
        fn below(&mut self, n: usize) -> usize {
            (self.next() % n as u64) as usize
        }
        fn time(&mut self) -> String {
            format!("{}/{}", self.below(600), 1 + self.below(3))
        }
    }
    fn link_key(r: &Value) -> String {
        let side = |v: &Value| {
            let (k, i) = super::super::entity_ref(v).unwrap();
            format!("{}:{}", if k == "moment" { "m" } else { "d" }, i)
        };
        let (a, b) = (side(&r["a"]), side(&r["b"]));
        if a < b {
            format!("{a}~{b}")
        } else {
            format!("{b}~{a}")
        }
    }
    /// A document independent of storage order.
    fn normal(doc: &Document) -> Value {
        let mut events = doc.events.clone();
        events.sort_by(|a, b| a.id.cmp(&b.id));
        let mut durations = doc.durations.clone();
        durations.sort_by(|a, b| a.id.cmp(&b.id));
        let links: BTreeSet<String> = doc
            .relationships
            .iter()
            .map(|r| link_key(&serde_json::to_value(r).unwrap()))
            .collect();
        let canon = |db: &Connection, t: &str| db.scalar("SELECT q(?)", &[t]).unwrap();
        let db = Connection::open(Path::new(":memory:"), true).unwrap();
        let endpoint = |v: &Value| match v {
            Value::String(t) => json!(canon(&db, t)),
            other => other.clone(),
        };
        json!({
            "title": doc.title,
            "events": events.iter().map(|e| json!([e.id, canon(&db, &e.time), e.metadata])).collect::<Vec<_>>(),
            "durations": durations.iter().map(|d| json!([d.id, endpoint(&d.start), endpoint(&d.end), d.metadata])).collect::<Vec<_>>(),
            "links": links,
        })
    }
    /// Recomputes every node from its children and checks balance, order and orphans.
    fn check_tree(path: &Path, intervals: &str, nodes: &str) {
        let db = Connection::open(path, false).unwrap();
        let rows = db.query(&format!("SELECT n.id,n.left_id,n.right_id,n.height,d.id,d.first,d.last,d.extent,n.min_time,n.max_time,n.max_first,n.cnt,n.min_extent,n.max_extent FROM {nodes} n JOIN {intervals} d ON d.ord=n.id"), &[]).unwrap();
        let count: usize = db
            .scalar(&format!("SELECT count(*) FROM {nodes}"), &[])
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(rows.len(), count, "{nodes} rows pair with intervals");
        let byid: BTreeMap<String, Vec<Option<String>>> = rows
            .into_iter()
            .map(|r| (r[0].clone().unwrap(), r))
            .collect();
        let root = db
            .query("SELECT root FROM interval_roots WHERE name=?", &[nodes])
            .unwrap()
            .first()
            .and_then(|r| r[0].clone());
        let cmp = |a: &str, b: &str| -> i32 {
            db.scalar("SELECT q_cmp(q(?),q(?))", &[a, b])
                .unwrap()
                .parse()
                .unwrap()
        };
        let same = |a: &str, b: &str| cmp(a, b) == 0;
        struct Summary {
            min: String,
            max: String,
            max_first: String,
            cnt: usize,
            min_extent: String,
            max_extent: String,
            height: usize,
        }
        let mut seen = 0;
        let mut last: Option<(String, String)> = None;
        fn walk(
            id: Option<String>,
            byid: &BTreeMap<String, Vec<Option<String>>>,
            cmp: &dyn Fn(&str, &str) -> i32,
            seen: &mut usize,
            last: &mut Option<(String, String)>,
        ) -> Option<Summary> {
            let id = id?;
            let r = &byid[&id];
            *seen += 1;
            let text = |i: usize| r[i].clone().unwrap();
            let l = walk(r[1].clone(), byid, cmp, seen, last);
            let key = (text(5), text(4));
            if let Some((first, kid)) = last.as_ref() {
                let c = cmp(first, &key.0);
                assert!(c < 0 || (c == 0 && *kid < key.1), "interval order");
            }
            *last = Some(key);
            let r2 = walk(r[2].clone(), byid, cmp, seen, last);
            let pick = |a: String, b: Option<&String>, larger: bool| match b {
                Some(b) if (cmp(b, &a) > 0) == larger && cmp(b, &a) != 0 => b.clone(),
                _ => a,
            };
            let (lh, rh) = (
                l.as_ref().map_or(0, |s| s.height),
                r2.as_ref().map_or(0, |s| s.height),
            );
            assert!(lh.abs_diff(rh) <= 1, "AVL balance");
            let max = pick(text(6), l.as_ref().map(|s| &s.max), true);
            let s = Summary {
                min: l.as_ref().map_or(text(5), |s| s.min.clone()),
                max: pick(max, r2.as_ref().map(|s| &s.max), true),
                max_first: r2.as_ref().map_or(text(5), |s| s.max_first.clone()),
                cnt: 1 + l.as_ref().map_or(0, |s| s.cnt) + r2.as_ref().map_or(0, |s| s.cnt),
                min_extent: pick(
                    pick(text(7), l.as_ref().map(|s| &s.min_extent), false),
                    r2.as_ref().map(|s| &s.min_extent),
                    false,
                ),
                max_extent: pick(
                    pick(text(7), l.as_ref().map(|s| &s.max_extent), true),
                    r2.as_ref().map(|s| &s.max_extent),
                    true,
                ),
                height: 1 + lh.max(rh),
            };
            assert_eq!(text(3).parse::<usize>().unwrap(), s.height, "height");
            assert_eq!(text(11).parse::<usize>().unwrap(), s.cnt, "count");
            for (stored, expected) in [
                (text(8), &s.min),
                (text(9), &s.max),
                (text(10), &s.max_first),
                (text(12), &s.min_extent),
                (text(13), &s.max_extent),
            ] {
                assert_eq!(cmp(&stored, expected), 0, "summary");
            }
            Some(s)
        }
        walk(root, &byid, &cmp, &mut seen, &mut last);
        assert_eq!(seen, count, "no orphaned {nodes}");
        let _ = same;
    }
    /// What a reader sees, independent of the tree's shape.
    fn observe(snapshot: &Snapshot) -> Vec<Value> {
        let mut out = Vec::new();
        for (lower, upper, threshold) in [
            ("-10", "700", "0"),
            ("-10", "700", "7"),
            ("100", "300", "1"),
            ("0", "600", "61"),
        ] {
            let mut r = snapshot
                .query(&serde_json::from_value(json!({"kind":"overview","lower":lower,"upper":upper,"threshold":threshold})).unwrap())
                .unwrap();
            for list in ["durations", "edges"] {
                if let Some(items) = r[list].as_array_mut() {
                    items.sort_by_key(|v| v["id"].as_str().unwrap_or_default().to_string());
                }
            }
            if let Some(o) = r.as_object_mut() {
                o.remove("visitedNodes");
            }
            out.push(r);
        }
        for q in [
            json!({"kind":"durations","lower":"-10","upper":"700","limit":500}),
            json!({"kind":"events","lower":"50","upper":"450","limit":500}),
            json!({"kind":"search","text":"note","page":1}),
        ] {
            out.push(snapshot.query(&serde_json::from_value(q).unwrap()).unwrap());
        }
        out
    }
    #[test]
    fn random_sparse_saves_match_a_model_and_a_rebuild() {
        let mut rng = Random(32);
        let path = std::env::temp_dir().join(format!("och-incremental-{}.och", intervals::token()));
        let mut events: BTreeMap<String, Event> = BTreeMap::new();
        for i in 0..200 {
            let t = rng.time();
            events.insert(
                format!("m{i}"),
                Event {
                    id: format!("m{i}"),
                    time: t,
                    metadata: serde_json::from_value(
                        json!({"title": format!("Moment {i}"), "description": "A note"}),
                    )
                    .unwrap(),
                },
            );
        }
        let mut durations: BTreeMap<String, Duration> = BTreeMap::new();
        for i in 0..30 {
            let start = rng.time();
            durations.insert(
                format!("d{i}"),
                Duration {
                    id: format!("d{i}"),
                    start: if i % 4 == 0 {
                        json!({"moment": format!("m{i}")})
                    } else {
                        json!(start)
                    },
                    end: if i % 6 == 0 {
                        json!({"moment": format!("m{}", i + 50)})
                    } else {
                        json!(format!("{}/1", 600 + i))
                    },
                    metadata: serde_json::from_value(json!({"title": format!("Span {i} note")}))
                        .unwrap(),
                },
            );
        }
        let mut links: BTreeMap<String, Value> = BTreeMap::new();
        for i in 0..40 {
            let r = json!({"a":{"moment":format!("m{i}")},"b": if i % 3 == 0 { json!({"duration": format!("d{}", i % 30)}) } else { json!({"moment": format!("m{}", i + 100)}) }});
            links.insert(link_key(&r), r);
        }
        let document = |events: &BTreeMap<String, Event>,
                        durations: &BTreeMap<String, Duration>,
                        links: &BTreeMap<String, Value>,
                        title: &str|
         -> Document {
            serde_json::from_value(json!({
                "format":"openchronology","version":1,"title":title,"description":"",
                "events": events.values().collect::<Vec<_>>(),
                "durations": durations.values().collect::<Vec<_>>(),
                "relationships": links.values().collect::<Vec<_>>(),
            }))
            .unwrap()
        };
        super::super::save(&path, &document(&events, &durations, &links, "Incremental")).unwrap();
        let mut baseline = Snapshot::open(&path).unwrap();
        let mut title = "Incremental".to_string();
        for step in 1..=80 {
            let mut changes = Vec::new();
            let mut duration_changes = Vec::new();
            let mut link_changes = Vec::new();
            let mut next_events = events.clone();
            let mut next_durations = durations.clone();
            let mut next_links = links.clone();
            let mut touched = BTreeSet::new();
            for i in 0..1 + rng.below(5) {
                let ids: Vec<String> = next_events.keys().cloned().collect();
                let pick = ids[rng.below(ids.len())].clone();
                if touched.contains(&pick) {
                    continue;
                }
                match rng.below(10) {
                    0..=2 => {
                        let mut e = next_events[&pick].clone();
                        e.metadata
                            .insert("title".into(), json!(format!("Renamed {step}.{i}")));
                        touched.insert(pick.clone());
                        changes.push(json!({"id":pick,"event":e}));
                        next_events.insert(pick, e);
                    }
                    3..=4 => {
                        let mut e = next_events[&pick].clone();
                        e.time = if rng.below(3) == 0 {
                            next_events[&ids[rng.below(ids.len())]].time.clone()
                        } else {
                            rng.time()
                        };
                        touched.insert(pick.clone());
                        changes.push(json!({"id":pick,"event":e}));
                        next_events.insert(pick, e);
                    }
                    5 => {
                        // Durations following a deleted moment keep its last saved time.
                        let last = events.get(&pick).map(|e| e.time.clone());
                        touched.insert(pick.clone());
                        changes.push(json!({"id":pick,"event":null}));
                        next_events.remove(&pick);
                        for d in next_durations.values_mut() {
                            for side in [&mut d.start, &mut d.end] {
                                if side["moment"] == json!(pick) {
                                    *side = json!(last.clone().unwrap());
                                }
                            }
                        }
                    }
                    6 => {
                        let id = format!("n{step}x{i}");
                        let e = Event {
                            id: id.clone(),
                            time: rng.time(),
                            metadata: serde_json::from_value(json!({"title": format!("New {id}")}))
                                .unwrap(),
                        };
                        touched.insert(id.clone());
                        changes.push(json!({"id":id,"event":e}));
                        next_events.insert(id, e);
                    }
                    7 => {
                        let id = if rng.below(2) == 0 && !next_durations.is_empty() {
                            next_durations
                                .keys()
                                .nth(rng.below(next_durations.len()))
                                .unwrap()
                                .clone()
                        } else {
                            format!("d{step}x{i}")
                        };
                        let anchors: Vec<String> = next_events.keys().cloned().collect();
                        let start = if rng.below(3) == 0 {
                            json!({"moment": anchors[rng.below(anchors.len())]})
                        } else {
                            json!(rng.time())
                        };
                        let d = Duration {
                            id: id.clone(),
                            start,
                            end: json!(format!("{}/1", 600 + rng.below(90))),
                            metadata: serde_json::from_value(
                                json!({"title": format!("Span {id} note")}),
                            )
                            .unwrap(),
                        };
                        duration_changes.retain(|c: &Value| c["id"] != json!(id));
                        duration_changes.push(json!({"id":id,"duration":d}));
                        next_durations.insert(id, d);
                    }
                    8 if !next_durations.is_empty() => {
                        let id = next_durations
                            .keys()
                            .nth(rng.below(next_durations.len()))
                            .unwrap()
                            .clone();
                        duration_changes.retain(|c: &Value| c["id"] != json!(id));
                        duration_changes.push(json!({"id":id,"duration":null}));
                        next_durations.remove(&id);
                    }
                    _ => {
                        let mut entities: Vec<Value> =
                            next_events.keys().map(|m| json!({"moment": m})).collect();
                        entities.extend(next_durations.keys().map(|d| json!({"duration": d})));
                        let (a, b) = (
                            entities[rng.below(entities.len())].clone(),
                            entities[rng.below(entities.len())].clone(),
                        );
                        if a != b {
                            let r = json!({"a":a,"b":b});
                            let related =
                                !(rng.below(3) == 0 && next_links.contains_key(&link_key(&r)));
                            link_changes.push(json!({"a":a,"b":b,"related":related}));
                            if related {
                                next_links.insert(link_key(&r), r);
                            } else {
                                next_links.remove(&link_key(&r));
                            }
                        }
                    }
                }
            }
            // Deleting an entity removes its links.
            next_links.retain(|_, r| {
                [&r["a"], &r["b"]]
                    .iter()
                    .all(|v| match (v.get("moment"), v.get("duration")) {
                        (Some(m), _) => next_events.contains_key(m.as_str().unwrap()),
                        (_, Some(d)) => next_durations.contains_key(d.as_str().unwrap()),
                        _ => false,
                    })
            });
            if step % 7 == 3 {
                title = format!("Incremental {step}");
            }
            let mut settings =
                document(&BTreeMap::new(), &BTreeMap::new(), &BTreeMap::new(), &title);
            settings.durations.clear();
            let patch: Patch = serde_json::from_value(json!({"settings":settings,"changes":changes,"durationChanges":duration_changes,"relationshipChanges":link_changes})).unwrap();
            let before = baseline.path().to_path_buf();
            baseline = baseline.save_patch(&path, &patch).unwrap();
            assert_eq!(baseline.path(), before, "saved in place at step {step}");
            events = next_events;
            durations = next_durations;
            links = next_links;
            let expected = document(&events, &durations, &links, &title);
            let saved = super::super::open(&path).unwrap();
            assert_eq!(normal(&saved), normal(&expected), "file after step {step}");
            assert_eq!(
                normal(&baseline.document().unwrap()),
                normal(&expected),
                "baseline after step {step}"
            );
            if step % 10 == 0 {
                for (intervals, nodes) in [
                    ("duration_intervals", "duration_nodes"),
                    ("edge_intervals", "edge_nodes"),
                ] {
                    check_tree(&path, intervals, nodes);
                    check_tree(baseline.path(), intervals, nodes);
                }
                let rebuilt = Snapshot::from_document(&saved).unwrap();
                assert_eq!(
                    observe(&baseline),
                    observe(&rebuilt),
                    "queries after step {step}"
                );
            }
        }
        std::fs::remove_file(path).unwrap();
    }
}
