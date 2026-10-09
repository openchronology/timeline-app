// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! Persistent AVL interval trees over `duration_intervals`/`duration_nodes` and
//! `edge_intervals`/`edge_nodes`. An interval row and its node share an ID (`ord`), which
//! stays stable, so inserting or removing an interval rewrites only the nodes on its path
//! (plus rotations) instead of rebuilding the whole index. Nodes are ordered by
//! (first, ID); each holds the summaries the window and summary queries prune with.
use super::Connection;
use std::collections::{HashMap, HashSet};

/// Index layout written by this version: AVL interval trees with heights and stored roots.
pub(crate) const LAYOUT: &str = "2";

#[derive(Clone)]
struct Node {
    id: i64,
    left: Option<i64>,
    right: Option<i64>,
    height: i64,
    key: String,
    first: String,
    last: String,
    extent: String,
    min: String,
    max: String,
    max_first: String,
    cnt: i64,
    min_extent: String,
    max_extent: String,
}

/// A resolved interval to store: ID, endpoint JSON, endpoint times and metadata JSON.
pub(crate) struct Interval<'a> {
    pub id: &'a str,
    pub start_json: &'a str,
    pub end_json: &'a str,
    pub start: &'a str,
    pub end: &'a str,
    pub metadata: &'a str,
}

fn height(n: &Option<Node>) -> i64 {
    n.as_ref().map_or(0, |n| n.height)
}
fn optional(value: &Option<String>) -> Result<Option<i64>, String> {
    value
        .as_deref()
        .map(|v| v.parse::<i64>().map_err(|e| e.to_string()))
        .transpose()
}

pub(crate) struct Tree<'a> {
    db: &'a Connection,
    intervals: &'static str,
    nodes: &'static str,
    root: Option<i64>,
    cache: HashMap<i64, Node>,
    dirty: HashSet<i64>,
    dropped: HashSet<i64>,
    next: Option<i64>,
}

