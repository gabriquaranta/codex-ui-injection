# Codex UI Injection: Implementation Notes

This file records implementation details that took non-trivial inspection or testing to discover. Update it when new details are confirmed. Keep observed facts separate from assumptions and record how each fact was checked.

## Current library implementation

### macOS launcher

- `scripts/create-macos-launcher.sh` builds a small AppleScript app in `~/Applications` and places a Desktop symlink to it. The app runs `scripts/launch-codex-ui.sh`, so the workflow does not require an open Terminal window.
- The launcher builds the current bundle, reuses a responsive localhost CDP endpoint or opens `/Applications/ChatGPT.app` with CDP bound to `127.0.0.1:9335`, then retries injection for up to 60 seconds while the renderer starts. It does not close an already running app; if that app has no CDP endpoint, the user must quit it and click the launcher again.
- The launcher app and its shell script are specific to this macOS checkout path. Syntax and bundle creation are verified locally; launching the generated app and observing its injected UI remain unverified.

The toolkit adds toolbar actions, one shared right drawer, and popovers to the running ChatGPT desktop app in Codex mode. Empty panel and popover modules remain examples. The core changes renderer DOM and CSS only; it does not call Codex tools, edit conversations, or submit messages.

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
- Empty panel and popover modules remain examples. The Apple Music popover is an enabled feature module; no git graph or custom theme module exists.

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

### Separate workspace background: 2026-11-06

- A live read-only CDP inspection of the main renderer found `data-app-shell-workspace-row="true"` spanning the 1900 by 1031 app viewport. Its `data-app-shell-page-surface="true"` ancestor had an 85% white background; `[data-app-shell-main-surface="default"]` was solid white; the left navigation and `data-app-shell-left-panel-appearance` aside were transparent. The workspace background now uses a single fixed root background, and core CSS clears the observed opaque shell and main surfaces. The image is stored separately from the existing chat image under the IndexedDB `workspace` key. Type-check and build passed. A temporary image showed through the left navigation and, with the chat image removed, through the conversation area; restoring the chat image put its layer back over the conversation. The test image was removed and the chat image restored by reinjecting the build.

- A temporary animated GIF was stored as `image/gif`; Chromium `ImageDecoder` reported two frames and decoded distinct colors from each. The runtime's CSS background uses the resulting GIF blob URL. Frame playback was not confirmed: `prefers-reduced-motion: reduce` is true in the renderer, and the screenshot comparison showed no frame change. After version 0.1.57, the right pane's canvas and surface nodes report transparent computed backgrounds, but a live screenshot still shows the pane as white. CSS inspection is not visual proof; right-pane continuity remains unresolved and needs the actual rendered surface owner. The injector uses CDP `Page` and `Runtime` commands against the main target; the repository has no Electron host API to change background throttling. GIF playback while Codex is unfocused remains unverified; verify focus loss on the live app and identify whether its renderer or host controls playback before changing it.

- Live inspection found an opaque body above the root image and an opaque parent of the right tab controller. Version 0.1.58 clears both while the workspace background is active. A screenshot after injection shows the GIF image continuing through the main chat, left navigation, and open side chat. The temporary diagnostic image override was removed from the live renderer. Animation during focus loss remains unverified.

- The navigation rail and title bar have separate shell attributes. Version 0.1.59 gives them the opaque theme surface color while the workspace image is active. A live screenshot shows the rail and title bar white, with the image still visible in the workspace and side chat.

- The shell frame has 4 px of right and bottom padding in the live renderer. Version 0.1.60 colors those edges with an inset shadow; a live screenshot shows the workspace image inside the frame and the shell edges in the theme surface color.

- After the app update, a live screenshot of the old chat showed a white strip along its bottom edge. The `[data-app-shell-frame="true"]` computed style still had the runtime's 4 px white inset shadow, which painted over the workspace background. Version 0.1.65 removes that shadow so the root workspace background shows through the frame padding. Type-check and build passed; the updated live renderer screenshot was checked after reinjection.

- The first frame-shadow fix did not remove the white area above and below the composer. The updated chat DOM has a white gradient and solid surface inside `[data-includes-composer="true"]`; the layers have `background-* fade-*` and `background-* surface-*` classes, with the solid layer inside `[data-thread-scroll-footer]`. They no longer have `aria-hidden`, and this chat has no active-page marker, so the old Home-chat selectors do not match. Version 0.1.66 clears both layers while the workspace background is active. Live computed styles and a screenshot after reinjection confirmed both layers are transparent; live scrolling was not exercised.

- Version 0.1.61 adds a rounded, one-pixel workspace outline using the shell's border color, title bar height, and navigation rail width. The outline ignores pointer events. A live screenshot shows the outline around the workspace; the right panel was closed during this check.

