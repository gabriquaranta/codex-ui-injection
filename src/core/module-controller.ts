import type { Cleanup, UiPanel, UiPopover } from "./contracts.js";
import { ModuleRegistry } from "./module-registry.js";

export class ModuleController {
  readonly toolbarRoot: HTMLDivElement;
  readonly popoverToolbarRoot: HTMLDivElement;
  readonly drawer: HTMLElement;
  readonly popoverStack: HTMLDivElement;
  readonly #document: Document;
  readonly #registry: ModuleRegistry<UiPanel>;
  readonly #popoverButtons = new Map<string, HTMLButtonElement>();
  readonly #openPopovers = new Map<string, { host: HTMLElement; cleanup: Cleanup | void }>();
  readonly #escapeHandler: EventListener;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #buttonHandlers = new Map<string, EventListener>();
  readonly #onStateChange: () => void;
  readonly #body: HTMLDivElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #closeHandler: EventListener;
  readonly #styleElement: HTMLStyleElement;
  #activeId: string | null = null;
  #activeCleanup: Cleanup | void = undefined;
  #popoversSuspended = false;

  constructor(document: Document, registry: ModuleRegistry<UiPanel>, onStateChange: () => void, popovers: readonly UiPopover[] = []) {
    this.#document = document;
    this.#registry = registry;
    this.#onStateChange = onStateChange;
    this.toolbarRoot = document.createElement("div");
    this.toolbarRoot.dataset.codexUiToolbar = "";
    this.popoverToolbarRoot = document.createElement("div");
    this.popoverToolbarRoot.dataset.codexUiPopoverToolbar = "";

    this.popoverStack = document.createElement("div");
    this.popoverStack.dataset.codexUiPopovers = "";
    this.#escapeHandler = (event) => {
      if (this.#popoversSuspended || (event as KeyboardEvent).key !== "Escape") return;
      const id = [...this.#openPopovers.keys()].at(-1);
      if (id) this.#closePopover(id);
    };
    document.addEventListener("keydown", this.#escapeHandler);

    this.drawer = document.createElement("aside");
    this.drawer.dataset.codexUiDrawer = "";
    this.drawer.dataset.open = "false";
    this.drawer.setAttribute("aria-label", "Feature panel");

    this.#closeButton = document.createElement("button");
    this.#closeButton.type = "button";
    this.#closeButton.dataset.codexUiClose = "";
    this.#closeButton.setAttribute("aria-label", "Close panel");
    this.#closeButton.title = "Close panel";
    this.#closeButton.textContent = "×";

    this.#body = document.createElement("div");
    this.#body.dataset.codexUiBody = "";
    this.drawer.append(this.#body);

    this.#closeHandler = () => this.close();
    this.#closeButton.addEventListener("click", this.#closeHandler);

    for (const module of registry.all()) this.#addToolbarButton(module);
    for (const popover of popovers) {
      if (registry.get(popover.id) || this.#popoverButtons.has(popover.id)) throw new Error(`Duplicate UI action id: ${popover.id}`);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.codexUiAction = popover.id;
      button.setAttribute("aria-label", popover.toolbarLabel);
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-pressed", "false");
      button.title = popover.toolbarLabel;
      button.append(popover.createIcon(document));
      button.addEventListener("click", () => this.#togglePopover(popover));
      this.popoverToolbarRoot.append(button);
      this.#popoverButtons.set(popover.id, button);
    }

    this.#styleElement = document.createElement("style");
    this.#styleElement.dataset.codexUiStyles = "";
    this.#styleElement.textContent = `
      :root[data-codex-ui-home-chat]:has([data-codex-ui-drawer][data-open="true"]) [data-app-shell-active-page="true"] [data-app-shell-thread-edge-divider] { max-width: 100%; }
      :root[data-codex-ui-home-chat]:has([data-codex-ui-drawer][data-open="true"]) [data-app-shell-main-titlebar] { --app-shell-page-inline-end-inset: var(--codex-ui-drawer-width); }
      :root[data-codex-ui-home-chat]:has([data-codex-ui-drawer][data-open="true"]) [data-app-shell-active-page="true"] [data-app-shell-main-surface="default"] { clip-path: none; border-start-end-radius: 0; border-end-end-radius: 0; }
      :root[data-codex-ui-home-chat]:has([data-codex-ui-drawer][data-open="true"]) [data-app-shell-titlebar-slot="content"][data-app-shell-focus-area="right-panel"] { translate: calc(-1 * var(--codex-ui-drawer-width)) 0; }
      [data-codex-ui-toolbar], [data-codex-ui-popover-toolbar] { display: contents; }
      [data-codex-ui-popovers] { position: fixed; box-sizing: content-box; padding: 32px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; pointer-events: none; font: inherit; }
      [data-codex-ui-popover] { flex: none; box-sizing: border-box; pointer-events: auto; color: var(--color-text-primary, CanvasText); overflow: hidden; font: inherit; }
      [data-codex-ui-action] { width: 28px; height: 28px; flex: 0 0 28px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
      [data-codex-ui-action]:hover, [data-codex-ui-action][aria-pressed="true"] { background: var(--color-background-primary-surface, rgba(127,127,127,.12)); }
      [data-codex-ui-action][aria-pressed="true"] { color: var(--color-text-primary, inherit); }
      [data-codex-ui-action]:focus-visible { outline: 2px solid var(--color-ring-primary, #5b9cff); outline-offset: 2px; }
      [data-codex-ui-action] svg { width: 16px; height: 16px; }
      [data-codex-ui-drawer] { position: relative; box-sizing: border-box; width: min(360px, 42vw); min-width: min(280px, 42vw); max-width: 42vw; flex: 0 0 min(360px, 42vw); align-self: flex-start; flex-direction: column; overflow: hidden; border-start-end-radius: var(--radius-xl-base, 12px); border-end-end-radius: var(--radius-xl-base, 12px); color: var(--color-text-primary, CanvasText); background: var(--app-color-background-elevated-secondary, Canvas); border-left: 1px solid var(--color-background-primary-surface, rgba(127,127,127,.12)); font: inherit; }
      [data-codex-ui-resize] { position: absolute; inset: 0 auto 0 0; width: 8px; cursor: col-resize; touch-action: none; z-index: 1; }
      [data-codex-ui-resize]:hover::before, [data-codex-ui-resize]:focus-visible::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 1px; background: var(--color-ring-primary, #5b9cff); opacity: .6; }
      [data-codex-ui-drawer][data-open="true"] { display: flex; }
      [data-codex-ui-drawer][data-open="false"] { display: none; }
      [data-codex-ui-body] { min-height: 0; flex: 1; overflow: auto; }
      [data-codex-ui-module-root] { display: block; min-width: 0; color: inherit; font: inherit; }
    `;
    document.head.append(this.#styleElement);
  }

  get activeId(): string | null {
    return this.#activeId;
  }

  setToolbarClass(className: string): void {
    for (const button of [...this.#buttons.values(), ...this.#popoverButtons.values()]) button.className = className;
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
    this.drawer.setAttribute("aria-label", module.drawerTitle);
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
    this.closePopovers();
    this.#document.removeEventListener("keydown", this.#escapeHandler);
    this.popoverStack.remove();
    this.popoverToolbarRoot.remove();
    for (const [id, handler] of this.#buttonHandlers) {
      this.#buttons.get(id)?.removeEventListener("click", handler);
    }
    this.#closeButton.removeEventListener("click", this.#closeHandler);
    this.toolbarRoot.remove();
    this.drawer.remove();
    this.#styleElement.remove();
  }

  closePopovers(): void {
    for (const id of [...this.#openPopovers.keys()]) this.#closePopover(id);
  }

  setPopoversSuspended(suspended: boolean): void {
    if (this.#popoversSuspended === suspended) return;
    this.#popoversSuspended = suspended;
    this.popoverStack.inert = suspended;
    this.popoverStack.style.zIndex = suspended ? "1" : "";
  }

  #togglePopover(popover: UiPopover): void {
    if (this.#openPopovers.has(popover.id)) {
      this.#closePopover(popover.id);
      return;
    }
    const host = this.#document.createElement("section");
    host.dataset.codexUiPopover = popover.id;
    host.className = "rounded-2xl extension:border extension:border-default extension:shadow-md bg-surface-elevated-secondary electron:elevation-prominent";
    host.setAttribute("aria-label", popover.toolbarLabel);
    const root = host.attachShadow({ mode: "open" });
    const style = this.#document.createElement("style");
    style.textContent = `:host { display: block; color: inherit; font: inherit; } ${popover.styles ?? ""}`;
    root.append(style);
    this.popoverStack.append(host);
    const cleanup = popover.mount(root);
    this.#openPopovers.set(popover.id, { host, cleanup });
    const button = this.#popoverButtons.get(popover.id)!;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-pressed", "true");
  }

  #closePopover(id: string): void {
    const popover = this.#openPopovers.get(id);
    if (!popover) return;
    popover.cleanup?.();
    popover.host.remove();
    this.#openPopovers.delete(id);
    const button = this.#popoverButtons.get(id)!;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
  }

  #addToolbarButton(module: UiPanel): void {
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

  #renderActive(module: UiPanel): void {
    this.#body.replaceChildren();
    const host = this.#document.createElement("div");
    host.dataset.codexUiModuleRoot = module.id;
    const shadowRoot = host.attachShadow({ mode: "open" });
    const baseStyle = this.#document.createElement("style");
    baseStyle.textContent = `
      :host { display: block; position: relative; min-width: 0; min-height: 100%; color: inherit; font: inherit; }
      [data-codex-ui-close] { position: absolute; top: 12px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 20px; }
      [data-codex-ui-close]:hover { background: var(--color-background-primary-surface, rgba(127,127,127,.12)); }
      [data-codex-ui-close]:focus-visible { outline: 2px solid var(--color-ring-primary, #5b9cff); outline-offset: 2px; }
    `;
    shadowRoot.append(baseStyle);
    if (module.styles) {
      const moduleStyle = this.#document.createElement("style");
      moduleStyle.textContent = module.styles;
      shadowRoot.append(moduleStyle);
    }
    shadowRoot.append(this.#closeButton);
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
