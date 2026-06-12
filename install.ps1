# devin-memory v1.0.0 — installer wrapper (PowerShell)
# Usage: .\install.ps1 -Target <dir> [-Scope project|user] [-Memory project|user] [-Lang en|pt-BR|es] [-Agents]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Target,
    [ValidateSet('project', 'user')][string]$Scope = 'project',
    [ValidateSet('project', 'user')][string]$Memory = 'project',
    [ValidateSet('en', 'pt-BR', 'es')][string]$Lang,
    [switch]$Agents
)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliArgs = @($Target, '--scope', $Scope, '--memory', $Memory)
if ($Lang) { $cliArgs += @('--lang', $Lang) }
if ($Agents) { $cliArgs += '--agents' }
& node (Join-Path $scriptDir 'scripts\install.js') @cliArgs
exit $LASTEXITCODE
