#!/bin/bash

APP_SUPPORT_DIR="$HOME/Library/Application Support/StudioOALUM"
CACHE_FILE="$APP_SUPPORT_DIR/repo-path.txt"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STUDIO_LAUNCHER="$REPO_DIR/apps/studio/start-studio.sh"

mkdir -p "$APP_SUPPORT_DIR"
printf '%s\n' "$REPO_DIR" > "$CACHE_FILE"

if [ ! -f "$STUDIO_LAUNCHER" ]; then
  echo "❌ Sanity Studio launcher not found."
  echo "   Expected: $STUDIO_LAUNCHER"
  exit 1
fi

exec /bin/bash "$STUDIO_LAUNCHER"