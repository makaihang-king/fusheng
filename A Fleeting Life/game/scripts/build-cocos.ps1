param([ValidateSet('web-desktop','android')][string]$Platform = 'web-desktop', [switch]$ProjectOnly)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolRoot = if ($env:FLEETING_TOOL_ROOT) { (Resolve-Path -LiteralPath $env:FLEETING_TOOL_ROOT).Path } else { (Resolve-Path (Join-Path $projectPath '..')).Path }
$creatorPath = Join-Path $toolRoot '需要的软件\CocosCreator\3.8.8\CocosCreator.exe'
$androidRoot = Join-Path $toolRoot 'android'
if (!(Test-Path -LiteralPath $creatorPath)) { throw 'Cocos Creator 3.8.8 was not found next to the game folder.' }
New-Item -ItemType Directory -Force -Path (Join-Path $projectPath 'build') | Out-Null
$config = Join-Path $projectPath "scripts\cocos-$Platform.json"
$gradleProjectPath = $projectPath
if ($Platform -eq 'android') {
  # Keep Creator on its real project/install paths so script UUID registration
  # matches the existing asset database. Only native compilation needs aliases.
  $aliasJson = & node (Join-Path $PSScriptRoot 'prepare-android.cjs') --paths-only $projectPath $toolRoot
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $androidAliases = ($aliasJson | Out-String) | ConvertFrom-Json
  $gradleProjectPath = $androidAliases.project
  $env:JAVA_HOME = $androidAliases.jdk
  $env:ANDROID_SDK_ROOT = $androidAliases.sdk
  $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
  $env:ANDROID_NDK_HOME = $androidAliases.ndk
  $javaExe = $androidAliases.javaExe
  $debugKeystore = $androidAliases.keystore
  if (!(Test-Path -LiteralPath $javaExe -PathType Leaf)) { throw "Java executable is missing: $javaExe" }
  if (!(Test-Path -LiteralPath $debugKeystore -PathType Leaf)) { throw "Debug keystore is missing: $debugKeystore" }
  $env:GRADLE_USER_HOME = Join-Path $gradleProjectPath 'build\gradle-cache'
  $env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_SDK_ROOT\platform-tools;$env:PATH"
  # Environment variables do not replace explicit Creator package settings.
  # Keep machine-specific paths in generated output, never the source config.
  $currentConfig = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
  if (!$currentConfig.packages.android) { throw "Android package settings are missing: $config" }
  $currentConfig.packages.android.sdkPath = $env:ANDROID_SDK_ROOT
  $currentConfig.packages.android.ndkPath = $env:ANDROID_NDK_HOME
  $currentConfig.packages.android.javaHome = $env:JAVA_HOME
  $currentConfig.packages.android.javaPath = $javaExe
  $config = Join-Path $projectPath 'build\cocos-android-current.json'
  [IO.File]::WriteAllText($config, ($currentConfig | ConvertTo-Json -Depth 32), [Text.UTF8Encoding]::new($false))
}
$log = Join-Path $projectPath "build\cocos-$Platform.log"
$process = Start-Process -FilePath $creatorPath -ArgumentList @('--project',('"' + $projectPath + '"'),'--build',('"configPath=' + $config + ';logDest=' + $log + '"')) -WindowStyle Hidden -PassThru
# Wait only for the launched editor; Electron's orphan crash handler can outlive it.
$process.WaitForExit()
$code = $process.ExitCode
Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'CocosCreator.exe' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Creator exited with $code. Log: $log"
if ($code -ne 36 -and $code -ne 0) { exit $code }
if ($Platform -eq 'android') {
  & node (Join-Path $PSScriptRoot 'prepare-android.cjs') --check-startup $projectPath
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & node (Join-Path $PSScriptRoot 'prepare-android.cjs') $projectPath $toolRoot
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if ($Platform -eq 'android' -and !$ProjectOnly) {
  Push-Location (Join-Path $gradleProjectPath 'build\android\proj')
  try {
    $localGradle = Join-Path $gradleProjectPath 'build\tools\gradle-8.11.1\bin\gradle.bat'
    if (Test-Path -LiteralPath $localGradle) { & $localGradle --no-daemon assembleDebug } else { & '.\gradlew.bat' --no-daemon assembleDebug }
    $gradleCode = $LASTEXITCODE
  } finally { Pop-Location }
  if ($gradleCode -ne 0) { exit $gradleCode }
  $apk = Get-ChildItem -LiteralPath (Join-Path $projectPath 'build\android') -Recurse -Filter '*-debug.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$apk) { throw 'Gradle succeeded but no debug APK was found.' }
  & node (Join-Path $PSScriptRoot 'prepare-android.cjs') --check-apk-startup $projectPath $apk.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $dist = Join-Path $projectPath 'dist'
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $deliveredApk = Join-Path $dist '浮生-第一章-debug.apk'
  Copy-Item -LiteralPath $apk.FullName -Destination $deliveredApk -Force
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $apkStream = [System.IO.File]::OpenRead($deliveredApk)
  try {
    $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($apkStream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $apkStream.Dispose()
    $sha256.Dispose()
  }
  [IO.File]::WriteAllText((Join-Path $dist 'APK-SHA256.txt'), "$hash  浮生-第一章-debug.apk", [Text.UTF8Encoding]::new($false))
  Write-Host "APK: $deliveredApk"
  Write-Host "SHA256: $hash"
}
