param(
  [string]$AdbPath,
  [string]$DeviceSerial,
  [string]$EvidenceDir,
  [string]$ResumeFromChoice5Report,
  [string]$ResumeFromSegment6Report
)

# Guided, input-only Android route check. This does not install an APK or clear
# app data. A PASS requires visual inspection of every saved checkpoint image.
# Use an otherwise idle, unlocked device: ADB input latency and frame stalls can
# invalidate the authored obstacle windows. The report records the input schedule
# and never treats an ADB command succeeding as proof of an in-game choice.

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (!$AdbPath) { $AdbPath = Join-Path $projectPath '..\android\android-sdk\platform-tools\adb.exe' }
if (!$EvidenceDir) { $EvidenceDir = Join-Path $projectPath ('build\qa\android-route-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$EvidenceDir = [IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$packageName = 'com.fleetinglife.s1'
$activityName = 'com.cocos.game.AppActivity'
$script:serial = ''
$script:screenWidth = 0
$script:screenHeight = 0
$script:coreWidth = 0.0
$script:coreHeight = 0.0
$script:checkpointNumber = 0
$script:pausedByScript = $false
$script:phaseOffset = 0.25
$script:report = [ordered]@{
  generatedAt = (Get-Date).ToString('o')
  status = 'FAIL'
  route = 'desk: umbrella, first seat, own homework, face exam, close piano lid, apologize, forward'
  expectedEnding = '小一号的课桌'
  verification = 'Every paused screenshot is visually reviewed; ADB success alone is not a gameplay pass.'
  timing = '480x270 centered core; approximately 0.25 s into each new phase at resume; umbrella runs at 1.04x game time; on-screen pause button.'
  deviceSerial = $null
  screenPixels = $null
  contentSha256 = $null
  devicePackage = @()
  checkpoints = @()
  actions = @()
  adbReconnects = @()
  fatalOrAnrLines = @()
  processAlive = $false
  failure = $null
}

function Test-AdbDeviceMissing([string]$Output) {
  # Retry only ADB's own pre-dispatch transport errors. A game/activity, file,
  # permission, or input-command failure must still fail immediately.
  return ($Output -match '(?i)(?:adb(?:\.exe)?:|error:)\s*device\b[^\r\n]*\b(?:not found|offline)\b' -or
          $Output -match '(?i)(?:adb(?:\.exe)?:|error:)\s*no devices/emulators found')
}

function Invoke-Adb([string[]]$Arguments, [switch]$AllowFailure) {
  $command = @($Arguments)
  if ($script:serial) { $command = @('-s', $script:serial) + $command }
  # adb pull emits successful progress on stderr under Windows PowerShell.
  $ErrorActionPreference = 'Continue'
  $retryClock = $null
  $retries = 0
  while ($true) {
    $result = @(& $AdbPath @command 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      if ($retries -gt 0) {
        $script:report.adbReconnects += [ordered]@{ command = ($command -join ' '); retries = $retries; waitedSeconds = [math]::Round($retryClock.Elapsed.TotalSeconds, 2); recovered = $true }
      }
      return $result
    }
    $output = ($result -join "`n")
    if (!$script:serial -or !(Test-AdbDeviceMissing $output)) { break }
    if ($null -eq $retryClock) {
      $retryClock = [Diagnostics.Stopwatch]::StartNew()
      Write-Warning "ADB lost $($script:serial); waiting up to 15 seconds for the same device to return."
    }
    $online = $false
    $deviceLine = '(?m)^' + [regex]::Escape($script:serial) + '\s+device(?:\s|$)'
    while ($retryClock.Elapsed.TotalSeconds -lt 15) {
      Start-Sleep -Milliseconds 500
      $devices = @(& $AdbPath devices 2>&1)
      if ($LASTEXITCODE -eq 0 -and (($devices -join "`n") -match $deviceLine)) {
        $online = $true
        break
      }
    }
    if (!$online) { break }
    $retries++
  }
  if ($retries -gt 0 -or $null -ne $retryClock) {
    $script:report.adbReconnects += [ordered]@{ command = ($command -join ' '); retries = $retries; waitedSeconds = [math]::Round($retryClock.Elapsed.TotalSeconds, 2); recovered = $false }
  }
  if (!$AllowFailure) {
    $reason = if ($null -ne $retryClock -and $retryClock.Elapsed.TotalSeconds -ge 15) { ' The same device did not return within 15 seconds.' } else { '' }
    throw "adb $($command -join ' ') failed:$reason`n$output"
  }
  return $result
}

function Get-PngDimensions([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 24 -or [Text.Encoding]::ASCII.GetString($bytes, 1, 3) -ne 'PNG') {
    throw "Invalid screenshot PNG: $Path"
  }
  $width = [BitConverter]::ToUInt32([byte[]]@($bytes[19], $bytes[18], $bytes[17], $bytes[16]), 0)
  $height = [BitConverter]::ToUInt32([byte[]]@($bytes[23], $bytes[22], $bytes[21], $bytes[20]), 0)
  return @([int]$width, [int]$height)
}

function Read-RunGameTime([string]$Path, [double]$Duration) {
  # The HUD's one-logical-pixel progress bar is drawn before the uniform pause
  # overlay, so its color is constant even when scenery behind it changes.
  # Measuring it at each paused segment start avoids accumulating ADB/UI delay.
  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    if ($bitmap.Width -ne $script:screenWidth -or $bitmap.Height -ne $script:screenHeight) {
      throw "Screenshot dimensions changed during route: $Path"
    }
    $left = [int][math]::Round(($script:screenWidth - $script:coreWidth) / 2.0)
    $right = [int][math]::Round($left + $script:coreWidth)
    $top = ($script:screenHeight - $script:coreHeight) / 2.0
    $barY = [int][math]::Round($top + 34.3 * $script:coreHeight / 270.0)
    $barColor = $bitmap.GetPixel($left + 2, $barY).ToArgb()
    $end = $left
    for ($x = $left; $x -lt $right; $x++) {
      if ($bitmap.GetPixel($x, $barY).ToArgb() -ne $barColor) { break }
      $end = $x + 1
    }
    $gameTime = ($end - $left) * $Duration / $script:coreWidth
    if ($gameTime -lt 0.04 -or $gameTime -gt 2.5) {
      throw "Cannot calibrate segment start from progress bar ($([math]::Round($gameTime, 3)) s): $Path"
    }
    return [math]::Round($gameTime, 3)
  } finally {
    $bitmap.Dispose()
  }
}

function Save-Screenshot([string]$Name) {
  $path = Join-Path $EvidenceDir "$Name.png"
  $remote = "/sdcard/fleeting-route-$Name.png"
  Invoke-Adb -Arguments @('shell', 'screencap', '-p', $remote) | Out-Null
  try { Invoke-Adb -Arguments @('pull', $remote, $path) | Out-Null }
  finally { Invoke-Adb -Arguments @('shell', 'rm', $remote) -AllowFailure | Out-Null }
  if (!(Test-Path -LiteralPath $path)) { throw "Screenshot missing after adb pull: $path" }
  return $path
}

function Get-ScreenPoint([int]$X, [int]$Y) {
  if ($X -lt 0 -or $X -gt 480 -or $Y -lt 0 -or $Y -gt 270) { throw "Logical point outside 480x270: $X,$Y" }
  $left = ($script:screenWidth - $script:coreWidth) / 2.0
  $top = ($script:screenHeight - $script:coreHeight) / 2.0
  return @(
    [int][math]::Round($left + $X * $script:coreWidth / 480.0),
    [int][math]::Round($top + $Y * $script:coreHeight / 270.0)
  )
}

function Assert-PauseOverlay([string]$Path) {
  # These are solid interior pixels of the pause card and its primary button.
  # The V2055A probe confirmed they remain unchanged while gameplay is stopped.
  Add-Type -AssemblyName System.Drawing
  $paper = Get-ScreenPoint 135 80
  # The final APK's pause overlay places the primary button around logical y=120.
  $button = Get-ScreenPoint 160 120
  $bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    $paperColor = $bitmap.GetPixel($paper[0], $paper[1])
    $buttonColor = $bitmap.GetPixel($button[0], $button[1])
    if ($paperColor.R -ne 238 -or $paperColor.G -ne 234 -or $paperColor.B -ne 222 -or
        $buttonColor.R -ne 51 -or $buttonColor.G -ne 73 -or $buttonColor.B -ne 65) {
      throw "Pause overlay is absent or changed: $Path"
    }
  } finally {
    $bitmap.Dispose()
  }
}

