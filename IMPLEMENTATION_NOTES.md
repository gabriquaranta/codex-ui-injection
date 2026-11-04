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

- The current chat toolbar has a button with `aria-label="Chat actions"`. It is inside a `display: contents` wrapper in the right-side toolbar action group. The adapter uses it to find that group and appends module actions after the existing controls.
- The button's immediate parent is a `display: contents` group that contains only some toolbar controls. Other controls, including `Toggle pinned summary` and `Show tabs`, sit in sibling groups, and `Show tabs` is itself inside a nested flex group. The adapter finds the rightmost visible native toolbar button on the same row as `Chat actions` and appends its root to that button's row-flex parent. Wide tab controls are excluded so the injected action does not join an expanded tab pill. Fixtures cover both layouts.
- The adapter copies the native toolbar button's class onto module actions. Leave the inactive action's `color` unset so the app's own class rule supplies the exact muted icon color. A live computed-style check showed both colors as `rgba(13, 13, 13, 0.494)` on the inspected renderer. The active action uses `--color-text-primary`.
- The active conversation is a visible `<main>` element. Its ancestors include `display: contents` wrappers and a full-size row flex container (`display: flex; flex-direction: row`). The adapter finds that container from the visible `<main>` rather than relying on generated React IDs.
- The adapter appends the drawer as a flex child of that row container. It has a 360 px flex basis (capped at 42% of the viewport), so the main view shrinks to make room. The adapter positions it vertically from the active `<main>` rectangle; the row container starts above the content header.
- When open, the adapter sets the active `<main>` minimum width to zero and sizes the drawer to preserve 680 px for the chat where possible. The drawer can shrink to 220 px when other panels reduce available width; closing restores the original main minimum width and the 360 px drawer width. A fixture test checks this lifecycle. This is intended to prevent flex overflow when another app panel is open.
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
- **Verification:** type-check passed; Vitest passed 10 tests across 4 files; both bundles built. Live CDP smoke checks found one toolbar action and one drawer. Version 0.1.5 keeps the action after the rightmost native toolbar control. With the drawer open at a 1712 px renderer width, the main view measured 1027 px and the drawer 360 px. A CDP viewport simulation at 1293 px narrowed the drawer to 288 px and preserved a 680 px main view; clearing the override restored the original widths. A wide-tab simulation kept the injected action in the toolbar row rather than the tab's inner group. The native Codex side panel was not opened through CDP, so the screenshot's simultaneous native-plus-injected panel state remains unverified live.
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

### Image viewer isolation: 2026-11-04

- The toolbar lookup searches inside the `header` containing `Chat actions`. Live renderer inspection showed that `Show tabs` is outside the first flex ancestor but shares that header. A button in a separate image viewer can otherwise match the same screen row and receive the injected toolbar. A fixture checks the separate viewer case; the live image viewer remains unverified.

### Concurrent panels: 2026-11-04

- Live inspection showed the native chat frame retained a fixed width wider than its viewport when both panels were open. The main title bar also used an inline end inset that excluded the injected drawer. While the drawer is open, the frame is capped at its parent width and the title bar inset includes the drawer width. With both panels open, CDP measured the frame and viewport at 976 px and the title bar end within 4 px of the native panel start. Closing the drawer removed the added title bar inset.

### Panel corners: 2026-11-04

- The app draws a rounded page surface behind the workspace and clips the main surface with a rounded clip path. With the injected drawer open, that clip creates a corner at the shared edge. The drawer now uses the observed `--radius-xl-base` on its outer corners, while the main surface clip is removed for the open state. Live renderer inspection showed 12 px drawer corners and a square shared edge; closing the drawer restored the app clip. Dark mode and other platforms remain unverified.

### Native panel tabs: 2026-11-04

- The native right panel tab row is positioned independently of its panel. With a 360 px injected drawer open, CDP measured the tab row 360 px to the right of the native panel. The adapter styles translate that row by the drawer width while open. Live geometry then placed both left edges at 961 px; closing the injected drawer restored the original position.

### Drawer resizing: 2026-11-04

- The drawer has a left-edge pointer handle and arrow-key controls. The selected width is retained while the runtime remains active and is limited by the available layout width, with a 220 px minimum. The existing drawer-width variable keeps title bar offsets in sync. A live CDP drag changed the drawer from 360 px to 430 px; the keyboard lifecycle is covered by a fixture. Dragging with the native panel open was not checked live.

- The resize hit area is 8 px wide; its hover and keyboard focus indicator is 1 px wide. Live hover and drag verification after the change was not completed.

### Home-only mounting: 2026-11-04

- The app marks the active Home navigation button with `data-sidebar-destination="builtin:home"` and `aria-current="page"`. The adapter observes that selection, closes and detaches its UI outside Home, and remounts the closed panel on return. A live Home to Spaces to Home transition confirmed the toolbar and drawer were absent in Spaces and restored on Home. Other destinations were not checked live.

### Module close control: 2026-11-04

- The shell no longer draws a title or divider. The module title remains the drawer accessible label. The close button is inserted into the module shadow root before `mount`, so a module can style, move, or remove `[data-codex-ui-close]`. Live CDP confirmed the button closes the panel; the fixture checks removal and restoration when switching modules.

### Drawer ordering during navigation: 2026-11-04

- The workspace row can receive new `data-app-shell-active-page` children after the injected drawer. When a later child becomes active, flex ordering can place the drawer to its left. The adapter now keeps the drawer as the last row child. A fixture and a live DOM insertion check confirmed the drawer returns to the end and remains at the main view right edge; a live tab switch was not exercised.
