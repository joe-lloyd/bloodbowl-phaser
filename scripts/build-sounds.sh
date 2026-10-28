#!/bin/sh
# Rebuilds the sound effects in public/assets/sounds/ from their CC0 sources.
# public/assets/sounds/CREDITS.md lists every source, author and license.
#
# Needs ffmpeg with libmp3lame and curl.
#
#   scripts/build-sounds.sh SRC_DIR OUT_DIR
#
# SRC_DIR must hold:
#   - the Freesound previews listed in FREESOUND below, which this script
#     downloads if they are missing (previews need no login),
#   - Kenney "Casino Audio" and "Impact Sounds" .ogg files, copied flat into
#     SRC_DIR from https://kenney.nl/assets/casino-audio and
#     https://kenney.nl/assets/impact-sounds (the zips need a browser click).
set -eu
SRC=$1
OUT=$2
mkdir -p "$SRC" "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FREESOUND="261/261267_2399519 276/276600_464940 417/417994_7482766
504/504626_4437257 447/447922_9159316 514/514989_10132653
164/164536_2320755 346/346373_4882199 523/523230_11537497
378/378355_7020379 538/538422_11966684 631/631849_13817463
397/397434_4019029"
for path in $FREESOUND; do
  file="$SRC/$(basename "$path").mp3"
  [ -f "$file" ] || curl -sfL -o "$file" "https://cdn.freesound.org/previews/$path-hq.mp3"
done

s() { echo "$SRC/$1"; }

# Strip leading silence so every sample starts on its transient.
LEAD="silenceremove=start_periods=1:start_threshold=-45dB"

