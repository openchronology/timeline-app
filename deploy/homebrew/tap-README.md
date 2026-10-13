# OpenChronology Homebrew tap

The [OpenChronology](https://github.com/openchronology/timeline-app) server for macOS.

```sh
brew install openchronology/tap/openchronology-server
openchronology-setup
```

`openchronology-setup` starts PostgreSQL 17 (with `brew services`) if needed, creates the
database, and starts the server on <http://localhost:5173>. See
`$(brew --prefix)/share/doc/openchronology-server/README.Homebrew` once installed.

The formula is published here by each stable release of `openchronology/timeline-app`
(`deploy/homebrew` there); please report problems in that repository.
