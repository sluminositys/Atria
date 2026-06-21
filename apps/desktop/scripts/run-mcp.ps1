$ErrorActionPreference = "Stop"
$McpArguments = @($args)

if ($McpArguments.Count -gt 0 -and $McpArguments[0] -eq "--") {
  $McpArguments = if ($McpArguments.Count -gt 1) {
    $McpArguments[1..($McpArguments.Count - 1)]
  } else {
    @()
  }
}

& (Join-Path $PSScriptRoot "prepare-sidecar.ps1") -Quiet
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$desktopRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $desktopRoot "src-tauri\target\release\atria-mcp.exe"
& $executable @McpArguments
exit $LASTEXITCODE