function Send-Tap([int]$X, [int]$Y) {
  $point = Get-ScreenPoint $X $Y
  Invoke-Adb -Arguments @('shell', 'input', 'tap', "$($point[0])", "$($point[1])") | Out-Null
}

function Send-Swipe([int]$X1, [int]$Y1, [int]$X2, [int]$Y2, [int]$DurationMs = 160) {
  $start = Get-ScreenPoint $X1 $Y1
  $end = Get-ScreenPoint $X2 $Y2
  Invoke-Adb -Arguments @('shell', 'input', 'swipe', "$($start[0])", "$($start[1])", "$($end[0])", "$($end[1])", "$DurationMs") | Out-Null
}

function Send-Hold([int]$X, [int]$Y, [int]$DurationMs = 900) {
  $point = Get-ScreenPoint $X $Y
  Invoke-Adb -Arguments @('shell', 'input', 'swipe', "$($point[0])", "$($point[1])", "$($point[0])", "$($point[1])", "$DurationMs") | Out-Null
}

# The on-screen pause button is present in every timed phase before ending.
# Use the on-screen pause button for repeatable timing. The ending is
# captured without pausing while its own 80-second clock continues.
function Pause-Game {
  if ($script:pausedByScript) { throw 'Refusing a second pause tap while the script expects the pause overlay.' }
  Send-Tap 456 49
  $script:pausedByScript = $true
  Start-Sleep -Milliseconds 150
}
function Resume-Game {
  if (!$script:pausedByScript) { throw 'Refusing to resume: the script does not expect the pause overlay.' }
  # The final APK's primary resume button is centered around logical y=120.
  Send-Tap 240 120
  $script:pausedByScript = $false
}

