param(
  [string]$Apk,
  [string]$AdbPath,
  [string]$DeviceSerial,
  [string]$EvidenceDir,
  [int]$SoakSeconds = 600,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
if ($SoakSeconds -lt 600) { throw 'SoakSeconds must be at least 600 for the ten-minute check.' }
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (!$Apk) {
  # Windows PowerShell 5.1 reads UTF-8 scripts without a BOM as the active
  # code page. Discover the Unicode-named artifact from the filesystem.
  $artifact = Get-ChildItem -LiteralPath (Join-Path $projectPath 'dist') -Filter '*-debug.apk' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$artifact) { throw 'No debug APK found in dist.' }
  $Apk = $artifact.FullName
}
$androidRoot = Join-Path $projectPath '..\android'
$adb = if ($AdbPath) { [IO.Path]::GetFullPath($AdbPath) } else { Join-Path $androidRoot 'android-sdk\platform-tools\adb.exe' }
$packageName = 'com.fleetinglife.s1'
$activityName = 'com.cocos.game.AppActivity'
$qaPath = if ($EvidenceDir) { [IO.Path]::GetFullPath($EvidenceDir) } else {
  Join-Path $projectPath ('build\qa\android-device-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
if (Test-Path -LiteralPath $qaPath) { throw "Evidence directory already exists: $qaPath" }
New-Item -ItemType Directory -Force -Path $qaPath | Out-Null

if (!(Test-Path -LiteralPath $adb)) { throw "adb not found: $adb" }
if (!$SkipInstall -and !(Test-Path -LiteralPath $Apk)) { throw "APK not found: $Apk" }

function Invoke-Adb(
  [string[]]$Arguments,
  [switch]$AllowFailure,
  [switch]$RetryTransport,
  [switch]$AllowTransientTransportFailure
) {
  $command = @($Arguments)
  if ($script:serial) { $command = @('-s', $script:serial) + $command }
  # adb pull writes progress to stderr even on success; check the exit code
  # ourselves instead of treating that progress as a terminating PS error.
  $retryWatch = [System.Diagnostics.Stopwatch]::StartNew()
  do {
    $ErrorActionPreference = 'Continue'
    $result = @(& $adb @command 2>&1)
    $exitCode = $LASTEXITCODE
    $resultText = $result -join "`n"
    $transportFailure = $exitCode -ne 0 -and $resultText -match '(?i)(device\s+.+\s+not found|device\s+offline|no devices(?:/emulators)? found|no devices/emulators found|device still authorizing)'
    if (!$transportFailure -or !$RetryTransport -or $retryWatch.Elapsed.TotalSeconds -ge 15) { break }
    Write-Warning "ADB device connection was lost; retrying a safe command ($([math]::Round($retryWatch.Elapsed.TotalSeconds, 1))s / 15s)."
    Start-Sleep -Seconds 1
  } while ($true)
  $retryWatch.Stop()
  if ($exitCode -ne 0 -and !$AllowFailure) {
    if ($transportFailure -and $AllowTransientTransportFailure) {
      Write-Warning "Skipped a non-idempotent ADB command after a transient connection failure: adb $($command -join ' ')"
    } else {
      throw "adb $($command -join ' ') failed:`n$($result -join "`n")"
    }
  }
  return $result
}

function Get-AuthorizedDevices {
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $connected = @(Invoke-Adb -Arguments @('devices') -RetryTransport | Where-Object { $_ -match '^\S+\s+device$' })
    if ($connected.Count -gt 0 -or (Get-Date) -ge $deadline) { return $connected }
    Write-Warning 'No authorized Android device is visible yet; waiting for USB reconnect.'
    Start-Sleep -Seconds 1
  } while ($true)
}

function Get-ScreenPoint([int]$X, [int]$Y) {
  $width = $script:screenWidth
  $height = $script:screenHeight
  if (!$width -or !$height) { throw 'Capture android-hall.png before sending screen input.' }
  if ($width -le $height) { throw "Expected landscape screen, got ${width}x${height}." }
  $coreWidth = [math]::Min($width, $height * 16.0 / 9.0)
  $screenX = [int][math]::Round(($width - $coreWidth) / 2 + $X * $coreWidth / 480)
  $screenY = [int][math]::Round($Y * $height / 270)
  return @($screenX, $screenY)
}

function Set-ScreenSizeFromScreenshot([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $header = New-Object byte[] 24
    if ($stream.Read($header, 0, $header.Length) -ne $header.Length) { throw "PNG header is incomplete: $Path" }
    if ($header[0] -ne 137 -or $header[1] -ne 80 -or $header[2] -ne 78 -or $header[3] -ne 71 -or
        $header[12] -ne 73 -or $header[13] -ne 72 -or $header[14] -ne 68 -or $header[15] -ne 82) {
      throw "Screenshot is not a PNG: $Path"
    }
    $script:screenWidth = [int](([uint32]$header[16] -shl 24) -bor ([uint32]$header[17] -shl 16) -bor ([uint32]$header[18] -shl 8) -bor [uint32]$header[19])
    $script:screenHeight = [int](([uint32]$header[20] -shl 24) -bor ([uint32]$header[21] -shl 16) -bor ([uint32]$header[22] -shl 8) -bor [uint32]$header[23])
  } finally { $stream.Dispose() }
}

function Send-Tap([int]$X, [int]$Y, [switch]$BestEffort) {
  $point = Get-ScreenPoint $X $Y
  Invoke-Adb -Arguments @('shell','input','tap',"$($point[0])","$($point[1])") -AllowTransientTransportFailure:$BestEffort | Out-Null
}

function Send-Swipe([int]$X1, [int]$Y1, [int]$X2, [int]$Y2, [int]$DurationMs = 180, [switch]$BestEffort) {
  $start = Get-ScreenPoint $X1 $Y1
  $end = Get-ScreenPoint $X2 $Y2
  Invoke-Adb -Arguments @('shell','input','swipe',"$($start[0])","$($start[1])","$($end[0])","$($end[1])","$DurationMs") -AllowTransientTransportFailure:$BestEffort | Out-Null
}

function Get-DisplayRotation {
  $display = Invoke-Adb -Arguments @('shell','dumpsys','display') -RetryTransport
  $physical = $display | Where-Object { $_ -match 'mOverrideDisplayInfo=DisplayInfo\{' -and $_ -match 'displayId 0' } | Select-Object -First 1
  if ($physical -match '\brotation (\d+)\b') { return [int]$Matches[1] }
  throw 'Could not verify physical display rotation from dumpsys display.'
}

function Set-DisplayRotation([int]$Rotation) {
  Invoke-Adb -Arguments @('shell','cmd','window',$script:rotationCommand,'lock',"$Rotation") -RetryTransport | Out-Null
  Start-Sleep -Seconds 2
  $actual = Get-DisplayRotation
  if ($actual -ne $Rotation) { throw "Requested rotation $Rotation, observed $actual." }
}

function Restore-DisplayRotation {
  if ($script:originalAccelerometer -eq '0' -and $script:originalRotation -match '^\d+$') {
    Invoke-Adb -Arguments @('shell','cmd','window',$script:rotationCommand,'lock',$script:originalRotation) -AllowFailure -RetryTransport | Out-Null
  } else {
    Invoke-Adb -Arguments @('shell','cmd','window',$script:rotationCommand,'free') -AllowFailure -RetryTransport | Out-Null
  }
  if ($script:originalRotation -match '^\d+$') { Invoke-Adb -Arguments @('shell','settings','put','system','user_rotation',$script:originalRotation) -AllowFailure -RetryTransport | Out-Null }
  if ($script:originalAccelerometer -match '^[01]$') { Invoke-Adb -Arguments @('shell','settings','put','system','accelerometer_rotation',$script:originalAccelerometer) -AllowFailure -RetryTransport | Out-Null }
  if ($script:originalIgnoreOrientation -match 'ignoreOrientationRequest (true|false)') {
    Invoke-Adb -Arguments @('shell','cmd','window','set-ignore-orientation-request',$Matches[1]) -AllowFailure -RetryTransport | Out-Null
  }
}

function Save-Screenshot([string]$Name) {
  $remote = "/sdcard/fleeting-life-$Name.png"
  Invoke-Adb -Arguments @('shell','screencap','-p',$remote) -RetryTransport | Out-Null
  Invoke-Adb -Arguments @('pull',$remote,(Join-Path $qaPath "$Name.png")) -RetryTransport | Out-Null
  Invoke-Adb -Arguments @('shell','rm',$remote) -AllowFailure -RetryTransport | Out-Null
}

function Read-PssKb {
  $memory = Invoke-Adb -Arguments @('shell','dumpsys','meminfo',$packageName) -AllowFailure -RetryTransport
  $line = $memory | Where-Object { $_ -match '^\s*TOTAL PSS:\s+(\d+)' } | Select-Object -First 1
  if ($line -match '^\s*TOTAL PSS:\s+(\d+)') { return [int]$Matches[1] }
  return $null
}

function Collect-PerfLogcat {
  $sample = Invoke-Adb -Arguments @('logcat','-d','-v','threadtime','*:V') -AllowFailure -RetryTransport
  foreach ($line in $sample) {
    $text = [string]$line
    if ($text -notmatch 'FLEETING_(PERF|PHASE)') { continue }
    if (!$script:perfLogcatSeen.ContainsKey($text)) {
      $script:perfLogcatSeen[$text] = $true
      [void]$script:perfLogcatLines.Add($text)
    }
  }
}

function Wait-App([int]$Seconds = 5) {
  Start-Sleep -Seconds $Seconds
  $deadline = (Get-Date).AddSeconds(8)
  $focus = ''
  do {
    Start-Sleep -Milliseconds 500
    $activityDump = (Invoke-Adb -Arguments @('shell','dumpsys','activity','activities') -AllowFailure -RetryTransport) -join "`n"
    $resumed = ($activityDump -split "`n" | Where-Object { $_ -match 'topResumedActivity=|mResumedActivity=|^\s*Resumed:\s*ActivityRecord' }) -join "`n"
    $windowDump = (Invoke-Adb -Arguments @('shell','dumpsys','window') -AllowFailure -RetryTransport) -join "`n"
    $focus = ($windowDump -split "`n" | Where-Object { $_ -match 'mCurrentFocus=|mFocusedApp=' }) -join "`n"
    if ($resumed -match [regex]::Escape($packageName) -and
        $focus -match 'mCurrentFocus=Window\{[^\r\n]*com\.fleetinglife\.s1') { return }
    # Android 16 may keep NotificationShade focused after a cold start. Close
    # only that system shade; otherwise a tap would land outside the game.
    if ($focus -match 'mCurrentFocus=Window\{[^\r\n]*NotificationShade') {
      Invoke-Adb -Arguments @('shell','cmd','statusbar','collapse') -AllowFailure -RetryTransport | Out-Null
    }
  } while ((Get-Date) -lt $deadline)
  throw "The game did not become the focused Android activity. Last focus: $focus"
}

$devices = @(Get-AuthorizedDevices)
if ($DeviceSerial) {
  if (!($devices | Where-Object { ($_ -split '\s+')[0] -eq $DeviceSerial })) {
    throw "Device $DeviceSerial is not authorized and online."
  }
  $serial = $DeviceSerial
} else {
  if ($devices.Count -ne 1) { throw "Expected exactly one authorized Android device, found $($devices.Count). Pass -DeviceSerial if needed." }
  $serial = ($devices[0] -split '\s+')[0]
}
$windowHelp = (Invoke-Adb -Arguments @('shell','cmd','window','help') -AllowFailure -RetryTransport) -join "`n"
$rotationCommand = if ($windowHelp -match '(?m)^\s*set-user-rotation\b') { 'set-user-rotation' } elseif ($windowHelp -match '(?m)^\s*user-rotation\b') { 'user-rotation' } else { throw 'Android window shell has no supported user-rotation command.' }
$originalRotation = ([string](Invoke-Adb -Arguments @('shell','settings','get','system','user_rotation') -AllowFailure -RetryTransport | Select-Object -First 1)).Trim()
$originalAccelerometer = ([string](Invoke-Adb -Arguments @('shell','settings','get','system','accelerometer_rotation') -AllowFailure -RetryTransport | Select-Object -First 1)).Trim()
$originalIgnoreOrientation = (Invoke-Adb -Arguments @('shell','cmd','window','get-ignore-orientation-request') -AllowFailure -RetryTransport) -join ' '
$rotationLocked = $false

try {
  if (!$SkipInstall) {
    $install = Invoke-Adb -Arguments @('install','-r','-t',$Apk)
    if (($install -join "`n") -notmatch 'Success') { throw "APK install did not report success: $($install -join ' ')" }
  }

  Invoke-Adb -Arguments @('logcat','-c') | Out-Null
  Invoke-Adb -Arguments @('shell','am','force-stop',$packageName) | Out-Null
  Invoke-Adb -Arguments @('shell','am','start','-W','-n',"$packageName/$activityName") | Out-Null
  Wait-App 6
  Save-Screenshot 'android-hall'
  Set-ScreenSizeFromScreenshot (Join-Path $qaPath 'android-hall.png')

  # Map the fixed 480x270 game core to the device's current landscape size.
  Send-Tap 50 160
  Start-Sleep -Seconds 4
  Send-Tap 240 96
  Start-Sleep -Milliseconds 180
  Send-Tap 240 96
  Start-Sleep -Milliseconds 220
  Send-Swipe 240 92 240 163
  Save-Screenshot 'android-input'

  Invoke-Adb -Arguments @('shell','input','keyevent','4') | Out-Null
  Start-Sleep -Seconds 1
  Save-Screenshot 'android-back-paused'
  Invoke-Adb -Arguments @('shell','input','keyevent','4') | Out-Null
  Start-Sleep -Seconds 1
  Save-Screenshot 'android-back-hall'

  Send-Tap 50 160
  Start-Sleep -Seconds 4
  Invoke-Adb -Arguments @('shell','input','keyevent','3') | Out-Null
  Start-Sleep -Seconds 2
  Invoke-Adb -Arguments @('shell','am','start','-W','-n',"$packageName/$activityName") | Out-Null
  Wait-App 2
  Save-Screenshot 'android-resume-paused'

  # Exercise Android's lock screen, then keep evidence of the resumed activity.
  Invoke-Adb -Arguments @('shell','input','keyevent','26') | Out-Null
  Start-Sleep -Seconds 2
  (Invoke-Adb -Arguments @('shell','dumpsys','power') -AllowFailure -RetryTransport) | Set-Content -LiteralPath (Join-Path $qaPath 'android-locked-power.txt') -Encoding utf8
  Invoke-Adb -Arguments @('shell','input','keyevent','224') | Out-Null
  Invoke-Adb -Arguments @('shell','cmd','window','dismiss-keyguard') -AllowFailure | Out-Null
  Invoke-Adb -Arguments @('shell','input','keyevent','82') -AllowFailure | Out-Null
  Wait-App 3
  Save-Screenshot 'android-unlocked-resumed'

  # Restart the process after play; screenshot and storage metadata allow a
  # human to compare the persisted session with the pre-restart state.
  Save-Screenshot 'android-before-restart'
  Invoke-Adb -Arguments @('shell','am','force-stop',$packageName) | Out-Null
  Invoke-Adb -Arguments @('shell','am','start','-W','-n',"$packageName/$activityName") | Out-Null
  Wait-App 5
  Save-Screenshot 'android-after-restart'
  (Invoke-Adb -Arguments @('shell','dumpsys','activity','activities') -AllowFailure -RetryTransport) | Set-Content -LiteralPath (Join-Path $qaPath 'android-restarted-activity.txt') -Encoding utf8

  # Exercise both sensorLandscape directions, then return rotation control to Android.
  $rotationLocked = $true
  Invoke-Adb -Arguments @('shell','cmd','window','set-ignore-orientation-request','true') | Out-Null
  Set-DisplayRotation 1
  (Invoke-Adb -Arguments @('shell','dumpsys','display') -RetryTransport) | Set-Content -LiteralPath (Join-Path $qaPath 'android-landscape-left-display.txt') -Encoding utf8
  Save-Screenshot 'android-landscape-left'
  Set-DisplayRotation 3
  (Invoke-Adb -Arguments @('shell','dumpsys','display') -RetryTransport) | Set-Content -LiteralPath (Join-Path $qaPath 'android-landscape-right-display.txt') -Encoding utf8
  Save-Screenshot 'android-landscape-right'
  Restore-DisplayRotation
  $rotationLocked = $false

  # Keep the stability sample on live first-chapter gameplay, not an idle hall.
  Send-Tap 50 160
  Start-Sleep -Seconds 4
  Invoke-Adb -Arguments @('shell','dumpsys','gfxinfo',$packageName,'reset') -AllowFailure | Out-Null
  $listedLayers = Invoke-Adb -Arguments @('shell','dumpsys','SurfaceFlinger','--list') -AllowFailure -RetryTransport
  # SurfaceFlinger also lists a static "Background for SurfaceView" layer.
  # It never receives game frames. Sample the real view and its BLAST child,
  # then use whichever actually reports presented frames on this Android build.
  $surfaceNames = @($listedLayers | Where-Object {
    $_ -match '^SurfaceView\[' -and $_ -match [regex]::Escape($packageName)
  })
  $intervalsBySurface = @{}
  $lastFrameBySurface = @{}
  foreach ($name in $surfaceNames) {
    $intervalsBySurface[$name] = New-Object 'System.Collections.Generic.List[double]'
    $lastFrameBySurface[$name] = [int64]0
  }
  # Start the native telemetry archive at the same boundary as the soak.
  Invoke-Adb -Arguments @('logcat','-c') -RetryTransport | Out-Null
  $script:perfLogcatSeen = @{}
  $script:perfLogcatLines = New-Object 'System.Collections.Generic.List[string]'
  $memorySamples = @([pscustomobject]@{ second = 0; pssKb = (Read-PssKb) })
  $soakStarted = Get-Date
  $deadline = $soakStarted.AddSeconds($SoakSeconds)
  $nextMemory = 120
  $nextFrame = 0
  $nextPerfLogcat = 30
  $nextDeparture = 30
  $lastProgress = -30
  while ((Get-Date) -lt $deadline) {
    $elapsed = [int]((Get-Date) - $soakStarted).TotalSeconds
    if ($elapsed - $lastProgress -ge 30) { Write-Host "Android soak: $elapsed / $SoakSeconds seconds"; $lastProgress = $elapsed }
    Send-Tap 240 96 -BestEffort
    Start-Sleep -Milliseconds 180
    Send-Tap 240 96 -BestEffort
    if (($elapsed % 9) -lt 3) { Send-Swipe 240 92 240 163 150 -BestEffort }
    if ($elapsed -ge $nextDeparture) {
      # If a route returned to the hall, this starts another play attempt.
      Send-Tap 50 160 -BestEffort
      $nextDeparture += 30
    }
    if ($elapsed -ge $nextMemory) {
      $memorySamples += [pscustomobject]@{ second = $elapsed; pssKb = (Read-PssKb) }
      $nextMemory += 120
    }
    if ($surfaceNames.Count -and $elapsed -ge $nextFrame) {
      foreach ($name in $surfaceNames) {
        # adb shell needs remote quoting for BLAST names containing brackets
        # and parentheses; passing the name bare causes a shell syntax error.
        $safeName = $name.Replace("'", "'\''")
        $latencyCommand = "dumpsys SurfaceFlinger --latency '$safeName'"
        $latency = Invoke-Adb -Arguments @('shell', $latencyCommand) -AllowFailure -RetryTransport
        $timestamps = @($latency | Select-Object -Skip 1 | ForEach-Object {
          if ($_ -match '^\s*\d+\s+\d+\s+(\d+)\s*$' -and [int64]$Matches[1] -gt 0) { [int64]$Matches[1] }
        } | Sort-Object -Unique)
        foreach ($timestamp in $timestamps) {
          if ($timestamp -gt $lastFrameBySurface[$name]) {
            if ($lastFrameBySurface[$name] -gt 0) {
              $ms = ($timestamp - $lastFrameBySurface[$name]) / 1000000
              if ($ms -gt 0 -and $ms -lt 1000) { [void]$intervalsBySurface[$name].Add($ms) }
            }
            $lastFrameBySurface[$name] = $timestamp
          }
        }
      }
      $nextFrame += 10
    }
    if ($elapsed -ge $nextPerfLogcat) {
      # Archive the tagged native telemetry before Android's ring buffer can
      # evict early soak windows. The command is read-only and normally takes
      # much less time than the two-second input cadence.
      Collect-PerfLogcat
      $nextPerfLogcat = 30 * ([math]::Floor($elapsed / 30) + 1)
    }
    Start-Sleep -Seconds 2
  }
  $soakEnded = Get-Date
  Collect-PerfLogcat
  $perfLogcatPath = Join-Path $qaPath 'android-perf-logcat.txt'
  Set-Content -LiteralPath $perfLogcatPath -Value @($script:perfLogcatLines) -Encoding utf8
  $perfSampleWindows = @($script:perfLogcatLines | Where-Object { $_ -match 'FLEETING_PERF\s+screen=' }).Count
  $memorySamples += [pscustomobject]@{ second = $SoakSeconds; pssKb = (Read-PssKb) }
  Save-Screenshot 'android-soak-final'

  $logcat = Invoke-Adb -Arguments @('logcat','-d','-v','threadtime','*:V') -AllowFailure -RetryTransport
  $logcat | Set-Content -LiteralPath (Join-Path $qaPath 'android-logcat.txt') -Encoding utf8
  $gfx = Invoke-Adb -Arguments @('shell','dumpsys','gfxinfo',$packageName,'framestats') -AllowFailure -RetryTransport
  $gfx | Set-Content -LiteralPath (Join-Path $qaPath 'android-gfxinfo.txt') -Encoding utf8
  $window = Invoke-Adb -Arguments @('shell','dumpsys','window','displays') -AllowFailure -RetryTransport
  $window | Set-Content -LiteralPath (Join-Path $qaPath 'android-window.txt') -Encoding utf8
  $activity = Invoke-Adb -Arguments @('shell','dumpsys','activity','activities') -AllowFailure -RetryTransport
  $activity | Set-Content -LiteralPath (Join-Path $qaPath 'android-activity.txt') -Encoding utf8

  $surfaceName = $surfaceNames | Sort-Object { $intervalsBySurface[$_].Count } -Descending | Select-Object -First 1
  $intervalsMs = if ($surfaceName) { @($intervalsBySurface[$surfaceName].ToArray()) } else { @() }
  $surfaceCandidates = @($surfaceNames | ForEach-Object { [pscustomobject]@{ name = $_; sampledFrameIntervals = $intervalsBySurface[$_].Count } })
  if ($surfaceName) {
    $safeName = $surfaceName.Replace("'", "'\''")
    $latencyCommand = "dumpsys SurfaceFlinger --latency '$safeName'"
    (Invoke-Adb -Arguments @('shell', $latencyCommand) -AllowFailure -RetryTransport) | Set-Content -LiteralPath (Join-Path $qaPath 'android-surface-latency.txt') -Encoding utf8
  }
  $jankFrames = @($intervalsMs | Where-Object { $_ -gt 25 }).Count
  $jankPercent = if ($intervalsMs.Count) { [math]::Round(100 * $jankFrames / $intervalsMs.Count, 2) } else { $null }
  $averageFrameMs = if ($intervalsMs.Count) { [math]::Round(($intervalsMs | Measure-Object -Average).Average, 2) } else { $null }
  $fatalLines = @($logcat | Where-Object { $_ -match 'FATAL EXCEPTION|ANR in com\.fleetinglife\.s1|Fatal signal|native crash' })
  $processAlive = ((Invoke-Adb -Arguments @('shell','pidof',$packageName) -AllowFailure -RetryTransport) -join '').Trim().Length -gt 0
  $validMemory = @($memorySamples | Where-Object { $null -ne $_.pssKb })
  $memoryGrowthKb = if ($validMemory.Count -ge 2) { $validMemory[-1].pssKb - $validMemory[0].pssKb } else { $null }
  $hash = if (Test-Path -LiteralPath $Apk) { (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToString('o')
    deviceSerial = $serial
    device = ((Invoke-Adb -Arguments @('shell','getprop','ro.product.model') -RetryTransport) -join '').Trim()
    android = ((Invoke-Adb -Arguments @('shell','getprop','ro.build.version.release') -RetryTransport) -join '').Trim()
    api = ((Invoke-Adb -Arguments @('shell','getprop','ro.build.version.sdk') -RetryTransport) -join '').Trim()
    apkSha256 = $hash
    soakSeconds = $SoakSeconds
    soakInput = 'First-chapter play started before sampling; jump/dive inputs every loop and hall departure taps every 30 seconds'
    soakElapsedSeconds = [math]::Round(($soakEnded - $soakStarted).TotalSeconds, 1)
    soakStartedAt = $soakStarted.ToString('o')
    soakEndedAt = $soakEnded.ToString('o')
    perfSampleWindows = $perfSampleWindows
    perfLogcatFile = $perfLogcatPath
    processAlive = $processAlive
    fatalOrAnrCount = $fatalLines.Count
    fatalOrAnrLines = $fatalLines
    memorySamples = $memorySamples
    memoryGrowthKb = $memoryGrowthKb
    surface = $surfaceName
    surfaceCandidates = $surfaceCandidates
    frameSampling = 'SurfaceFlinger latency sampled every 10 seconds; gaps over 1 second excluded'
    sampledFrameIntervals = $intervalsMs.Count
    averageFrameMs = $averageFrameMs
    jankFramesOver25ms = $jankFrames
    jankPercent = $jankPercent
    stabilityStatus = if ($processAlive -and $fatalLines.Count -eq 0) { 'PASS' } else { 'FAIL' }
    performanceSamplingStatus = if ($perfSampleWindows -ge 5 -or $intervalsMs.Count -ge 100) { 'MEASURED' } else { 'UNMEASURED' }
  }
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $qaPath 'android-device-report.json') -Encoding utf8
  $report | ConvertTo-Json -Depth 8
  if (!$processAlive -or $fatalLines.Count -gt 0) { exit 1 }
  if ($report.performanceSamplingStatus -eq 'UNMEASURED') { exit 2 }
} finally {
  if ($rotationLocked) { Restore-DisplayRotation }
}
