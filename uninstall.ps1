# devin-memory v1.0.0 — uninstaller wrapper (PowerShell)
# Usage: .\uninstall.ps1 -Target <dir> [-Scope project|user] [-Purge] [-Yes]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Target,
    [ValidateSet('project', 'user')][string]$Scope,
    [switch]$Purge,
    [switch]$Yes
)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliArgs = @($Target)
if ($Scope) { $cliArgs += @('--scope', $Scope) }
if ($Purge) { $cliArgs += '--purge' }
if ($Yes) { $cliArgs += '--yes' }
& node (Join-Path $scriptDir 'scripts\uninstall.js') @cliArgs
exit $LASTEXITCODE
