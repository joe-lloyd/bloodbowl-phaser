# Start a detached headless render on Jellybingus and print its process id.
#   powershell -File launch_batch.ps1 <out dir name> [model_id ...]
# The process is created through WMI so it outlives the SSH session.
param([Parameter(Mandatory)][string]$Out, [Parameter(ValueFromRemainingArguments)][string[]]$Ids)

$dir = $PSScriptRoot -replace '\\', '/'
$blender = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
New-Item -ItemType Directory -Force "$dir/$Out" | Out-Null
$cmd = "`"$blender`" -b --factory-startup --python $dir/batch_render.py -- $dir/$Out $($Ids -join ' ')"
(Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }).ProcessId
