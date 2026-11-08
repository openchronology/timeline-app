# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Sets up OpenChronology after the Windows installer copies it (#116), as the other packages'
# setup does: the configuration in %ProgramData%\OpenChronology, the bundled PostgreSQL 17
# (initialized once and run as the OpenChronologyPostgreSQL service on 127.0.0.1:5442), the
# database with pgmp, the migration and the OpenChronology services. Run again (an upgrade, or
# by hand as an administrator), it keeps the configuration and database, migrates them to this
# version and starts the services. Written for Windows PowerShell 5.1, present on every
# Windows. Usage:
#   powershell -ExecutionPolicy Bypass -File setup.ps1 [-InstallDir <dir>] [-TrustExistingData]
param([string]$InstallDir = $PSScriptRoot, [switch]$TrustExistingData)
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
$me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function Test-Link([string]$Path) {
  [bool]((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)
}
# Replaces the access list of a file or folder in one step, protected from inheritance so that
# no other entry stays: administrators and the system in full, then each grant, 'SID=Rights'
# (a FileSystemRights name), inherited by a folder's contents unless it ends in '=here'.
function Set-Access([string]$Path, [string[]]$Grants) {
  if (Test-Link $Path) { throw "$Path is a link or junction; setup does not follow it" }
  $item = Get-Item -LiteralPath $Path -Force
  $folder = $item -is [IO.DirectoryInfo]
  $acl = if ($folder) { New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($grant in @('S-1-5-32-544=FullControl', 'S-1-5-18=FullControl') + $Grants) {
    $sid, $rights, $scope = $grant.Split('=')
    $inherit = if ($folder -and $scope -ne 'here') { 'ContainerInherit, ObjectInherit' } else { 'None' }
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        [Security.Principal.SecurityIdentifier]::new($sid), $rights, $inherit, 'None', 'Allow'))
  }
  $item.SetAccessControl($acl)
}
# Makes administrators the owner of a folder (taking it whatever its access list says), or with
# -Recurse of everything in it too, acting on links themselves rather than what they lead to.
function Set-Owner([string]$Path, [switch]$Recurse) {
  if ($Recurse) {
    & icacls $Path /setowner '*S-1-5-32-544' /T /C /L /Q | Out-Null
  } else {
    if (Test-Link $Path) { throw "$Path is a link or junction; setup does not follow it" }
    & takeown /F $Path /A | Out-Null
  }
  if ($LASTEXITCODE -ne 0) { throw "Making administrators the owner of $Path failed; take ownership with takeown /A /R, then run setup again" }
}
# Resets what is in a folder to inherit the folder's access list alone.
function Reset-Contents([string]$Path) {
  & icacls (Join-Path $Path '*') /reset /T /C /L /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Resetting access to the files in $Path failed" }
}
# The owners setup trusts: another account cannot make a file the administrators', the system's
# or an administrator's.
$trustedOwners = @('S-1-5-32-544', 'S-1-5-18', $me)
try {
  $administrators = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544').Translate([Security.Principal.NTAccount]).Value.Split('\')[-1]
  foreach ($member in ([ADSI]"WinNT://./$administrators,group").Invoke('Members')) {
    $sid = [byte[]]($member.GetType().InvokeMember('objectSid', 'GetProperty', $null, $member, $null))
    $trustedOwners += [Security.Principal.SecurityIdentifier]::new($sid, 0).Value
  }
} catch { Write-Host "Listing the Administrators group failed ($_); trusting files of the administrators, the system and this account" }
function Test-TrustedOwner([string]$Path) {
  try {
    if (Test-Link $Path) { return $false }
    $owner = (Get-Item -LiteralPath $Path -Force).GetAccessControl('Owner').GetOwner([Security.Principal.SecurityIdentifier]).Value
    return $trustedOwners -contains $owner
  } catch { return $false }
}

