// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! A small RAII binding to the same system SQLite linked by sqlite-rational.
//!
//! The store needs only a handful of SQLite calls, and sqlite-rational must register its
//! functions, collation and virtual table on the very connection the queries run on, so this
//! declares the C functions directly instead of pulling in a binding crate that might link a
//! second SQLite. Every value crosses the boundary as text: parameters are bound as TEXT and
//! columns are read back as TEXT (NULL becomes `None`), which suits exact rationals, which
//! sqlite-rational keeps as canonical `n/d` strings anyway.
//!
//! Numeric constants below are SQLite's documented codes, written inline: open flags
//! (1 `SQLITE_OPEN_READONLY`, 2 `SQLITE_OPEN_READWRITE`, 4 `SQLITE_OPEN_CREATE`), result
//! codes (0 `SQLITE_OK`, 5 `SQLITE_BUSY`, 6 `SQLITE_LOCKED`, 100 `SQLITE_ROW`,
//! 101 `SQLITE_DONE`), column type 5 `SQLITE_NULL`, and limit IDs (0 `SQLITE_LIMIT_LENGTH`,
//! 1 `SQLITE_LIMIT_SQL_LENGTH`, 2 `SQLITE_LIMIT_COLUMN`, 3 `SQLITE_LIMIT_EXPR_DEPTH`).
use std::{
    cell::Cell,
    ffi::{c_char, c_int, c_void, CStr, CString},
    marker::PhantomData,
    path::Path,
    ptr, slice,
};
extern "C" {
    fn sqlite3_open_v2(
        path: *const c_char,
        db: *mut *mut c_void,
        flags: c_int,
        vfs: *const c_char,
    ) -> c_int;
    fn sqlite3_backup_init(
        destination: *mut c_void,
        destination_name: *const c_char,
        source: *mut c_void,
        source_name: *const c_char,
    ) -> *mut c_void;
    fn sqlite3_backup_step(backup: *mut c_void, pages: c_int) -> c_int;
    fn sqlite3_backup_finish(backup: *mut c_void) -> c_int;
    fn sqlite3_close(db: *mut c_void) -> c_int;
    fn sqlite3_errmsg(db: *mut c_void) -> *const c_char;
    fn sqlite3_prepare_v2(
        db: *mut c_void,
        sql: *const c_char,
        len: c_int,
        stmt: *mut *mut c_void,
        tail: *mut *const c_char,
    ) -> c_int;
    fn sqlite3_bind_text(
        stmt: *mut c_void,
        index: c_int,
        text: *const c_char,
        len: c_int,
        destructor: Option<unsafe extern "C" fn(*mut c_void)>,
    ) -> c_int;
    fn sqlite3_step(stmt: *mut c_void) -> c_int;
    fn sqlite3_column_count(stmt: *mut c_void) -> c_int;
    fn sqlite3_column_type(stmt: *mut c_void, col: c_int) -> c_int;
    fn sqlite3_column_text(stmt: *mut c_void, col: c_int) -> *const u8;
    fn sqlite3_column_bytes(stmt: *mut c_void, col: c_int) -> c_int;
    fn sqlite3_finalize(stmt: *mut c_void) -> c_int;
    fn sqlite3_busy_timeout(db: *mut c_void, ms: c_int) -> c_int;
    fn sqlite3_limit(db: *mut c_void, id: c_int, value: c_int) -> c_int;
    fn sqlite3_progress_handler(
        db: *mut c_void,
        steps: c_int,
        callback: Option<unsafe extern "C" fn(*mut c_void) -> c_int>,
        context: *mut c_void,
    );
    /// From the statically linked sqlite-rational: registers q(), the q_* functions, the
    /// RATIONAL_V1 collation and the rational_index virtual-table module on one connection.
    fn sqlite_rational_register(db: *mut c_void) -> c_int;
}
/// An open SQLite connection with sqlite-rational registered and the store's safety pragmas
/// applied. Closed when dropped. Not shared across threads: callers open one per operation.
pub struct Connection {
    raw: *mut c_void,
    /// Remaining progress-handler ticks (each 1000 virtual-machine instructions) before SQLite
    /// interrupts the running statement; boxed so the pointer handed to SQLite stays valid when
    /// the `Connection` moves. Only consulted once a budget is installed (`limit_reads`, or
    /// `OCH_CONVERSION_LIMITS=1` at open). Refilled for each statement, so it bounds each
    /// query, not the whole conversion: one budget for every insert of a large file ran out
    /// near 10,000 moments (#193).
    _budget: Box<Cell<u64>>,
}
/// Progress-handler ticks per statement: about 20 million instructions.
const BUDGET: u64 = 20000;
/// SQLite's progress callback: counts down the connection's budget and returns non-zero
/// (interrupting the statement with `SQLITE_INTERRUPT`) once it reaches zero.
unsafe extern "C" fn progress(context: *mut c_void) -> c_int {
    let remaining = &*context.cast::<Cell<u64>>();
    remaining.set(remaining.get().saturating_sub(1));
    if remaining.get() == 0 {
        1
    } else {
        0
    }
}
/// A prepared statement, finalized when dropped; the lifetime ties it to its connection so the
/// connection cannot be closed while the statement is alive.
struct Statement<'a> {
    raw: *mut c_void,
    _db: PhantomData<&'a Connection>,
}
impl Drop for Connection {
    fn drop(&mut self) {
        unsafe {
            sqlite3_close(self.raw);
        }
    }
}
impl Drop for Statement<'_> {
    fn drop(&mut self) {
        unsafe {
            sqlite3_finalize(self.raw);
        }
    }
}
impl Connection {
    /// Opens `path` read-write and creating it when `create` is true, otherwise read-only.
    ///
    /// Waits up to 5 s for another connection's lock (busy timeout), registers sqlite-rational,
    /// and sets the pragmas every store connection relies on:
    /// - `trusted_schema=OFF`: functions and virtual tables named in a file's schema (views,
    ///   triggers, CHECK constraints, defaults) cannot run with side effects, since the file
    ///   may come from anyone (an upload, a downloaded `.och`).
    /// - `foreign_keys=ON`: enforce any foreign keys a schema declares.
    /// - `cache_size=-2048` (2 MiB), `mmap_size=0`, `temp_store=FILE`: keep memory small and
    ///   predictable; sorts and temporary results spill to disk instead of RAM.
    ///
    /// With `OCH_CONVERSION_LIMITS=1` in the environment (set by `och-convert`) it also caps
    /// string/blob size (32 MiB), SQL length, column count and expression depth, and installs the
    /// instruction budget, so a hostile upload cannot make a conversion run unbounded.
    ///
    /// Errors: a non-Unicode path, or SQLite's message when the file cannot be opened or the
    /// extension cannot be registered.
    pub fn open(path: &Path, create: bool) -> Result<Self, String> {
        let name = CString::new(path.to_str().ok_or("The file path must be Unicode")?)
            .map_err(|e| e.to_string())?;
        let mut raw = ptr::null_mut();
        let result = unsafe {
            sqlite3_open_v2(
                name.as_ptr(),
                &mut raw,
                if create { 2 | 4 } else { 1 },
                ptr::null(),
            )
        };
        if raw.is_null() {
            return Err("Could not open SQLite file".into());
        }
        let db = Self {
            raw,
            _budget: Box::new(Cell::new(BUDGET)),
        };
        if result != 0 {
            return Err(db.error());
        }
        unsafe {
            sqlite3_busy_timeout(raw, 5000);
            if std::env::var("OCH_CONVERSION_LIMITS").as_deref() == Ok("1") {
                sqlite3_limit(raw, 0, 32 * 1024 * 1024);
                sqlite3_limit(raw, 1, 100000);
                sqlite3_limit(raw, 2, 128);
                sqlite3_limit(raw, 3, 128);
                sqlite3_progress_handler(raw, 1000, Some(progress), db._budget.as_ptr().cast());
            }
        }
        if unsafe { sqlite_rational_register(raw) } != 0 {
            return Err(db.error());
        }
        db.execute("PRAGMA trusted_schema=OFF", &[])?;
        db.execute("PRAGMA foreign_keys=ON", &[])?;
        db.execute("PRAGMA cache_size=-2048", &[])?;
        db.execute("PRAGMA mmap_size=0", &[])?;
        db.execute("PRAGMA temp_store=FILE", &[])?;
        Ok(db)
    }
    /// Applies the same limits as `OCH_CONVERSION_LIMITS` to this connection and installs its
    /// instruction budget (BUDGET ticks of 1000 instructions, about 20 million per statement).
    /// The desktop app uses it for browsing queries, so one viewport request cannot pin a CPU
    /// or build huge results however the file was crafted.
    pub fn limit_reads(&mut self) {
        unsafe {
            sqlite3_limit(self.raw, 0, 32 * 1024 * 1024);
            sqlite3_limit(self.raw, 1, 100000);
            sqlite3_limit(self.raw, 2, 128);
            sqlite3_limit(self.raw, 3, 128);
            self._budget.set(BUDGET);
            sqlite3_progress_handler(self.raw, 1000, Some(progress), self._budget.as_ptr().cast());
        }
    }
    /// SQLite's message for the connection's most recent failure.
    fn error(&self) -> String {
        unsafe {
            CStr::from_ptr(sqlite3_errmsg(self.raw))
                .to_string_lossy()
                .into_owned()
        }
    }
    /// Copies this database page by page into `path` (created if missing, its previous
    /// contents replaced) with SQLite's online backup API. The copy is a consistent snapshot of
    /// the source. Each step copies 128 pages; while either side is busy or locked by another
    /// connection it retries every 20 ms for up to 10 s, then gives up with SQLite's error.
    pub fn backup_to(&self, path: &Path) -> Result<(), String> {
        let destination = Self::open(path, true)?;
        let name = c"main";
        let backup =
            unsafe { sqlite3_backup_init(destination.raw, name.as_ptr(), self.raw, name.as_ptr()) };
        if backup.is_null() {
            return Err(destination.error());
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        // 101 SQLITE_DONE: every page copied; 0 SQLITE_OK: more pages remain;
        // 5/6 SQLITE_BUSY/SQLITE_LOCKED: try again shortly, until the deadline.
        let result = loop {
            let rc = unsafe { sqlite3_backup_step(backup, 128) };
            match rc {
                101 => break Ok(()),
                0 => {}
                5 | 6 if std::time::Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                _ => break Err(destination.error()),
            }
        };
        // Always release the backup handle, even after a failed step.
        let finished = unsafe { sqlite3_backup_finish(backup) };
        result?;
        if finished != 0 {
            return Err(destination.error());
        }
        Ok(())
    }
    /// Runs one SQL statement with text parameters and returns every row, each column as text
    /// (`None` for NULL). No row or byte cap; see `query_limited`.
    pub fn query(
        &self,
        sql: &str,
        parameters: &[&str],
    ) -> Result<Vec<Vec<Option<String>>>, String> {
        self.query_limited(sql, parameters, usize::MAX, usize::MAX)
    }
    /// Runs one SQL statement and collects its rows, failing once it would return more than
    /// `max_rows` rows or more than `max_bytes` bytes of column text in all, so a query over an
    /// untrusted or very large file cannot exhaust memory.
    ///
    /// `parameters` bind in order to `?`, `?1`, `?2`, … as TEXT; SQL that needs a number casts
    /// it (`CAST(? AS INTEGER)`), and rationals go through `q(?)`. Only the first statement in
    /// `sql` is prepared; any text after it is ignored. Errors: SQLite's message for a prepare,
    /// bind or step failure (including an interrupt from the instruction budget), a budget
    /// error, or a column that is not UTF-8.
    pub fn query_limited(
        &self,
        sql: &str,
        parameters: &[&str],
        max_rows: usize,
        max_bytes: usize,
    ) -> Result<Vec<Vec<Option<String>>>, String> {
        let sql = CString::new(sql).map_err(|e| e.to_string())?;
        let mut raw = ptr::null_mut();
        if unsafe { sqlite3_prepare_v2(self.raw, sql.as_ptr(), -1, &mut raw, ptr::null_mut()) } != 0
        {
            return Err(self.error());
        }
        let stmt = Statement {
            raw,
            _db: PhantomData,
        };
        // Each statement has the whole budget.
        self._budget.set(BUDGET);
        for (i, value) in parameters.iter().enumerate() {
            let len: c_int = value
                .len()
                .try_into()
                .map_err(|_| "SQLite value is too large")?;
            // SQLITE_STATIC: parameters remain borrowed until this statement is finalized.
            if unsafe {
                sqlite3_bind_text(stmt.raw, (i + 1) as c_int, value.as_ptr().cast(), len, None)
            } != 0
            {
                return Err(self.error());
            }
        }
        let mut rows = Vec::new();
        let mut bytes = 0usize;
        // Step until 101 SQLITE_DONE; each 100 SQLITE_ROW is copied out before the next step,
        // since SQLite's column pointers are valid only until then.
        loop {
            match unsafe { sqlite3_step(stmt.raw) } {
                101 => break,
                100 => {
                    if rows.len() >= max_rows {
                        return Err("SQLite query exceeds row budget".into());
                    }
                    let mut row = Vec::new();
                    for col in 0..unsafe { sqlite3_column_count(stmt.raw) } {
                        // 5 is SQLITE_NULL; any other type is read through SQLite's text
                        // conversion (integers become decimal text).
                        if unsafe { sqlite3_column_type(stmt.raw, col) } == 5 {
                            row.push(None);
                            continue;
                        }
                        let ptr = unsafe { sqlite3_column_text(stmt.raw, col) };
                        let len = unsafe { sqlite3_column_bytes(stmt.raw, col) } as usize;
                        bytes = bytes.saturating_add(len);
                        if bytes > max_bytes {
                            return Err("SQLite query exceeds memory budget".into());
                        }
                        if ptr.is_null() {
                            return Err("SQLite could not allocate a result value".into());
                        }
                        row.push(Some(
                            String::from_utf8(unsafe { slice::from_raw_parts(ptr, len) }.to_vec())
                                .map_err(|e| e.to_string())?,
                        ));
                    }
                    rows.push(row);
                }
                _ => return Err(self.error()),
            }
        }
        Ok(rows)
    }
    /// Runs a statement for its effect (DDL, writes, pragmas, transaction control), discarding
    /// any rows it returns.
    pub fn execute(&self, sql: &str, parameters: &[&str]) -> Result<(), String> {
        self.query(sql, parameters).map(|_| ())
    }
    /// The first column of the first row, as text: for `count(*)`, pragmas and single exact
    /// rational results. Errors when there is no row or that value is NULL.
    pub fn scalar(&self, sql: &str, parameters: &[&str]) -> Result<String, String> {
        self.query(sql, parameters)?
            .into_iter()
            .next()
            .and_then(|row| row.into_iter().next().flatten())
            .ok_or_else(|| "Missing SQLite result".into())
    }
}
