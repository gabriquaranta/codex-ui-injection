#!/bin/zsh
set -euo pipefail

project_dir="/Users/gabrielequaranta/Developer/codex-ui-injection"
app_executable="/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"
cd "$project_dir"

export PATH="/Users/gabrielequaranta/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
npm run build --silent

if ! curl --silent --fail http://127.0.0.1:9335/json/list >/dev/null; then
  if [[ ! -x "$app_executable" ]]; then
    print -u2 "ChatGPT.app was not found at $app_executable."
    exit 1
  fi
  open -na /Applications/ChatGPT.app --args \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9335
fi

for attempt in {1..60}; do
  if node dist/inject.mjs >/dev/null 2>&1; then
    nohup node dist/music-bridge.mjs >/dev/null 2>&1 </dev/null &
    exit 0
  fi
  sleep 1
done

print -u2 "Codex did not become ready on localhost port 9335. Quit ChatGPT if it is already open, then click the launcher again."
exit 1