impl<'a> Tree<'a> {
    pub fn open(
        db: &'a Connection,
        intervals: &'static str,
        nodes: &'static str,
    ) -> Result<Self, String> {
        let root = db.query("SELECT root FROM interval_roots WHERE name=?", &[nodes])?;
        Ok(Self {
            db,
            intervals,
            nodes,
            root: optional(&root.first().and_then(|r| r[0].clone()))?,
            cache: HashMap::new(),
            dirty: HashSet::new(),
            dropped: HashSet::new(),
            next: None,
        })
    }
    pub fn size(&mut self) -> Result<i64, String> {
        Ok(self.get(self.root)?.map_or(0, |n| n.cnt))
    }
    fn cmp(&self, a: &str, b: &str) -> Result<i32, String> {
        self.db
            .scalar("SELECT q_cmp(q(?1),q(?2))", &[a, b])?
            .parse::<i32>()
            .map_err(|e| e.to_string())
    }
    fn larger(&self, a: &str, b: Option<&str>) -> Result<String, String> {
        Ok(match b {
            Some(b) if self.cmp(b, a)? > 0 => b.into(),
            _ => a.into(),
        })
    }
    fn smaller(&self, a: &str, b: Option<&str>) -> Result<String, String> {
        Ok(match b {
            Some(b) if self.cmp(b, a)? < 0 => b.into(),
            _ => a.into(),
        })
    }
    /// Orders (first, id) keys like the static builder: by time, then ID bytes.
    fn compare(&self, first: &str, id: &str, n: &Node) -> Result<i32, String> {
        Ok(match self.cmp(first, &n.first)? {
            0 => match id.cmp(n.key.as_str()) {
                std::cmp::Ordering::Less => -1,
                std::cmp::Ordering::Equal => 0,
                std::cmp::Ordering::Greater => 1,
            },
            c => c,
        })
    }
    fn get(&mut self, id: Option<i64>) -> Result<Option<Node>, String> {
        let Some(id) = id else { return Ok(None) };
        if let Some(n) = self.cache.get(&id) {
            return Ok(Some(n.clone()));
        }
        let rows = self.db.query(
            &format!("SELECT n.id,n.left_id,n.right_id,n.height,d.id,d.first,d.last,d.extent,n.min_time,n.max_time,n.max_first,n.cnt,n.min_extent,n.max_extent FROM {} n JOIN {} d ON d.ord=n.id WHERE n.id=CAST(?1 AS INTEGER)", self.nodes, self.intervals),
            &[&id.to_string()],
        )?;
        let r = rows.first().ok_or("Broken interval index")?;
        let text = |i: usize| r[i].clone().ok_or("Broken interval index");
        let node = Node {
            id,
            left: optional(&r[1])?,
            right: optional(&r[2])?,
            height: text(3)?.parse().map_err(|_| "Broken interval index")?,
            key: text(4)?,
            first: text(5)?,
            last: text(6)?,
            extent: text(7)?,
            min: text(8)?,
            max: text(9)?,
            max_first: text(10)?,
            cnt: text(11)?.parse().map_err(|_| "Broken interval index")?,
            min_extent: text(12)?,
            max_extent: text(13)?,
        };
        self.cache.insert(id, node.clone());
        Ok(Some(node))
    }
    fn new_id(&mut self) -> Result<i64, String> {
        let next = match self.next {
            Some(n) => n + 1,
            None => self
                .db
                .scalar(
                    &format!("SELECT coalesce(max(id),0)+1 FROM {}", self.nodes),
                    &[],
                )?
                .parse::<i64>()
                .map_err(|e| e.to_string())?
                .max(
                    self.db
                        .scalar(
                            &format!("SELECT coalesce(max(ord),0)+1 FROM {}", self.intervals),
                            &[],
                        )?
                        .parse::<i64>()
                        .map_err(|e| e.to_string())?,
                ),
        };
        self.next = Some(next);
        Ok(next)
    }
    /// Recomputes a node's height and summaries from its children and stores it.
    fn update(&mut self, mut n: Node) -> Result<Node, String> {
        let l = self.get(n.left)?;
        let r = self.get(n.right)?;
        n.height = 1 + height(&l).max(height(&r));
        n.min = l.as_ref().map_or(n.first.clone(), |l| l.min.clone());
        let max = self.larger(&n.last, l.as_ref().map(|l| l.max.as_str()))?;
        n.max = self.larger(&max, r.as_ref().map(|r| r.max.as_str()))?;
        n.max_first = r.as_ref().map_or(n.first.clone(), |r| r.max_first.clone());
        n.cnt = 1 + l.as_ref().map_or(0, |l| l.cnt) + r.as_ref().map_or(0, |r| r.cnt);
        let low = self.smaller(&n.extent, l.as_ref().map(|l| l.min_extent.as_str()))?;
        n.min_extent = self.smaller(&low, r.as_ref().map(|r| r.min_extent.as_str()))?;
        let high = self.larger(&n.extent, l.as_ref().map(|l| l.max_extent.as_str()))?;
        n.max_extent = self.larger(&high, r.as_ref().map(|r| r.max_extent.as_str()))?;
        self.dirty.insert(n.id);
        self.cache.insert(n.id, n.clone());
        Ok(n)
    }
    fn rotate_right(&mut self, mut n: Node) -> Result<i64, String> {
        let mut l = self.get(n.left)?.ok_or("Broken interval index")?;
        n.left = l.right;
        let n = self.update(n)?;
        l.right = Some(n.id);
        Ok(self.update(l)?.id)
    }
    fn rotate_left(&mut self, mut n: Node) -> Result<i64, String> {
        let mut r = self.get(n.right)?.ok_or("Broken interval index")?;
        n.right = r.left;
        let n = self.update(n)?;
        r.left = Some(n.id);
        Ok(self.update(r)?.id)
    }
    fn balance(&mut self, n: Node) -> Result<i64, String> {
        let mut n = self.update(n)?;
        let l = self.get(n.left)?;
        let r = self.get(n.right)?;
        let skew = height(&l) - height(&r);
        if skew > 1 {
            let l = l.ok_or("Broken interval index")?;
            if height(&self.get(l.left)?) < height(&self.get(l.right)?) {
                n.left = Some(self.rotate_left(l)?);
            }
            return self.rotate_right(n);
        }
        if skew < -1 {
            let r = r.ok_or("Broken interval index")?;
            if height(&self.get(r.right)?) < height(&self.get(r.left)?) {
                n.right = Some(self.rotate_right(r)?);
            }
            return self.rotate_left(n);
        }
        Ok(n.id)
    }
    /// Adds an interval; its ID must not be stored yet.
    pub fn insert(&mut self, interval: &Interval) -> Result<(), String> {
        let id = self.new_id()?;
        self.db.execute(
            &format!("INSERT INTO {}(ord,id,start_json,end_json,start_time,end_time,first,last,metadata,extent) VALUES(CAST(?1 AS INTEGER),?2,?3,?4,q(?5),q(?6),q_min(q(?5),q(?6)),q_max(q(?5),q(?6)),?7,q_sub(q_max(q(?5),q(?6)),q_min(q(?5),q(?6))))", self.intervals),
            &[&id.to_string(), interval.id, interval.start_json, interval.end_json, interval.start, interval.end, interval.metadata],
        )?;
        let row = self.db.query(
            &format!(
                "SELECT first,last,extent FROM {} WHERE ord=CAST(?1 AS INTEGER)",
                self.intervals
            ),
            &[&id.to_string()],
        )?;
        let r = row.first().ok_or("Broken interval index")?;
        let node = Node {
            id,
            left: None,
            right: None,
            height: 1,
            key: interval.id.into(),
            first: r[0].clone().ok_or("Broken interval index")?,
            last: r[1].clone().ok_or("Broken interval index")?,
            extent: r[2].clone().ok_or("Broken interval index")?,
            min: String::new(),
            max: String::new(),
            max_first: String::new(),
            cnt: 1,
            min_extent: String::new(),
            max_extent: String::new(),
        };
        let first = node.first.clone();
        self.cache.insert(id, node);
        self.root = Some(self.insert_at(self.root, &first, interval.id, id)?);
        Ok(())
    }
    fn insert_at(
        &mut self,
        at: Option<i64>,
        first: &str,
        key: &str,
        id: i64,
    ) -> Result<i64, String> {
        let Some(mut n) = self.get(at)? else {
            let n = self.get(Some(id))?.ok_or("Broken interval index")?;
            return Ok(self.update(n)?.id);
        };
        match self.compare(first, key, &n)? {
            0 => return Err("Duplicate interval".into()),
            c if c < 0 => n.left = Some(self.insert_at(n.left, first, key, id)?),
            _ => n.right = Some(self.insert_at(n.right, first, key, id)?),
        }
        self.balance(n)
    }
    /// Removes the interval with this ID, if stored.
    pub fn remove(&mut self, key: &str) -> Result<bool, String> {
        let rows = self.db.query(
            &format!("SELECT first FROM {} WHERE id=?1", self.intervals),
            &[key],
        )?;
        let Some(first) = rows.first().and_then(|r| r[0].clone()) else {
            return Ok(false);
        };
        self.root = self.remove_at(self.root, &first, key)?;
        Ok(true)
    }
    fn remove_at(
        &mut self,
        at: Option<i64>,
        first: &str,
        key: &str,
    ) -> Result<Option<i64>, String> {
        let mut n = self.get(at)?.ok_or("Broken interval index")?;
        match self.compare(first, key, &n)? {
            c if c < 0 => n.left = self.remove_at(n.left, first, key)?,
            c if c > 0 => n.right = self.remove_at(n.right, first, key)?,
            _ => {
                self.db.execute(
                    &format!(
                        "DELETE FROM {} WHERE ord=CAST(?1 AS INTEGER)",
                        self.intervals
                    ),
                    &[&n.id.to_string()],
                )?;
                if n.left.is_none() || n.right.is_none() {
                    self.drop(n.id);
                    return Ok(n.left.or(n.right));
                }
                // The in-order successor's interval moves into this node; its node goes.
                let mut successor = self.get(n.right)?.ok_or("Broken interval index")?;
                while let Some(left) = successor.left {
                    successor = self.get(Some(left))?.ok_or("Broken interval index")?;
                }
                self.db.execute(
                    &format!(
                        "UPDATE {} SET ord=CAST(?1 AS INTEGER) WHERE ord=CAST(?2 AS INTEGER)",
                        self.intervals
                    ),
                    &[&n.id.to_string(), &successor.id.to_string()],
                )?;
                n.key = successor.key;
                n.first = successor.first;
                n.last = successor.last;
                n.extent = successor.extent;
                n.right = self.remove_min(n.right)?;
            }
        }
        self.balance(n).map(Some)
    }
    fn remove_min(&mut self, at: Option<i64>) -> Result<Option<i64>, String> {
        let mut n = self.get(at)?.ok_or("Broken interval index")?;
        if n.left.is_none() {
            self.drop(n.id);
            return Ok(n.right);
        }
        n.left = self.remove_min(n.left)?;
        self.balance(n).map(Some)
    }
    fn drop(&mut self, id: i64) {
        self.cache.remove(&id);
        self.dirty.remove(&id);
        self.dropped.insert(id);
    }
    /// Writes changed nodes and the root.
    pub fn flush(&mut self) -> Result<(), String> {
        for id in self.dropped.drain() {
            self.db.execute(
                &format!("DELETE FROM {} WHERE id=CAST(?1 AS INTEGER)", self.nodes),
                &[&id.to_string()],
            )?;
        }
        for id in self.dirty.drain() {
            let n = &self.cache[&id];
            let opt = |v: Option<i64>| v.map(|v| v.to_string()).unwrap_or_default();
            self.db.execute(
                &format!("INSERT OR REPLACE INTO {}(id,left_id,right_id,min_time,max_time,max_first,cnt,min_extent,max_extent,height) VALUES(CAST(?1 AS INTEGER),CAST(NULLIF(?2,'') AS INTEGER),CAST(NULLIF(?3,'') AS INTEGER),q(?4),q(?5),q(?6),CAST(?7 AS INTEGER),q(?8),q(?9),CAST(?10 AS INTEGER))", self.nodes),
                &[&n.id.to_string(), &opt(n.left), &opt(n.right), &n.min, &n.max, &n.max_first, &n.cnt.to_string(), &n.min_extent, &n.max_extent, &n.height.to_string()],
            )?;
        }
        set_root(self.db, self.nodes, self.root)
    }
}

