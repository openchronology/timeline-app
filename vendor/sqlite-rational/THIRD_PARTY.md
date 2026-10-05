# Dependencies

- GNU MP (GMP): https://gmplib.org/
  Dual licensed LGPL version 3 or later / GPL version 2 or later.
  This project uses GMP via system development headers and libraries; it does not
  vendor GMP source. The loadable extension links to the system GMP library.
  Distribution of binaries must satisfy the chosen GMP license, including its
  notices and applicable relinking/source requirements. Static distribution
  requires particular attention to those requirements.
- SQLite: https://www.sqlite.org/copyright.html
  Public domain. The loadable extension uses the host SQLite extension API.
  Static embedding links the host's SQLite implementation.

The licenses of these dependencies do not change this project's own MIT license.
