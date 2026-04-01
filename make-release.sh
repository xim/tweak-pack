#!/bin/bash -e

cd "$(dirname "$0")"

read -r uuid version < <(python3 -c 'import json; m=json.load(open("metadata.json")); print(m["uuid"], m["version"])')
out="${uuid}-v${version}.zip"

glib-compile-schemas schemas/

rm -f "$out"
zip "$out" extension.js prefs.js metadata.json schemas/*.xml >&2

echo >&2 "Created $out"
echo "$out"
