import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CodexAdapter } from "../../src/codex/adapter.js";
import { ModuleRegistry } from "../../src/core/module-registry.js";
import { emptyPanelModule } from "../../src/modules/empty-panel/index.js";

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
  });

  it("mounts module actions in the toolbar slot and the drawer in the flex layout", () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanelModule]));
    adapter.start();

    const anchor = document.querySelector('button[aria-label="Chat actions"]')!;
    const action = document.querySelector('[data-codex-ui-action="empty-panel"]')!;
    const toolbarRoot = document.querySelector("[data-codex-ui-toolbar]")!;
    const drawer = document.querySelector("[data-codex-ui-drawer]")!;
    expect(action.parentElement).toBe(toolbarRoot);
    expect(toolbarRoot.parentElement).toBe(anchor.parentElement);
    expect(toolbarRoot.nextElementSibling).toBe(anchor);
    expect(drawer.parentElement).toBe(document.querySelector(".layout"));

    action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect((drawer as HTMLElement).style.marginTop).toBe("44px");
    adapter.dispose();
  });

  it("does not duplicate its UI when mounted more than once", () => {
    const adapter = new CodexAdapter(document, new ModuleRegistry([emptyPanelModule]));
    adapter.start();
    adapter.start();

    expect(document.querySelectorAll('[data-codex-ui-action="empty-panel"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-codex-ui-drawer]")).toHaveLength(1);
    adapter.dispose();
  });
});
