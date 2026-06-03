#!/usr/bin/env bash
set -euo pipefail

# Generate Android launcher icons from web assets.
# Requires ImageMagick installed (`convert` or `magick`).
# Places generated icons into android/app/src/main/res/mipmap-*/

if [ -f "public/icon-1024.png" ]; then
  SRC=public/icon-1024.png
else
  SRC=public/favicon.ico
fi
ANDROID_RES=android/app/src/main/res
if [ ! -f "$SRC" ]; then
  echo "Source icon not found: $SRC"
  exit 1
fi

if command -v convert >/dev/null 2>&1; then
  IM_CMD=(convert)
elif command -v magick >/dev/null 2>&1; then
  IM_CMD=(magick)
else
  echo "ImageMagick not found. Install it and retry."
  exit 1
fi

# Sizes for launcher icons (px)
declare -A sizes=(
  [mipmap-mdpi]=48
  [mipmap-hdpi]=72
  [mipmap-xhdpi]=96
  [mipmap-xxhdpi]=144
  [mipmap-xxxhdpi]=192
)

for dir in "${!sizes[@]}"; do
  size=${sizes[$dir]}
  outdir="$ANDROID_RES/$dir"
  mkdir -p "$outdir"
  outpng="$outdir/ic_launcher.png"
  echo "Generating $outpng ($size x $size)"
  "${IM_CMD[@]}" "$SRC" -strip -filter Lanczos -define filter:blur=0.92 -resize ${size}x${size} -unsharp 0x0.8+0.7+0.02 "$outpng"
  # also generate round icon
  outpng_round="$outdir/ic_launcher_round.png"
  "${IM_CMD[@]}" "$SRC" -strip -filter Lanczos -define filter:blur=0.92 -resize ${size}x${size} -unsharp 0x0.8+0.7+0.02 "$outpng_round"
  # generate foreground (adaptive) - smaller center crop
  fgsize=$(( size * 3 / 4 ))
  outfg="$outdir/ic_launcher_foreground.png"
  "${IM_CMD[@]}" "$SRC" -strip -background none -filter Lanczos -define filter:blur=0.92 -resize ${fgsize}x${fgsize} -gravity center -extent ${size}x${size} -unsharp 0x0.8+0.7+0.02 "$outfg"
done

# Update drawable-v24 vector? We keep existing vector foreground if present.

echo "Icons generated. Please review files under $ANDROID_RES/ and rebuild the app."
