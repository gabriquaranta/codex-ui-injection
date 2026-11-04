import { describe, expect, it, vi } from "vitest";
import type { UiModule } from "../../src/core/contracts.js";
import { ModuleController } from "../../src/core/module-controller.js";
import { ModuleRegistry } from "../../src/core/module-registry.js";

function testModule(id: string, onMount = vi.fn()): UiModule {
  return {
    id,
    toolbarLabel: `Open ${id}`,
    drawerTitle: `${id} panel`,
    createIcon(document) {
      return document.createElementNS("http://www.w3.org/2000/svg", "svg");
    },
    styles: ":host { color: inherit; }",
    mount(root) {
      const view = root.ownerDocument.createElement("p");
      view.textContent = id;
      root.append(view);
      return onMount;
    },
  };
}

describe("ModuleController", () => {
  it("opens, switches, toggles closed, and cleans up each view", () => {
    const cleanupOne = vi.fn();
    const cleanupTwo = vi.fn();
    const one = testModule("one", cleanupOne);
    const two = testModule("two", cleanupTwo);
    const controller = new ModuleController(document, new ModuleRegistry([one, two]), vi.fn());
    document.body.append(controller.toolbarRoot, controller.drawer);

    controller.open("one");
    expect(controller.activeId).toBe("one");
    expect(controller.drawer.dataset.open).toBe("true");
    expect(controller.drawer.querySelector("h2")?.textContent).toBe("one panel");
    expect(controller.drawer.querySelector("[data-codex-ui-module-root='one']")?.shadowRoot?.textContent).toContain("one");

    controller.open("two");
    expect(cleanupOne).toHaveBeenCalledOnce();
    expect(controller.activeId).toBe("two");
    expect(controller.drawer.querySelector("h2")?.textContent).toBe("two panel");

    controller.open("two");
    expect(cleanupTwo).toHaveBeenCalledOnce();
    expect(controller.activeId).toBeNull();
    expect(controller.drawer.dataset.open).toBe("false");
    expect(controller.toolbarRoot.querySelector('[data-codex-ui-action="two"]')?.getAttribute("aria-pressed")).toBe("false");
    controller.dispose();
  });

  it("keeps optional CSS inside the module shadow root", () => {
    const controller = new ModuleController(document, new ModuleRegistry([testModule("sample")]), vi.fn());
    document.body.append(controller.toolbarRoot, controller.drawer);
    controller.open("sample");

    const shadow = controller.drawer.querySelector("[data-codex-ui-module-root]")?.shadowRoot;
    expect([...shadow?.querySelectorAll("style") || []].some((style) => style.textContent?.includes(":host { color: inherit; }"))).toBe(true);
    controller.dispose();
  });
});
