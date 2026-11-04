export class ModuleRegistry<T extends { readonly id: string }> {
  readonly #modules: readonly T[];
  readonly #byId: ReadonlyMap<string, T>;

  constructor(modules: readonly T[]) {
    const byId = new Map<string, T>();
    for (const module of modules) {
      if (!module.id.trim()) throw new Error("UI module id must not be empty.");
      if (byId.has(module.id)) throw new Error(`Duplicate UI module id: ${module.id}`);
      byId.set(module.id, module);
    }
    this.#modules = Object.freeze([...modules]);
    this.#byId = byId;
  }

  static fromEnabled<T extends { readonly id: string }>(modules: readonly T[], enabledIds: readonly string[]): ModuleRegistry<T> {
    const available = new ModuleRegistry(modules);
    const enabled = enabledIds.map((id) => {
      const module = available.get(id);
      if (!module) throw new Error(`Unknown enabled UI module: ${id}`);
      return module;
    });
    return new ModuleRegistry(enabled);
  }

  all(): readonly T[] {
    return this.#modules;
  }

  get(id: string): T | undefined {
    return this.#byId.get(id);
  }
}