function Confirm-Checkpoint([string]$Id, [string]$Expected, [switch]$AlreadyPaused, [switch]$AllowWait) {
  if (!$AlreadyPaused) { Pause-Game }
  if (!$script:pausedByScript) { throw "Checkpoint $Id requires a paused game." }
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    $script:checkpointNumber++
    $name = ('{0:D2}-{1}' -f $script:checkpointNumber, $Id)
    $path = Save-Screenshot $name
    Assert-PauseOverlay $path
    Write-Host "Checkpoint $Id | expected: $Expected"
    Write-Host "Inspect: $path"
    $prompt = if ($AllowWait) {
      'Type Y only if the screenshot shows this phase; N fails; W waits 0.5 s for a late transition'
    } else {
      'Type Y only if the screenshot shows this phase; N fails'
    }
    $answer = (Read-Host $prompt).Trim().ToUpperInvariant()
    if ($answer -eq 'Y') {
      $script:phaseOffset = 0.25
      if ($Id -match '^segment-([1-7])$') {
        $segmentId = [int]$Matches[1]
        $script:phaseOffset = Read-RunGameTime $path $script:segments[$segmentId].duration
        if ($segmentId -eq 6 -and $script:phaseOffset -ge 2.4) {
          throw 'Segment 6 is too close to its first timed obstacle for a safe continuation.'
        }
        Write-Host "Calibrated segment $segmentId start: $($script:phaseOffset) game seconds."
      }
      $script:report.checkpoints += [ordered]@{ id = $Id; expected = $Expected; screenshot = $path; attestation = 'visual:Y'; attempt = $attempt; phaseOffsetSeconds = $script:phaseOffset }
      return
    }
    $script:report.checkpoints += [ordered]@{ id = $Id; expected = $Expected; screenshot = $path; attestation = "visual:$answer"; attempt = $attempt }
    if ($answer -ne 'W' -or !$AllowWait -or $attempt -eq 4) {
      throw "Checkpoint $Id was not confirmed (answer '$answer')."
    }
    Resume-Game
    Start-Sleep -Milliseconds 500
    Pause-Game
  }
}

function Wait-Until([Diagnostics.Stopwatch]$Clock, [double]$Seconds) {
  while ($Clock.Elapsed.TotalSeconds -lt $Seconds) {
    $remainingMs = ($Seconds - $Clock.Elapsed.TotalSeconds) * 1000.0
    Start-Sleep -Milliseconds ([int][math]::Max(10, [math]::Min(200, $remainingMs - 15)))
  }
}

