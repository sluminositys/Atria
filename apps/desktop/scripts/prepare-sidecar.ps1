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
$targetTriple = (& rustc --print host-tuple).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($targetTriple)) {
  throw "Failed to determine the Rust host target triple."
}
$bundleDirectory = Join-Path $tauriRoot "binaries"
$destination = Join-Path $bundleDirectory "atria-mcp-$targetTriple$extension"
New-Item -ItemType Directory -Force -Path $bundleDirectory | Out-Null
Copy-Item -LiteralPath $source -Destination $destination -Force
if (-not $Quiet) {
  Write-Host "Prepared $destination"
}
