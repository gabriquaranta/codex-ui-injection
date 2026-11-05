# Codex UI Injection: Implementation Notes

This file records implementation details that took non-trivial inspection or testing to discover. Update it when new details are confirmed. Keep observed facts separate from assumptions and record how each fact was checked.

## Current library implementation

The toolkit adds a toolbar action and one shared right drawer to the running ChatGPT desktop app in Codex mode. Its first static module is an empty panel. The core changes renderer DOM and CSS only; it does not call Codex tools, edit conversations, or submit messages.

- `UiModule` supplies an ID and an activation function with optional cleanup. A module may register a `UiPanel`, which supplies a toolbar label/icon, drawer title, `mount(ShadowRoot)` plus optional cleanup, and optional CSS.
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

### Chat background: 2026-11-04

- Live DOM inspection found chat surfaces marked by `data-app-shell-focus-area="main"` and IDs ending in `-chat-panel`; their large descendants had transparent backgrounds in the inspected view. The adapter applies the background to those surfaces on Home. The build embeds an optional image from the repository root and includes its hash in the runtime version, so a changed image replaces the startup script. Image display and GIF animation remain unverified in the app.

- A 4 MB JPEG produced a data URL that the renderer did not retain as a CSS variable. Converting the embedded bytes to a blob URL gave the CSS a short value; live inspection confirmed the 3840 by 2160 image decoded and the chat's computed background contained that URL. The previous surface color was transparent, so the overlay now uses `--app-color-background-surface`. Visual appearance and GIF animation remain unverified.

- Live inspection found a decorative gradient and solid surface behind the composer, both marked `aria-hidden` and using generated `_background_` classes. With a custom background on Home, the adapter makes those layers transparent. Their computed styles were transparent after injection; visual appearance remains unverified.

### Toolbar observer loop: 2026-11-04

- With two injected actions and the native tab strip open, the `New tab` button can move between the rightmost and an earlier position as the toolbar is moved. A capped live observer showed the injected toolbar alternating between two parents and triggering itself repeatedly. The toolbar lookup now excludes `New tab` from its candidates. With one injected action, a capped live observation saw one callback and no loop; the two-action case remains unverified.

### Home chat lifecycle: 2026-11-04

- Live inspection showed that the active chat main and its toolbar share a `data-app-shell-active-page="true"` ancestor inside `data-app-shell-workspace-row="true"`. The adapter now requires these hooks, a visible chat and toolbar, and no visible modal before mounting; its chat and drawer styles are gated by that state. Mutation updates are coalesced into animation frames, and changes inside the chat content do not trigger layout lookup. A fixture covers modal removal and return; live inspection confirmed the toolbar, drawer and background mounted on the active chat. A real Settings-to-chat transition and its reported freeze remain unverified.

### Toolbar action placement: 2026-11-04

- Live inspection showed the rightmost native tab control inside `data-app-shell-header-slot="end"` and `data-app-shell-header-slot-content="true"`. The adapter now appends injected actions to that end slot and restores their position if native buttons are inserted after them. Live inspection placed the injected button after `New tab`, with no native toolbar button to its right. Opening and closing the native panel was not exercised.

### Background storage and chat guards: 2026-11-04

- A script identifier registered through one CDP connection could not be removed through a second connection (`Script not found`). New renderer startup bundles therefore read the selected image from a dedicated IndexedDB store; the injector updates or deletes that image before installing the runtime. Live inspection confirmed the 20 MB GIF in the store and a blob background on the chat. The renderer bundle measured 24 KB. Scripts registered by earlier runtime versions can remain until the app restarts; reload behavior was not checked.
- The chat background marker now follows the active chat independently of toolbar availability. The observer also schedules a mount when dialogs are inserted, removed, or changed inside the chat. These paths were reviewed in code; an actual in-chat modal and a missing toolbar slot were not exercised live.

### Enabled modules: 2026-11-04