# render NAME PEAK_DB CHANNELS FILTERGRAPH INPUT...
# FILTERGRAPH must end in [o]. The result is normalized to PEAK_DB and
# encoded as MP3, which every browser's decodeAudioData accepts.
render() {
  name=$1 peak=$2 channels=$3 graph=$4
  shift 4
  args=""
  for input in "$@"; do args="$args -i $input"; done
  # shellcheck disable=SC2086
  ffmpeg -hide_banner -loglevel error -y $args -filter_complex "$graph" \
    -map "[o]" -ac "$channels" -ar 44100 "$TMP/$name.wav"
  max=$(ffmpeg -hide_banner -nostats -i "$TMP/$name.wav" -af volumedetect \
    -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB/\1/p')
  gain=$(awk -v p="$peak" -v m="$max" 'BEGIN { print p - m }')
  bitrate=80k
  [ "$channels" = 2 ] && bitrate=128k
  ffmpeg -hide_banner -loglevel error -y -i "$TMP/$name.wav" \
    -af "volume=${gain}dB" -c:a libmp3lame -b:a "$bitrate" "$OUT/$name.mp3"
}

# Ball bouncing on the ground, softened toward a thud on turf.
i=1
for start in 0.065 1.26 2.50 3.65; do
  render "ball-bounce-$i" -3 1 \
    "[0]atrim=start=$start:duration=0.4,asetpts=PTS-STARTPTS,lowpass=f=2800,afade=t=out:st=0.25:d=0.15[o]" \
    "$(s 378355_7020379.mp3)"
  i=$((i + 1))
done

# Fumble: the ball slaps a hand, drops and bounces away, each bounce quieter.
B="atrim=start=0.065:duration=0.4,asetpts=PTS-STARTPTS,lowpass=f=2800"
render fumble -2 1 \
  "[0]$LEAD,atrim=duration=0.2,volume=0.6[slap];\
[1]$B,adelay=120[b1];[2]$B,volume=0.55,adelay=480[b2];\
[3]$B,volume=0.3,adelay=720[b3];[4]$B,volume=0.15,adelay=880[b4];\
[slap][b1][b2][b3][b4]amix=inputs=5:normalize=0,atrim=duration=1.3[o]" \
  "$(s 514989_10132653.mp3)" "$(s 378355_7020379.mp3)" "$(s 378355_7020379.mp3)" \
  "$(s 378355_7020379.mp3)" "$(s 378355_7020379.mp3)"

# Kick-off: boot on ball, then the ball flying off.
render kickoff -1 1 \
  "[0]$LEAD,atrim=duration=0.5[k];[1]$LEAD,atrim=duration=0.45,volume=0.25,adelay=30[w];\
[k][w]amix=inputs=2:normalize=0,afade=t=out:st=0.35:d=0.15[o]" \
  "$(s 261267_2399519.mp3)" "$(s 523230_11537497.mp3)"

# Pass: the throw.
render pass-1 -3 1 "[0]$LEAD,atrim=duration=0.3,afade=t=out:st=0.2:d=0.1[o]" "$(s 346373_4882199.mp3)"
render pass-2 -3 1 "[0]$LEAD,atrim=duration=0.45,afade=t=out:st=0.3:d=0.15[o]" "$(s 523230_11537497.mp3)"

# Catch: leather slapping into hands.
render catch-1 -2 1 "[0]$LEAD,atrim=duration=0.2[o]" "$(s 514989_10132653.mp3)"
render catch-2 -2 1 "[0]$LEAD,atrim=duration=0.25,afade=t=out:st=0.15:d=0.1[o]" "$(s 164536_2320755.mp3)"

# Block: shoulder-pad collisions.
i=1
for n in 000 002 004; do
  render "block-impact-$i" -1 1 "[0]$LEAD[o]" "$(s impactPunch_heavy_$n.ogg)"
  i=$((i + 1))
done
render block-impact-4 -1 1 "[0]$LEAD,atrim=duration=0.5,afade=t=out:st=0.35:d=0.15[o]" "$(s 276600_464940.mp3)"

# Pushback: a lighter shove.
render pushback-1 -3 1 "[0]$LEAD[o]" "$(s impactPunch_medium_000.ogg)"
render pushback-2 -3 1 "[0]$LEAD[o]" "$(s impactPunch_medium_003.ogg)"

# Knockdown: a body hitting the ground.
render knockdown-1 -1 1 "[0]$LEAD,atrim=duration=0.9,afade=t=out:st=0.6:d=0.3[o]" "$(s 504626_4437257.mp3)"
render knockdown-2 -1 1 "[0]$LEAD,atrim=duration=0.8,afade=t=out:st=0.5:d=0.3[o]" "$(s 417994_7482766.mp3)"

# KO or injury: a crunch on top of a heavy thud.
render ko-injury -1 1 \
  "[0]$LEAD[c];[1]$LEAD,volume=0.7[t];[c][t]amix=inputs=2:normalize=0[o]" \
  "$(s 447922_9159316.mp3)" "$(s impactSoft_heavy_002.ogg)"

# Dice rattling on a table.
for n in 1 2 3; do
  render "dice-roll-$n" -3 1 "[0]$LEAD[o]" "$(s dice-throw-$n.ogg)"
done

# Single die knocks, cut from one-die throws, for the 3D dice tray's collisions.
render dice-clack-1 -3 1 "[0]atrim=start=0.07:duration=0.06,asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st=0.04:d=0.02[o]" "$(s die-throw-3.ogg)"
render dice-clack-2 -3 1 "[0]atrim=start=0.22:duration=0.09,asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st=0.06:d=0.03[o]" "$(s die-throw-3.ogg)"
render dice-clack-3 -3 1 "[0]atrim=start=0.15:duration=0.07,asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st=0.05:d=0.02[o]" "$(s die-throw-1.ogg)"

# Referee whistles. Whistles are piercing, so they peak lower.
SHORT="$LEAD,atrim=duration=0.34,afade=t=out:st=0.26:d=0.08"
LONG="$LEAD,atrim=duration=0.75,afade=t=out:st=0.55:d=0.2"
render whistle-short -6 1 "[0]$SHORT[o]" "$(s 538422_11966684.mp3)"
render whistle-double -6 1 \
  "[0]$SHORT[a];[1]$SHORT,adelay=380[b];[a][b]amix=inputs=2:normalize=0[o]" \
  "$(s 538422_11966684.mp3)" "$(s 538422_11966684.mp3)"
render whistle-long -6 1 "[0]$LONG[o]" "$(s 631849_13817463.mp3)"
render whistle-final -6 1 \
  "[0]$SHORT[a];[1]$SHORT,adelay=380[b];[2]$LONG,adelay=800[c];[a][b][c]amix=inputs=3:normalize=0[o]" \
  "$(s 538422_11966684.mp3)" "$(s 538422_11966684.mp3)" "$(s 631849_13817463.mp3)"

# Touchdown: the crowd erupts.
render touchdown -3 2 \
  "[0]atrim=start=1.0:duration=4.8,asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st=3.3:d=1.5[o]" \
  "$(s 397434_4019029.mp3)"

ls -l "$OUT"