function Invoke-PhysicalAction($Action, [Diagnostics.Stopwatch]$Clock, [double]$TargetSeconds) {
  $lateMs = [math]::Round(($Clock.Elapsed.TotalSeconds - $TargetSeconds) * 1000.0)
  if ($lateMs -gt 250) { throw "Missed $($Action.label) by $lateMs ms before sending input." }
  switch ($Action.type) {
    'tap' { Send-Tap 210 120 }
    'slide' { Send-Swipe 210 93 210 169 160 }
    'hold' { Send-Hold 210 120 900 }
    default { throw "Unknown physical action: $($Action.type)" }
  }
  $script:report.actions += [ordered]@{
    label = $Action.label
    input = $Action.type
    gameTime = $Action.at
    targetWallSeconds = [math]::Round($TargetSeconds, 3)
    sentByWallSeconds = [math]::Round($Clock.Elapsed.TotalSeconds, 3)
    lateBeforeSendMs = $lateMs
  }
}

# All game times below are measured from the beginning of the *current* phase.
# Paused checkpoints are deliberately placed near 0.25 s into the next phase.
function Run-Phase([string]$Id, [string]$Expected, [double]$UntilGameTime, [object[]]$Actions = @(), [double]$Rate = 1.0, [switch]$AllowWait, [switch]$NoPause) {
  if (!$script:pausedByScript) { throw "Phase $Id requires the prior checkpoint to be paused." }
  $offset = $script:phaseOffset
  # Keep the resume ADB call on the wall clock: the game can advance before
  # adb input tap returns, and resetting here makes every obstacle input late.
  $clock = [Diagnostics.Stopwatch]::StartNew()
  Resume-Game
  $resumeWallSeconds = $clock.Elapsed.TotalSeconds
  if ($Id -eq 'choice-6') {
    # Dream reward act 1 runs before the 30 s transition; act 2 starts at 30 s.
    Wait-Until $clock (10 + $resumeWallSeconds)
    Save-Screenshot 'dream-act1' | Out-Null
    Wait-Until $clock (35 + $resumeWallSeconds)
    Save-Screenshot 'dream-act2' | Out-Null
  }
  foreach ($action in @($Actions | Sort-Object -Property at)) {
    $target = ($action.at - $offset) / $Rate
    if ($target -lt 0) { throw "Action $($action.label) falls before phase resume." }
    Wait-Until $clock $target
    Invoke-PhysicalAction $action $clock $target
  }
  # Preserve the phase-boundary checkpoint timing while moving obstacle inputs
  # earlier by the measured resume-command time.
  $endTarget = ($UntilGameTime - $offset) / $Rate + $resumeWallSeconds
  if ($endTarget -lt $clock.Elapsed.TotalSeconds - 0.25) { throw "Phase $Id overran the next checkpoint." }
  Wait-Until $clock $endTarget
  if ($NoPause) {
    $script:report.actions += [ordered]@{ label = "enter-$Id"; input = 'none'; targetWallSeconds = [math]::Round($endTarget, 3); observedByWallSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 3) }
    return
  }
  Pause-Game
  $script:report.actions += [ordered]@{ label = "pause-for-$Id"; input = 'tap'; targetWallSeconds = [math]::Round($endTarget, 3); sentByWallSeconds = [math]::Round($clock.Elapsed.TotalSeconds, 3); resumeAdbSeconds = [math]::Round($resumeWallSeconds, 3) }
  Confirm-Checkpoint $Id $Expected -AlreadyPaused -AllowWait:$AllowWait
}

