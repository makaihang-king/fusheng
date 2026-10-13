param(
  [string]$AdbPath,
  [string]$DeviceSerial,
  [string]$EvidenceDir
)

# Natural-collision Android check. It does not clear app storage; gameplay
# writes progress and native video records, so snapshot state before running.
# PASS requires visual confirmation of each saved phase screenshot.
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (!$AdbPath) { $AdbPath = Join-Path $projectPath '..\android\android-sdk\platform-tools\adb.exe' }
if (!(Test-Path -LiteralPath $AdbPath)) { throw "adb not found: $AdbPath" }
$AdbPath = (Resolve-Path -LiteralPath $AdbPath).Path
if (!$EvidenceDir) { $EvidenceDir = Join-Path $projectPath ('build\qa\android-hell-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$EvidenceDir = [IO.Path]::GetFullPath($EvidenceDir)
if (Test-Path -LiteralPath $EvidenceDir) { throw "Evidence directory already exists: $EvidenceDir" }
New-Item -ItemType Directory -Path $EvidenceDir | Out-Null

$packageName = 'com.fleetinglife.s1'
$activityName = 'com.cocos.game.AppActivity'
$script:serial = ''
$script:screenWidth = 0
$script:screenHeight = 0
$script:coreWidth = 0.0
$script:coreHeight = 0.0
$script:paused = $false
$script:report = [ordered]@{
  generatedAt = (Get-Date).ToString('o')
  status = 'FAIL'
  objective = 'Natural collision enters a randomized 28-second hell course; nine physical inputs follow the device-reported obstacle plan and restore three lives and at least 15 fragments.'
  deviceSerial = $null
  screenPixels = $null
  apkSha256 = $null
  installedBaseSha256 = $null
  gameSourceSha256 = $null
  runStartOffsetSeconds = $null
  hellStartOffsetSeconds = $null
  lateHellCheckpoint = $null
  returnCheckpoint = $null
  firstReturnPauseGameTime = $null
  checkpoints = @()
  courseSeed = $null
  courseLogLine = $null
  actionPlan = @()
  inputs = @()
  fatalOrAnrLines = @()
  processAlive = $false
  stoppedAfterFailure = $false
  failure = $null
}

function Invoke-Adb([string[]]$Arguments, [switch]$AllowFailure) {
  $command = @($Arguments)
  if ($script:serial) { $command = @('-s', $script:serial) + $command }
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $result = @(& $AdbPath @command 2>&1)
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($exitCode -ne 0 -and !$AllowFailure) {
    throw "adb $($command -join ' ') failed: $($result -join ' | ')"
  }
  return $result
}

function Get-PngDimensions([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 24 -or [Text.Encoding]::ASCII.GetString($bytes, 1, 3) -ne 'PNG') {
    throw "Invalid screenshot PNG: $Path"
  }
  return @(
    [int][BitConverter]::ToUInt32([byte[]]@($bytes[19], $bytes[18], $bytes[17], $bytes[16]), 0),
    [int][BitConverter]::ToUInt32([byte[]]@($bytes[23], $bytes[22], $bytes[21], $bytes[20]), 0)
  )
}

function Save-Screenshot([string]$Name) {
  $path = Join-Path $EvidenceDir "$Name.png"
  $remote = "/sdcard/fleeting-hell-$Name.png"
  Invoke-Adb -Arguments @('shell', 'screencap', '-p', $remote) | Out-Null
  try { Invoke-Adb -Arguments @('pull', $remote, $path) | Out-Null }
  finally { Invoke-Adb -Arguments @('shell', 'rm', $remote) -AllowFailure | Out-Null }
  if (!(Test-Path -LiteralPath $path)) { throw "Screenshot missing after adb pull: $path" }
  return $path
}

function Get-ScreenPoint([double]$X, [double]$Y) {
  if ($X -lt 0 -or $X -gt 480 -or $Y -lt 0 -or $Y -gt 270) { throw "Logical point outside 480x270: $X,$Y" }
  $left = ($script:screenWidth - $script:coreWidth) / 2.0
  $top = ($script:screenHeight - $script:coreHeight) / 2.0
  return @(
    [int][math]::Round($left + $X * $script:coreWidth / 480.0),
    [int][math]::Round($top + $Y * $script:coreHeight / 270.0)
  )
}

function Send-Tap([int]$X, [int]$Y) {
  $point = Get-ScreenPoint $X $Y
  Invoke-Adb -Arguments @('shell', 'input', 'tap', "$($point[0])", "$($point[1])") | Out-Null
}

function Send-Slide {
  $start = Get-ScreenPoint 210 93
  $end = Get-ScreenPoint 210 169
  Invoke-Adb -Arguments @('shell', 'input', 'swipe', "$($start[0])", "$($start[1])", "$($end[0])", "$($end[1])", '160') | Out-Null
}

function Pause-Game {
  if ($script:paused) { throw 'The game is already expected to be paused.' }
  Send-Tap 456 49
  $script:paused = $true
  Start-Sleep -Milliseconds 150
}

function Resume-Game {
  if (!$script:paused) { throw 'The game is not expected to be paused.' }
  # The final APK's primary resume button is centered around logical y=120.
  Send-Tap 240 120
  $script:paused = $false
}

function Assert-PauseOverlay([string]$Path) {
  Add-Type -AssemblyName System.Drawing
  $paper = Get-ScreenPoint 135 80
  # The final APK's pause overlay places the primary button around logical y=120.
  $button = Get-ScreenPoint 160 120
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    $p = $bitmap.GetPixel($paper[0], $paper[1])
    $b = $bitmap.GetPixel($button[0], $button[1])
    if ($p.R -ne 238 -or $p.G -ne 234 -or $p.B -ne 222 -or
        $b.R -ne 51 -or $b.G -ne 73 -or $b.B -ne 65) {
      throw "Pause overlay is absent or changed: $Path"
    }
  } finally { $bitmap.Dispose() }
}

function Read-RunTime([string]$Path) {
  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    $left = [int][math]::Round(($script:screenWidth - $script:coreWidth) / 2.0)
    $barY = (Get-ScreenPoint 0 34.3)[1]
    $barColor = $bitmap.GetPixel($left + 2, $barY).ToArgb()
    $end = $left
    for ($x = $left; $x -lt $left + [int]$script:coreWidth; $x++) {
      if ($bitmap.GetPixel($x, $barY).ToArgb() -ne $barColor) { break }
      $end = $x + 1
    }
    $seconds = ($end - $left) * 40.0 / $script:coreWidth
    if ($seconds -lt 0.10 -or $seconds -gt 2.0) { throw "Cannot calibrate the first segment ($seconds s): $Path" }
    return [math]::Round($seconds, 3)
  } finally { $bitmap.Dispose() }
}

