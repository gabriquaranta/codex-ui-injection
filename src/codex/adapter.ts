import type { UiPanel, UiPopover } from "../core/contracts.js";
import type { ModuleRegistry } from "../core/module-registry.js";
import { ModuleController } from "../core/module-controller.js";

const LEGACY_IDS = ["codex-side-poc-button", "codex-side-poc-panel", "codex-side-poc-style"];
const DEFAULT_DRAWER_WIDTH = 360;
const MIN_DRAWER_WIDTH = 220;
const MIN_MAIN_WIDTH = 680;
const POPOVER_SHADOW_SPACE = 32;

export class CodexAdapter {
  readonly #document: Document;
  readonly #controller: ModuleController;
  readonly #observer: MutationObserver;
  readonly #resizeObserver: ResizeObserver;
  readonly #resizeHandler: EventListener;
  readonly #backgroundStyle: HTMLStyleElement;
  #observedTargets: readonly Element[] = [];
  #sizedMain: HTMLElement | null = null;
  #originalMainMinWidth = "";
  #desiredWidth = DEFAULT_DRAWER_WIDTH;
  #stopResize: (() => void) | null = null;
  #backgroundUrl: string | null = null;
  #workspaceBackgroundUrl: string | null = null;
  #mountFrame: number | null = null;
  #disposed = false;
  readonly #responseRootHandlers: readonly ((root: HTMLElement) => (() => void) | void)[];
  readonly #responseRootCleanups = new Map<HTMLElement, Array<() => void>>();

