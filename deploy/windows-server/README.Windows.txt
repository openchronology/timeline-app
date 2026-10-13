OpenChronology server for Windows
=================================

Install
-------

Run openchronology-server-windows-amd64-setup.exe (as an administrator; it asks). It installs
into C:\Program Files\OpenChronology Server everything the server needs: its own PostgreSQL 17
with the pgmp extension, Node.js 24, the platform and the SQLite converter. It then:

  - writes C:\ProgramData\OpenChronology\openchronology.env (readable only by administrators
    and the server), with a new AUTH_ENCRYPTION_KEY and the database's password;
  - initializes PostgreSQL in C:\ProgramData\OpenChronology\pgdata, listening on
    127.0.0.1:5442 only, as the OpenChronologyPostgreSQL service (Network Service account);
    its superuser password is in postgres-superuser.txt beside the configuration;
  - creates the openchronology database with pgmp and migrates it;
  - starts the OpenChronology service (Local Service account), which listens on
    127.0.0.1:5173. Both services start with Windows.

Unattended: openchronology-server-windows-amd64-setup.exe /S (exit code 2 when setup did not
finish). Setup writes C:\ProgramData\OpenChronology\setup.log; it is safe to run again, as an
administrator: powershell -ExecutionPolicy Bypass -File "C:\Program Files\OpenChronology
Server\setup.ps1".

Configure
---------

Edit C:\ProgramData\OpenChronology\openchronology.env as an administrator, then restart the
OpenChronology service (Services, or Restart-Service OpenChronology):

  - APP_ORIGIN: the public HTTPS origin users reach, without a trailing slash. The server
    refuses a plain http:// origin other than localhost; on a trusted private network without
    a proxy, set ALLOW_INSECURE_ORIGIN=1 and HOST=0.0.0.0 to serve http://<name>:5173
    directly (and allow port 5173 in Windows Defender Firewall). The server's log is in
    C:\ProgramData\OpenChronology\logs; if the website reports "Server misconfigured", the
    reason is there.
  - ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD for the first administrator,
    created by openchronology-migrate. The password is used once; to sign in with it again
    (or with a new one written there), run openchronology-reset-admin-password.
  - Sign-in providers, human verification, quotas: see the comments in the file and
    authentication.md, administration.md in the doc folder.

The commands are in C:\Program Files\OpenChronology Server; run them as an administrator:

  openchronology-migrate                 migrates the database and restarts the server
  openchronology-reset-admin-password    the administrator's password, from the configuration
  och-import-logs                        imports log files (log-import.md)

Back up AUTH_ENCRYPTION_KEY apart from the database: without it, enrolled authenticator
secrets cannot be decrypted. Do not change it once accounts exist.

Serve it publicly through an HTTPS reverse proxy (Caddy, IIS with URL Rewrite and ARR, or
nginx) forwarding to http://127.0.0.1:5173.

Upgrade
-------

Run the newer installer. It stops the services, replaces the program, keeps the configuration
and the database, migrates the database to the new version and starts the services again.
Back up first:

  "C:\Program Files\OpenChronology Server\pgsql\bin\pg_dump.exe" -h 127.0.0.1 -p 5442 ^
    -U postgres openchronology > openchronology.sql

(with the password in C:\ProgramData\OpenChronology\postgres-superuser.txt). Compare the
configuration with this version's template in C:\Program Files\OpenChronology Server\templates.

Remove
------

Settings > Apps > OpenChronology Server > Uninstall (or uninstall.exe /S). The services and
the program are removed; the configuration (including AUTH_ENCRYPTION_KEY) and the database
remain in C:\ProgramData\OpenChronology: delete that folder to remove them as well.
