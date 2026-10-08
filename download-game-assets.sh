#!/usr/bin/env bash
set -u

# ============================================================
# Childhood Game - Asset Downloader
# ============================================================
# Run from the project root:
#   chmod +x download-game-assets.sh
#   ./download-game-assets.sh
#
# Sources:
# - OpenGameArt CC0 assets
# - Orange Free Sounds assets (license noted per file)
#
# The script uses direct file URLs only; it does NOT scrape
# Pixabay pages, avoiding Cloudflare/403 problems.
# ============================================================

ROOT="public/assets"
AUDIO="$ROOT/audio"
AUDIO_AMBIENCE="$AUDIO/ambience"
AUDIO_SFX="$AUDIO/sfx"
CHAR_ADULT="$ROOT/characters/adult"
CHAR_CHILD="$ROOT/characters/child"
ENV_CITY="$ROOT/environment/city"
ENV_CHILD="$ROOT/environment/childhood"
MINIGAMES="$ROOT/minigames"
UI="$ROOT/ui"
# Pack tạm để ngoài public/ — tránh lỡ copy vào build
TMP_PACKS="${TMPDIR:-/tmp}/childhood-game-assets"

mkdir -p \
  "$AUDIO_AMBIENCE" \
  "$AUDIO_SFX" \
  "$UI/fonts" \
  "$CHAR_ADULT" \
  "$CHAR_CHILD" \
  "$ENV_CITY" \
  "$ENV_CHILD" \
  "$MINIGAMES/o-an-quan" \
  "$MINIGAMES/ban-bi" \
  "$MINIGAMES/nhay-day" \
  "$MINIGAMES/rong-ran-len-may" \
  "$UI"

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
DOWNLOADED=0
FAILED=0
SKIPPED=0

 download_file() {
  local url="$1"
  local file="$2"
  local license="$3"

  mkdir -p "$(dirname "$file")"

  if [[ -s "$file" ]]; then
    echo "SKIP  $file"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  echo "GET   $file"
  echo "      $url"

  if curl -fL --retry 3 --retry-delay 1 --connect-timeout 15 --max-time 120 \
      -A "Mozilla/5.0" \
      -H "Accept: */*" \
      "$url" -o "$file"; then
    if [[ -s "$file" ]]; then
      echo "OK    $file"
      echo "      License: $license"
      DOWNLOADED=$((DOWNLOADED + 1))
    else
      echo "FAIL  empty file: $file" >&2
      rm -f "$file"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "FAIL  $url" >&2
    rm -f "$file"
    FAILED=$((FAILED + 1))
  fi
}

# ------------------------------------------------------------
# Environment - Childhood
# ------------------------------------------------------------
# Puny World: CC0, includes grass, trees, paths, water,
# buildings and other overworld tiles.
download_file \
  "https://opengameart.org/sites/default/files/punyworld-overworld-tileset.png" \
  "$ENV_CHILD/punyworld-overworld-tileset.png" \
  "CC0 - OpenGameArt / Shade"

# Individual CC0 tree.
download_file \
  "https://opengameart.org/sites/default/files/Tree.png" \
  "$ENV_CHILD/tree.png" \
  "CC0 - OpenGameArt / genar"

# House - CC0.
download_file \
  "https://opengameart.org/sites/default/files/House.png" \
  "$ENV_CHILD/house.png" \
  "CC0 - OpenGameArt / Light Game Studio"

# Fence and well - CC0.
download_file \
  "https://opengameart.org/sites/default/files/fence_remix.png" \
  "$ENV_CHILD/fence.png" \
  "CC0 - OpenGameArt / William.Thompsonj + collaborators"

download_file \
  "https://opengameart.org/sites/default/files/well_remix.png" \
  "$ENV_CHILD/well.png" \
  "CC0 - OpenGameArt / William.Thompsonj + collaborators"

# ------------------------------------------------------------
# Characters
# ------------------------------------------------------------
# Puny Characters is CC0 and contains 8-direction idle/walk
# animations. Keep the original zip so you can extract the
# individual sprites/spritesheets you need later.
download_file \
  "https://opengameart.org/sites/default/files/puny-characters.zip" \
  "$ROOT/characters/puny-characters.zip" \
  "CC0 - OpenGameArt / Shade"

