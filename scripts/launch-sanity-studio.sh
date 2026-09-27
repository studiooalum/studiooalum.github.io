#!/bin/bash

APP_SUPPORT_DIR="$HOME/Library/Application Support/StudioOALUM"
CACHE_FILE="$APP_SUPPORT_DIR/repo-path.txt"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_URL="git@github.com:studiooalum/studiooalum-sanity.git"
STUDIO_DIR="$REPO_DIR/apps/studio"
STUDIO_LAUNCHER="$STUDIO_DIR/start-studio.sh"

mkdir -p "$APP_SUPPORT_DIR"
printf '%s\n' "$REPO_DIR" > "$CACHE_FILE"

# --- 1) 상위 레포 (studiooalum.github.io) 최신화 ---
echo "📡 최신 코드 확인 중... (website)"
if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" reset --hard origin/main
  echo "✅ website 업데이트 완료"
else
  echo "⚠️ $REPO_DIR 가 git 저장소가 아닙니다. 최신화 건너뜀."
fi

# --- 2) apps/studio (studiooalum-sanity, 중첩 레포) 최신화 ---
echo "📡 최신 코드 확인 중... (studio 스키마)"
if [ -d "$STUDIO_DIR" ] && git -C "$STUDIO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$STUDIO_DIR" fetch origin
  git -C "$STUDIO_DIR" reset --hard origin/main
  echo "✅ 스키마 업데이트 완료"
elif [ ! -d "$STUDIO_DIR" ]; then
  echo "⚠️ $STUDIO_DIR 가 없습니다. 새로 클론합니다..."
  git clone "$REPO_URL" "$STUDIO_DIR"
else
  echo "⚠️ $STUDIO_DIR 가 git 저장소가 아닙니다. 최신화 건너뜀."
fi

if [ ! -f "$STUDIO_LAUNCHER" ]; then
  echo "❌ Sanity Studio launcher not found."
  echo "   Expected: $STUDIO_LAUNCHER"
  exit 1
fi

exec /bin/bash "$STUDIO_LAUNCHER"
