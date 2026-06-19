param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $desktopRoot "src-tauri"
$hostLine = (& rustc -vV | Select-String "^host:").Line
if (-not $hostLine) {
  throw "Unable to determine Rust host triple."
}
$targetTriple = $hostLine.Substring(5).Trim()
$extension = if ($IsWindows -or $env:OS -eq "Windows_NT") { ".exe" } else { "" }
$binaryDirectory = Join-Path $tauriRoot "binaries"
$destination = Join-Path $binaryDirectory "atria-mcp-$targetTriple$extension"
New-Item -ItemType Directory -Path $binaryDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $destination)) {
  New-Item -ItemType File -Path $destination -Force | Out-Null
}

& cargo build --release --bin atria-mcp --manifest-path (Join-Path $tauriRoot "Cargo.toml")
if ($LASTEXITCODE -ne 0) {
  throw "Failed to build atria-mcp."
}

$source = Join-Path $tauriRoot "target\release\atria-mcp$extension"
Copy-Item -LiteralPath $source -Destination $destination -Force
if (-not $Quiet) {
  Write-Host "Prepared $destination"
}
