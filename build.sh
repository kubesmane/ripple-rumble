#!/usr/bin/env bash
# Two builds from one source tree.
#   artifact.html    — for publishing as a Claude Artifact (no <head>: the
#                      host wraps it, and its CSP blocks outside networking,
#                      so multiplayer there uses the platform's room channel)
#   public/index.html — a normal web page for Cloudflare Pages: anyone with
#                      the link plays, no sign-in
set -e
cd "$(dirname "$0")"

SRC="js/audio.js js/fighters.js js/engine.js js/net.js js/render.js js/touch.js js/main.js"

bundle() {           # bundle <shell> <out>
  local shell="$1" out="$2"
  cat "$shell" > "$out"
  printf '\n<script>\n' >> "$out"
  for f in $SRC; do
    printf '\n/* ===== %s ===== */\n' "$f" >> "$out"
    cat "$f" >> "$out"
  done
  printf '\n</script>\n' >> "$out"
}

bundle artifact-shell.html artifact.html
echo "built artifact.html ($(wc -c < artifact.html) bytes)"

mkdir -p public
bundle public-shell.html public/index.html
printf '</body>\n</html>\n' >> public/index.html
echo "built public/index.html ($(wc -c < public/index.html) bytes)"
