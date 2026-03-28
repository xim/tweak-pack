#!/bin/bash -e

cd "$(dirname "$0")"

UUID="xims-tweak-pack@xim"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

glib-compile-schemas schemas/
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r extension.js prefs.js metadata.json schemas "$DEST"

cat <<EOF
Installed to $DEST
Restart GNOME Shell (log out/in), then run:

gnome-extensions enable $UUID
EOF