# ------------------------------------------------------------
# Audio - City / Adult section
# ------------------------------------------------------------
# Commercial-use CC BY 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2016/08/Footsteps-sound-effect.mp3" \
  "$AUDIO_SFX/footsteps.mp3" \
  "CC BY 4.0 - attribution required"

# Non-commercial CC BY-NC 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2014/10/Door-opening-sound-effect.mp3" \
  "$AUDIO_SFX/door-open.mp3" \
  "CC BY-NC 4.0 - non-commercial + attribution"

# City ambience. Non-commercial CC BY-NC 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2023/03/City-traffic-with-bird-singing-sound-effect.mp3" \
  "$AUDIO_AMBIENCE/city.mp3" \
  "CC BY-NC 4.0 - non-commercial + attribution"

# Dream transition. Non-commercial CC BY-NC 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2020/06/Dream-harp-flashback-sound-effect.mp3" \
  "$AUDIO_SFX/sleep.mp3" \
  "CC BY-NC 4.0 - non-commercial + attribution"

# ------------------------------------------------------------
# Audio - Childhood section
# ------------------------------------------------------------
# Commercial-use CC BY 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2018/05/Sound-therapy-morning-birds.mp3" \
  "$AUDIO_AMBIENCE/childhood-birds.mp3" \
  "CC BY 4.0 - attribution required"

# Village ambience. Non-commercial CC BY-NC 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2019/03/Morning-village-birds-ambience-sound-effect.mp3" \
  "$AUDIO_AMBIENCE/village.mp3" \
  "CC BY-NC 4.0 - non-commercial + attribution"

# Rural footsteps/ambience. Non-commercial CC BY-NC 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2025/09/Village-morning-footsteps-sound-effect.mp3" \
  "$AUDIO_SFX/child-footsteps.mp3" \
  "CC BY-NC 4.0 - non-commercial + attribution"

# ------------------------------------------------------------
# UI fonts (OFL) — VT323, có bộ tiếng Việt
# ------------------------------------------------------------
download_file \
  "https://fonts.gstatic.com/s/vt323/v18/pxiKyp0ihIEF2isfFJXUdVNF.woff2" \
  "$UI/fonts/vt323-latin.woff2" \
  "OFL 1.1 — VT323 / Peter Hull (Google Fonts)"

download_file \
  "https://fonts.gstatic.com/s/vt323/v18/pxiKyp0IHIEF2isQFJXUdVNFKPY.woff2" \
  "$UI/fonts/vt323-vietnamese.woff2" \
  "OFL 1.1 — VT323 / Peter Hull (Google Fonts)"

# ------------------------------------------------------------
# UI sounds (CC0) — tiếng gõ chữ, xác nhận, chime hồi ký
# ------------------------------------------------------------
# Soundpack CC0 gồm 32 tiếng bấm phím rời; lấy 3 tiếng để xoay vòng.
KEYBOARD_PACK="$TMP_PACKS/unicae_games_keyboard_soundpack_1_0.zip"

download_file \
  "https://opengameart.org/sites/default/files/unicae_games_keyboard_soundpack_1_0.zip" \
  "$KEYBOARD_PACK" \
  "CC0 — OpenGameArt / Unicae Games"

if [[ -s "$KEYBOARD_PACK" ]]; then
  KEY_TMP="$TMP_PACKS/keys"

  rm -rf "$KEY_TMP"
  mkdir -p "$KEY_TMP"

  unzip -o -j "$KEYBOARD_PACK" \
    "Single Keys/keypress-001.wav" \
    "Single Keys/keypress-009.wav" \
    "Single Keys/keypress-017.wav" \
    -d "$KEY_TMP" >/dev/null

  cp "$KEY_TMP/keypress-001.wav" "$AUDIO_SFX/ui-type-1.wav"
  cp "$KEY_TMP/keypress-009.wav" "$AUDIO_SFX/ui-type-2.wav"
  cp "$KEY_TMP/keypress-017.wav" "$AUDIO_SFX/ui-type-3.wav"

  echo "OK    $AUDIO_SFX/ui-type-{1,2,3}.wav (trích từ keyboard soundpack)"
