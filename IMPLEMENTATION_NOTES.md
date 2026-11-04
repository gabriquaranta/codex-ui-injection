# Codex UI Injection: Implementation Notes

This file records implementation details that took non-trivial inspection or testing to discover. Update it when new details are confirmed. Keep observed facts separate from assumptions and record how each fact was checked.

## Current proof of concept

The POC adds a toolbar toggle and an empty side panel to the running ChatGPT desktop app in Codex mode. It changes renderer DOM and CSS only. The panel does not call Codex tools, edit conversations, or submit messages.

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
- **CDP access:** connect to the selected target's `webSocketDebuggerUrl`. `inject.mjs` limits this connection to localhost port 9335. The endpoint grants renderer control, so do not bind it to a network interface or leave it enabled when it is not needed.
- **Persistence:** `Page.addScriptToEvaluateOnNewDocument` installs the script for future documents in that target; `Runtime.evaluate` applies it to the current document. Restarting the app removes the runtime injection.
- Repeated calls to `Page.addScriptToEvaluateOnNewDocument` register more startup scripts. `Page.getScriptToEvaluateOnNewDocument` is not implemented by the current app CDP endpoint (it returned protocol error `-32601`), so old script identifiers cannot be listed through that command. `inject.mjs` now checks the version installed in the current renderer before registering another startup script.
- **Runtime:** Node.js 22 or newer works without a WebSocket package. The injector uses Node's built-in `fetch` and `WebSocket`.

### Confirmed toolbar and layout hooks

- The current chat toolbar has a button with `aria-label="Chat actions"`. It is inside a `display: contents` wrapper in the right-side toolbar action group. Inserting the POC button before that control places it in the real toolbar; its 28 px width expands the group to the left.
- The active conversation is a visible `<main>` element. Its ancestors include `display: contents` wrappers and a full-size row flex container (`display: flex; flex-direction: row`). The POC finds that container from the visible `<main>` rather than relying on generated React IDs.
- Append the panel as a flex child of that row container. Give it a 360 px flex basis (capped at 42% of the viewport). The main view then shrinks to make room. Position the panel vertically from the active `<main>` rectangle; the row container starts above the content header.
- A `MutationObserver` remounts the UI if React replaces toolbar or layout nodes. A cleanup callback disconnects the previous observer and resize listener when the injection is reapplied.

### Verification record: 2026-11-04

- The live renderer showed both the toolbar button and panel after injection.
- DOM geometry confirmed the button was in the toolbar and the panel was a child of the row flex layout.
- Open/close interaction was exercised through CDP. In the observed window, the main view width changed from 666 px open to 1026 px closed, then returned to 666 px when reopened. The panel's left edge matched the main view's right edge while open.
- `node --check inject.mjs` and `node --check panel.js` passed.

### Duplicate injection incident: 2026-11-04

- **Observed:** the main renderer contained two POC buttons and two POC panels. Removing the current copy caused one old pair to reappear after the next DOM mutation. This confirmed that a stale `MutationObserver` from an earlier injection was still mounting its own nodes.
- **Cause:** repeated runtime injection left multiple controller instances in one renderer. The first cleanup also removed only the first element matching each ID.
- **Fix:** `panel.js` removes every matching node, calls registered cleanups, versions its owned button and panel, and hides nodes from older versions. `inject.mjs` avoids adding the same startup version again. `AGENTS.md` requires a version increment when `panel.js` changes.
- **Current renderer:** one versioned button is visible. The panel opens as one 360 px flex child; the main view's right edge meets the panel's left edge. Closing the panel restores the main view's width. Older hidden nodes may remain in the current renderer until app restart; restart also clears stale observers.
- **Verification:** after the fix, the live renderer reported one visible button, one active panel, `panelX === mainRight` while open, and a main width increase from 1027 px to 1387 px when closed.

## Known limits

- This is an unofficial DOM/CSS injection. Codex does not provide a documented API for persistent dockable side panels.
- Toolbar labels, DOM shape, and flex layout are private app details. Updates can change them. If the button or panel does not mount, inspect the new renderer DOM and record the change here.
- CDP is enabled only when the app is launched with the debugging flag. The POC does not restart the app or enable CDP itself.
- The current panel width and colors are prototype values. Theme matching, resizing, panel content, and across-session startup are not implemented.

## How to extend these notes

For each non-trivial discovery, add a dated note with:

1. What was discovered.
2. The evidence (renderer structure, protocol behavior, or observed UI behavior).
3. The implementation consequence.
4. How it was verified and any platform/version limit.

Do not record session-specific target IDs as stable facts. Label unverified ideas as hypotheses.