pub(crate) fn set_root(db: &Connection, nodes: &str, root: Option<i64>) -> Result<(), String> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS interval_roots(name TEXT PRIMARY KEY,root INTEGER) STRICT",
        &[],
    )?;
    db.execute(
        "INSERT OR REPLACE INTO interval_roots(name,root) VALUES(?1,CAST(NULLIF(?2,'') AS INTEGER))",
        &[nodes, &root.map(|r| r.to_string()).unwrap_or_default()],
    )
}

/// Height of a perfectly balanced subtree over `size` intervals (its bit length).
pub(crate) fn balanced_height(size: &str) -> String {
    let mut sql = String::from("CASE");
    for bits in 1..=20 {
        sql.push_str(&format!(" WHEN {size}<{} THEN {bits}", 1u64 << bits));
    }
    sql + " ELSE 21 END"
}

/// A token identifying the saved state; files and baselines with equal tokens are equal.
pub(crate) fn token() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    format!(
        "{:x}-{:x}-{:x}",
        nanos,
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

/// The index layout and save token of a file, if it records them in a data table.
pub(crate) fn layout(db: &Connection) -> Result<Option<(String, String)>, String> {
    if db.scalar(
        "SELECT count(*) FROM sqlite_schema WHERE name='index_layout' AND type='table'",
        &[],
    )? == "0"
    {
        return Ok(None);
    }
    let rows = db.query(
        "SELECT CAST(version AS TEXT),token FROM index_layout WHERE singleton=1",
        &[],
    )?;
    Ok(rows
        .first()
        .and_then(|r| Some((r[0].clone()?, r[1].clone()?))))
}
pub(crate) fn set_layout(db: &Connection, token: &str) -> Result<(), String> {
    db.execute("CREATE TABLE IF NOT EXISTS index_layout(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,token TEXT NOT NULL) STRICT", &[])?;
    db.execute(
        "INSERT OR REPLACE INTO index_layout VALUES(1,CAST(?1 AS INTEGER),?2)",
        &[LAYOUT, token],
    )
}
