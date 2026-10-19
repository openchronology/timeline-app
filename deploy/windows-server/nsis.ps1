# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Makes makensis available for build.ps1, without depending on any one package feed (#225):
#   ./deploy/windows-server/nsis.ps1 -Destination <folder>
# In order: an NSIS already installed; a copy in -Destination (restored by CI's cache); the
# pinned portable release from SourceForge, checked against its SHA-256; Chocolatey. Each
# download is tried three times. In GitHub Actions the folder found goes on later steps' PATH.
param([Parameter(Mandatory = $true)][string]$Destination)
$ErrorActionPreference = 'Stop'

$version = '3.13'
$sha256 = 'BA63DFFC4410EE89193E1CB5A41989991BD77C61068DA17E3156D136B7B0B3D8'
$url = "https://downloads.sourceforge.net/project/nsis/NSIS%203/$version/nsis-$version.zip"

function Use-Folder([string]$folder) {
  Write-Host "NSIS: $folder"
  if ($env:GITHUB_PATH) { Add-Content -Path $env:GITHUB_PATH -Value $folder }
  $env:PATH = "$folder;$env:PATH"
}
function Retry([string]$what, [scriptblock]$action) {
  foreach ($attempt in 1..3) {
    try {
      # Shown, not returned: only the outcome may leave this function.
      & $action | Out-Host
      return $true
    } catch {
      Write-Warning "$what, attempt ${attempt}: $($_.Exception.Message)"
      if ($attempt -lt 3) { Start-Sleep -Seconds (10 * $attempt) }
    }
  }
  return $false
}

if ((Get-Command makensis -ErrorAction SilentlyContinue) -or
  (Test-Path "${env:ProgramFiles(x86)}\NSIS\makensis.exe")) {
  Write-Host 'NSIS: already installed'
  exit 0
}
if (Test-Path (Join-Path $Destination 'makensis.exe')) {
  Use-Folder $Destination
  exit 0
}

$zip = Join-Path ([IO.Path]::GetTempPath()) "nsis-$version.zip"
$downloaded = Retry 'Downloading NSIS' {
  # SourceForge gives browsers a "your download will start" page; command-line clients get
  # the file, through redirects to a mirror.
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 120 -UserAgent 'Wget/1.21'
  $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash
  if ($actual -ne $sha256) { throw "SHA-256 $actual is not the pinned $sha256" }
}
if ($downloaded) {
  $unpacked = Join-Path ([IO.Path]::GetTempPath()) "nsis-$version-unpacked"
  Remove-Item -Recurse -Force $unpacked -ErrorAction SilentlyContinue
  Expand-Archive -Path $zip -DestinationPath $unpacked
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -Recurse -Force (Join-Path $unpacked "nsis-$version\*") $Destination
  Use-Folder $Destination
  exit 0
}

# The last resort: Chocolatey's community feed.
if (Retry 'Installing NSIS with Chocolatey' {
    choco install nsis -y --no-progress
    if ($LASTEXITCODE -ne 0) { throw "choco exited with $LASTEXITCODE" }
  }) {
  exit 0
}
throw 'NSIS could not be installed from the pinned release or Chocolatey.'