  constructor(document: Document, registry: ModuleRegistry<UiPanel>, popovers: readonly UiPopover[] = [], responseRootHandlers: readonly ((root: HTMLElement) => (() => void) | void)[] = []) {
    this.#document = document;
    this.#responseRootHandlers = responseRootHandlers;
    this.#backgroundStyle = document.createElement("style");
    this.#backgroundStyle.textContent = `
      [data-codex-ui-shift-chat] { --thread-content-x: -154px !important; }
      :root[data-codex-ui-workspace-background] {
        background-image: linear-gradient(color-mix(in srgb, var(--app-color-background-surface, Canvas) calc(100% - var(--codex-ui-workspace-background-opacity)), transparent), color-mix(in srgb, var(--app-color-background-surface, Canvas) calc(100% - var(--codex-ui-workspace-background-opacity)), transparent)), var(--codex-ui-workspace-background);
        background-position: center; background-size: cover; background-repeat: no-repeat; background-attachment: fixed;
      }
      :root[data-codex-ui-workspace-background] body,
      :root[data-codex-ui-workspace-background] [data-app-shell-page-surface="true"],
      :root[data-codex-ui-workspace-background] [data-app-shell-main-surface="default"],
      :root[data-codex-ui-workspace-background] [data-app-shell-tabs] [data-app-shell-compact-page-gutter]:has([data-app-shell-tab-panel-controller="right"]),
      :root[data-codex-ui-workspace-background] [data-app-shell-tab-panel-controller="right"] {
        background-color: transparent !important;
      }
      :root[data-codex-ui-workspace-background] [data-app-shell-tab-panel-controller="right"] [data-app-shell-pane-content-viewport] .bg-surface-canvas {
        background-color: transparent !important;
      }
      :root[data-codex-ui-workspace-background] [data-app-shell-tab-panel-controller="right"] :is([data-app-action-review-scroll], [class~="group/file-diff"], .bg-surface, [data-codex-terminal], file-tree-container, diffs-container) {
        background-color: transparent !important;
      }
      :root[data-codex-ui-workspace-background] [data-app-shell-tab-panel-controller="right"] :is(file-tree-container, diffs-container) {
        --color-surface: transparent;
      }
      :root[data-codex-ui-workspace-background] [data-includes-composer="true"] [class*="background-"][class*="fade-"],
      :root[data-codex-ui-workspace-background] [data-includes-composer="true"] [class*="background-"][class*="surface-"] {
        background: transparent !important;
      }
      :root[data-codex-ui-workspace-background] :is([data-app-navigation-rail="true"], [data-app-shell-titlebar="true"]) {
        background-color: var(--app-color-background-surface, Canvas) !important;
      }
      :root[data-codex-ui-workspace-background] [data-app-shell-workspace-row]:has([data-app-navigation-rail="true"])::after {
        content: ""; position: absolute; z-index: 1; pointer-events: none;
        inset: var(--app-shell-titlebar-height) 0 0 var(--app-shell-navigation-rail-width);
        border: 1px solid var(--app-color-border); border-radius: var(--radius-xl);
        box-shadow: 0 0 0 var(--radius-xl) var(--app-color-background-surface, Canvas);
      }
      :root[data-codex-ui-home-chat] [data-app-shell-active-page="true"] :is([data-app-shell-focus-area="main"][id$="-chat-panel"], [data-app-shell-tab-panel-controller="right"] [data-includes-composer="true"]) {
        background-image: linear-gradient(color-mix(in srgb, var(--app-color-background-surface, Canvas) calc(100% - var(--codex-ui-background-opacity)), transparent), color-mix(in srgb, var(--app-color-background-surface, Canvas) calc(100% - var(--codex-ui-background-opacity)), transparent)), var(--codex-ui-background);
        background-position: center; background-size: cover; background-repeat: no-repeat;
      }
      :root[data-codex-ui-home-chat]:is([data-codex-ui-background], [data-codex-ui-workspace-background]) [data-app-shell-active-page="true"] :is([data-app-shell-focus-area="main"][id$="-chat-panel"], [data-app-shell-tab-panel-controller="right"] [data-includes-composer="true"]) [aria-hidden="true"][class*="_background_"][class*="_fade_"],
      :root[data-codex-ui-home-chat]:is([data-codex-ui-background], [data-codex-ui-workspace-background]) [data-app-shell-active-page="true"] :is([data-app-shell-focus-area="main"][id$="-chat-panel"], [data-app-shell-tab-panel-controller="right"] [data-includes-composer="true"]) [aria-hidden="true"][class*="_background_"][class*="_surface_"] { background: transparent !important; }
    `;
    this.#controller = new ModuleController(document, registry, () => {
      this.#updateDrawerGeometry();
      this.#scheduleMount();
    }, popovers);
    const handle = document.createElement("div");
    handle.dataset.codexUiResize = "";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", "Resize panel");
    handle.setAttribute("aria-orientation", "vertical");
    handle.tabIndex = 0;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.#stopResize?.();
      const startX = event.clientX;
      const startWidth = this.#controller.drawer.getBoundingClientRect().width;
      const move = (moveEvent: PointerEvent) => {
        this.#desiredWidth = Math.max(MIN_DRAWER_WIDTH, startWidth + startX - moveEvent.clientX);
        this.#updateDrawerGeometry();
      };
      const stop = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
        this.#stopResize = null;
      };
      this.#stopResize = stop;
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", stop, { once: true });
      document.addEventListener("pointercancel", stop, { once: true });
    });
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      this.#desiredWidth = Math.max(MIN_DRAWER_WIDTH, this.#controller.drawer.getBoundingClientRect().width
        + (event.key === "ArrowLeft" ? 20 : -20));
      this.#updateDrawerGeometry();
    });
    this.#controller.drawer.prepend(handle);
    this.#resizeHandler = () => this.#scheduleMount();
    this.#observer = new MutationObserver((records) => {
      const relevant = records.filter((record) => !(record.target instanceof Element
        && record.target.closest("[data-codex-ui-stream-glitch]"))
        && !([...record.addedNodes, ...record.removedNodes].length > 0
          && [...record.addedNodes, ...record.removedNodes].every((node) => node instanceof Element
            && node.hasAttribute("data-codex-ui-stream-glitch"))));
      if (relevant.some((record) => record.type === "attributes"
        || !(record.target instanceof Element)
        || !record.target.closest('[data-markdown-text-style="assistant-message"]'))) this.#syncResponseRoots();
      const summaryToggleChanged = relevant.some((record) => record.type === "attributes"
        && record.target instanceof Element
        && record.target.matches('button[data-thread-summary-panel-toggle="true"]'));
      if (summaryToggleChanged || relevant.some((record) => !(record.target instanceof Element)
        || !record.target.closest('[data-app-shell-focus-area="main"][id$="-chat-panel"]')
        || record.attributeName === "role"
        || Boolean(record.target.closest('[role="dialog"]'))
        || [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element
          && (node.matches('[role="dialog"]') || Boolean(node.querySelector('[role="dialog"]')))))) {
        this.#scheduleMount();
      }
    });
    this.#resizeObserver = new ResizeObserver(() => this.#scheduleMount());
  }

  start(): void {
    this.#document.head.append(this.#backgroundStyle);
    this.#mount();
    this.#observer.observe(this.#document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-modal", "aria-hidden", "aria-pressed", "role", "inert", "data-app-shell-active-page"] });
    this.#syncResponseRoots();
    this.#document.defaultView?.addEventListener("resize", this.#resizeHandler);
    this.#document.addEventListener("transitionend", this.#resizeHandler, true);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopResize?.();
    if (this.#mountFrame !== null) this.#document.defaultView?.cancelAnimationFrame(this.#mountFrame);
    this.#observer.disconnect();
    for (const cleanups of this.#responseRootCleanups.values()) cleanups.forEach((cleanup) => cleanup());
    this.#responseRootCleanups.clear();
    this.#resizeObserver.disconnect();
    this.#observedTargets = [];
    this.#document.defaultView?.removeEventListener("resize", this.#resizeHandler);
    this.#document.removeEventListener("transitionend", this.#resizeHandler, true);
    this.#document.querySelectorAll("[data-codex-ui-shift-chat]").forEach((element) => element.removeAttribute("data-codex-ui-shift-chat"));
    this.#controller.dispose();
    this.#backgroundStyle.remove();
    delete this.#document.documentElement.dataset.codexUiHomeChat;
    delete this.#document.documentElement.dataset.codexUiBackground;
    delete this.#document.documentElement.dataset.codexUiWorkspaceBackground;
    if (this.#backgroundUrl) URL.revokeObjectURL(this.#backgroundUrl);
    if (this.#workspaceBackgroundUrl) URL.revokeObjectURL(this.#workspaceBackgroundUrl);
    this.#document.documentElement.style.removeProperty("--codex-ui-background");
    this.#document.documentElement.style.removeProperty("--codex-ui-background-opacity");
    this.#document.documentElement.style.removeProperty("--codex-ui-workspace-background");
    this.#document.documentElement.style.removeProperty("--codex-ui-workspace-background-opacity");
    this.#document.documentElement.style.removeProperty("--codex-ui-drawer-width");
    this.#removeLegacyUi();
  }

  #scheduleMount(): void {
    const view = this.#document.defaultView;
    if (this.#disposed || !view || this.#mountFrame !== null) return;
    this.#mountFrame = view.requestAnimationFrame(() => {
      this.#mountFrame = null;
      this.#mount();
    });
  }

  #syncResponseRoots(): void {
    const roots = new Set(this.#document.querySelectorAll<HTMLElement>(
      '[data-app-shell-active-page="true"] [data-markdown-text-style="assistant-message"]',
    ));
    for (const [root, cleanups] of this.#responseRootCleanups) {
      if (!roots.has(root)) {
        cleanups.forEach((cleanup) => cleanup());
        this.#responseRootCleanups.delete(root);
      }
    }
    for (const root of roots) {
      if (this.#responseRootCleanups.has(root)) continue;
      this.#responseRootCleanups.set(root, this.#responseRootHandlers
        .map((handler) => handler(root)).filter((cleanup): cleanup is () => void => cleanup !== undefined));
    }
  }

  setChatBackground(image: Blob | null, opacity: number): void {
    const style = this.#document.documentElement.style;
    if (this.#backgroundUrl) URL.revokeObjectURL(this.#backgroundUrl);
    this.#backgroundUrl = null;
    if (image) {
      this.#document.documentElement.dataset.codexUiBackground = "";
      this.#backgroundUrl = URL.createObjectURL(image);
      style.setProperty("--codex-ui-background", `url("${this.#backgroundUrl}")`);
      style.setProperty("--codex-ui-background-opacity", `${opacity}%`);
    } else {
      delete this.#document.documentElement.dataset.codexUiBackground;
      style.removeProperty("--codex-ui-background");
      style.removeProperty("--codex-ui-background-opacity");
    }
  }

  setWorkspaceBackground(image: Blob | null, opacity: number): void {
    const root = this.#document.documentElement;
    const style = root.style;
    if (this.#workspaceBackgroundUrl) URL.revokeObjectURL(this.#workspaceBackgroundUrl);
    this.#workspaceBackgroundUrl = null;
    if (image) {
      root.dataset.codexUiWorkspaceBackground = "";
      this.#workspaceBackgroundUrl = URL.createObjectURL(image);
      style.setProperty("--codex-ui-workspace-background", `url("${this.#workspaceBackgroundUrl}")`);
      style.setProperty("--codex-ui-workspace-background-opacity", `${opacity}%`);
    } else {
      delete root.dataset.codexUiWorkspaceBackground;
      style.removeProperty("--codex-ui-workspace-background");
      style.removeProperty("--codex-ui-workspace-background-opacity");
    }
  }

  #mount(): void {
    if (this.#disposed) return;
    const home = this.#document.querySelector('[data-sidebar-destination="builtin:home"][aria-current="page"]');
    const modal = [...this.#document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
      .some((element) => element.getBoundingClientRect().width > 0);
    this.#controller.setPopoversSuspended(modal);
    if (modal) {
      this.#document.querySelectorAll("[data-codex-ui-shift-chat]").forEach((element) => element.removeAttribute("data-codex-ui-shift-chat"));
      this.#controller.close();
      this.#controller.popoverToolbarRoot.remove();
      this.#controller.toolbarRoot.remove();
      this.#controller.drawer.remove();
      this.#restoreMainMinWidth();
      delete this.#document.documentElement.dataset.codexUiHomeChat;
      return;
    }
    const layout = home ? this.#findLayout() : null;
    if (layout) this.#document.documentElement.dataset.codexUiHomeChat = "";
    else delete this.#document.documentElement.dataset.codexUiHomeChat;
    const activePage = layout?.main.closest('[data-app-shell-active-page="true"]');
    const anchor = activePage && [...activePage.querySelectorAll<HTMLButtonElement>('button[aria-label="Chat actions"]')]
      .find((button) => button.getBoundingClientRect().width > 0 && !button.closest('[aria-hidden="true"], [inert]'));
    const toolbarSlot = (anchor && this.#findToolbarSlot(anchor))
      ?? [...activePage?.querySelectorAll<HTMLElement>('[data-app-shell-header-slot="end"] [data-app-shell-header-slot-content="true"]') ?? []]
        .find((element) => element.getBoundingClientRect().height > 0 && !element.closest('[aria-hidden="true"], [inert]'));
    if (!toolbarSlot && layout && this.#controller.hasOpenPopovers) {
      this.#document.querySelectorAll("[data-codex-ui-shift-chat]").forEach((element) => element.removeAttribute("data-codex-ui-shift-chat"));
      const chatLayout = activePage?.querySelector<HTMLElement>('[class~="group/thread-scroll-layout"]') ?? null;
      const summary = activePage?.querySelector<HTMLElement>('[data-summary-panel-variant="summary"]') ?? null;
      const popoverHost = this.#findPopoverHost(layout.main, chatLayout, summary);
      if (chatLayout) chatLayout.dataset.codexUiShiftChat = "";
      if (this.#controller.popoverStack.parentElement !== popoverHost) popoverHost.append(this.#controller.popoverStack);
      const chatRect = chatLayout?.getBoundingClientRect() ?? layout.main.getBoundingClientRect();
      const stack = this.#controller.popoverStack;
      const stackWidth = Math.max(0, Math.min(300, chatRect.width - 16));
      stack.style.top = `${chatRect.top + 8 - POPOVER_SHADOW_SPACE}px`;
      stack.style.width = `${stackWidth}px`;
      stack.style.setProperty("--codex-ui-popover-width", `${stackWidth}px`);
      stack.style.left = `${chatRect.right - 8 - stackWidth - POPOVER_SHADOW_SPACE}px`;
      stack.style.right = "auto";
      stack.style.bottom = `${Math.max(16, (this.#document.defaultView?.innerHeight ?? chatRect.bottom) - chatRect.bottom + 16) - POPOVER_SHADOW_SPACE}px`;
      this.#observeTargets([
        layout.element,
        layout.main,
        ...(popoverHost !== layout.main ? [popoverHost] : []),
        ...(chatLayout ? [chatLayout] : []),
        ...(summary ? [summary] : []),
      ]);
      this.#updateDrawerGeometry();
      return;
    }
    if (!toolbarSlot || !layout) {
      this.#document.querySelectorAll("[data-codex-ui-shift-chat]").forEach((element) => element.removeAttribute("data-codex-ui-shift-chat"));
      this.#controller.close();
      this.#controller.closePopovers();
      this.#controller.popoverStack.remove();
      this.#controller.popoverToolbarRoot.remove();
      this.#controller.toolbarRoot.remove();
      this.#controller.drawer.remove();
      this.#restoreMainMinWidth();
      if (layout) this.#observeTargets([layout.element, layout.main]);
      else {
        this.#resizeObserver.disconnect();
        this.#observedTargets = [];
      }
      return;
    }
    const toolbarClass = anchor?.className ?? [...toolbarSlot.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getBoundingClientRect().width > 0)?.className ?? "";
    this.#controller.setToolbarClass(toolbarClass);
    const summaryButton = activePage?.querySelector<HTMLButtonElement>('button[data-thread-summary-panel-toggle="true"]');
    if (summaryButton?.parentElement) {
      if (this.#controller.popoverToolbarRoot.parentElement !== summaryButton.parentElement
        || this.#controller.popoverToolbarRoot.nextSibling !== summaryButton) {
        summaryButton.parentElement.insertBefore(this.#controller.popoverToolbarRoot, summaryButton);
      }
    } else {
      if (this.#controller.popoverToolbarRoot.parentElement !== toolbarSlot) toolbarSlot.append(this.#controller.popoverToolbarRoot);
    }
    if (this.#controller.toolbarRoot.parentElement !== toolbarSlot
      || [...toolbarSlot.children].some((child) => child !== this.#controller.toolbarRoot
        && Boolean(this.#controller.toolbarRoot.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (child.matches("button") || Boolean(child.querySelector("button"))))) {
      toolbarSlot.append(this.#controller.toolbarRoot);
    }
    if (this.#controller.drawer.parentElement !== layout.element
      || [...layout.element.children].some((child) => child.matches('[data-app-shell-active-page="true"]')
        && Boolean(this.#controller.drawer.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING))) {
      layout.element.append(this.#controller.drawer);
    }
    const chatLayout = activePage?.querySelector<HTMLElement>('[class~="group/thread-scroll-layout"]') ?? null;
    this.#document.querySelectorAll("[data-codex-ui-shift-chat]").forEach((element) => {
      if (element !== chatLayout || !this.#controller.hasOpenPopovers || summaryButton?.getAttribute("aria-pressed") === "true") {
        element.removeAttribute("data-codex-ui-shift-chat");
      }
    });
    if (chatLayout && this.#controller.hasOpenPopovers && summaryButton?.getAttribute("aria-pressed") !== "true") {
      chatLayout.dataset.codexUiShiftChat = "";
    }
    const summary = activePage?.querySelector<HTMLElement>('[data-summary-panel-variant="summary"]') ?? null;
    const popoverHost = this.#findPopoverHost(layout.main, chatLayout, summary);
    if (this.#controller.popoverStack.parentElement !== popoverHost) popoverHost.append(this.#controller.popoverStack);
    const chatRect = chatLayout?.getBoundingClientRect() ?? layout.main.getBoundingClientRect();
    const stack = this.#controller.popoverStack;
    const summaryRect = summary?.getBoundingClientRect();
    const visibleSummary = summaryButton?.getAttribute("aria-pressed") === "true"
      && summaryRect && summaryRect.width > 0 && summaryRect.height > 0
      && summaryRect.left < chatRect.right && summaryRect.right > chatRect.left ? summaryRect : null;
    const stackWidth = Math.max(0, Math.min(visibleSummary?.width ?? 300, chatRect.width - 16));
    stack.style.top = `${(visibleSummary ? visibleSummary.bottom + 8 : chatRect.top + 8) - POPOVER_SHADOW_SPACE}px`;
    stack.style.width = `${stackWidth}px`;
    stack.style.setProperty("--codex-ui-popover-width", `${stackWidth}px`);
    if (this.#controller.hasOpenPopovers) {
      stack.style.left = `${chatRect.right - 8 - stackWidth - POPOVER_SHADOW_SPACE}px`;
      stack.style.right = "auto";
    } else {
      stack.style.left = "";
      stack.style.right = `${(this.#document.defaultView?.innerWidth ?? chatRect.right) - Math.min(visibleSummary?.right ?? chatRect.right - 8, chatRect.right - 8) - POPOVER_SHADOW_SPACE}px`;
    }
    stack.style.bottom = `${Math.max(16, (this.#document.defaultView?.innerHeight ?? chatRect.bottom) - chatRect.bottom + 16) - POPOVER_SHADOW_SPACE}px`;
    this.#observeTargets([
      toolbarSlot,
      layout.element,
      layout.main,
      ...(popoverHost !== layout.main ? [popoverHost] : []),
      ...(chatLayout ? [chatLayout] : []),
      ...(summary ? [summary] : []),
    ]);
    this.#updateDrawerGeometry();
  }

  #findPopoverHost(main: HTMLElement, chatLayout: HTMLElement | null, summary: HTMLElement | null): HTMLElement {
    if (!chatLayout || !summary) return chatLayout ?? main;

    const chatAncestors = new Set<HTMLElement>();
    for (let ancestor: HTMLElement | null = chatLayout; ancestor; ancestor = ancestor.parentElement) {
      chatAncestors.add(ancestor);
      if (ancestor === main) break;
    }
    for (let ancestor: HTMLElement | null = summary; ancestor; ancestor = ancestor.parentElement) {
      if (chatAncestors.has(ancestor)) return ancestor;
      if (ancestor === main) break;
    }
    return chatLayout;
  }

  #observeTargets(targets: readonly Element[]): void {
    if (targets.length === this.#observedTargets.length
      && targets.every((target, index) => target === this.#observedTargets[index])) return;
    this.#resizeObserver.disconnect();
    targets.forEach((target) => this.#resizeObserver.observe(target));
    this.#observedTargets = targets;
  }

  #findToolbarSlot(anchor: HTMLButtonElement): HTMLElement | null {
    const page = anchor.closest('[data-app-shell-active-page="true"]');
    return [...page?.querySelectorAll<HTMLElement>('[data-app-shell-header-slot="end"] [data-app-shell-header-slot-content="true"]') ?? []]
      .find((element) => element.getBoundingClientRect().height > 0
        && !element.closest('[aria-hidden="true"], [inert]')) ?? null;
  }

  #findLayout(): { element: HTMLElement; main: HTMLElement } | null {
    const main = [...this.#document.querySelectorAll<HTMLElement>('[data-app-shell-active-page="true"] main[data-app-shell-main-surface="default"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100
          && !element.closest('[aria-hidden="true"], [inert]')
          && Boolean(element.querySelector('[data-app-shell-focus-area="main"]'));
      })
      .sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width)[0];
    if (!main) return null;

    const element = main.closest<HTMLElement>('[data-app-shell-workspace-row="true"]');
    return element ? { element, main } : null;
  }

  #updateDrawerGeometry(): void {
    const drawer = this.#controller.drawer;
    if (drawer.dataset.open !== "true") {
      this.#stopResize?.();
      this.#restoreMainMinWidth();
      this.#setDrawerWidth(this.#desiredWidth);
      return;
    }
    if (!drawer.isConnected) return;
    const layout = this.#findLayout();
    if (!layout || drawer.parentElement !== layout.element) {
      this.#restoreMainMinWidth();
      return;
    }
    this.#setMainMinWidth(layout.main);
    const layoutRect = layout.element.getBoundingClientRect();
    const mainRect = layout.main.getBoundingClientRect();
    const drawerWidth = drawer.getBoundingClientRect().width || this.#desiredWidth;
    const otherWidth = Math.max(0, layoutRect.width - mainRect.width - drawerWidth);
    const availableDrawerWidth = layoutRect.width - otherWidth - MIN_MAIN_WIDTH;
    const width = Math.max(MIN_DRAWER_WIDTH, Math.min(this.#desiredWidth, availableDrawerWidth));
    this.#setDrawerWidth(width);
    drawer.style.marginTop = `${Math.max(0, mainRect.top - layoutRect.top)}px`;
    drawer.style.height = `${mainRect.height}px`;
  }

  #setMainMinWidth(main: HTMLElement): void {
    if (this.#sizedMain !== main) {
      this.#restoreMainMinWidth();
      this.#sizedMain = main;
      this.#originalMainMinWidth = main.style.minWidth;
    }
    main.style.minWidth = "0";
  }

  #restoreMainMinWidth(): void {
    if (!this.#sizedMain) return;
    this.#sizedMain.style.minWidth = this.#originalMainMinWidth;
    this.#sizedMain = null;
    this.#originalMainMinWidth = "";
  }

  #setDrawerWidth(width: number): void {
    const value = `${width}px`;
    this.#document.documentElement.style.setProperty("--codex-ui-drawer-width", value);
    this.#controller.drawer.style.width = value;
    this.#controller.drawer.style.minWidth = value;
    this.#controller.drawer.style.maxWidth = value;
    this.#controller.drawer.style.flexBasis = value;
  }

  #removeLegacyUi(): void {
    const selector = LEGACY_IDS.map((id) => `#${id}`).join(",");
    this.#document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}
