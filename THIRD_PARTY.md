# Third-party components

- **rational-map / rational-ordered-map 0.1.0**, MIT. The vendored npm archive includes its license; source and commit are recorded in `vendor/versions.json`. It uses **fraction.js 5.3.4**, MIT. Installed package licenses are under `node_modules/`.
- **sqlite-rational 0.1.0**, MIT. Source and license are in `vendor/sqlite-rational/`; source commit is recorded in `vendor/versions.json`.
- **pgmp 1.0.6**, LGPL 3 (see upstream COPYING and source headers). The deployment image builds the exact public source commit `1849585416f2bc3d070bf8cef6a659907687ec7f`; upstream license: https://github.com/dvarrazzo/pgmp/blob/1849585416f2bc3d070bf8cef6a659907687ec7f/COPYING.
- **GNU MP (GMP)**, LGPL 3 or later / GPL 2 or later. Desktop and PostgreSQL modules dynamically link system GMP; no GMP source or static GMP copy is bundled here. See `vendor/sqlite-rational/THIRD_PARTY.md` and your system package's notices/source provisions.
- **SQLite**, public domain; linked from the system package in the desktop build.
- **Tauri and its Rust dependencies**, MIT/Apache-2.0 and other licenses recorded in crate packages and `src-tauri/Cargo.lock`. **serde/serde_json**, MIT/Apache-2.0.
- **node-postgres**, MIT. **esbuild**, MIT. **TypeScript**, Apache-2.0. **Playwright**, Apache-2.0. JavaScript dependency versions are in `package-lock.json`.

The Debian package includes this file, the application's MIT license, the SQLite extension's license/notices, and the browser dependency license notices. System GMP, SQLite, GTK, and WebKit packages retain their own licenses.
