param([string]$CreatorHome = 'D:\_Cocos Games\Creator\3.8.8')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $PSScriptRoot 'output'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$log = Join-Path $outputDirectory 'creator-build.log'
$stdout = Join-Path $outputDirectory 'creator-stdout.log'
$stderr = Join-Path $outputDirectory 'creator-stderr.log'
$config = Join-Path $PSScriptRoot 'build-config.json'
$creatorExe = Join-Path $CreatorHome 'CocosCreator.exe'
[IO.File]::WriteAllText($log, '')
if (!(Test-Path -LiteralPath $creatorExe)) { throw "Creator missing: $creatorExe" }
# Creator's documented --build parameter consumes one semicolon-separated value.
$arguments = @('--project', ('"' + $projectRoot + '"'), '--build', ('"configPath=' + $config + ';logDest=' + $log + '"'))
$process = Start-Process -FilePath $creatorExe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Write-Host "Creator exit code: $($process.ExitCode); log: $log"
if ($process.ExitCode -ne 36) { Get-Content -LiteralPath $log -Tail 60 -ErrorAction SilentlyContinue; throw "Creator build failed with exit $($process.ExitCode)" }
if (Select-String -LiteralPath $log -Pattern 'Missing class:| - error: ' -Quiet) { throw 'Creator reported invalid assets; inspect creator-build.log' }
$index = Join-Path $projectRoot 'build\web-mobile\index.html'
if (!(Test-Path -LiteralPath $index)) { throw 'Creator reported success without web-mobile/index.html' }
& node (Join-Path $PSScriptRoot 'postbuild.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Offline postbuild failed' }
Write-Host "Build ready: $index"
