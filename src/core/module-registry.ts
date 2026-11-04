import type { UiModule } from "./contracts.js";

export class ModuleRegistry {
  readonly #modules: readonly UiModule[];
  readonly #byId: ReadonlyMap<string, UiModule>;

  constructor(modules: readonly UiModule[]) {
    const byId = new Map<string, UiModule>();
    for (const module of modules) {
      if (!module.id.trim()) throw new Error("UI module id must not be empty.");
      if (byId.has(module.id)) throw new Error(`Duplicate UI module id: ${module.id}`);
      byId.set(module.id, module);
    }
    this.#modules = Object.freeze([...modules]);
    this.#byId = byId;
  }

  all(): readonly UiModule[] {
    return this.#modules;
  }

  get(id: string): UiModule | undefined {
    return this.#byId.get(id);
  }
}