function Read-HellTime([string]$Path, [double]$MinSeconds, [double]$MaxSeconds) {
  # Hell progress bar: logical x=332..460, y=42..44. The act tick marks
  # use the same opaque color as the fill where they overlap it.
  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    $bar = Get-ScreenPoint 332 43
    $limit = (Get-ScreenPoint 460 43)[0]
    $fill = $bitmap.GetPixel($bar[0] + 2, $bar[1]).ToArgb()
    $end = $bar[0]
    for ($x = $bar[0] + 2; $x -le $limit; $x++) {
      if ($bitmap.GetPixel($x, $bar[1]).ToArgb() -ne $fill) { break }
      $end = $x + 1
    }
    $seconds = ($end - $bar[0]) * 28.0 / ($script:coreWidth * 128.0 / 480.0)
    if ($seconds -lt $MinSeconds -or $seconds -gt $MaxSeconds) {
      throw "Cannot safely calibrate the hell progress bar ($seconds s): $Path"
    }
    return [math]::Round($seconds, 3)
  } finally { $bitmap.Dispose() }
}

function Wait-Until([Diagnostics.Stopwatch]$Clock, [double]$Seconds) {
  while ($Clock.Elapsed.TotalSeconds -lt $Seconds) {
    $remainingMs = ($Seconds - $Clock.Elapsed.TotalSeconds) * 1000.0
    Start-Sleep -Milliseconds ([int][math]::Max(10, [math]::Min(200, $remainingMs - 15)))
  }
}

