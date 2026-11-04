import { CodexAdapter } from "../codex/adapter.js";
import { ModuleRegistry } from "../core/module-registry.js";
import { emptyPanelModule } from "../modules/empty-panel/index.js";
import { BUILD_VERSION } from "../shared/version.js";

const modules = new ModuleRegistry([emptyPanelModule]);

function startRenderer(): void {
  const force = window.__codexUiForce === true;
  if (window.__codexUiRuntime?.version === BUILD_VERSION && !force) return;

  window.__codexUiRuntime?.dispose();
  window.__codexSidePanelCleanup?.();
  for (const cleanup of window.__codexSidePanelCleanups || []) cleanup();

  const legacyStyle = document.createElement("style");
  legacyStyle.dataset.codexUiLegacyCleanup = "";
  legacyStyle.textContent = "#codex-side-poc-button, #codex-side-poc-panel { display: none !important; flex: 0 0 0 !important; width: 0 !important; }";
  document.head.append(legacyStyle);

  const adapter = new CodexAdapter(document, modules);
  adapter.start();
  window.__codexUiRuntime = {
    version: BUILD_VERSION,
    dispose() {
      adapter.dispose();
      legacyStyle.remove();
      delete window.__codexUiRuntime;
    },
  };
  delete window.__codexUiForce;
}

startRenderer();
