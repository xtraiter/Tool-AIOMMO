#!/usr/bin/env bash
# Build OpenReel (trình dựng video Pro, https://github.com/Augani/openreel-video, MIT) và đưa vào
# public/dung-video-pro/ để Next.js phục vụ tại https://tool.allinonemmo.com/dung-video-pro/
#
# Mã nguồn OpenReel nằm ở thư mục riêng (mặc định ../openreel-video). Các sửa đổi của mình nằm trong
# scripts/openreel-allinonemmo.patch và được áp tự động: chạy dưới /dung-video-pro/, tắt service worker
# (nếu không nó chiếm cả tên miền), sửa công tắc Chroma Key trong bảng thuộc tính.
#
# Cập nhật lên bản OpenReel mới nhất:
#   bash scripts/build-openreel.sh --update
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${OPENREEL_DIR:-$ROOT/../openreel-video}"
DEST="$ROOT/public/dung-video-pro"
BASE="/dung-video-pro/"

PATCH="$ROOT/scripts/openreel-allinonemmo.patch"

[ -d "$SRC/.git" ] || git clone https://github.com/Augani/openreel-video.git "$SRC"
cd "$SRC"
if [ "${1:-}" = "--update" ]; then
  git apply --reverse --check "$PATCH" 2>/dev/null && git apply --reverse "$PATCH"
  git fetch --depth 1 origin
  git checkout -q -B allinonemmo FETCH_HEAD
fi
if ! git apply --reverse --check "$PATCH" 2>/dev/null; then
  git apply "$PATCH" || { echo "Patch không áp được lên bản OpenReel này — cần cập nhật $PATCH" >&2; exit 1; }
fi

command -v pnpm >/dev/null || npm i -g pnpm@11.7.0
pnpm install --frozen-lockfile
OPENREEL_BASE="$BASE" pnpm build

# Cloudflare-only files and the service worker are not used here.
rm -rf "$DEST.tmp"
cp -r apps/web/dist "$DEST.tmp"
rm -f "$DEST.tmp/_headers" "$DEST.tmp/_redirects" "$DEST.tmp/sw.js"
rm -rf "$DEST"
mv "$DEST.tmp" "$DEST"
echo "Đã cập nhật $DEST ($(du -sh "$DEST" | cut -f1))"