- Root `modules.json` supplies enabled IDs for the bundled renderer. The renderer still imports available modules statically; `ModuleRegistry.fromEnabled` filters the toolbar and drawer registry and throws for an unknown module ID. The reserved `chat-background` ID controls the separately implemented saved background feature. It must be removed from the list before module IDs are validated. This avoids a runtime filesystem loader and a YAML dependency. Editing the file requires rebuilding and reinjecting, and disabled module code remains bundled. Type-check, unit tests, and build passed; live UI behavior was not checked.

### Background ID in module config: 2026-11-04

- The root `modules.json` contained `chat-background`, which is not a `UiModule`. Before the fix, `ModuleRegistry.fromEnabled` threw on that ID before `CodexAdapter.start()` and background loading ran, so both UI features were absent. The renderer now handles `chat-background` as a reserved feature ID and validates the remaining IDs as modules. Type-check, unit tests, and build passed; live UI behavior was not checked.

### Side chat background: 2026-11-04

- Live inspection showed the native side chat under `data-app-shell-tab-panel-controller="right"` with its chat surface marked `data-includes-composer="true"`. The background and composer fade rules now include that surface on the active Home page. After injection, computed styles showed the image and transparent fade layers in both the main chat and side chat. Other right-panel tabs and visual appearance were not checked.

### Module lifecycle: 2026-11-04

- Panel registration and background loading now activate through the same `UiModule` contract. The panel controller still owns the shared drawer, and the adapter owns the chat background slot. The background module reads its own IndexedDB data and cancels a pending result on cleanup. The build hashes `modules.json` into the runtime version so config changes replace the startup script. Automated checks cover the lifecycle; live UI behavior after this refactor is unverified.

### Background file location: 2026-11-04

- The build now looks for the background image in `src/modules/chat-background/`. The existing GIF was moved there. The build passed, and the injector bundle was checked against the moved GIF. Live injection was not checked.

### Popover slot: 2026-11-04

- The adapter positions a fixed popover stack inside the active main surface bounds, below its top edge. Modules register popovers through the core context; the controller owns their toolbar actions, shadow roots, vertical ordering, Escape handling, and cleanup. The stack scrolls when its contents exceed the available height. This uses the existing active chat and toolbar hooks; no module targets Codex selectors.
- Live injection of version 0.1.30 showed the empty popover at 360 by 74 px with a white surface and 12 px corners. Its toolbar action opened and closed it, and the rendered card was visually inspected. A controller test covers two open popovers and independent cleanup; multiple popovers and scrolling were not checked live.

### Native summary alignment: 2026-11-04

- Live renderer inspection found the summary button at `data-thread-summary-panel-toggle="true"` and its card at `data-summary-panel-variant="summary"` within the active page. The closed card can remain in the DOM off screen, so the adapter checks the button's `aria-pressed` state and the card bounds. Popover actions mount immediately before the summary button; open injected cards use the native card width and align 8 px below it. Closing the native summary closes injected popovers. Resize and mutation observers update the geometry.
- With version 0.1.32, live CDP measurements showed both cards at 300 px wide with matching edges and an 8 px vertical gap. A 1250 px viewport simulation preserved that alignment; closing the summary closed the injected card. The combined cards were visually inspected. A fixture covers button placement, resizing, and summary closure; multiple injected cards were not checked live.

### Popover shadow: 2026-11-04

- The popover's shadow was clipped at the scroll container edges, creating rectangular shading. The container now has 20 px of padding for the shadow, with its position adjusted to preserve card alignment. In version 0.1.33, live inspection showed the card still matched the native summary width and sat 8 px below it; the shadow was visually checked. Automated tests and the build passed.

### Matching native summary styling: 2026-11-04

- Live computed styles showed the native summary used 20 px corners, no solid border, and a three-layer elevation shadow. The injected card used 12 px corners, a 1 px border, and a different shadow. The core now applies the native summary's observed surface, corner, and elevation classes to popover cards, with 32 px of scroll-container padding for the larger shadow. In version 0.1.34, live computed background, border, radius, and shadow matched the native card; alignment and appearance were also checked. Type-check, tests, and build passed. Dark mode and other platforms remain unverified; the app's classes are private and may change.