- Version 0.1.62 paints the theme surface outside the rounded outline to cover the image at all four corners. The live renderer reports a 15 px radius and matching spread, and a screenshot was inspected with the right panel closed.

- Changes, Terminal, and Files have opaque panel surfaces. File trees and diffs also render inside shadow roots and use the inherited `--color-surface` value. Version 0.1.63 clears these surfaces while the workspace image is active. Live screenshots show the image in a terminal, the Changes view, the file tree, and an opened file; diff highlighting remains visible.

- The outline's shadow at stacking level 50 covered the navigation rail and title bar controls. Version 0.1.64 lowers it below those shell layers. A live screenshot with the right panel open shows the selected navigation icon and tab without the previous cut.

### Popover slot: 2026-11-04

- The adapter positions a fixed popover stack inside the active main surface bounds, below its top edge. Modules register popovers through the core context; the controller owns their toolbar actions, shadow roots, vertical ordering, Escape handling, and cleanup. The stack scrolls when its contents exceed the available height. This uses the existing active chat and toolbar hooks; no module targets Codex selectors.
- Live injection of version 0.1.30 showed the empty popover at 360 by 74 px with a white surface and 12 px corners. Its toolbar action opened and closed it, and the rendered card was visually inspected. A controller test covers two open popovers and independent cleanup; multiple popovers and scrolling were not checked live.

### Fixed-size popover overlay: 2026-11-08

- The alignment-only change did not move the 300 px Music card because it matched the stack width. Version 0.1.83 adds a 340 px flex spacer after the active page while a popover is open: 300 px for the card, an 8 px gap, and 32 px of shadow padding. The workspace row narrows the chat, and the fixed stack sits in the reserved column. The fixture checks spacer order, width, stack anchor, and removal on close. Live CDP inspection measured the active chat at 1525 px wide before opening and 1185 px after; the card began 8 px beyond the chat edge. Closing Music restored the original width and removed the spacer. A live screenshot confirmed the placement.

### Native summary alignment: 2026-11-04

- Live renderer inspection found the summary button at `data-thread-summary-panel-toggle="true"` and its card at `data-summary-panel-variant="summary"` within the active page. The closed card can remain in the DOM off screen, so the adapter checks the button's `aria-pressed` state and the card bounds. Popover actions mount immediately before the summary button; open injected cards use the native card width and align 8 px below it. Resize and mutation observers update the geometry.
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

- Version 0.1.55 keeps injected popovers open when the native summary closes and moves the stack back to the top of the main surface. The adapter fixture and a live CDP interaction confirmed the custom popover remains open.

### Apple Music popover: 2026-11-07

- The enabled `apple-music` module renders a 300 by 300 px shadow-root popover. Artwork fills the square card. The global popover host uses border, shadow, and elevated-background classes; the module resets these on `:host` so no shell edge appears behind the artwork. The existing adapter provided the popover slot. A live check found its old chat-layout selector no longer matched the main focus area; `#findLayout` now uses the observed `[data-app-shell-focus-area="main"]` marker. A fixture uses this current shape.
- The player shows the bottom artwork gradient, track text, and compact bottom-row transport controls only on artwork hover or keyboard focus. Text uses a light shadow, and the primary control uses a white circle as in the earlier design. The shared host edge is removed with a `:host` override. Type-check and build pass; live hover rendering remains unverified in this pass.
- On track ID changes, the player retains the current image while it loads the requested image in a detached image element, then swaps only after load. It ignores stale load events. A missing image or failed request keeps the last working cover visible. Tests cover successful image changes, no-artwork responses, and rejected artwork requests.
- Music.app's local scripting definition exposes playback commands and current track/artwork properties. The persistent Node bridge accepts only validated `play`, `pause`, `next`, `previous`, `state`, and `artwork` requests over a CDP `Runtime.addBinding` restricted to the default world of the main `app://-/index.html` frame. It checks the calling context again before handling requests or returning responses. Playback commands map to fixed AppleScript strings; renderer values are not interpolated into scripts. An atomic per-user lock prevents concurrent bridge processes; dead-PID locks are reclaimed and startup races wait briefly for lock initialization. The launcher starts the bridge detached after injection; `npm run music-bridge` starts it for manual injection. It uses the existing localhost-only CDP endpoint and adds no network listener.
- Live verification on macOS: Music returned `JPEG picture` for the artwork format. The bridge normalizes that label, writes the image to a temporary file, and returns a JPEG data URL; the 600 by 600 image fills the card and the overlay is visually checked. Computed host and card radii both measured 12 px after the shell override. Play and pause UI clicks returned to the prior paused state in about 390 ms and 330 ms. A Next UI action changed tracks; a Previous UI action restored the same track after the state settled. A request while Music had no current track showed the empty-player state. Fresh-user Automation consent behavior remains unverified; this machine allowed the Apple Events used in the live check.
- The one-shot injector cannot receive renderer requests after it exits. The helper therefore owns the CDP connection and Apple Events calls. A live `Runtime.addBinding` probe proved renderer-to-host delivery before implementation; end-to-end control and artwork are now verified against the open Music app. CDP remains a high-privilege, unsupported third-party Chromium interface, so the helper selects only the main target and connects only to localhost port 9335.
- The live renderer reports the main frame as `app://-/index.html?initialRoute=...`, with a default context and a separate Electron isolated context. Repeated launcher runs left one bridge process; a second direct bridge start while it was running exited with `Music bridge is already running.` A live CDP check found the binding in the default context and `undefined` in a separately created isolated world. UI access was blocked during this verification, so playback through the updated context-scoped bridge was not re-tested in that final pass.
- Apple Music web playback remains an alternative player, not a control path for the installed Music app's current queue. MusicKit web setup, authorization, and licensing are not part of this feature. Sources checked: [MusicKit on the Web](https://developer.apple.com/musickit/web/), [Apple Music API](https://developer.apple.com/documentation/AppleMusicAPI), and [developer token requirements](https://developer.apple.com/documentation/AppleMusicAPI/generating-developer-tokens). Apple documents Automation permission settings at [Allow apps to automate and control other apps](https://support.apple.com/en-hk/guide/mac-help/mchl108e1718/mac).

