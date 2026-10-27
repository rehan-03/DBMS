param([string]$Mongod = "$PSScriptRoot\..\.tools\mongodb-win32-x86_64-windows-8.0.16\bin\mongod.exe")
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath "$PSScriptRoot\..").Path
$dataPath = Join-Path $projectRoot 'instance\mongo'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$mongoParameters = @('--replSet','rs0','--bind_ip','127.0.0.1','--port','27017','--dbpath',$dataPath,'--logpath',(Join-Path $projectRoot 'instance\mongod.log'),'--logappend')
$keyPath = Join-Path $projectRoot '.tools\rs-keyfile'
if (Test-Path -LiteralPath $keyPath) { $mongoParameters += @('--auth','--keyFile',$keyPath) }
Write-Output 'Starting the local LedgerLite replica set. Keep this terminal open.'
& $Mongod @mongoParameters
