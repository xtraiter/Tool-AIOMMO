#!/usr/bin/env bash
# Cài các công cụ phía server vào ngay trong thư mục dự án (không cần sudo):
#   .venv/                yt-dlp (+curl-cffi, yt-dlp-ejs), pdf2docx, requests
#   tools/bin/            ffmpeg, ffprobe (bản static do yt-dlp build)
#   tools/libreoffice/    LibreOffice dạng AppImage đã giải nén (DOCX ⇄ PDF)
#
# Dùng sau khi cài lại server:   bash scripts/setup-tools.sh
# Chỉ cập nhật yt-dlp (nên chạy định kỳ vì các trang hay đổi):
#                                bash scripts/setup-tools.sh --update-ytdlp
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
BIN="$TOOLS/bin"
VENV="$ROOT/.venv"
FFMPEG_URL="https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
LIBREOFFICE_URL="https://appimages.libreitalia.org/LibreOffice-still.standard-x86_64.AppImage"
# Thư viện LibreOffice cần mà Ubuntu Server (24.04) không có sẵn.
LIBREOFFICE_DEBS="libcairo2 libx11-xcb1 libcups2t64 libavahi-client3 libavahi-common3 libavahi-common-data libpixman-1-0 libxcb-render0 libxcb-shm0 libxrender1"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

setup_venv() {
  if [ ! -x "$VENV/bin/python" ] || ! "$VENV/bin/python" -c 'import sys' 2>/dev/null; then
    log "Tạo Python venv ($VENV)"
    rm -rf "$VENV"
    if ! python3 -m venv "$VENV" 2>/dev/null; then
      # Không có gói python3-venv (ensurepip) và không có sudo: tạo venv
      # không kèm pip rồi cài pip bằng get-pip.py.
      rm -rf "$VENV"
      python3 -m venv --without-pip "$VENV"
      curl -fsSL https://bootstrap.pypa.io/get-pip.py | "$VENV/bin/python" - -q
    fi
  fi
  log "Cài/cập nhật gói Python"
  "$VENV/bin/pip" install -q -U pip
  "$VENV/bin/pip" install -q -U -r "$ROOT/scripts/requirements.txt"
  echo "yt-dlp $("$VENV/bin/yt-dlp" --version)"
}

setup_ffmpeg() {
  if [ -x "$BIN/ffmpeg" ] && [ -x "$BIN/ffprobe" ] && [ "${FORCE:-0}" != 1 ]; then
    echo "ffmpeg đã có: $("$BIN/ffmpeg" -version | head -1)"
    return
  fi
  log "Tải ffmpeg static"
  local tmp; tmp="$(mktemp -d)"
  curl -fL --retry 3 -o "$tmp/ff.tar.xz" "$FFMPEG_URL"
  tar -xJf "$tmp/ff.tar.xz" -C "$tmp"
  mkdir -p "$BIN"
  install -m 755 "$tmp"/*/bin/ffmpeg "$tmp"/*/bin/ffprobe "$BIN/"
  rm -rf "$tmp"
  "$BIN/ffmpeg" -version | head -1
}

setup_libreoffice() {
  if [ -x "$BIN/libreoffice" ] && [ "${FORCE:-0}" != 1 ] && "$BIN/libreoffice" --version >/dev/null 2>&1; then
    echo "LibreOffice đã có: $("$BIN/libreoffice" --version | head -1)"
    return
  fi
  if command -v libreoffice >/dev/null 2>&1; then
    echo "Dùng LibreOffice của hệ thống: $(command -v libreoffice)"
    return
  fi
  log "Tải LibreOffice AppImage (~340MB)"
  local tmp; tmp="$(mktemp -d)"
  curl -fL --retry 3 -o "$tmp/lo.AppImage" "$LIBREOFFICE_URL"
  chmod +x "$tmp/lo.AppImage"
  # Giải nén thay vì mount để không cần FUSE.
  (cd "$tmp" && ./lo.AppImage --appimage-extract >/dev/null)

  # Server không có giao diện nên thiếu vài thư viện; tải .deb (không cần sudo)
  # và giải nén vào syslib/ — wrapper bên dưới sẽ trỏ LD_LIBRARY_PATH tới đó.
  log "Bổ sung thư viện hệ thống cho LibreOffice"
  mkdir -p "$tmp/debs"
  (cd "$tmp/debs" && apt-get download $LIBREOFFICE_DEBS)
  for deb in "$tmp"/debs/*.deb; do dpkg-deb -x "$deb" "$tmp/squashfs-root/syslib"; done

  rm -rf "$TOOLS/libreoffice"
  mkdir -p "$TOOLS" "$BIN"
  mv "$tmp/squashfs-root" "$TOOLS/libreoffice"
  rm -rf "$tmp"
  cat > "$BIN/libreoffice" <<'WRAPPER'
#!/usr/bin/env bash
# LibreOffice AppImage (giải nén) + các thư viện hệ thống còn thiếu trong syslib/.
LO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../libreoffice" && pwd)"
export LD_LIBRARY_PATH="$LO/syslib/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$LO/AppRun" "$@"
WRAPPER
  chmod +x "$BIN/libreoffice"
  "$BIN/libreoffice" --version | head -1
}

case "${1:-}" in
  --update-ytdlp)
    "$VENV/bin/pip" install -q -U "yt-dlp[default,curl-cffi]"
    echo "yt-dlp $("$VENV/bin/yt-dlp" --version)"
    ;;
  --force) FORCE=1 setup_venv; FORCE=1 setup_ffmpeg; FORCE=1 setup_libreoffice ;;
  "") setup_venv; setup_ffmpeg; setup_libreoffice ;;
  *) echo "Cách dùng: $0 [--update-ytdlp | --force]"; exit 1 ;;
esac

log "Xong. Khởi động lại web: pm2 restart web_toolAIOMMO"
