# Codex UI injection POC

A small local proof of concept. It adds one toolbar button and an empty side panel to a Codex renderer. It does not call Codex tools or change conversation data.

See [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for confirmed renderer and CDP findings. Update it when implementation work discovers a non-trivial detail.

## Requirements

- macOS Codex / ChatGPT desktop app
- Node.js 22 or newer (uses the built-in WebSocket client)
- The app started with a Chrome DevTools Protocol endpoint on `127.0.0.1:9335`

Keep the debugging endpoint bound to localhost. It gives its client control of the app renderer. This project does not start or restart the desktop app, and it does not enable that endpoint for you.

## Run

```sh
node inject.mjs --list
node inject.mjs --target <target-id>
```

Choose the main app renderer from the list. The script adds a toggle beside the existing chat toolbar actions and re-applies the UI after document navigation. Close the panel with its close button or the toolbar button. Restarting the desktop app removes the injection.

## Scope

The panel is a flex sibling of the main view. It takes 360 px from the available width, so the conversation resizes instead of sitting under the panel. The toolbar button is inserted before the existing Chat actions button.

Codex has no documented panel extension API. This POC relies on its current toolbar labels and layout structure, which may change in an app update.

The panel script has a version guard because CDP startup scripts remain registered for the lifetime of a renderer target. Increase the version in `panel.js` when changing the injected UI.
