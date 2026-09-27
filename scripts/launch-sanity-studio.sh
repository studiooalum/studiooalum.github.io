#!/bin/bash

APP_SUPPORT_DIR="$HOME/Library/Application Support/StudioOALUM"
CACHE_FILE="$APP_SUPPORT_DIR/repo-path.txt"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_URL="git@github.com:studiooalum/studiooalum-sanity.git"
STUDIO_LAUNCHER="$REPO_DIR/apps/studio/start-studio.sh"

mkdir -p "$APP_SUPPORT_DIR"
printf '%s\n' "$REPO_DIR" > "$CACHE_FILE"

echo "📡 최신 코드 확인 중..."
if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_REMOTE="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null)"
  if [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
    echo "⚠️ origin이 예상과 다릅니다 ($CURRENT_REMOTE). 그래도 fetch/reset 진행합니다."
  fi
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" reset --hard origin/main
  echo "✅ 최신 상태로 업데이트 완료"
else
  echo "⚠️ $REPO_DIR 가 git 저장소가 아닙니다. 새로 클론합니다..."
  rm -rf "$REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi

if [ ! -f "$STUDIO_LAUNCHER" ]; then
  echo "❌ Sanity Studio launcher not found."
  echo "   Expected: $STUDIO_LAUNCHER"
  exit 1
fi

exec /bin/bash "$STUDIO_LAUNCHER"
