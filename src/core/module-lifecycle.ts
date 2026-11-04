import type { Cleanup, ModuleContext, UiModule } from "./contracts.js";

export function activateModules(modules: readonly UiModule[], context: ModuleContext): Cleanup {
  const cleanups: Cleanup[] = [];
  try {
    for (const module of modules) {
      const cleanup = module.activate(context);
      if (cleanup) cleanups.push(cleanup);
    }
  } catch (error) {
    for (const cleanup of cleanups.reverse()) cleanup();
    throw error;
  }
  return () => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  };
}
