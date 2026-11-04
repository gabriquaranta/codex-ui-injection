import type { ModuleRegistry } from "../core/module-registry.js";
import { ModuleController } from "../core/module-controller.js";

const LEGACY_IDS = ["codex-side-poc-button", "codex-side-poc-panel", "codex-side-poc-style"];

export class CodexAdapter {
  readonly #document: Document;
  readonly #controller: ModuleController;
  readonly #observer: MutationObserver;
  readonly #resizeHandler: EventListener;
  #disposed = false;

  constructor(document: Document, registry: ModuleRegistry) {
    this.#document = document;
    this.#controller = new ModuleController(document, registry, () => this.#updateDrawerGeometry());
    this.#resizeHandler = () => this.#updateDrawerGeometry();
    this.#observer = new MutationObserver(() => this.#mount());
  }

  start(): void {
    this.#mount();
    this.#observer.observe(this.#document.documentElement, { childList: true, subtree: true });
    this.#document.defaultView?.addEventListener("resize", this.#resizeHandler);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#observer.disconnect();
    this.#document.defaultView?.removeEventListener("resize", this.#resizeHandler);
    this.#controller.dispose();
    this.#removeLegacyUi();
  }

  #mount(): void {
    if (this.#disposed) return;
    const anchor = this.#document.querySelector<HTMLButtonElement>('button[aria-label="Chat actions"]');
    const layout = this.#findLayout();
    if (!anchor?.parentElement || !layout) return;

    this.#controller.setToolbarClass(anchor.className);
    if (this.#controller.toolbarRoot.parentElement !== anchor.parentElement) {
      anchor.parentElement.insertBefore(this.#controller.toolbarRoot, anchor);
    }
    if (this.#controller.drawer.parentElement !== layout.element) layout.element.append(this.#controller.drawer);
    this.#updateDrawerGeometry();
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
    if (drawer.dataset.open !== "true" || !drawer.isConnected) return;
    const layout = this.#findLayout();
    if (!layout || drawer.parentElement !== layout.element) return;
    const layoutRect = layout.element.getBoundingClientRect();
    const mainRect = layout.main.getBoundingClientRect();
    drawer.style.marginTop = `${Math.max(0, mainRect.top - layoutRect.top)}px`;
    drawer.style.height = `${mainRect.height}px`;
  }

  #removeLegacyUi(): void {
    const selector = LEGACY_IDS.map((id) => `#${id}`).join(",");
    this.#document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}