function Read-Segments {
  $source = Join-Path $projectPath 'assets\scripts\Content.ts'
  $script:report.contentSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  $content = Get-Content -LiteralPath $source -Raw -Encoding UTF8
  $segmentPattern = "(?s)\{\s*id:\s*(?<id>[1-7]),\s*name:\s*'(?<name>[^']+)',\s*duration:\s*(?<duration>[0-9.]+).*?obstacles:\s*\[(?<obstacles>.*?)\]"
  $obstaclePattern = "\{\s*at:\s*(?<at>[0-9.]+),\s*kind:\s*'(?<kind>low|high|tall)'"
  $segments = @{}
  foreach ($match in [regex]::Matches($content, $segmentPattern)) {
    $id = [int]$match.Groups['id'].Value
    $obstacles = @()
    foreach ($obstacle in [regex]::Matches($match.Groups['obstacles'].Value, $obstaclePattern)) {
      $obstacles += [pscustomobject]@{
        at = [double]::Parse($obstacle.Groups['at'].Value, [Globalization.CultureInfo]::InvariantCulture)
        kind = $obstacle.Groups['kind'].Value
      }
    }
    if ($obstacles.Count -lt 5 -or $segments.ContainsKey($id)) { throw "Cannot safely read obstacle plan for segment $id." }
    $segments[$id] = [pscustomobject]@{
      id = $id
      name = $match.Groups['name'].Value
      duration = [double]::Parse($match.Groups['duration'].Value, [Globalization.CultureInfo]::InvariantCulture)
      obstacles = $obstacles
    }
  }
  if ($segments.Count -ne 7) { throw "Expected seven authored segments, parsed $($segments.Count)." }
  return $segments
}

function Segment-Actions($Segment) {
  $actions = @()
  foreach ($obstacle in $Segment.obstacles) {
    if ($obstacle.kind -eq 'high') {
      # Refresh the slide before its trailing collision edge. A single swipe
      # leaves only a narrow 0.8-second window on this device.
      $actions += [pscustomobject]@{ at = $obstacle.at - 0.58; type = 'slide'; label = "segment-$($Segment.id)-high-first-$($obstacle.at)" }
      $actions += [pscustomobject]@{ at = $obstacle.at - 0.12; type = 'slide'; label = "segment-$($Segment.id)-high-refresh-$($obstacle.at)" }
    } elseif ($obstacle.kind -eq 'tall') {
      $actions += [pscustomobject]@{ at = $obstacle.at - 0.77; type = 'tap'; label = "segment-$($Segment.id)-tall-first-$($obstacle.at)" }
      $actions += [pscustomobject]@{ at = $obstacle.at - 0.38; type = 'tap'; label = "segment-$($Segment.id)-tall-second-$($obstacle.at)" }
    } else {
      # The two real segment-1 low hits on V2055A landed after a single jump.
      # A second airborne jump keeps the player's feet above the trailing edge.
      $actions += [pscustomobject]@{ at = $obstacle.at - 0.53; type = 'tap'; label = "segment-$($Segment.id)-low-first-$($obstacle.at)" }
      $actions += [pscustomobject]@{ at = $obstacle.at - 0.14; type = 'tap'; label = "segment-$($Segment.id)-low-second-$($obstacle.at)" }
    }
  }
  if ($Segment.id -eq 3) {
    $actions += [pscustomobject]@{ at = $Segment.duration * 0.7 - 0.45; type = 'tap'; label = 'own-homework' }
  }
  return $actions
}

function Run-Segment([int]$Id, [string]$NextId, [string]$NextExpected) {
  $segment = $script:segments[$Id]
  $rate = if ($Id -eq 1) { 1.0 } else { 1.04 } # umbrella stays in inventory after choice 1
  Run-Phase $NextId $NextExpected ($segment.duration + 0.25) (Segment-Actions $segment) $rate
}

