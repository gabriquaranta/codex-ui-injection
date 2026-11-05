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
  #mountFrame: number | null = null;
  #disposed = false;
  #summaryVisible = false;
  readonly #responseRootHandlers: readonly ((root: HTMLElement) => (() => void) | void)[];
  readonly #responseRootCleanups = new Map<HTMLElement, Array<() => void>>();

  constructor(document: Document, registry: ModuleRegistry<UiPanel>, popovers: readonly UiPopover[] = [], responseRootHandlers: readonly ((root: HTMLElement) => (() => void) | void)[] = []) {
    this.#document = document;
    this.#responseRootHandlers = responseRootHandlers;
    this.#backgroundStyle = document.createElement("style");
    this.#backgroundStyle.textContent = `
      :root[data-codex-ui-home-chat] [data-app-shell-active-page="true"] :is([data-app-shell-focus-area="main"][id$="-chat-panel"], [data-app-shell-tab-panel-controller="right"] [data-includes-composer="true"]) {
        background-image: linear-gradient(color-mix(in srgb, var(--app-color-background-surface, Canvas) calc(100% - var(--codex-ui-background-opacity)), transparent), color-mix(in srgb, var(--app-color-background-surface, Canvas) calc(100% - var(--codex-ui-background-opacity)), transparent)), var(--codex-ui-background);
        background-position: center; background-size: cover; background-repeat: no-repeat;
      }
      :root[data-codex-ui-home-chat][data-codex-ui-background] [data-app-shell-active-page="true"] :is([data-app-shell-focus-area="main"][id$="-chat-panel"], [data-app-shell-tab-panel-controller="right"] [data-includes-composer="true"]) [aria-hidden="true"][class*="_background_"][class*="_fade_"],
      :root[data-codex-ui-home-chat][data-codex-ui-background] [data-app-shell-active-page="true"] :is([data-app-shell-focus-area="main"][id$="-chat-panel"], [data-app-shell-tab-panel-controller="right"] [data-includes-composer="true"]) [aria-hidden="true"][class*="_background_"][class*="_surface_"] { background: transparent !important; }
    `;
    this.#controller = new ModuleController(document, registry, () => this.#updateDrawerGeometry(), popovers);
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
      if (relevant.some((record) => !(record.target instanceof Element)
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
    this.#controller.dispose();
    this.#backgroundStyle.remove();
    delete this.#document.documentElement.dataset.codexUiHomeChat;
    delete this.#document.documentElement.dataset.codexUiBackground;
    if (this.#backgroundUrl) URL.revokeObjectURL(this.#backgroundUrl);
    this.#document.documentElement.style.removeProperty("--codex-ui-background");
    this.#document.documentElement.style.removeProperty("--codex-ui-background-opacity");
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

  #mount(): void {
    if (this.#disposed) return;
    const home = this.#document.querySelector('[data-sidebar-destination="builtin:home"][aria-current="page"]');
    const modal = [...this.#document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
      .some((element) => element.getBoundingClientRect().width > 0);
    this.#controller.setPopoversSuspended(modal);
    if (modal) {
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
    const toolbarSlot = anchor && this.#findToolbarSlot(anchor);
    if (!anchor || !toolbarSlot || !layout) {
      this.#controller.close();
      this.#controller.closePopovers();
      this.#summaryVisible = false;
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
    this.#controller.setToolbarClass(anchor.className);
    const summaryButton = activePage?.querySelector<HTMLButtonElement>('button[data-thread-summary-panel-toggle="true"]');
    if (summaryButton?.parentElement) {
      if (this.#controller.popoverToolbarRoot.parentElement !== summaryButton.parentElement
        || this.#controller.popoverToolbarRoot.nextSibling !== summaryButton) {
        summaryButton.parentElement.insertBefore(this.#controller.popoverToolbarRoot, summaryButton);
      }
    } else {
      this.#controller.closePopovers();
      this.#controller.popoverToolbarRoot.remove();
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
    if (!this.#controller.popoverStack.isConnected) this.#document.body.append(this.#controller.popoverStack);
    const mainRect = layout.main.getBoundingClientRect();
    const stack = this.#controller.popoverStack;
    const summary = activePage?.querySelector<HTMLElement>('[data-summary-panel-variant="summary"]');
    const summaryRect = summary?.getBoundingClientRect();
    const visibleSummary = summaryButton?.getAttribute("aria-pressed") === "true"
      && summaryRect && summaryRect.width > 0 && summaryRect.height > 0
      && summaryRect.left < mainRect.right && summaryRect.right > mainRect.left ? summaryRect : null;
    if (this.#summaryVisible && !visibleSummary) this.#controller.closePopovers();
    this.#summaryVisible = Boolean(visibleSummary);
    stack.style.top = `${(visibleSummary ? visibleSummary.bottom + 8 : mainRect.top + 8) - POPOVER_SHADOW_SPACE}px`;
    stack.style.width = `${Math.max(0, Math.min(visibleSummary?.width ?? 300, mainRect.width - 16))}px`;
    stack.style.right = `${(this.#document.defaultView?.innerWidth ?? mainRect.right) - Math.min(visibleSummary?.right ?? mainRect.right - 8, mainRect.right - 8) - POPOVER_SHADOW_SPACE}px`;
    stack.style.bottom = `${Math.max(16, (this.#document.defaultView?.innerHeight ?? mainRect.bottom) - mainRect.bottom + 16) - POPOVER_SHADOW_SPACE}px`;
    this.#observeTargets([toolbarSlot, layout.element, layout.main, ...(visibleSummary && summary ? [summary] : [])]);
    this.#updateDrawerGeometry();
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
          && Boolean(element.querySelector('[data-app-shell-focus-area="main"][id$="-chat-panel"]'));
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
