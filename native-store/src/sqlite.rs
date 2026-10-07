// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
//! A small RAII binding to the same system SQLite linked by sqlite-rational.
use std::{
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
    fn sqlite_rational_register(db: *mut c_void) -> c_int;
}
pub struct Connection {
    raw: *mut c_void,
    _budget: Box<u64>,
}
unsafe extern "C" fn progress(context: *mut c_void) -> c_int {
    let remaining = &mut *context.cast::<u64>();
    *remaining = remaining.saturating_sub(1);
    if *remaining == 0 {
        1
    } else {
        0
    }
}
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
        let mut db = Self {
            raw,
            _budget: Box::new(20000),
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
                sqlite3_progress_handler(
                    raw,
                    1000,
                    Some(progress),
                    (&mut *db._budget as *mut u64).cast(),
                );
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
    pub fn limit_reads(&mut self) {
        unsafe {
            sqlite3_limit(self.raw, 0, 32 * 1024 * 1024);
            sqlite3_limit(self.raw, 1, 100000);
            sqlite3_limit(self.raw, 2, 128);
            sqlite3_limit(self.raw, 3, 128);
            *self._budget = 20000;
            sqlite3_progress_handler(
                self.raw,
                1000,
                Some(progress),
                (&mut *self._budget as *mut u64).cast(),
            );
        }
    }
    fn error(&self) -> String {
        unsafe {
            CStr::from_ptr(sqlite3_errmsg(self.raw))
                .to_string_lossy()
                .into_owned()
        }
    }
    pub fn backup_to(&self, path: &Path) -> Result<(), String> {
        let destination = Self::open(path, true)?;
        let name = c"main";
        let backup =
            unsafe { sqlite3_backup_init(destination.raw, name.as_ptr(), self.raw, name.as_ptr()) };
        if backup.is_null() {
            return Err(destination.error());
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
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
        let finished = unsafe { sqlite3_backup_finish(backup) };
        result?;
        if finished != 0 {
            return Err(destination.error());
        }
        Ok(())
    }
    pub fn query(
        &self,
        sql: &str,
        parameters: &[&str],
    ) -> Result<Vec<Vec<Option<String>>>, String> {
        self.query_limited(sql, parameters, usize::MAX, usize::MAX)
    }
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
        loop {
            match unsafe { sqlite3_step(stmt.raw) } {
                101 => break,
                100 => {
                    if rows.len() >= max_rows {
                        return Err("SQLite query exceeds row budget".into());
                    }
                    let mut row = Vec::new();
                    for col in 0..unsafe { sqlite3_column_count(stmt.raw) } {
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
    pub fn execute(&self, sql: &str, parameters: &[&str]) -> Result<(), String> {
        self.query(sql, parameters).map(|_| ())
    }
    pub fn scalar(&self, sql: &str, parameters: &[&str]) -> Result<String, String> {
        self.query(sql, parameters)?
            .into_iter()
            .next()
            .and_then(|row| row.into_iter().next().flatten())
            .ok_or_else(|| "Missing SQLite result".into())
    }
}
