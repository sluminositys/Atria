param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $desktopRoot "src-tauri"
$extension = if ($IsWindows -or $env:OS -eq "Windows_NT") { ".exe" } else { "" }

& cargo build --release --bin atria-mcp --manifest-path (Join-Path $tauriRoot "Cargo.toml")
if ($LASTEXITCODE -ne 0) {
  throw "Failed to build atria-mcp."
}

$source = Join-Path $tauriRoot "target\release\atria-mcp$extension"
if (-not $Quiet) {
  Write-Host "Prepared $source"
}