function Read-HellCourseFromDevice {
  # The device emits the exact randomized course when a life loss enters hell.
  # The log buffer was cleared before this run, so its last matching row is
  # the course visible in the current paused screenshot.
  $logcat = @(Invoke-Adb -Arguments @('logcat', '-d', '-v', 'threadtime', '*:V'))
  $logcat | Where-Object { $_ -match 'FLEETING_HELL_COURSE' } |
    Set-Content -LiteralPath (Join-Path $EvidenceDir 'hell-course-logcat.txt') -Encoding utf8
  $lines = @($logcat | Where-Object { $_ -match '\bE FleetingHell\s*:\s*FLEETING_HELL_COURSE\s+\{' })
  if ($lines.Count -eq 0) { throw 'No device FLEETING_HELL_COURSE log was observed after hell entry.' }
  $line = [string]$lines[-1]
  $jsonStart = $line.IndexOf('{')
  if ($jsonStart -lt 0) { throw "Hell course JSON missing: $line" }
  $course = $line.Substring($jsonStart) | ConvertFrom-Json
  $obstacles = @($course.obstacles)
  if ($obstacles.Count -ne 9) { throw "Expected nine device-reported hell obstacles, found $($obstacles.Count)." }
  $plan = @()
  $previousAt = 0.0
  foreach ($obstacle in $obstacles) {
    $at = [double]$obstacle.at
    $kind = [string]$obstacle.kind
    if ($kind -notin @('low', 'high') -or [double]::IsNaN($at) -or [double]::IsInfinity($at) -or
        $at -le $previousAt -or $at -lt 4.0 -or $at -ge 27.0) {
      throw "Invalid device-reported hell obstacle: at=$at kind=$kind after=$previousAt"
    }
    $lead = if ($kind -eq 'low') { 0.40 } else { 0.44 }
    $plan += [ordered]@{
      obstacleAt = $at
      kind = $kind
      inputAt = [math]::Round($at - $lead, 2)
      input = if ($kind -eq 'low') { 'jump' } else { 'slide' }
    }
    $previousAt = $at
  }
  $script:report.courseSeed = $course.seed
  $script:report.courseLogLine = $line
  $script:report.actionPlan = $plan
  Write-Host "Device hell course seed=$($course.seed): $(($plan | ForEach-Object { "$($_.obstacleAt):$($_.kind)" }) -join ', ')"
}