### Popovers during image preview: 2026-11-04

- Live inspection found the image viewer uses a visible `role="dialog"` with `aria-modal="true"` and z-index 50. The adapter previously closed popovers when that dialog appeared. It now keeps them mounted, makes their stack inert behind the modal, and suspends their Escape handler until the dialog closes. Live checks with version 0.1.36 confirmed the same popover stayed mounted behind the image viewer and remained open after its close button was used. A fixture covers Escape during a modal and cleanup after return; the viewer's own Escape behavior was not confirmed live.

### Stream glitch response effect: 2026-11-04

- Live renderer inspection found assistant response roots marked with `[data-markdown-text-style="assistant-message"]` inside the active app page. The adjacent `data-conversation-role="assistant"` label is a sibling, not an ancestor. The adapter owns this selector and exposes matching roots to registered module handlers, so the feature module does not query Codex DOM.
- The optional `stream-glitch` module watches each response root for text and child updates, waits 70 ms between changes, then animates its latest rendered block with visible color offsets, clipping, and horizontal shifts. It uses the Web Animations API and does not wrap or replace React-managed text nodes. It honors `prefers-reduced-motion`.
- Version 0.1.39 fixes the initial selector so response handlers attach to Markdown roots. Versions 0.1.40 and 0.1.41 temporarily used a highly visible 1400 ms magenta/cyan flash and bypassed reduced-motion suppression for confirmation. A live CDP check on 0.1.41 confirmed a running animation and neon computed colors. Version 0.1.42 restored a 700 ms subtle effect; version 0.1.43 removes reduced-motion suppression at the user's request. Version 0.1.44 limited the effect to the final word. Version 0.1.45 processes completed words as text arrives and uses CSS text highlights plus positioned per-character glyph overlays, so each word scrambles and trembles without changing React's text nodes or animating whole lines.

- Version 0.1.46 batches word geometry reads, uses one animated overlay per word, and excludes overlay mutations from adapter scans. Code inspection confirms response text is still read in full on each update, though append comparisons use `startsWith` and each batch walks the text nodes once. Type-check and tests passed; live performance and appearance remain unverified.

- Version 0.1.47 cancels active word overlays on captured scroll events so hidden source text is restored when its viewport position changes. A fixture checks overlay removal on scroll; live streaming with scrolling remains unverified.

- Version 0.1.48 uses monochrome shade glyphs and a brief horizontal tremble for the streamed-word effect. It inherits the response text color for light and dark themes. Visual appearance remains unverified.

- Version 0.1.49 extracts response word observation into `src/core/stream-words.ts`. Effects can consume word ranges while the glitch module owns its appearance and cleanup. This preserves the existing full-text comparison and single-node word limitation; live appearance remains unverified.

- Version 0.1.50 associates active glitch overlays with their response root and removes them when that root is detached. A fixture checks response cleanup; conversation switching during an animation remains unverified live.

- Version 0.1.51 adds `UiStreamAnimation` and a shared lifecycle that observes word batches and cancels active effects on scroll, response removal, or module disposal. Effects own their visuals and signal completion. Fixtures cover word observation and effect cleanup; live appearance remains unverified.

- Version 0.1.52 makes `UiStreamAnimation` a `UiModule` base class with a no-op `animate` method. Effects inherit response observation and cancellation; the glitch subclass also initializes and releases its highlight resources. Fixtures cover inheritance and cleanup; live appearance remains unverified.

- Version 0.1.53 registers an optional `empty-stream-animation` template. Its inherited lifecycle observes words, and its animation does nothing until customized. It is not enabled by default.

### Popover alignment and tooltip: 2026-11-05

- Live CDP measurements showed the native summary slides from beyond the main surface into its final position; the injected stack retained an early horizontal measurement. Version 0.1.54 clamps the stack to the main surface edge while the summary enters and removes its elevated z-index so native tooltips can appear above it. Live measurements showed matching card edges and an 8 px gap after opening the summary; hit testing placed the summary tooltip above the open injected card. Type-check and tests passed.
