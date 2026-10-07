# Third-party components

- **rational-map / rational-ordered-map 0.1.0**, MIT. The vendored npm archive includes its license; source and commit are recorded in `vendor/versions.json`. It uses **fraction.js 5.3.4**, MIT. Installed package licenses are under `node_modules/`.
- **sqlite-rational 0.1.0**, MIT. Source and license are in `vendor/sqlite-rational/`; source commit is recorded in `vendor/versions.json`.
- **pgmp 1.0.6**, LGPL 3 (see upstream COPYING and source headers). The deployment image builds the exact public source commit `1849585416f2bc3d070bf8cef6a659907687ec7f`; upstream license: https://github.com/dvarrazzo/pgmp/blob/1849585416f2bc3d070bf8cef6a659907687ec7f/COPYING.
- **GNU MP (GMP)**, LGPL 3 or later / GPL 2 or later. Desktop and PostgreSQL modules dynamically link system GMP; no GMP source or static GMP copy is bundled here. See `vendor/sqlite-rational/THIRD_PARTY.md` and your system package's notices/source provisions.
- **SQLite**, public domain; linked from the system package in desktop and server-converter builds.
- **reqwest 0.12.28**, MIT/Apache-2.0; native HTTPS transport, with **rustls** and **webpki-roots** as recorded in `src-tauri/Cargo.lock`. Their licenses remain in the crate packages.
- **Tauri and its Rust dependencies**, MIT/Apache-2.0 and other licenses recorded in crate packages and `src-tauri/Cargo.lock`. **serde/serde_json**, MIT/Apache-2.0.
- **Next.js 16.3.8**, MIT (Vercel); **React / React DOM 19.2.8**, MIT (Meta and contributors). Their original licenses are retained in installed packages and the standalone server distribution. The platform browser bundles retain dependency license notices. These packages are used only by the hosted platform, not the standalone HTML or Tauri editor.
- **node-postgres**, MIT. **esbuild**, MIT. **TypeScript**, Apache-2.0. **Playwright**, Apache-2.0. JavaScript dependency versions are in `package-lock.json`.

The Debian package includes this file, the application's GPLv3 license, the SQLite extension's license/notices, and the browser dependency license notices. System GMP, SQLite, GTK, and WebKit packages retain their own licenses.