$exitCode = 1
try {
  $devices = @(Invoke-Adb -Arguments @('devices') | Where-Object { $_ -match '^\S+\s+device$' })
  if ($DeviceSerial) {
    if (!($devices | Where-Object { ($_ -split '\s+')[0] -eq $DeviceSerial })) { throw "Device $DeviceSerial is not authorized and online." }
    $script:serial = $DeviceSerial
  } else {
    if ($devices.Count -ne 1) { throw "Expected one authorized Android device; found $($devices.Count)." }
    $script:serial = ($devices[0] -split '\s+')[0]
  }
  $script:report.deviceSerial = $script:serial
  $sourcePath = Join-Path $projectPath 'assets\scripts\Game.ts'
  $script:report.gameSourceSha256 = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $apk = Get-ChildItem -LiteralPath (Join-Path $projectPath 'dist') -Filter '*-debug.apk' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($apk) { $script:report.apkSha256 = (Get-FileHash -LiteralPath $apk.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  if (!$script:report.apkSha256) { throw 'Release APK was not found for device comparison.' }
  $packagePathLine = ((Invoke-Adb -Arguments @('shell', 'pm', 'path', $packageName)) -join '').Trim()
  if ($packagePathLine -notmatch '^package:(/data/app/.+/base\.apk)$') { throw "Unexpected installed APK path: $packagePathLine" }
  $installedBasePath = Join-Path $EvidenceDir 'installed-base.apk'
  Invoke-Adb -Arguments @('pull', $Matches[1], $installedBasePath) | Out-Null
  $script:report.installedBaseSha256 = (Get-FileHash -LiteralPath $installedBasePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($script:report.installedBaseSha256 -ne $script:report.apkSha256) { throw 'Installed APK SHA-256 differs from the release artifact.' }

  Invoke-Adb -Arguments @('logcat', '-c') | Out-Null
  Invoke-Adb -Arguments @('shell', 'am', 'force-stop', $packageName) | Out-Null
  Invoke-Adb -Arguments @('shell', 'am', 'start', '-W', '-n', "$packageName/$activityName") | Out-Null
  Start-Sleep -Seconds 4
  $hallPath = Save-Screenshot '00-hall'
  $size = Get-PngDimensions $hallPath
  $script:screenWidth = $size[0]
  $script:screenHeight = $size[1]
  if ($size[0] -le $size[1]) { throw "Expected landscape screenshot, got $($size[0])x$($size[1])." }
  $script:coreWidth = [math]::Min($size[0], $size[1] * 16.0 / 9.0)
  $script:coreHeight = [math]::Min($size[1], $size[0] * 9.0 / 16.0)
  $script:report.screenPixels = "$($size[0])x$($size[1])"
  Write-Host "Inspect: $hallPath"
  $hallAnswer = (Read-Host 'Confirm the first-chapter hall and departure door: Y=yes, N=fail').Trim().ToUpperInvariant()
  $script:report.checkpoints += [ordered]@{ id = 'hall'; screenshot = $hallPath; attestation = "visual:$hallAnswer" }
  if ($hallAnswer -ne 'Y') { throw 'Departure hall was not confirmed.' }

  Send-Tap 50 160
  Start-Sleep -Milliseconds 3250
  Pause-Game
  $startPath = Save-Screenshot '01-segment-before-hits'
  Assert-PauseOverlay $startPath
  Write-Host "Inspect: $startPath"
  $startAnswer = (Read-Host 'Confirm 幼儿园门口, three lives, and no 时光 or 羽毛 inventory: Y=yes, N=fail').Trim().ToUpperInvariant()
  $script:report.checkpoints += [ordered]@{ id = 'segment-before-hits'; screenshot = $startPath; attestation = "visual:$startAnswer" }
  if ($startAnswer -ne 'Y') { throw 'The clean three-life starting state was not confirmed.' }
  $runOffset = Read-RunTime $startPath
  $script:report.runStartOffsetSeconds = $runOffset
  Write-Host "Calibrated first segment at $runOffset game seconds."

  Resume-Game
  $runClock = [Diagnostics.Stopwatch]::StartNew()
  Wait-Until $runClock (26.5 - $runOffset)
  Pause-Game
  $hellPath = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $hellPath = Save-Screenshot ('02-hell-entry-' + $attempt)
    Assert-PauseOverlay $hellPath
    Write-Host "Inspect: $hellPath"
    $answer = (Read-Host 'H=余烬 with empty hearts; W=not yet, run 0.6 s more; N=fail').Trim().ToUpperInvariant()
    $script:report.checkpoints += [ordered]@{ id = 'hell-entry'; screenshot = $hellPath; attestation = "visual:$answer"; attempt = $attempt }
    if ($answer -eq 'H') { break }
    if ($answer -ne 'W' -or $attempt -eq 3) { throw "Hell entry was not confirmed (answer '$answer')." }
    Resume-Game
    Start-Sleep -Milliseconds 600
    Pause-Game
  }
  $hellOffset = Read-HellTime $hellPath 0.20 3.40
  $script:report.hellStartOffsetSeconds = $hellOffset
  Write-Host "Calibrated hell entry at $hellOffset game seconds."
  Read-HellCourseFromDevice

  $hellClock = [Diagnostics.Stopwatch]::StartNew()
  Resume-Game
  foreach ($action in $script:report.actionPlan) {
    $target = $action.inputAt - $hellOffset
    if ($target -lt 0) { throw "Input before hell resume: $($action.inputAt)." }
    Wait-Until $hellClock $target
    $lateMs = [math]::Round(($hellClock.Elapsed.TotalSeconds - $target) * 1000)
    if ($lateMs -gt 250) { throw "Missed hell obstacle $($action.obstacleAt) by $lateMs ms before input." }
    if ($action.input -eq 'jump') { Send-Tap 210 120 } else { Send-Slide }
    $script:report.inputs += [ordered]@{
      obstacleAt = $action.obstacleAt
      kind = $action.kind
      input = $action.input
      gameTime = $action.inputAt
      targetWallSeconds = [math]::Round($target, 3)
      sentByWallSeconds = [math]::Round($hellClock.Elapsed.TotalSeconds, 3)
      lateBeforeSendMs = $lateMs
    }
  }
  # Capture after this randomized course's ninth obstacle while still in hell.
  $lastObstacleAt = [double]$script:report.actionPlan[-1].obstacleAt
  $afterNineAt = [math]::Min(27.2, [math]::Max(26.0, $lastObstacleAt + 0.55))
  Wait-Until $hellClock ($afterNineAt - $hellOffset)
  $firstActiveWallSeconds = $hellClock.Elapsed.TotalSeconds
  Pause-Game
  $latePhase = $null
  $lateResumeExtraSeconds = 0.0
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $latePath = Save-Screenshot ('03-hell-after-nine-' + $attempt)
    Assert-PauseOverlay $latePath
    $latePhase = Read-HellTime $latePath 23.0 27.5
    $script:report.lateHellCheckpoint = [ordered]@{
      screenshot = $latePath
      capturedAt = (Get-Date).ToString('o')
      measuredGameSeconds = $latePhase
      activeWallSecondsBeforeCheckpoint = [math]::Round($firstActiveWallSeconds + $lateResumeExtraSeconds, 3)
      attempt = $attempt
    }
    Write-Host "Inspect: $latePath | measured hell progress: $latePhase / 28 s; last obstacle at $lastObstacleAt s"
    if ($latePhase -lt $lastObstacleAt) {
      if ($attempt -eq 3) { throw 'Hell progress did not reach the ninth obstacle before the safe checkpoint limit.' }
      Resume-Game
      $extraClock = [Diagnostics.Stopwatch]::StartNew()
      Start-Sleep -Milliseconds 500
      Pause-Game
      $lateResumeExtraSeconds += $extraClock.Elapsed.TotalSeconds
      continue
    }
    $answer = (Read-Host "Confirm still in 余烬 after all nine obstacles, progress at least $lastObstacleAt/28: Y=yes, N=fail").Trim().ToUpperInvariant()
    $script:report.checkpoints += [ordered]@{ id = 'hell-after-nine'; screenshot = $latePath; measuredGameSeconds = $latePhase; attestation = "visual:$answer" }
    if ($answer -ne 'Y') { throw 'The late hell checkpoint was not confirmed.' }
    break
  }

  Resume-Game
  $returnClock = [Diagnostics.Stopwatch]::StartNew()
  Wait-Until $returnClock (28.25 - $latePhase)
  $script:report.firstReturnPauseGameTime = [math]::Round($latePhase + $returnClock.Elapsed.TotalSeconds, 3)
  Pause-Game
  $script:report.returnCheckpoint = [ordered]@{
    pausedAt = (Get-Date).ToString('o')
    activeSecondsAfterLateCheckpoint = [math]::Round($returnClock.Elapsed.TotalSeconds, 3)
    scheduledGameSeconds = $script:report.firstReturnPauseGameTime
  }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $returnPath = Save-Screenshot ('04-return-to-run-' + $attempt)
    Assert-PauseOverlay $returnPath
    $script:report.returnCheckpoint.screenshot = $returnPath
    $script:report.returnCheckpoint.capturedAt = (Get-Date).ToString('o')
    Write-Host "Inspect: $returnPath"
    $answer = (Read-Host 'Y=幼儿园门口 resumed with three hearts and at least 15 more fragments; W=still 余烬, run 0.5 s; N=fail').Trim().ToUpperInvariant()
    $script:report.checkpoints += [ordered]@{ id = 'return-to-run'; screenshot = $returnPath; attestation = "visual:$answer"; attempt = $attempt }
    if ($answer -eq 'Y') { break }
    if ($answer -ne 'W' -or $attempt -eq 3) { throw "Hell recovery was not confirmed (answer '$answer')." }
    Resume-Game
    Start-Sleep -Milliseconds 500
    Pause-Game
  }
  $exitCode = 0
} catch {
  $script:report.failure = $_.Exception.Message
  Write-Warning $script:report.failure
} finally {
  if ($script:serial) {
    try {
      $logcat = @(Invoke-Adb -Arguments @('logcat', '-d', '-v', 'threadtime', '*:V') -AllowFailure)
      $logcat | Set-Content -LiteralPath (Join-Path $EvidenceDir 'logcat.txt') -Encoding utf8
      $script:report.fatalOrAnrLines = @($logcat | Where-Object { $_ -match 'FATAL EXCEPTION|ANR in com\.fleetinglife\.s1|Fatal signal' })
      $script:report.processAlive = (((Invoke-Adb -Arguments @('shell', 'pidof', $packageName) -AllowFailure) -join '').Trim().Length -gt 0)
    } catch {
      $script:report.failure = 'Evidence collection failed: ' + $_.Exception.Message
      $exitCode = 1
    }
  }
  if ($script:report.fatalOrAnrLines.Count -gt 0 -or !$script:report.processAlive) {
    if (!$script:report.failure) { $script:report.failure = 'Fatal/ANR log found or game process not alive at finish.' }
    $exitCode = 1
  }
  if ($exitCode -ne 0 -and $script:serial) {
    try {
      Invoke-Adb -Arguments @('shell', 'am', 'force-stop', $packageName) | Out-Null
      $script:report.stoppedAfterFailure = $true
    } catch {
      $script:report.failure = $script:report.failure + ' Cleanup force-stop failed: ' + $_.Exception.Message
    }
  }
  $script:report.status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
  $script:report.completedAt = (Get-Date).ToString('o')
  $reportPath = Join-Path $EvidenceDir 'hell-report.json'
  $script:report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Write-Host "Hell status: $($script:report.status). Report: $reportPath"
}
exit $exitCode