### Music artwork and summary alignment: 2026-11-08

- Music returned its artwork format as `«class PNG »`; the bridge now recognizes this AppleScript format. In version 0.1.84, the live renderer loaded the current artwork as an 800 px PNG.
- When the native summary is open, the popover stack uses its left edge. Live renderer bounds placed the summary at x=1252, y=52..294 and Music at x=1252, y=302..602. The 8 px vertical gap and horizontal alignment were verified in the active renderer.

### Shared popover space: 2026-11-08

- The native summary already reserves space for its column. Keeping the Music spacer while the summary was open created a second column and separated the cards. Version 0.1.85 removes the spacer while the summary button is pressed and restores it when the summary closes. The stack also avoids inherited transitions and updates after native transitions finish.
- Live CDP checks opened Music, opened the summary, and closed the summary. With both open, the cards had the same x coordinate (1592 px), an 8 px vertical gap, and no extra spacer. Music alone restored the spacer. Tests and type-check passed.

### Transcript shift without a separate column: 2026-11-08

- Live inspection showed that the native summary keeps the main surface width and sets `--thread-content-x` to `-154px` on `group/thread-scroll-layout` for its 308 px wide floating area. Version 0.1.87 removes the extra flex spacer, uses that same shift while Music alone is open, and anchors Music at the native summary's 8 px right inset. The app controls the shift when its summary is open.
- Live CDP checks opened Music, opened and closed the summary, then closed Music. Music stayed at x=1592 throughout; with the summary open its x was also 1592 and the vertical gap was 8 px. The transcript shift was -154 px while open and cleared on close. No spacer was present. Tests and type-check passed. The native class and custom property are private app hooks.
- The transcript shift and stack position belong to the shared adapter and apply to every registered popover. A fixture using the empty popover confirms the shift starts when it opens, remains while another popover is open, and clears when the last one closes. The empty module is disabled in the current modules.json, so this check did not exercise it in the live app.

### Preserve Music across chat navigation: 2026-11-08

- The adapter closed all popovers when the active chat had no native summary button. Version 0.1.88 keeps the open popover mounted and maintains the shared transcript shift when that button is absent; the per-chat toolbar action is removed until available again. An adapter test removes the summary button while Music is open and confirms that the card and shift remain. The runtime was injected; chat navigation in the live app remains unverified.

### Empty chat toolbar fallback: 2026-11-08

- Live navigation confirmed Music closed when a new empty chat had no summary action or chat toolbar anchor. Version 0.1.89 retains the popover when the active home layout still exists but those chat controls do not. It applies the shared transcript shift and positions the stack from the main surface. The fixture removes both controls while Music is open and confirms the card and shift remain. The runtime was injected; a second live navigation pass after this fix remains unverified.

### Music toolbar on an empty chat: 2026-11-08

- Empty chats may not expose the chat-specific `Chat actions` button. Version 0.1.90 falls back to the visible end toolbar slot, so the registered Music action remains available there. Live navigation confirmed the Music button at x=1864 in a new chat, and confirmed its open card remained mounted after returning to an existing chat. Adapter tests, all 34 tests, type-check, and diff check passed.

