#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/R00TED"
DIST_DIR="dist"
ICON_SRC="public/r00ted.png"
DESKTOP_FILE="$HOME/.local/share/applications/r00ted.desktop"
APPIMAGE_SRC=$(ls -1 "$DIST_DIR"/R00TED-*.AppImage 2>/dev/null | sort -V | tail -n 1)

if [[ -z "${APPIMAGE_SRC:-}" ]]; then
    echo "Error: No R00TED AppImage found in $DIST_DIR/"
    exit 1
fi

echo "Found AppImage: $APPIMAGE_SRC"
mkdir -p "$INSTALL_DIR"
cp "$APPIMAGE_SRC" "$INSTALL_DIR/R00TED.AppImage"
chmod +x "$INSTALL_DIR/R00TED.AppImage"
cp "$ICON_SRC" "$INSTALL_DIR/r00ted.png"

mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=R00TED
Comment=Beyond identity. Beyond control. True Freedom.
Exec=$INSTALL_DIR/R00TED.AppImage --ozone-platform=x11
Icon=$INSTALL_DIR/r00ted.png
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
StartupWMClass=r00ted
X-KDE-StartupNotify=true
X-KDE-Protocols=unity
EOF

chmod +x "$DESKTOP_FILE"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "R00TED installed successfully."
echo "AppImage source: $APPIMAGE_SRC"
echo "Installed to: $INSTALL_DIR/R00TED.AppImage"
