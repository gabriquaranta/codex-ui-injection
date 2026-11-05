import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodexAdapter } from "../../src/codex/adapter.js";
import { ModuleRegistry } from "../../src/core/module-registry.js";
import { emptyPanel } from "../../src/modules/empty-panel/index.js";

const fixture = readFileSync("tests/fixtures/codex.html", "utf8");

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x, toJSON: () => ({}) } as DOMRect;
}

describe("CodexAdapter", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = fixture.match(/<html[^>]*>([\s\S]*)<\/html>/i)?.[1] || "";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    document.querySelector(".layout")!.getBoundingClientRect = () => rect(0, 0, 1600, 1000);
    document.querySelector("main")!.getBoundingClientRect = () => rect(220, 44, 1380, 956);
    document.querySelector(".last-toolbar-group")!.getBoundingClientRect = () => rect(1502, 8, 28, 28);
    document.querySelector<HTMLButtonElement>('[aria-label="Chat actions"]')!.getBoundingClientRect = () => rect(1400, 8, 28, 28);
    document.querySelector<HTMLButtonElement>('[aria-label="View chat usage"]')!.getBoundingClientRect = () => rect(1434, 8, 28, 28);
    document.querySelector<HTMLButtonElement>('[aria-label="Toggle pinned summary"]')!.getBoundingClientRect = () => rect(1468, 8, 28, 28);
    document.querySelector<HTMLButtonElement>('[aria-label="Show tabs"]')!.getBoundingClientRect = () => rect(1502, 8, 28, 28);
  });

  it("mounts module actions last in the toolbar slot and the drawer in the flex layout", () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();

    const anchor = document.querySelector('button[aria-label="Chat actions"]')!;
    const action = document.querySelector('[data-codex-ui-action="empty-panel"]')!;
    const toolbarRoot = document.querySelector("[data-codex-ui-toolbar]")!;
    const drawer = document.querySelector("[data-codex-ui-drawer]")!;
    expect(action.parentElement).toBe(toolbarRoot);
    expect(toolbarRoot.parentElement).toBe(document.querySelector(".last-toolbar-group"));
    expect(toolbarRoot.parentElement?.lastElementChild).toBe(toolbarRoot);
    expect(drawer.parentElement).toBe(document.querySelector(".layout"));

    action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect((drawer as HTMLElement).style.marginTop).toBe("44px");
    adapter.dispose();
  });

  it("places popovers beside the summary action and below the native summary", async () => {
    const popover = {
      id: "popover",
      toolbarLabel: "Popover",
      createIcon: (document: Document) => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      mount: () => {},
    };
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]), [popover]);
    adapter.start();
    const summaryButton = document.querySelector<HTMLButtonElement>('[data-thread-summary-panel-toggle]')!;
    const action = document.querySelector<HTMLButtonElement>('[data-codex-ui-action="popover"]')!;
    expect(action.parentElement?.nextElementSibling).toBe(summaryButton);
    const summary = document.createElement("div");
    summaryButton.setAttribute("aria-pressed", "true");
    summary.dataset.summaryPanelVariant = "summary";
    summary.getBoundingClientRect = () => rect(1280, 52, 300, 316);
    document.querySelector('[data-app-shell-active-page="true"]')!.append(summary);
    await new Promise((resolve) => setTimeout(resolve, 30));
    action.click();
    const stack = document.querySelector<HTMLElement>("[data-codex-ui-popovers]")!;
    expect(stack.style.top).toBe("344px");
    expect(stack.style.right).toBe("-12px");
    expect(stack.style.width).toBe("300px");
    summary.getBoundingClientRect = () => rect(1500, 52, 300, 316);
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stack.style.right).toBe("-24px");
    summary.getBoundingClientRect = () => rect(980, 52, 240, 200);
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stack.style.top).toBe("228px");
    expect(stack.style.width).toBe("240px");
    summaryButton.setAttribute("aria-pressed", "false");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stack.children).toHaveLength(1);
    expect(action.getAttribute("aria-expanded")).toBe("true");
    expect(stack.style.top).toBe("20px");
    adapter.dispose();
  });

  it("removes the panel outside home and restores the action on return", async () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();
    document.querySelector<HTMLButtonElement>('[data-codex-ui-action]')!.click();
    const home = document.querySelector('[data-sidebar-destination="builtin:home"]')!;
    home.removeAttribute("aria-current");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector("[data-codex-ui-drawer]")).toBeNull();
    expect(document.querySelector("[data-codex-ui-toolbar]")).toBeNull();
    home.setAttribute("aria-current", "page");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector("[data-codex-ui-drawer]")?.getAttribute("data-open")).toBe("false");
    expect(document.querySelector("[data-codex-ui-toolbar]")).not.toBeNull();
    adapter.dispose();
  });

  it("detaches chat UI while a modal is open and restores it on close", async () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();
    document.querySelector<HTMLButtonElement>('[data-codex-ui-action]')!.click();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.getBoundingClientRect = () => rect(300, 100, 600, 600);
    document.body.append(modal);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector("[data-codex-ui-toolbar]")).toBeNull();
    expect(document.querySelector("[data-codex-ui-drawer]")).toBeNull();
    expect(document.documentElement.hasAttribute("data-codex-ui-home-chat")).toBe(false);
    expect(document.querySelector<HTMLElement>("main")!.style.minWidth).toBe("");
    modal.remove();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('[data-codex-ui-drawer]')?.getAttribute("data-open")).toBe("false");
    expect(document.documentElement.hasAttribute("data-codex-ui-home-chat")).toBe(true);
    adapter.dispose();
  });

  it("keeps an open popover mounted while a modal is open", async () => {
    const cleanup = vi.fn();
    const popover = {
      id: "popover",
      toolbarLabel: "Popover",
      createIcon: (document: Document) => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      mount: () => cleanup,
    };
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]), [popover]);
    adapter.start();
    const button = document.querySelector<HTMLButtonElement>('[data-codex-ui-action="popover"]')!;
    button.click();
    const card = document.querySelector('[data-codex-ui-popover="popover"]')!;
    const stack = document.querySelector<HTMLElement>("[data-codex-ui-popovers]")!;
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.getBoundingClientRect = () => rect(0, 0, 600, 600);
    document.body.append(modal);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stack.style.zIndex).toBe("1");
    expect(stack.inert).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cleanup).not.toHaveBeenCalled();
    expect(stack.firstElementChild).toBe(card);
    modal.remove();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stack.style.zIndex).toBe("");
    expect(stack.inert).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(stack.firstElementChild).toBe(card);
    button.click();
    expect(cleanup).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("keeps the drawer after pages added during navigation", async () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();
    const layout = document.querySelector(".layout")!;
    const drawer = document.querySelector("[data-codex-ui-drawer]")!;
    const page = document.createElement("div");
    document.querySelector('[data-app-shell-active-page="true"]')!.setAttribute("data-app-shell-active-page", "false");
    page.setAttribute("data-app-shell-active-page", "true");
    page.append(document.querySelector("header")!);
    page.append(document.querySelector("main")!);
    layout.append(page);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(layout.lastElementChild).toBe(drawer);
    expect(drawer.previousElementSibling).toBe(page);
    adapter.dispose();
  });

  it("keeps the toolbar action out of an image viewer", () => {
    const viewer = document.createElement("div");
    viewer.style.display = "flex";
    const close = document.createElement("button");
    close.getBoundingClientRect = () => rect(1560, 8, 28, 28);
    viewer.append(close);
    document.body.append(viewer);

    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();
    expect(document.querySelector("[data-codex-ui-toolbar]")?.parentElement)
      .toBe(document.querySelector(".last-toolbar-group"));
    adapter.dispose();
  });

  it("does not duplicate its UI when mounted more than once", () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();
    adapter.start();

    expect(document.querySelectorAll('[data-codex-ui-action="empty-panel"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-codex-ui-drawer]")).toHaveLength(1);
    adapter.dispose();
  });

  it("keeps the toolbar action at the end when a tab control expands", async () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();

    const toolbarRoot = document.querySelector("[data-codex-ui-toolbar]")!;
    expect(toolbarRoot.parentElement).toBe(document.querySelector(".last-toolbar-group"));
    document.querySelector<HTMLButtonElement>('[aria-label="Show tabs"]')!.getBoundingClientRect = () => rect(1502, 8, 320, 28);
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(toolbarRoot.parentElement).toBe(document.querySelector(".last-toolbar-group"));
    expect(toolbarRoot.parentElement?.lastElementChild).toBe(toolbarRoot);
    adapter.dispose();
  });

  it("resizes the panel by keyboard and preserves the selected width", () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();
    const action = document.querySelector<HTMLButtonElement>('[data-codex-ui-action="empty-panel"]')!;
    const drawer = document.querySelector<HTMLElement>("[data-codex-ui-drawer]")!;
    drawer.getBoundingClientRect = () => rect(1240, 44, Number.parseFloat(drawer.style.width), 956);
    action.click();
    document.querySelector<HTMLElement>("[data-codex-ui-resize]")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(drawer.style.width).toBe("380px");
    action.click();
    action.click();
    expect(drawer.style.width).toBe("380px");
    adapter.dispose();
  });

  it("shrinks the drawer when the remaining chat width is too small and restores styles on close", () => {
    const main = document.querySelector("main")!;
    main.getBoundingClientRect = () => rect(220, 44, 500, 956);
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanel]));
    adapter.start();

    const action = document.querySelector<HTMLButtonElement>('[data-codex-ui-action="empty-panel"]')!;
    const drawer = document.querySelector<HTMLElement>("[data-codex-ui-drawer]")!;
    action.click();
    expect(main.style.minWidth).toBe("0");
    expect(drawer.style.width).toBe("220px");
    expect(document.documentElement.style.getPropertyValue("--codex-ui-drawer-width")).toBe("220px");

    action.click();
    expect(main.style.minWidth).toBe("");
    expect(drawer.style.width).toBe("360px");
    adapter.dispose();
    expect(document.documentElement.style.getPropertyValue("--codex-ui-drawer-width")).toBe("");
  });
});
