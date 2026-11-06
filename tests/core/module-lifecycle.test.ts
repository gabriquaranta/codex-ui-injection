import { describe, expect, it, vi } from "vitest";
import type { ModuleContext, UiModule } from "../../src/core/contracts.js";
import { activateModules } from "../../src/core/module-lifecycle.js";
import { ModuleRegistry } from "../../src/core/module-registry.js";
import { emptyPanelModule } from "../../src/modules/empty-panel/index.js";

describe("module lifecycle", () => {
  it("activates only enabled modules and cleans them up in reverse order", () => {
    const calls: string[] = [];
    const modules: UiModule[] = ["first", "disabled", "last"].map((id) => ({
      id,
      activate() {
        calls.push(`activate ${id}`);
        return () => calls.push(`cleanup ${id}`);
      },
    }));
    const context: ModuleContext = { document, registerPanel: vi.fn(), registerPopover: vi.fn(), registerResponseRootHandler: vi.fn(), setChatBackground: vi.fn(), setWorkspaceBackground: vi.fn() };
    const enabled = ModuleRegistry.fromEnabled(modules, ["first", "last"]);
    const dispose = activateModules(enabled.all(), context);
    dispose();
    dispose();
    expect(calls).toEqual(["activate first", "activate last", "cleanup last", "cleanup first"]);
  });

  it("registers the panel when its module activates", () => {
    const registerPanel = vi.fn();
    const dispose = activateModules([emptyPanelModule], { document, registerPanel, registerPopover: vi.fn(), registerResponseRootHandler: vi.fn(), setChatBackground: vi.fn(), setWorkspaceBackground: vi.fn() });
    expect(registerPanel).toHaveBeenCalledWith(expect.objectContaining({ id: "empty-panel" }));
    dispose();
  });
});