# The data folder. Any user may create folders in ProgramData, so another account may have made
# this one first, to plant a configuration, a superuser password or a database for setup to
# use. Whatever it finds, setup makes the folder the administrators' and replaces its access
# list. It then uses only what an administrator or the system owns: anything else stops setup,
# unless an administrator who has checked it runs setup again with -TrustExistingData.
New-Item -ItemType Directory -Force -Path $data | Out-Null
if (Test-Link $data) { throw "$data is a link or junction, which setup did not make; remove it and run setup again" }
Set-Owner $data
# Only administrators and the system read the configuration and secrets; the server's
# LocalService account reads the configuration and writes its logs; PostgreSQL's
# NetworkService account owns its data.
Set-Access $data @('S-1-5-19=ReadAndExecute=here')
$foreign = @(Get-ChildItem -LiteralPath $data -Force | Where-Object { -not (Test-TrustedOwner $_.FullName) })
if ($foreign) {
  $names = ($foreign | ForEach-Object { "  $($_.FullName)" }) -join "`n"
  if (-not $TrustExistingData) {
    throw @"
$data holds files that neither an administrator nor the system owns:
$names
Another account may have put them there to take over the database. Setup has made the folder
the administrators' and stopped without using them. Delete the folder or move it aside, then
run the installer again. If they are an earlier installation's files and you have checked
them, run instead, as an administrator:
  powershell -ExecutionPolicy Bypass -File "$InstallDir\setup.ps1" -TrustExistingData
"@
  }
  Write-Host "Taking these over, as -TrustExistingData asks:`n$names"
  Set-Owner $data -Recurse
  Reset-Contents $data
}
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Start-Transcript -Path (Join-Path $data 'setup.log') -Append | Out-Null
try {
  # Files are written without a byte-order mark: PostgreSQL would read one as part of a password.
  function Write-Text([string]$Path, [string]$Text) { [IO.File]::WriteAllText($Path, $Text) }
  function New-Secret([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    ($buffer | ForEach-Object { $_.ToString('x2') }) -join ''
  }
  Set-Access $logs @('S-1-5-19=Modify')

  # The installation, when not in Program Files (whose access list already keeps users from
  # changing programs): as there, users and the services read and run it, and only
  # administrators and the system change it.
  $installPath = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\') + '\'
  $programFiles = @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ } |
    ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') + '\' }
  if (-not ($programFiles | Where-Object { $installPath.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) {
    if ([IO.Path]::GetPathRoot($installPath) -eq $installPath) { throw "$InstallDir is a drive's root; install OpenChronology Server in a folder of its own" }
    Set-Owner $InstallDir
    Set-Access $InstallDir @('S-1-5-32-545=ReadAndExecute', 'S-1-5-19=ReadAndExecute', 'S-1-5-20=ReadAndExecute')
    Set-Owner $InstallDir -Recurse
    Reset-Contents $InstallDir
  }

  # The configuration: created once, then the administrator's (each version's templates stay
  # in the installation's templates folder to compare).
  $existing = Test-Path $config
  if (-not $existing) {
    $superuser = New-Secret 24
    $password = New-Secret 24
    $template = Get-Content -Raw (Join-Path $InstallDir 'templates\openchronology.env.example')
    $template = $template -replace '(?m)^AUTH_ENCRYPTION_KEY=\r?$', ('AUTH_ENCRYPTION_KEY=' + (New-Secret 32))
    $template = $template -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=postgresql://openchronology:$password@127.0.0.1:$port/openchronology"
    # Written in the data folder, whose contents only administrators and the system may read
    # until their access is set below.
    Write-Text $config $template
    Write-Text $superuserFile $superuser
  }
  # The syslog receiver's configuration (which holds its API key) and its routes, read by its
  # service's LocalService account.
  $syslog = Join-Path $data 'syslog.env'
  $routes = Join-Path $data 'syslog-routes.json'
  if (-not (Test-Path $syslog)) {
    Copy-Item (Join-Path $InstallDir 'templates\syslog.env.example') $syslog
  }
  if (-not (Test-Path $routes)) {
    Write-Text $routes "{`n  `"routes`": [],`n  `"default`": null`n}`n"
  }
  # The GitHub receiver's, likewise, and the folder where it keeps each item's board column
  # (GITHUB_STATE), which its LocalService account writes.
  $github = Join-Path $data 'github.env'
  $githubRoutes = Join-Path $data 'github-routes.json'
  $githubState = Join-Path $data 'github-state'
  if (-not (Test-Path $github)) {
    Copy-Item (Join-Path $InstallDir 'templates\github.env.example') $github
  }
  if (-not (Test-Path $githubRoutes)) {
    Write-Text $githubRoutes "{`n  `"routes`": [],`n  `"default`": null`n}`n"
  }
  New-Item -ItemType Directory -Force -Path $githubState | Out-Null
  Set-Access $githubState @('S-1-5-19=Modify')
  # Set on each run, so a file written anew since (readable by administrators only) is readable
  # by the services again, and no other entry stays.
  Set-Access $superuserFile @()
  foreach ($file in $config, $syslog, $routes, $github, $githubRoutes) { Set-Access $file @('S-1-5-19=Read') }
  $superuser = (Get-Content -Raw $superuserFile).Trim()
  $url = (Select-String -Path $config -Pattern '^DATABASE_URL=postgresql://openchronology:([^@]+)@').Matches
  if (-not $url) { throw "DATABASE_URL in $config does not name the openchronology role's password" }
  $password = $url[0].Groups[1].Value

  # PostgreSQL 17: initialized once, listening on loopback only, run as a service.
  if (-not (Test-Path (Join-Path $pgdata 'PG_VERSION'))) {
    # initdb drops administrator rights (a restricted token) and runs as this account alone, so
    # its folder and password file are this account's while it runs. The password file is in
    # the data folder, not in a temporary folder other accounts may write in.
    New-Item -ItemType Directory -Force -Path $pgdata | Out-Null
    Set-Access $pgdata @("$me=FullControl", 'S-1-5-20=FullControl')
    $pwfile = Join-Path $data "initdb-$PID.pw"
    Write-Text $pwfile $superuser
    try {
      Set-Access $pwfile @("$me=Read")
      & (Join-Path $pg 'initdb.exe') -D $pgdata -U postgres "--pwfile=$pwfile" -E UTF8 --locale=C --auth=scram-sha-256 | Out-Host
      if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
    } finally { Remove-Item -Force $pwfile -ErrorAction SilentlyContinue }
    Add-Content -Path (Join-Path $pgdata 'postgresql.conf') -Value "`nport = $port`nlisten_addresses = '127.0.0.1'`n"
  }
  # PostgreSQL's NetworkService account owns its data, with administrators and the system.
  Set-Access $pgdata @('S-1-5-20=FullControl')
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
  # The syslog and GitHub receivers and email delivery (WinSW, #125): installed once, to start
  # by hand until configured. An upgrade stopped them; the ones set to start with Windows start
  # again.
  foreach ($worker in @(
      @{ Name = 'OpenChronologySyslog'; Wrapper = 'openchronology-syslog-service.exe' },
      @{ Name = 'OpenChronologyGitHub'; Wrapper = 'openchronology-github-service.exe' },
      @{ Name = 'OpenChronologyMail'; Wrapper = 'openchronology-mail-service.exe' })) {
    if (-not (Get-Service $worker.Name -ErrorAction SilentlyContinue)) {
      & (Join-Path $InstallDir "service\$($worker.Wrapper)") install | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "Installing the $($worker.Name) service failed" }
    } elseif ((Get-Service $worker.Name).StartType -eq 'Automatic') {
      Restart-Service $worker.Name -Force
    }
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
  - For account email, set RESEND_API_KEY and AUTH_EMAIL_FROM there, then start the
    OpenChronologyMail service; for syslog, configure syslog.env and start
    OpenChronologySyslog; for GitHub, configure github.env and start
    OpenChronologyGitHub (README.Windows.txt).

See $InstallDir\README.Windows.txt.
"@
} finally {
  Stop-Transcript | Out-Null
}
