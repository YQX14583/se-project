param(
 [string]$NodeExe = 'D:\Program Files\nodejs\node.exe',
 [string]$CreatorHome = 'D:\_Cocos Games\Creator\3.8.8',
 [string]$OutputDirectory = ''
)
$ErrorActionPreference='Stop'
$project=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$release=if($OutputDirectory){$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)}else{Join-Path $project 'release'}
$dest=Join-Path $release '悲伤消消乐-Windows-x64-免安装版'
$zip=Join-Path $release '悲伤消消乐-Windows-x64-免安装版.zip'
$engineLicense=Join-Path $CreatorHome 'resources\resources\3d\engine\LICENSE.md'
if((Test-Path -LiteralPath $dest) -or (Test-Path -LiteralPath $zip)){throw 'Output already exists. Use -OutputDirectory with a new folder to preserve the previous release.'}
foreach($source in @($NodeExe,$engineLicense,(Join-Path $project 'build\web-mobile\offline-manifest.json'))){if(!(Test-Path -LiteralPath $source -PathType Leaf)){throw "Required packaging input missing: $source"}}
New-Item -ItemType Directory -Path $dest,(Join-Path $dest 'runtime'),(Join-Path $dest 'licenses') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'build\web-mobile') -Destination (Join-Path $dest 'game') -Recurse
Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $dest 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launcher.cjs') -Destination $dest
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'NODE-LICENSE.txt') -Destination (Join-Path $dest 'licenses')
Copy-Item -LiteralPath (Join-Path $project 'assets\resources\fonts\OFL.txt') -Destination (Join-Path $dest 'licenses\FONT-OFL.txt')
Copy-Item -LiteralPath $engineLicense -Destination (Join-Path $dest 'licenses\COCOS-ENGINE-LICENSE.md')
$cmd="@echo off`r`nchcp 65001 >nul`r`ncd /d `"%~dp0`"`r`n`"%~dp0runtime\node.exe`" `"%~dp0launcher.cjs`"`r`nif errorlevel 1 pause`r`n"
[IO.File]::WriteAllText((Join-Path $dest '开始游戏.cmd'),$cmd,[Text.Encoding]::ASCII)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '使用说明.txt') -Destination $dest
Compress-Archive -LiteralPath $dest -DestinationPath $zip -CompressionLevel Optimal
Get-FileHash -LiteralPath $zip -Algorithm SHA256 | Format-List
Get-Item -LiteralPath $zip | Select-Object FullName,Length
