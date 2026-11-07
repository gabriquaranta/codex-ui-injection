#!/bin/zsh
set -euo pipefail

project_dir="/Users/gabrielequaranta/Developer/codex-ui-injection"
applications_dir="$HOME/Applications"
launcher_path="$applications_dir/Codex UI Launcher.app"
desktop_link="$HOME/Desktop/Codex UI Launcher.app"

if [[ -e "$launcher_path" || -L "$desktop_link" ]]; then
  print -u2 "The launcher app or Desktop link already exists. Remove or rename it before recreating the shortcut."
  exit 1
fi

mkdir -p "$applications_dir"
osacompile -o "$launcher_path" "$project_dir/scripts/Codex UI Launcher.applescript"
ln -s "$launcher_path" "$desktop_link"

print "Created $launcher_path and $desktop_link"
