# Codex UI Building Blocks

A local TypeScript toolkit for adding small, UI-only modules to the Codex desktop renderer. V1 provides a toolbar action and one shared right drawer. The first registered module is an empty-panel example.

To add a chat background, place one file named `chat-background.png`, `chat-background.jpg`, `chat-background.jpeg`, `chat-background.webp`, or `chat-background.gif` in `src/modules/chat-background/`, then run `npm run inject`. Remove the file and inject again to clear the background. The image is stored locally in the app and displayed at 30% opacity.

The core manages renderer discovery, module lifecycle, and layout. Modules do not call Codex tools, submit messages, or change conversation data. Each module owns any future data source it needs.

## Run locally

Start the ChatGPT desktop app in Codex mode with CDP bound to localhost:

```sh
/Applications/ChatGPT.app/Contents/MacOS/ChatGPT \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9335
```

Then build, test, list targets, and inject:

```sh
npm install
npm run typecheck
npm test
npm run build
npm run targets
npm run inject -- --target <target-id>
```

If there is exactly one main `app://` renderer, injection can select it automatically with `npm run inject`. Restarting the app clears runtime injections. Keep CDP bound to localhost; it grants control of the renderer.

## Add a module

Implement `UiModule` in `src/modules/<module-name>/index.ts`, then add it to the available module list in `src/entrypoints/renderer.ts` and add its ID to root `modules.json`. Each enabled module activates with a context and can return a cleanup function. A module can register a `UiPanel` or use the chat background slot; see the existing modules for examples. A panel provides its toolbar label and icon, drawer title, `mount(ShadowRoot)`, and optional CSS. The shadow root keeps module CSS local while inheriting Codex fonts and CSS variables.

Remove an ID from `modules.json` to disable that module. Rebuild and inject after editing the file. Imports stay static, so disabled module code remains in the bundle.

Core supports named toolbar and right-drawer slots. Do not make modules depend on Codex selectors. Add new slots through the Codex adapter after inspecting and documenting the renderer hook.

## Structure

- `src/cdp/`: CDP connection and target discovery.
- `src/codex/`: main renderer selection and toolbar/layout adapter.
- `src/core/`: module contracts, registry, and shared drawer lifecycle.
- `src/modules/`: statically registered feature modules.
- `src/entrypoints/`: browser renderer entrypoint.
- `src/cli/`: local injection command.
- `tests/`: module behavior and a mock Codex layout fixture.

See [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for confirmed runtime details and version-specific findings. Update it when implementation work confirms a non-trivial detail.