fi

# Bộ "Basic Sound Effects" (CC0) của n4 — file mp3 tải trực tiếp.
download_file \
  "https://opengameart.org/sites/default/files/button_0.mp3" \
  "$AUDIO_SFX/ui-confirm.mp3" \
  "CC0 — OpenGameArt / n4"

download_file \
  "https://opengameart.org/sites/default/files/coin1_0.mp3" \
  "$AUDIO_SFX/ui-chime.mp3" \
  "CC0 — OpenGameArt / n4"

download_file \
  "https://opengameart.org/sites/default/files/bell3_0.mp3" \
  "$AUDIO_SFX/school-bell.mp3" \
  "CC0 — OpenGameArt / n4"

# ------------------------------------------------------------
# Ambience hồi tưởng (CC0) — dế đêm hè
# ------------------------------------------------------------
download_file \
  "https://opengameart.org/sites/default/files/crickets_1.mp3" \
  "$AUDIO_AMBIENCE/crickets.mp3" \
  "CC0 — OpenGameArt (Crickets Ambient Noise, loopable)"

# ------------------------------------------------------------
# Optional peaceful room / sleep ambience
# ------------------------------------------------------------
# Commercial-use CC BY 4.0.
download_file \
  "https://orangefreesounds.com/wp-content/uploads/2016/01/Raining.mp3" \
  "$AUDIO_AMBIENCE/room.mp3" \
  "CC BY 4.0 - attribution required"

# ------------------------------------------------------------
# Asset metadata / licenses
# ------------------------------------------------------------
cat > "$ROOT/ASSET_LICENSES.md" <<'LICENSES'
# Game Asset Licenses

## UI fonts

- VT323 (latin + vietnamese woff2) — SIL Open Font License 1.1 — Peter Hull,
  via Google Fonts (`ui/fonts/vt323-*.woff2`)

## UI sounds (CC0)

- ui-type-1/2/3.wav — trích từ "Keyboard Soundpack #1" (CC0) — Unicae Games
- ui-confirm.mp3, ui-chime.mp3, school-bell.mp3 — "Basic Sound Effects" (CC0) — n4
- ambience/crickets.mp3 — "Crickets Ambient Noise - loopable" (CC0)

## OpenGameArt

- Puny World Tileset — CC0 — Shade
- Pixel Tree — CC0 — genar
- House Pixelart 16*16 — CC0 — Light Game Studio
- Fence and Well [Tiny 16] — CC0 — William.Thompsonj + collaborators
- Puny Characters — CC0 — Shade

CC0 assets do not require attribution, although attribution is appreciated.

## Orange Free Sounds

Some audio files in this package are CC BY 4.0 and some are CC BY-NC 4.0.

### CC BY 4.0

- footsteps.mp3
- childhood-birds.mp3
- room.mp3

These may be used commercially, but attribution is required.

### CC BY-NC 4.0

- door-open.mp3
- city.mp3
- sleep.mp3
- village.mp3
- child-footsteps.mp3

These are for non-commercial use and require attribution.

Before publishing commercially, replace the CC BY-NC files with commercially
licensed alternatives or obtain appropriate permission.
LICENSES

# ------------------------------------------------------------
# Dọn file tạm
# ------------------------------------------------------------
rm -rf "$TMP_PACKS"

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
echo
echo "============================================================"
echo "Asset download finished"
echo "============================================================"
echo "Downloaded : $DOWNLOADED"
echo "Skipped    : $SKIPPED"
echo "Failed     : $FAILED"
echo
echo "Assets: $ROOT"
echo
echo "Files:"
find "$ROOT" -type f -print | sort

echo
if [[ "$FAILED" -gt 0 ]]; then
  echo "WARNING: $FAILED asset(s) failed to download."
  echo "Run the script again; successful files will be skipped."
  exit 1
fi

echo "All requested downloadable assets are ready."
