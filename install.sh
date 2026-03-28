#!/bin/bash -e

cd "$(dirname "$0")"

zip=$(./make-release.sh)

echo

gnome-extensions install --force "$zip"

echo "Installed. Restart GNOME Shell (log out/in), then e.g. run:"
echo "  gnome-extensions enable xims-tweak-pack@xim"
