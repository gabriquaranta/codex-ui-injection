import { describe, expect, it } from "vitest";
import type { UiModule } from "../../src/core/contracts.js";
import { ModuleRegistry } from "../../src/core/module-registry.js";

function moduleWithId(id: string): UiModule {
  return {
    id,
    toolbarLabel: id,
    drawerTitle: id,
    createIcon(document) {
      return document.createElementNS("http://www.w3.org/2000/svg", "svg");
    },
    mount() {},
  };
}

describe("ModuleRegistry", () => {
  it("rejects duplicate module IDs", () => {
    expect(() => new ModuleRegistry([moduleWithId("git"), moduleWithId("git")]))
      .toThrow("Duplicate UI module id: git");
  });

  it("provides modules in registration order and by ID", () => {
    const git = moduleWithId("git");
    const music = moduleWithId("music");
    const registry = new ModuleRegistry([git, music]);

    expect(registry.all()).toEqual([git, music]);
    expect(registry.get("music")).toBe(music);
    expect(registry.get("missing")).toBeUndefined();
  });
});
