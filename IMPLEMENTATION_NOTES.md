# Codex UI Injection: Implementation Notes

This file records implementation details that took non-trivial inspection or testing to discover. Update it when new details are confirmed. Keep observed facts separate from assumptions and record how each fact was checked.

## Current library implementation

The toolkit adds a toolbar action and one shared right drawer to the running ChatGPT desktop app in Codex mode. Its first static module is an empty panel. The core changes renderer DOM and CSS only; it does not call Codex tools, edit conversations, or submit messages.

- `UiModule` supplies an ID, toolbar label/icon, drawer title, `mount(ShadowRoot)` plus optional cleanup, and optional CSS.
- `ModuleRegistry` rejects duplicate IDs. `ModuleController` opens, closes, or switches the single drawer and runs view cleanup.
- `CodexAdapter` maps named toolbar and right-drawer slots to the current renderer DOM. Features do not use Codex selectors.
- Each module view uses a shadow root. This isolates module CSS while allowing inherited host fonts and CSS variables. The shell uses `--color-text-primary`, `--app-color-background-elevated-secondary`, and `--color-background-primary-surface`, with system-color fallbacks.
- The browser runtime bundles to `dist/renderer.js`; the Node CLI bundles to `dist/inject.mjs`. `package.json` version is the runtime identity used to avoid repeated startup registration and to install changed renderer code on future documents.

### Confirmed runtime path

- **Platform tested:** macOS, ChatGPT desktop app with Codex selected.
- **App executable:** `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT`.
- **Debug endpoint:** Chrome DevTools Protocol (CDP) on `127.0.0.1:9335`.
- **Launch:** quit the desktop app, then start it with:

  ```sh
  /Applications/ChatGPT.app/Contents/MacOS/ChatGPT \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9335
  ```

- **Target discovery:** `GET http://127.0.0.1:9335/json/list` returns renderer targets. The main shell uses `type: "page"` and a URL such as `app://-/index.html`. Target IDs change between app sessions. The list can also include the Spotlight, detached-window, and other renderers; select the main app page.
- **CDP access:** connect to the selected target's `webSocketDebuggerUrl`. `src/cli/inject.ts` limits this connection to localhost port 9335. The endpoint grants renderer control, so do not bind it to a network interface or leave it enabled when it is not needed.
- **Persistence:** `Page.addScriptToEvaluateOnNewDocument` installs the script for future documents in that target; `Runtime.evaluate` applies it to the current document. Restarting the app removes the runtime injection.
- Repeated calls to `Page.addScriptToEvaluateOnNewDocument` register more startup scripts. `Page.getScriptToEvaluateOnNewDocument` is not implemented by the current app CDP endpoint (it returned protocol error `-32601`), so old script identifiers cannot be listed through that command. The CLI checks the runtime version in the current renderer before registering another startup script.
- **Runtime:** Node.js 22 or newer works without a WebSocket package. The injector uses Node's built-in `fetch` and `WebSocket`.

### Confirmed toolbar and layout hooks

- The current chat toolbar has a button with `aria-label="Chat actions"`. It is inside a `display: contents` wrapper in the right-side toolbar action group. Inserting the POC button before that control places it in the real toolbar; its 28 px width expands the group to the left.
- The adapter inserts a `display: contents` toolbar root immediately before the `Chat actions` button. Module actions are children of that root, so they inherit the action group layout without becoming feature-specific DOM hooks.
- The active conversation is a visible `<main>` element. Its ancestors include `display: contents` wrappers and a full-size row flex container (`display: flex; flex-direction: row`). The POC finds that container from the visible `<main>` rather than relying on generated React IDs.
- Append the panel as a flex child of that row container. Give it a 360 px flex basis (capped at 42% of the viewport). The main view then shrinks to make room. Position the panel vertically from the active `<main>` rectangle; the row container starts above the content header.
- A `MutationObserver` remounts the UI if React replaces toolbar or layout nodes. A cleanup callback disconnects the previous observer and resize listener when the injection is reapplied.

### Initial POC verification: 2026-11-04

- The live renderer showed both the toolbar button and panel after injection.
- DOM geometry confirmed the button was in the toolbar and the panel was a child of the row flex layout.
- Open/close interaction was exercised through CDP. In the observed window, the main view width changed from 666 px open to 1026 px closed, then returned to 666 px when reopened. The panel's left edge matched the main view's right edge while open.
- The initial JavaScript POC was later replaced by the TypeScript library recorded below.

### Library refactor: 2026-11-04

- **Build:** TypeScript source is bundled by esbuild into one Node CLI and one browser IIFE. Dependencies are local dev dependencies; generated `dist/` output is ignored.
- **Composition:** modules are imported through a static registry. One drawer is shared; selecting the active action closes it, and selecting another module replaces its view after cleanup.
- **Theme:** default shell styles use observed Codex CSS variables. Optional module CSS is scoped by shadow DOM; the core does not replace the global theme.
- **Target choice:** the CLI identifies the main `app://.../index.html` page without an `initialRoute` parameter. Auxiliary Spotlight and detached-window targets are excluded. An explicit target ID is accepted only if it matches the main app page.
- **Verification:** type-check passed; Vitest passed 7 tests across 4 files; both bundles built. Live CDP smoke check found one toolbar action and one drawer. Opening produced a 360 px drawer with `drawer.left === main.right`; closing restored 360 px to the main view. Re-running injection kept one action and one drawer.
- **Scope:** tested on macOS only. No runtime module loader, data connectors, published package, or custom theme module is included.

### Historical duplicate injection incident: 2026-11-04

- **Observed:** the main renderer contained two POC buttons and two POC panels. Removing the current copy caused one old pair to reappear after the next DOM mutation. This confirmed that a stale `MutationObserver` from an earlier injection was still mounting its own nodes.
- **Cause:** repeated runtime injection left multiple controller instances in one renderer. The first cleanup also removed only the first element matching each ID.
- **POC fix:** the old `panel.js` removed duplicate nodes, called registered cleanups, and versioned its UI. The current library supersedes that implementation with one versioned runtime, an adapter observer, and controller cleanup.
- **POC verification:** the live renderer reported one visible button, one active panel, `panelX === mainRight` while open, and a main width increase from 1027 px to 1387 px when closed. The refactored runtime was smoke-tested again as recorded above.

## Known limits

- This is an unofficial DOM/CSS injection. Codex does not provide a documented API for persistent dockable side panels.
- Toolbar labels, DOM shape, and flex layout are private app details. Updates can change them. If the button or panel does not mount, inspect the new renderer DOM and record the change here.
- CDP is enabled only when the app is launched with the debugging flag. The POC does not restart the app or enable CDP itself.
- The drawer width is currently 360 px and capped at 42% of the viewport. It uses observed Codex CSS variables and resizes the main view through the flex layout. Dark-mode appearance was not visually checked.
- The current module is empty. No git graph, music panel, or custom theme module exists yet.

## How to extend these notes

For each non-trivial discovery, add a dated note with:

1. What was discovered.
2. The evidence (renderer structure, protocol behavior, or observed UI behavior).
3. The implementation consequence.
4. How it was verified and any platform/version limit.

Do not record session-specific target IDs as stable facts. Label unverified ideas as hypotheses.
