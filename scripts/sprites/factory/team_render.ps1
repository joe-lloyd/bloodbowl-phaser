# Render a team's models layered on Jellybingus: parallel chunks, then pack each model with --verify. At most
# -Parallel Blenders run at once in either step; more than that runs the GPU out of memory.
#   powershell -File team_render.ps1 -Models thrall,vampire_runner -Out out-layered [-Parallel 14]
# Resumable: a chunk whose stash file exists is skipped. Writes logs-<Out>/ and logs-<Out>/all.done, which
# starts with FAILED and lists the missing chunks of any model it did not pack; rerun to retry those.
param(
  [Parameter(Mandatory)][string]$Models,
  [string]$Out = "out-layered",
  [int]$Parallel = 14,
  [string]$Characters = "",
  [string]$Blender = "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
)
Set-Location $PSScriptRoot
$common = @("--layers", "--dither", "0", "--density", "2", "--frames", "run=12", "--out", $Out)
$loadCharacters = @()
if ($Characters) { $loadCharacters = @("--characters", $Characters) }
$common += $loadCharacters
$stash = "stash-$Out"
$logs = "logs-$Out"
New-Item -ItemType Directory -Force $logs, $stash | Out-Null
Remove-Item -Force "$logs/all.done" -ErrorAction SilentlyContinue
$anims = @("run", "idle", "fall", "cheer", "block", "pass")

function Start-Blender([string[]]$Opts, [string]$Log) {
  $argv = @("-b", "--factory-startup", "--python", "lib/render.py", "--") + $Opts
  Start-Process -FilePath $Blender -ArgumentList $argv -RedirectStandardOutput "$Log.log" -RedirectStandardError "$Log.err" -NoNewWindow -PassThru
}

function Wait-Slot($Procs) {
  while (($Procs | Where-Object { -not $_.HasExited }).Count -ge $Parallel) { Start-Sleep -Seconds 3 }
}

$jobs = @()
$bodiesOf = @{}
foreach ($model in $Models.Split(",")) {
  $bodies = (& $Blender -b --factory-startup --python lib/render.py -- --bodies-of $model @loadCharacters 2>$null | Select-String "^BODIES " | ForEach-Object { $_.Line.Split(" ")[1..99] })
  $bodiesOf[$model] = @($bodies)
  foreach ($bodyName in $bodies) {
    foreach ($anim in $anims) {
      if (Test-Path "$stash/$($model)__$($bodyName)__$anim.pkl") { continue }
      $opts = @("--models", $model, "--bodies", $bodyName, "--anims", $anim, "--stash", $stash) + $common
      $jobs += ,@("$model-$bodyName-$anim", $opts)
    }
  }
}
"$($jobs.Count) chunks to render" | Out-File "$logs/plan.txt"
$running = @()
$started = 0
foreach ($job in $jobs) {
  Wait-Slot $running
  $started++
  Write-Host "Chunk $started of $($jobs.Count): $($job[0])"
  $running += Start-Blender -Opts $job[1] -Log "$logs/$($job[0])"
}
$running | Wait-Process
$packs = @()
$packed = @()
$failed = @()
foreach ($model in $Models.Split(",")) {
  $missing = @(foreach ($bodyName in $bodiesOf[$model]) { foreach ($anim in $anims) {
    if (-not (Test-Path "$stash/$($model)__$($bodyName)__$anim.pkl")) { "$bodyName-$anim" } } })
  if ($bodiesOf[$model].Count -eq 0) { $missing = @("no bodies") }
  if ($missing.Count -gt 0) {
    $failed += "$model missing $($missing -join ',')"
    continue
  }
  Wait-Slot $packs
  Remove-Item -Force "$logs/pack-$model.log" -ErrorAction SilentlyContinue
  $packs += Start-Blender -Opts (@("--models", $model, "--pack", $stash, "--verify", "2") + $common) -Log "$logs/pack-$model"
  $packed += $model
}
$packs | Wait-Process
foreach ($model in $packed) {
  $log = "$logs/pack-$model.log"
  if (-not ((Test-Path $log) -and (Select-String -Quiet -Path $log -Pattern "^DONE $model "))) {
    $failed += "$model pack failed, see $log"
  }
}
if ($failed.Count -gt 0) {
  ("FAILED`n" + ($failed -join "`n")) | Out-File "$logs/all.done"
  $failed | ForEach-Object { Write-Host "FAILED $_" }
  exit 1
}
else { "ALL DONE" | Out-File "$logs/all.done" }
