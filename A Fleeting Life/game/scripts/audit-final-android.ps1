param([string]$ApkPath)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolRoot = if ($env:FLEETING_TOOL_ROOT) { (Resolve-Path -LiteralPath $env:FLEETING_TOOL_ROOT).Path } else { (Resolve-Path -LiteralPath (Join-Path $projectPath '..')).Path }
if (!$ApkPath) {
  $apks = @(Get-ChildItem -LiteralPath (Join-Path $projectPath 'dist') -File -Filter '*-debug.apk')
  if ($apks.Count -ne 1) { throw "Expected one debug APK in dist, found $($apks.Count)" }
  $ApkPath = $apks[0].FullName
}
$actualApk = (Resolve-Path -LiteralPath $ApkPath -ErrorAction Stop).Path
$aliasJson = & node (Join-Path $PSScriptRoot 'prepare-android.cjs') --paths-only $projectPath $toolRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$aliases = ($aliasJson | Out-String) | ConvertFrom-Json
$env:JAVA_HOME = $aliases.jdk
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$buildTools = Join-Path $aliases.sdk 'build-tools\36.0.0'
$aapt = Join-Path $buildTools 'aapt.exe'
$signer = Join-Path $buildTools 'apksigner.bat'
foreach ($tool in @($aapt, $signer)) { if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Missing Android audit tool: $tool" } }
$inspectionDirectory = Join-Path $projectPath 'build\qa\android-final-aapt'
New-Item -ItemType Directory -Path $inspectionDirectory -Force | Out-Null
$inspectionLocal = Join-Path $inspectionDirectory 'FleetingLife-debug.apk'
$inspectionAscii = Join-Path $aliases.project 'build\qa\android-final-aapt\FleetingLife-debug.apk'
$originalHash = (Get-FileHash -LiteralPath $actualApk -Algorithm SHA256).Hash.ToLowerInvariant()
Copy-Item -LiteralPath $actualApk -Destination $inspectionLocal -Force
$copyHash = (Get-FileHash -LiteralPath $inspectionLocal -Algorithm SHA256).Hash.ToLowerInvariant()
$aliasHash = (Get-FileHash -LiteralPath $inspectionAscii -Algorithm SHA256).Hash.ToLowerInvariant()
if ($originalHash -ne $copyHash -or $copyHash -ne $aliasHash) { throw 'APK inspection copy does not match the delivery APK' }
$badging = & $aapt dump badging $inspectionAscii
if ($LASTEXITCODE -ne 0) { throw 'aapt badging failed' }
$manifest = & $aapt dump xmltree $inspectionAscii AndroidManifest.xml
if ($LASTEXITCODE -ne 0) { throw 'aapt manifest failed' }
$signature = & $signer verify --verbose --print-certs $inspectionAscii
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
$signatureText = ($signature -join "`n") + "`n"
if ($signatureText -notmatch 'Verified using v1 scheme[^\r\n]*true' -or $signatureText -notmatch 'Verified using v2 scheme[^\r\n]*true') { throw 'APK must verify with v1 and v2 signatures' }
$dist = Join-Path $projectPath 'dist'
$encoding = [Text.UTF8Encoding]::new($false)
$badgingPath = Join-Path $dist 'APK-badging.txt'
$manifestPath = Join-Path $dist 'APK-manifest.txt'
[IO.File]::WriteAllText($badgingPath, ($badging -join "`n") + "`n", $encoding)
[IO.File]::WriteAllText($manifestPath, ($manifest -join "`n") + "`n", $encoding)
[IO.File]::WriteAllText((Join-Path $dist 'APK-signature.txt'), $signatureText, $encoding)
if (($badging -join "`n") -notmatch "package: name='com\.fleetinglife\.s1'") { throw 'Unexpected application package name' }
$report = [ordered]@{
 generatedAt = [DateTime]::UtcNow.ToString('o'); passed = $true; apkSha256 = $originalHash
 inspectionPath = $inspectionAscii.Replace('\','/'); inspectionSha256 = $aliasHash
 badgingSha256 = (Get-FileHash -LiteralPath $badgingPath -Algorithm SHA256).Hash.ToLowerInvariant()
 manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
 scope = 'aapt/apksigner read an identical APK through a verified ASCII inspection copy; no native device execution.'
}
$reportPath = Join-Path $projectPath 'build\qa\android-final-package-info.json'
[IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 8), $encoding)
Write-Output ($report | ConvertTo-Json -Compress)
