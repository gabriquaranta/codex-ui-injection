(() => {
  const version = 2;
  const buttonId = "codex-side-poc-button";
  const panelId = "codex-side-poc-panel";
  const styleId = "codex-side-poc-style";
  const startOpen = [...document.querySelectorAll(`#${panelId}`)]
    .some((item) => item.dataset.open === "true");

  if (Number(window.__codexSidePanelVersion || 0) >= version && !window.__codexSidePanelForce) return;
  window.__codexSidePanelForce = false;
  window.__codexSidePanelVersion = version;

  for (const cleanup of window.__codexSidePanelCleanups || []) cleanup();
  window.__codexSidePanelCleanup?.();
  window.__codexSidePanelCleanups = [];
  document.querySelectorAll(`#${buttonId}, #${panelId}, #${styleId}`).forEach((element) => element.remove());

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #${buttonId} {
      width: 28px; height: 28px; flex: 0 0 28px; display: flex;
      align-items: center; justify-content: center; padding: 0;
      border: 0; border-radius: 8px; color: inherit;
      background: transparent; cursor: pointer;
    }
    #${buttonId}:not([data-poc-version="${version}"]) { display: none !important; }
    #${buttonId}:hover, #${buttonId}[aria-expanded="true"] { background: rgba(120,120,128,.16); }
    #${buttonId}:focus-visible, #${panelId} button:focus-visible { outline: 2px solid #5b9cff; outline-offset: 2px; }
    #${buttonId} svg { width: 16px; height: 16px; }
    #${panelId} {
      box-sizing: border-box; min-width: 280px; max-width: 42vw;
      flex: 0 0 min(360px, 42vw); flex-direction: column;
      align-self: flex-start; overflow: auto; color: #242424;
      background: #fff; border-left: 1px solid rgba(0,0,0,.12);
      box-shadow: -8px 0 24px rgba(0,0,0,.08);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${panelId}:not([data-poc-version="${version}"]) { display: none !important; flex: 0 0 0 !important; width: 0 !important; }
    #${panelId}[data-open="true"] { display: flex; }
    #${panelId}[data-open="false"] { display: none; }
    #${panelId} header { height: 56px; box-sizing: border-box; flex: 0 0 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,.09); }
    #${panelId} h2 { margin: 0; font-size: 15px; font-weight: 600; }
    #${panelId} button { width: 32px; height: 32px; border: 0; border-radius: 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 20px; }
    #${panelId} button:hover { background: rgba(120,120,128,.14); }
    #${panelId} .empty { flex: 1; display: grid; place-items: center; min-height: 120px; color: #777; }
    @media (prefers-color-scheme: dark) {
      #${panelId} { color: #eee; background: #202020; border-color: rgba(255,255,255,.12); box-shadow: -8px 0 24px rgba(0,0,0,.25); }
      #${panelId} header { border-color: rgba(255,255,255,.1); }
      #${panelId} .empty { color: #aaa; }
    }
  `;
  document.head.append(style);

  const button = document.createElement("button");
  button.id = buttonId;
  button.type = "button";
  button.dataset.pocVersion = String(version);
  button.setAttribute("aria-label", startOpen ? "Close side panel" : "Open side panel");
  button.setAttribute("aria-expanded", String(startOpen));
  button.title = startOpen ? "Close side panel" : "Open side panel";
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M15 4.5v15" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 8h4M7.5 12h4M7.5 16h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  const panel = document.createElement("aside");
  panel.id = panelId;
  panel.dataset.pocVersion = String(version);
  panel.setAttribute("aria-label", "Side panel");
  panel.dataset.open = String(startOpen);
  panel.innerHTML = '<header><h2>Side panel</h2><button type="button" aria-label="Close side panel" title="Close">×</button></header><div class="empty">Your panel is empty.</div>';

  const setOpen = (open) => {
    panel.dataset.open = String(open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close side panel" : "Open side panel");
    button.title = open ? "Close side panel" : "Open side panel";
    updateLayout();
  };

  function findLayout() {
    const main = [...document.querySelectorAll("main")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      })
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (!main) return null;

    for (let element = main.parentElement; element; element = element.parentElement) {
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      if (computed.display === "flex" && computed.flexDirection === "row"
        && rect.width > innerWidth * 0.85 && rect.height > innerHeight * 0.85) {
        return { element, main };
      }
    }
    return null;
  }

  function updateLayout() {
    if (!panel.isConnected || panel.dataset.open !== "true") return;
    const layout = findLayout();
    if (!layout || panel.parentElement !== layout.element) return;
    const layoutRect = layout.element.getBoundingClientRect();
    const mainRect = layout.main.getBoundingClientRect();
    panel.style.marginTop = `${Math.max(0, mainRect.top - layoutRect.top)}px`;
    panel.style.height = `${mainRect.height}px`;
  }

  function mount() {
    const anchor = document.querySelector('button[aria-label="Chat actions"]');
    const layout = findLayout();
    if (!anchor?.parentElement || !layout) return;
    if (button.parentElement !== anchor.parentElement) anchor.parentElement.insertBefore(button, anchor);
    if (panel.parentElement !== layout.element) layout.element.append(panel);
    updateLayout();
  }

  button.addEventListener("click", () => setOpen(panel.dataset.open !== "true"));
  panel.querySelector("header button").addEventListener("click", () => setOpen(false));
  window.addEventListener("resize", updateLayout);
  mount();

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__codexSidePanelCleanup = () => {
    observer.disconnect();
    window.removeEventListener("resize", updateLayout);
  };
  window.__codexSidePanelCleanups.push(window.__codexSidePanelCleanup);
})();
