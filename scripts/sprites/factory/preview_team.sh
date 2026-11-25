#!/bin/sh
# Preview models on Jellybingus and bring the strips back: preview_team.sh model,model [kits]
# writes out/preview/<model>.png; nothing renders on this machine.
set -e
cd "$(dirname "$0")"
models=$1
kits=${2:-8a1a2a-2a2a36}
host=${BLENDER_HOST:-jellybingus}
dir=bloodbowl-preview
blender='"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"'
[ -d reference ] || python3 make_reference.py
mkdir -p out/preview
COPYFILE_DISABLE=1 tar --exclude=__pycache__ -czf out/preview.tgz lib teams characters reference art
ssh "$host" "if not exist $dir mkdir $dir"
scp -q out/preview.tgz "$host:$dir/"
ssh "$host" "cd /d %USERPROFILE%\\$dir && (rmdir /s /q lib teams characters art out\\preview 2>nul & tar -xzf preview.tgz && $blender -b --factory-startup --python lib/render.py -- --models $models --preview --density 2 --dither 0 --kits $kits --out out)" |
    grep -E "PREVIEW|FAILED|NO SPEC|ERROR|Error|File \"|CLIPPED" || true
for model in $(echo "$models" | tr , ' '); do
    scp -q "$host:$dir/out/preview/$model.png" out/preview/
done
