import type { ModuleRegistry } from "../core/module-registry.js";
import { ModuleController } from "../core/module-controller.js";

const LEGACY_IDS = ["codex-side-poc-button", "codex-side-poc-panel", "codex-side-poc-style"];
const DEFAULT_DRAWER_WIDTH = 360;
const MIN_DRAWER_WIDTH = 220;
const MIN_MAIN_WIDTH = 680;

export class CodexAdapter {
  readonly #document: Document;
  readonly #controller: ModuleController;
  readonly #observer: MutationObserver;
  readonly #resizeObserver: ResizeObserver;
  readonly #resizeHandler: EventListener;
  #observedTargets: readonly Element[] = [];
  #sizedMain: HTMLElement | null = null;
  #originalMainMinWidth = "";
  #desiredWidth = DEFAULT_DRAWER_WIDTH;
  #stopResize: (() => void) | null = null;
  #disposed = false;

  constructor(document: Document, registry: ModuleRegistry) {
    this.#document = document;
    this.#controller = new ModuleController(document, registry, () => this.#updateDrawerGeometry());
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
    this.#resizeHandler = () => this.#mount();
    this.#observer = new MutationObserver(() => this.#mount());
    this.#resizeObserver = new ResizeObserver(() => this.#mount());
  }

  start(): void {
    this.#mount();
    this.#observer.observe(this.#document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    this.#document.defaultView?.addEventListener("resize", this.#resizeHandler);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopResize?.();
    this.#observer.disconnect();
    this.#resizeObserver.disconnect();
    this.#observedTargets = [];
    this.#document.defaultView?.removeEventListener("resize", this.#resizeHandler);
    this.#controller.dispose();
    this.#document.documentElement.style.removeProperty("--codex-ui-drawer-width");
    this.#removeLegacyUi();
  }

  #mount(): void {
    if (this.#disposed) return;
    const home = this.#document.querySelector('[data-sidebar-destination="builtin:home"][aria-current="page"]');
    if (!home) {
      this.#controller.close();
      this.#controller.toolbarRoot.remove();
      this.#controller.drawer.remove();
      this.#resizeObserver.disconnect();
      this.#observedTargets = [];
      return;
    }
    const anchor = this.#document.querySelector<HTMLButtonElement>('button[aria-label="Chat actions"]');
    const toolbarSlot = anchor && this.#findToolbarSlot(anchor);
    const layout = this.#findLayout();
    if (!anchor || !toolbarSlot || !layout) return;

    this.#controller.setToolbarClass(anchor.className);
    if (this.#controller.toolbarRoot.parentElement !== toolbarSlot
      || toolbarSlot.lastElementChild !== this.#controller.toolbarRoot) {
      toolbarSlot.append(this.#controller.toolbarRoot);
    }
    if (this.#controller.drawer.parentElement !== layout.element
      || layout.element.lastElementChild !== this.#controller.drawer) {
      layout.element.append(this.#controller.drawer);
    }
    this.#observeTargets([toolbarSlot, layout.element, layout.main]);
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
    const view = this.#document.defaultView;
    if (!view) return null;
    const toolbar = anchor.closest("header");
    if (!toolbar) return null;
    const anchorRect = anchor.getBoundingClientRect();
    const trailingButton = [...toolbar.querySelectorAll<HTMLButtonElement>("button")]
      .filter((button) => button.dataset.codexUiAction === undefined)
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0
        && rect.width <= anchorRect.width * 2
        && Math.abs(rect.top - anchorRect.top) <= 6
        && rect.left >= anchorRect.left)
      .sort((left, right) => right.rect.right - left.rect.right)[0]?.button ?? anchor;

    for (let element = trailingButton.parentElement; element; element = element.parentElement) {
      const style = view.getComputedStyle(element);
      if (style.display === "flex" && style.flexDirection === "row") return element;
    }
    return null;
  }

  #findLayout(): { element: HTMLElement; main: HTMLElement } | null {
    const main = [...this.#document.querySelectorAll<HTMLElement>("main")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      })
      .sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width)[0];
    if (!main) return null;

    const view = this.#document.defaultView;
    if (!view) return null;
    for (let element: HTMLElement | null = main.parentElement; element; element = element.parentElement) {
      const rect = element.getBoundingClientRect();
      const style = view.getComputedStyle(element);
      if (style.display === "flex" && style.flexDirection === "row"
        && rect.width > view.innerWidth * 0.85 && rect.height > view.innerHeight * 0.85) {
        return { element, main };
      }
    }
    return null;
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