### Keep popovers in chat and layer Summary above Music: 2026-11-09

- Live inspection with the Plan tab open showed the main surface spanning x=290..1900 while `group/thread-scroll-layout` ended at x=1078 and the Plan tab began there. The old stack position used the main surface's right edge, which placed Music over Plan. Version 0.1.93 positions the stack from the chat bounds and observes the chat layout for resizing.
- The user's scrawl frames showed the native Summary action clicked while Music was open. Live reproduction placed both cards at x=1592..1892; `elementsFromPoint` returned Music above Summary. The Summary layer shares a `.min-h-0.flex-1` host with the chat layout. Mounting the stack in that nearest shared host with z-index 10 puts the Summary layer above Music. The app filters mutations inside the chat panel, so the adapter now schedules on the named Summary toggle and observes its panel size. After injection, CDP measured Summary at y=52..204 and Music at y=212..512, with Summary winning hit testing.
- The adapter fixture covers a split Plan/chat layout and stack placement below an open Summary card, including summary toggles within the chat panel. All 15 adapter tests, type-check, build, and injection of version 0.1.93 passed. The Plan panel was not open in the final live renderer check, so its post-injection placement is fixture-verified; the pre-injection live bounds confirmed the failure path.
- Review feedback identified that a narrower chat reduced stack width but left the Music card at 300 px and positioned it as if it were still 300 px. Version 0.1.94 uses the computed stack width for its left offset and passes that width to the Music card. The 280 px chat fixture confirms a 264 px card at x=228 within chat bounds x=220..500; all 16 adapter tests, type-check, and build passed.

### Remove the Music popover rim: 2026-11-09

- Version 0.1.95 removed the core host classes, but the light rim remained. Live CDP measurements showed the Music host and card sharing the same 300 px bounds with no CSS border or shadow. The chat surface began at y=44 and the card at y=52, so the white strip was the 8 px top inset showing the surface behind it.
- Version 0.1.97 positioned the card flush with the chat top. The user confirmed that this removed the required top gap while leaving the pale rim.
- Version 0.1.98 restores the 8 px top gap, removes only the host border and elevated-surface classes, and leaves the shadow classes enabled. Live CDP measured the card at y=52 and chat top at y=44; the computed three-layer shadow remained. The remaining pale fade was incorrectly attributed to the artwork; version 0.1.100 identifies the app layer that caused it.
- Version 0.1.99 scales the artwork image by 1.17 to crop the pale frame while keeping the popover shadow and 8 px top gap. After injection, CDP showed the original 600 px image at 351 px in the 300 px card, the host's computed three-layer shadow, and no host border or surface. The screenshot confirmed the artwork frame was cropped and the chat gap remained.

- Version 0.1.100 removes the artwork scaling. Live renderer inspection found the actual white fade in the app’s `MainContentTopFade` layer at z-index 20, above the injected stack at 10. The native Summary layer uses z-index 40. The stack now uses 30 to place it between those layers; the 8 px top gap and popover shadow remain. Live CDP verified the stack at 30, fade at 20, Summary at 40, an 8 px gap below Summary, an unscaled image, and the host shadow. A screenshot with Summary closed showed the full artwork without the white fade; adapter tests and type-check passed.

### Music bridge reconnect: 2026-11-09

- The Music popover keeps its initial “Connects to Music on this Mac” subtitle until a state response arrives. In the live checkout, localhost CDP and the main renderer target were available, but no `music-bridge` process or lock existed. This confirms the helper was absent at inspection time; it does not identify why it exited.
- The bridge used one CDP connection and did not retry after setup errors or disconnects. It now retains the per-user lock and reconnects every two seconds. Each connection installs a fresh binding in the trusted main frame and removes its listeners when the socket closes. The renderer's existing 1.5 second state poll can then recover without a reload. A timed-out WebSocket connection is closed before retry.
- If the CDP socket closes while a Music request is pending, sending its response can fail. Response dispatch now fails closed without attempting a second send on the same socket; a request failure still gets one error-response attempt. A regression test simulates a disconnect during an active request.
- Verification: TypeScript type-check, bundle build, and the bridge-disconnect test passed. A short live run connected to the main renderer and received binding calls. Playback controls and Automation permission behavior were not exercised.

### Music artwork corners: 2026-11-11

- Version 0.1.101 removes the card's second 12 px clipping layer. The popover host now clips the artwork and card together to its 12 px radius. Double clipping was a possible cause of the light corner; this cause remains unverified. Type-check, the Music module test, and build passed. Live visual verification was unavailable because CDP was not listening.
