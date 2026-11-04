import { CodexAdapter } from "../codex/adapter.js";
import { ModuleRegistry } from "../core/module-registry.js";
import { emptyPanelModule } from "../modules/empty-panel/index.js";
import { BUILD_VERSION } from "../shared/version.js";

function loadBackground(): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("codex-ui-background", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("images", "readonly");
      const image = transaction.objectStore("images").get("chat");
      image.onsuccess = () => resolve(image.result ?? null);
      image.onerror = () => reject(image.error);
      transaction.oncomplete = () => database.close();
      transaction.onabort = () => database.close();
    };
  });
}

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

  const modules = new ModuleRegistry([emptyPanelModule]);
  const adapter = new CodexAdapter(document, modules);
  adapter.start();
  let disposed = false;
  void loadBackground().then((image) => {
    if (!disposed) adapter.setChatBackground(image, 30);
  }).catch((error: unknown) => console.error("Could not load chat background:", error));
  window.__codexUiRuntime = {
    version: BUILD_VERSION,
    dispose() {
      disposed = true;
      adapter.dispose();
      legacyStyle.remove();
      delete window.__codexUiRuntime;
    },
  };
  delete window.__codexUiForce;
}

startRenderer();
