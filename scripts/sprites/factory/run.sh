#!/bin/sh
# usage: run.sh [render.py arguments], e.g. run.sh --models thrall --preview
# BLENDER overrides the Blender binary.
cd "$(dirname "$0")"
"${BLENDER:-blender}" -b --factory-startup --python lib/render.py -- "$@" 2>&1 | grep -E "rror|Traceback|File \"|line [0-9]+|DONE|SKIP|PREVIEW|FINISH|FAILED|NO SPEC|MODELS|CLIPPED"