$exitCode = 1
try {
  if (!(Test-Path -LiteralPath $AdbPath)) { throw "adb not found: $AdbPath" }
  $AdbPath = (Resolve-Path -LiteralPath $AdbPath).Path
  $script:segments = Read-Segments
  $devices = @(Invoke-Adb -Arguments @('devices') | Where-Object { $_ -match '^\S+\s+device$' })
  if ($DeviceSerial) {
    if (!($devices | Where-Object { ($_ -split '\s+')[0] -eq $DeviceSerial })) { throw "Device $DeviceSerial is not authorized and online." }
    $script:serial = $DeviceSerial
  } else {
    if ($devices.Count -ne 1) { throw "Expected exactly one authorized Android device; found $($devices.Count). Pass -DeviceSerial if needed." }
    $script:serial = ($devices[0] -split '\s+')[0]
  }
  $script:report.deviceSerial = $script:serial
  $script:report.devicePackage = @(Invoke-Adb -Arguments @('shell', 'dumpsys', 'package', $packageName) | Where-Object { $_ -match 'versionCode=|versionName=|lastUpdateTime=' } | Select-Object -First 5)
  if ($ResumeFromSegment6Report) {
    $priorPath = (Resolve-Path -LiteralPath $ResumeFromSegment6Report).Path
    $prior = Get-Content -LiteralPath $priorPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $priorImage = Join-Path (Split-Path -Parent $priorPath) '03-segment-6.png'
    if ($prior.status -ne 'FAIL' -or $prior.failure -notmatch 'Cannot calibrate segment start from progress bar' -or !(Test-Path -LiteralPath $priorImage)) {
      throw 'Segment-6 continuation requires its exact failed calibration report and screenshot.'
    }
    if ($prior.deviceSerial -ne $script:serial -or $prior.contentSha256 -ne $script:report.contentSha256) {
      throw 'Continuation device or authored content differs from the prior attempt.'
    }
    $script:report.continuedFrom = $priorPath
    $script:report.operatorCorrection = $prior.operatorCorrection
    $script:report.checkpoints = @($prior.checkpoints)
    $script:report.actions = @($prior.actions)
    $script:report.adbReconnects = @($prior.adbReconnects)
    $size = Get-PngDimensions $priorImage
    $script:screenWidth = $size[0]
    $script:screenHeight = $size[1]
    if ($script:screenWidth -le $script:screenHeight) { throw 'Continuation screenshot is not landscape.' }
    $script:coreWidth = [math]::Min($script:screenWidth, $script:screenHeight * 16.0 / 9.0)
    $script:coreHeight = [math]::Min($script:screenHeight, $script:screenWidth * 9.0 / 16.0)
    $script:report.screenPixels = "$($size[0])x$($size[1])"
    $pidText = ((Invoke-Adb -Arguments @('shell', 'pidof', $packageName)) -join '').Trim()
    if (!$pidText) { throw 'Original game process is no longer running; continuation is unsafe.' }
    $script:pausedByScript = $true
    Confirm-Checkpoint 'segment-6' '深夜的台灯 with three lives, before first obstacle' -AlreadyPaused
  } elseif ($ResumeFromChoice5Report) {
    # An operator may correct a visual misclassification while the original
    # process is still paused. Preserve the failed attestation and its report.
    $priorPath = (Resolve-Path -LiteralPath $ResumeFromChoice5Report).Path
    $prior = Get-Content -LiteralPath $priorPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $lastCheckpoint = @($prior.checkpoints)[-1]
    if ($prior.status -ne 'FAIL' -or $lastCheckpoint.id -ne 'choice-5' -or $lastCheckpoint.attestation -ne 'visual:N') {
      throw 'Choice-5 continuation requires the failed choice-5 visual checkpoint report.'
    }
    if ($prior.deviceSerial -ne $script:serial -or $prior.contentSha256 -ne $script:report.contentSha256) {
      throw 'Continuation device or authored content differs from the prior attempt.'
    }
    if (!(Test-Path -LiteralPath $lastCheckpoint.screenshot)) { throw 'Prior choice-5 screenshot is missing.' }
    $script:report.continuedFrom = $priorPath
    $script:report.operatorCorrection = 'The prior visual:N at choice-5 mistook the normal pause overlay for a death; the screenshot shows 家长会之后 and three lives. The correction is recorded here and must be visually reconfirmed.'
    $script:report.checkpoints = @($prior.checkpoints)
    $script:report.actions = @($prior.actions)
    $script:report.adbReconnects = @($prior.adbReconnects)
    $size = Get-PngDimensions $lastCheckpoint.screenshot
    $script:screenWidth = $size[0]
    $script:screenHeight = $size[1]
    if ($script:screenWidth -le $script:screenHeight) { throw 'Continuation screenshot is not landscape.' }
    $script:coreWidth = [math]::Min($script:screenWidth, $script:screenHeight * 16.0 / 9.0)
    $script:coreHeight = [math]::Min($script:screenHeight, $script:screenWidth * 9.0 / 16.0)
    $script:report.screenPixels = "$($size[0])x$($size[1])"
    $pidText = ((Invoke-Adb -Arguments @('shell', 'pidof', $packageName)) -join '').Trim()
    if (!$pidText) { throw 'Original game process is no longer running; continuation is unsafe.' }
    $script:pausedByScript = $true
    Confirm-Checkpoint 'choice-5' '家长会之后 with normal pause overlay and three lives' -AlreadyPaused
  } else {
  Invoke-Adb -Arguments @('logcat', '-c') | Out-Null
  Invoke-Adb -Arguments @('shell', 'am', 'force-stop', $packageName) | Out-Null
  Invoke-Adb -Arguments @('shell', 'am', 'start', '-W', '-n', "$packageName/$activityName") | Out-Null
  Start-Sleep -Seconds 4
  $hallPath = Save-Screenshot '00-hall-before'
  $size = Get-PngDimensions $hallPath
  $script:screenWidth = $size[0]
  $script:screenHeight = $size[1]
  if ($script:screenWidth -le $script:screenHeight) { throw "Expected landscape screenshot, got $($size[0])x$($size[1])." }
  $script:coreWidth = [math]::Min($script:screenWidth, $script:screenHeight * 16.0 / 9.0)
  $script:coreHeight = [math]::Min($script:screenHeight, $script:screenWidth * 9.0 / 16.0)
  $script:report.screenPixels = "$($size[0])x$($size[1])"
  Write-Host "Inspect: $hallPath"
  if ((Read-Host 'Confirm the first-chapter hall is visible: type Y, otherwise N').Trim().ToUpperInvariant() -ne 'Y') { throw 'The departure hall was not confirmed.' }
  $script:report.checkpoints += [ordered]@{ id = 'hall-before'; expected = '第一章 · 学堂 / 出发'; screenshot = $hallPath; attestation = 'visual:Y' }

  Send-Tap 50 160 # hall departure door
  Start-Sleep -Milliseconds 3250 # intro is 3 s; the next checkpoint pauses early in segment 1
  Confirm-Checkpoint 'segment-1' $script:segments[1].name

  Run-Segment 1 'choice-1' '上学的路'
  # The umbrella is physically reached at about 2.38 s, before choice 1's
  # three-second fallback. This early poem proves the contact route occurred.
  Run-Phase 'poem-1' '有人把伞留在门口 after touching the umbrella' 2.65
  Run-Phase 'segment-2' $script:segments[2].name 8.25

  Run-Segment 2 'choice-2' '教室 · 三把凳子'
  $seatActions = @(
    [pscustomobject]@{ at = 0.72; type = 'tap'; label = 'jump-onto-first-seat' },
    [pscustomobject]@{ at = 1.25; type = 'slide'; label = 'dive-onto-first-seat' }
  )
  # A successful landing spends 1.4 seconds in the seat scene before poem 2.
  Run-Phase 'poem-2' '教室很大，椅子很多' 2.95 $seatActions
  Run-Phase 'segment-3' $script:segments[3].name 8.25

  Run-Segment 3 'choice-3' '那张试卷'
  # The exam overlaps the player's feet from about 1.37 to 2.03 s. Two
  # real jumps keep the feet clear until the paper has passed to the left.
  $examAction = @(
    [pscustomobject]@{ at = 1.20; type = 'tap'; label = 'face-exam-first-jump' },
    [pscustomobject]@{ at = 1.63; type = 'tap'; label = 'face-exam-second-jump' }
  )
  # Entering the poem before choice 3's 3-second fallback proves the paper
  # was passed through its shared contact geometry.
  Run-Phase 'poem-3' '分数是别人写的 after jumping over the exam paper' 2.35 $examAction -AllowWait
  Run-Phase 'segment-4' $script:segments[4].name 8.25

  Run-Segment 4 'piano' '兴趣班 · 练习'
  Run-Phase 'choice-4' '兴趣班 · 琴房' 15.25
  $pianoAction = @([pscustomobject]@{ at = 0.40; type = 'hold'; label = 'close-piano-lid' })
  Run-Phase 'poem-4' '有些声音停下来' 1.75 $pianoAction
  Run-Phase 'segment-5' $script:segments[5].name 8.25

  Run-Segment 5 'choice-5' '家长会之后'
  }
  if (!$ResumeFromSegment6Report) {
    $doorAction = @([pscustomobject]@{ at = 0.45; type = 'slide'; label = 'apologize-under-door' })
    # The moving bench reaches the sliding player at about 1.06 s; capture
    # the poem before the door's three-second fallback.
    Run-Phase 'poem-5' '饭凉了可以再热 after sliding beneath the bench' 1.35 $doorAction -AllowWait
    Run-Phase 'segment-6' $script:segments[6].name 8.25
  }

  Run-Segment 6 'reward' '天上飘 或 云海光柱'
  $rewardAnswer = (Read-Host 'The paused reward screenshot shows D=天上飘 or H=云海光柱. Type D or H').Trim().ToUpperInvariant()
  if ($rewardAnswer -notin @('D', 'H')) { throw "Reward scene was not classified: '$rewardAnswer'." }
  $script:report.reward = if ($rewardAnswer -eq 'D') { 'dream' } else { 'heaven' }
  # Zero input is valid in both rewards. The dream now keeps its full
  # 60-second clock even after its first act reaches the ground.
  $rewardUntil = 60.25
  Run-Phase 'choice-6' '初中的岔路口' $rewardUntil @() 1.0 -AllowWait
  Run-Phase 'poem-6' '带上他走吧' 3.25
  Run-Phase 'segment-7' $script:segments[7].name 8.25

  $finalSegment = $script:segments[7]
  Run-Phase 'ending-desk' '小一号的课桌' ($finalSegment.duration + 0.25) (Segment-Actions $finalSegment) 1.04 -NoPause
  $endingClock = [Diagnostics.Stopwatch]::StartNew()
  $endingEntryPath = Save-Screenshot 'ending-entry'
  $script:report.checkpoints += [ordered]@{
    id = 'ending-entry'
    expected = '小一号的课桌 ending scene entered'
    screenshot = $endingEntryPath
    capturedAfterEntrySeconds = [math]::Round($endingClock.Elapsed.TotalSeconds, 2)
    attestation = 'evidence-only'
  }
  Wait-Until $endingClock 5.0
  $endingFramePath = Save-Screenshot 'ending-playback-5s'
  $script:report.checkpoints += [ordered]@{
    id = 'ending-playback-5s'
    expected = '小一号的课桌 ending scene still playing'
    screenshot = $endingFramePath
    capturedAfterResumeSeconds = [math]::Round($endingClock.Elapsed.TotalSeconds, 2)
    attestation = 'evidence-only'
  }
  Write-Host "Ending playback evidence: $endingFramePath"
  # This route shows the desk ending. Native moment replay belongs to the
  # separate secondGrade finale, which this one-route check does not enter.
  Wait-Until $endingClock 81.0 # ending lasts 80 s; completion returns to the hall
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    $path = Save-Screenshot ('hall-after-' + $attempt)
    Write-Host "Inspect: $path"
    $answer = (Read-Host 'Confirm the hall and the 课桌 lamp are visible: Y=yes, W=wait 2 s, N=fail').Trim().ToUpperInvariant()
    $script:report.checkpoints += [ordered]@{ id = 'hall-after'; expected = '课桌 lamp lit in hall'; screenshot = $path; attestation = "visual:$answer"; attempt = $attempt }
    if ($answer -eq 'Y') { break }
    if ($answer -ne 'W' -or $attempt -eq 5) { throw 'Final hall and desk lamp were not confirmed.' }
    Start-Sleep -Seconds 2
  }
  Write-Host "Inspect ending entry: $endingEntryPath"
  Write-Host "Inspect ending playback: $endingFramePath"
  $endingAnswer = (Read-Host 'Confirm both screenshots show the 小一号的课桌 ending: Y=yes, N=fail').Trim().ToUpperInvariant()
  $script:report.checkpoints += [ordered]@{ id = 'ending-desk'; expected = '小一号的课桌 entered and played'; screenshots = @($endingEntryPath, $endingFramePath); attestation = "visual:$endingAnswer" }
  if ($endingAnswer -ne 'Y') { throw 'Desk ending screenshots were not confirmed.' }
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
  $script:report.status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
  $script:report.completedAt = (Get-Date).ToString('o')
  $reportPath = Join-Path $EvidenceDir 'route-report.json'
  $script:report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Write-Host "Route status: $($script:report.status). Report: $reportPath"
}
exit $exitCode
