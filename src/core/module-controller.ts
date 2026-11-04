import type { Cleanup, UiModule } from "./contracts.js";
import { ModuleRegistry } from "./module-registry.js";

export class ModuleController {
  readonly toolbarRoot: HTMLDivElement;
  readonly drawer: HTMLElement;
  readonly #document: Document;
  readonly #registry: ModuleRegistry;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #buttonHandlers = new Map<string, EventListener>();
  readonly #onStateChange: () => void;
  readonly #header: HTMLHeadingElement;
  readonly #body: HTMLDivElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #closeHandler: EventListener;
  readonly #styleElement: HTMLStyleElement;
  #activeId: string | null = null;
  #activeCleanup: Cleanup | void = undefined;

  constructor(document: Document, registry: ModuleRegistry, onStateChange: () => void) {
    this.#document = document;
    this.#registry = registry;
    this.#onStateChange = onStateChange;
    this.toolbarRoot = document.createElement("div");
    this.toolbarRoot.dataset.codexUiToolbar = "";

    this.drawer = document.createElement("aside");
    this.drawer.dataset.codexUiDrawer = "";
    this.drawer.dataset.open = "false";
    this.drawer.setAttribute("aria-label", "Feature panel");

    const header = document.createElement("header");
    this.#header = document.createElement("h2");
    this.#closeButton = document.createElement("button");
    this.#closeButton.type = "button";
    this.#closeButton.dataset.codexUiClose = "";
    this.#closeButton.setAttribute("aria-label", "Close panel");
    this.#closeButton.title = "Close panel";
    this.#closeButton.textContent = "×";
    header.append(this.#header, this.#closeButton);

    this.#body = document.createElement("div");
    this.#body.dataset.codexUiBody = "";
    this.drawer.append(header, this.#body);

    this.#closeHandler = () => this.close();
    this.#closeButton.addEventListener("click", this.#closeHandler);

    for (const module of registry.all()) this.#addToolbarButton(module);

    this.#styleElement = document.createElement("style");
    this.#styleElement.dataset.codexUiStyles = "";
    this.#styleElement.textContent = `
      [data-codex-ui-toolbar] { display: contents; }
      [data-codex-ui-action] { width: 28px; height: 28px; flex: 0 0 28px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; color: inherit; background: transparent; cursor: pointer; }
      [data-codex-ui-action]:hover, [data-codex-ui-action][aria-pressed="true"] { background: var(--color-background-primary-surface, rgba(127,127,127,.12)); }
      [data-codex-ui-action]:focus-visible, [data-codex-ui-close]:focus-visible { outline: 2px solid var(--color-ring-primary, #5b9cff); outline-offset: 2px; }
      [data-codex-ui-action] svg { width: 16px; height: 16px; }
      [data-codex-ui-drawer] { box-sizing: border-box; width: min(360px, 42vw); min-width: min(280px, 42vw); max-width: 42vw; flex: 0 0 min(360px, 42vw); align-self: flex-start; flex-direction: column; overflow: auto; color: var(--color-text-primary, CanvasText); background: var(--app-color-background-elevated-secondary, Canvas); border-left: 1px solid var(--color-background-primary-surface, rgba(127,127,127,.12)); font: inherit; }
      [data-codex-ui-drawer][data-open="true"] { display: flex; }
      [data-codex-ui-drawer][data-open="false"] { display: none; }
      [data-codex-ui-drawer] > header { height: 56px; box-sizing: border-box; flex: 0 0 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid var(--color-background-primary-surface, rgba(127,127,127,.12)); }
      [data-codex-ui-drawer] h2 { margin: 0; font-size: 15px; font-weight: 600; }
      [data-codex-ui-close] { width: 32px; height: 32px; border: 0; border-radius: 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 20px; }
      [data-codex-ui-close]:hover { background: var(--color-background-primary-surface, rgba(127,127,127,.12)); }
      [data-codex-ui-body] { min-height: 0; flex: 1; overflow: auto; }
      [data-codex-ui-module-root] { display: block; min-width: 0; color: inherit; font: inherit; }
    `;
    document.head.append(this.#styleElement);
  }

  get activeId(): string | null {
    return this.#activeId;
  }

  setToolbarClass(className: string): void {
    for (const button of this.#buttons.values()) button.className = className;
  }

  open(id: string): void {
    const module = this.#registry.get(id);
    if (!module) throw new Error(`Unknown UI module: ${id}`);
    if (this.#activeId === id) {
      this.close();
      return;
    }
    this.#unmountActive();
    this.#activeId = id;
    this.#header.textContent = module.drawerTitle;
    this.drawer.dataset.open = "true";
    this.#renderActive(module);
    this.#updateButtons();
    this.#onStateChange();
  }

  close(): void {
    if (this.#activeId === null) return;
    this.#unmountActive();
    this.#activeId = null;
    this.drawer.dataset.open = "false";
    this.#updateButtons();
    this.#onStateChange();
  }

  dispose(): void {
    this.close();
    for (const [id, handler] of this.#buttonHandlers) {
      this.#buttons.get(id)?.removeEventListener("click", handler);
    }
    this.#closeButton.removeEventListener("click", this.#closeHandler);
    this.toolbarRoot.remove();
    this.drawer.remove();
    this.#styleElement.remove();
  }

  #addToolbarButton(module: UiModule): void {
    const button = this.#document.createElement("button");
    button.type = "button";
    button.dataset.codexUiAction = module.id;
    button.setAttribute("aria-label", module.toolbarLabel);
    button.setAttribute("aria-pressed", "false");
    button.title = module.toolbarLabel;
    button.append(module.createIcon(this.#document));
    const handler: EventListener = () => this.open(module.id);
    button.addEventListener("click", handler);
    this.toolbarRoot.append(button);
    this.#buttons.set(module.id, button);
    this.#buttonHandlers.set(module.id, handler);
  }

  #renderActive(module: UiModule): void {
    this.#body.replaceChildren();
    const host = this.#document.createElement("div");
    host.dataset.codexUiModuleRoot = module.id;
    const shadowRoot = host.attachShadow({ mode: "open" });
    const baseStyle = this.#document.createElement("style");
    baseStyle.textContent = ":host { display: block; min-width: 0; color: inherit; font: inherit; }";
    shadowRoot.append(baseStyle);
    if (module.styles) {
      const moduleStyle = this.#document.createElement("style");
      moduleStyle.textContent = module.styles;
      shadowRoot.append(moduleStyle);
    }
    this.#body.append(host);
    this.#activeCleanup = module.mount(shadowRoot);
  }

  #unmountActive(): void {
    this.#activeCleanup?.();
    this.#activeCleanup = undefined;
    this.#body.replaceChildren();
  }

  #updateButtons(): void {
    for (const [id, button] of this.#buttons) {
      const active = id === this.#activeId;
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-expanded", String(active));
    }
  }
}
