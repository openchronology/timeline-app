# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Sets up OpenChronology after the Windows installer copies it (#116), as the other packages'
# setup does: the configuration in %ProgramData%\OpenChronology, the bundled PostgreSQL 17
# (initialized once and run as the OpenChronologyPostgreSQL service on 127.0.0.1:5442), the
# database with pgmp, the migration and the OpenChronology service. Run again (an upgrade, or
# by hand as an administrator), it keeps the configuration and database, migrates them to this
# version and starts the services. Written for Windows PowerShell 5.1, present on every
# Windows. Usage: powershell -ExecutionPolicy Bypass -File setup.ps1 [-InstallDir <dir>]
param([string]$InstallDir = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$data = Join-Path $env:ProgramData 'OpenChronology'
$config = Join-Path $data 'openchronology.env'
$superuserFile = Join-Path $data 'postgres-superuser.txt'
$pgdata = Join-Path $data 'pgdata'
$logs = Join-Path $data 'logs'
$pg = Join-Path $InstallDir 'pgsql\bin'
$node = Join-Path $InstallDir 'node\node.exe'
$app = Join-Path $InstallDir 'app'
$port = 5442
$pgService = 'OpenChronologyPostgreSQL'
$service = 'OpenChronology'
New-Item -ItemType Directory -Force -Path $data, $logs | Out-Null
Start-Transcript -Path (Join-Path $data 'setup.log') -Append | Out-Null
try {
  # Files are written without a byte-order mark: PostgreSQL would read one as part of a password.
  function Write-Text([string]$Path, [string]$Text) { [IO.File]::WriteAllText($Path, $Text) }
  function New-Secret([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    ($buffer | ForEach-Object { $_.ToString('x2') }) -join ''
  }
  # Only administrators and the system read the configuration and secrets; the server's
  # LocalService account reads the configuration and writes its logs; PostgreSQL's
  # NetworkService account owns its data.
  function Set-Access([string]$Path, [string[]]$Grants) {
    & icacls $Path /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' $Grants | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Setting access to $Path failed" }
  }
  Set-Access $data @('*S-1-5-19:(RX)')
  # A file: administrators and the system only, and LocalService reading when named.
  function Set-FileAccess([string]$Path, [string[]]$Grants) {
    & icacls $Path /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' $Grants | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Setting access to $Path failed" }
  }
  Set-Access $logs @('*S-1-5-19:(OI)(CI)M')

  # The configuration: created once, then the administrator's (each version's templates stay
  # in the installation's templates folder to compare).
  $existing = Test-Path $config
  if (-not $existing) {
    $superuser = New-Secret 24
    $password = New-Secret 24
    $template = Get-Content -Raw (Join-Path $InstallDir 'templates\openchronology.env.example')
    $template = $template -replace '(?m)^AUTH_ENCRYPTION_KEY=\r?$', ('AUTH_ENCRYPTION_KEY=' + (New-Secret 32))
    $template = $template -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=postgresql://openchronology:$password@127.0.0.1:$port/openchronology"
    Write-Text $config $template
    Write-Text $superuserFile $superuser
    Set-FileAccess $superuserFile @()
    Set-FileAccess $config @('*S-1-5-19:R')
  }
  $syslog = Join-Path $data 'syslog.env'
  if (-not (Test-Path $syslog)) {
    Copy-Item (Join-Path $InstallDir 'templates\syslog.env.example') $syslog
  }
  $superuser = (Get-Content -Raw $superuserFile).Trim()
  $url = (Select-String -Path $config -Pattern '^DATABASE_URL=postgresql://openchronology:([^@]+)@').Matches
  if (-not $url) { throw "DATABASE_URL in $config does not name the openchronology role's password" }
  $password = $url[0].Groups[1].Value

  # PostgreSQL 17: initialized once, listening on loopback only, run as a service.
  if (-not (Test-Path (Join-Path $pgdata 'PG_VERSION'))) {
    # initdb drops administrator rights (a restricted token) and runs as this account alone, so
    # its folder and password file are this account's while it runs.
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    New-Item -ItemType Directory -Force -Path $pgdata | Out-Null
    Set-Access $pgdata @("*${me}:(OI)(CI)F", '*S-1-5-20:(OI)(CI)F')
    $pwfile = Join-Path ([IO.Path]::GetTempPath()) "openchronology-initdb-$PID.pw"
    Write-Text $pwfile $superuser
    try {
      & (Join-Path $pg 'initdb.exe') -D $pgdata -U postgres "--pwfile=$pwfile" -E UTF8 --locale=C --auth=scram-sha-256 | Out-Host
      if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
    } finally { Remove-Item -Force $pwfile -ErrorAction SilentlyContinue }
    Add-Content -Path (Join-Path $pgdata 'postgresql.conf') -Value "`nport = $port`nlisten_addresses = '127.0.0.1'`n"
    # From now on PostgreSQL's NetworkService account owns it, with administrators and the system.
    Set-Access $pgdata @('*S-1-5-20:(OI)(CI)F')
  }
  if (-not (Get-Service $pgService -ErrorAction SilentlyContinue)) {
    & (Join-Path $pg 'pg_ctl.exe') register -N $pgService -U 'NT AUTHORITY\NetworkService' -D $pgdata -S auto -w | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Registering the PostgreSQL service failed' }
  }
  Start-Service $pgService
  $env:PGPASSWORD = $superuser
  # Notices (such as "already exists, skipping") would reach stderr, which Windows
  # PowerShell 5.1 turns into errors; psql's exit code says whether SQL failed.
  $env:PGOPTIONS = '-c client_min_messages=warning'
  function Invoke-Sql([string]$Database, [string]$Sql) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $out = & (Join-Path $pg 'psql.exe') -X -q -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $Database -c $Sql 2>&1
    } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw "SQL failed: $Sql`n$out" }
    return ($out | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] })
  }
  for ($i = 0; $i -lt 60; $i++) {
    & (Join-Path $pg 'pg_isready.exe') -q -h 127.0.0.1 -p $port
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if (-not (Invoke-Sql postgres "SELECT 1 FROM pg_roles WHERE rolname='openchronology'")) {
    Invoke-Sql postgres "CREATE ROLE openchronology LOGIN PASSWORD '$password'" | Out-Null
  }
  if (-not (Invoke-Sql postgres "SELECT 1 FROM pg_database WHERE datname='openchronology'")) {
    Invoke-Sql postgres 'CREATE DATABASE openchronology OWNER openchronology' | Out-Null
  }
  # pgmp is not a trusted extension: the superuser creates it once for the application's role.
  Invoke-Sql openchronology 'CREATE EXTENSION IF NOT EXISTS pgmp' | Out-Null
  Remove-Item Env:\PGPASSWORD, Env:\PGOPTIONS

  # The schema: created, or migrated to this version.
  $env:OCH_CONFIG = $config
  & $node (Join-Path $app 'server\migrate.mjs') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Migrating the database failed' }

  # The server's service (WinSW): installed once. It runs the same wrapper, which reads its
  # settings (openchronology-service.xml) each time it starts, so an upgrade only restarts it.
  $wrapper = Join-Path $InstallDir 'service\openchronology-service.exe'
  if (-not (Get-Service $service -ErrorAction SilentlyContinue)) {
    & $wrapper install | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Installing the OpenChronology service failed' }
  }
  Restart-Service $service -Force
  $origin = ((Select-String -Path $config -Pattern '^APP_ORIGIN=(.*)$').Matches[0].Groups[1].Value)
  $healthy = $false
  for ($i = 0; $i -lt 90 -and -not $healthy; $i++) {
    try { $healthy = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:5173/healthz').StatusCode -eq 200 }
    catch { Start-Sleep -Seconds 1 }
  }
  if (-not $healthy) {
    # What went wrong: the service's state and the last of its logs (WinSW's and the server's).
    Get-Service $service | Format-List Name, Status, StartType | Out-Host
    Get-ChildItem $logs -Filter *.log -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Host "--- $($_.Name)"
      Get-Content -Tail 40 $_.FullName | Out-Host
    }
    throw "The server did not answer; see $logs"
  }
  if ($existing) { Write-Host "`nOpenChronology is upgraded: its configuration and database are kept, and the database is migrated to this version." }
  Write-Host @"

OpenChronology is installed and running at $origin.

Next steps, as an administrator:
  - Set APP_ORIGIN, email, an administrator and sign-in providers in
    $config, then run openchronology-migrate (in $InstallDir),
    which creates the administrator and restarts the server.
  - Put an HTTPS reverse proxy in front of it for public use.
  - Back up AUTH_ENCRYPTION_KEY from that file separately from the database.

See $InstallDir\README.Windows.txt.
"@
} finally {
  Stop-Transcript | Out-Null
}
