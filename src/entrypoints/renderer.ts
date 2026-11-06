import { CodexAdapter } from "../codex/adapter.js";
import { ModuleRegistry } from "../core/module-registry.js";
import { chatBackgroundModule } from "../modules/chat-background/index.js";
import { workspaceBackgroundModule } from "../modules/workspace-background/index.js";
import { activateModules } from "../core/module-lifecycle.js";
import type { UiPanel, UiPopover } from "../core/contracts.js";
import { emptyPopoverModule } from "../modules/empty-popover/index.js";
import { emptyPanelModule } from "../modules/empty-panel/index.js";
import { emptyStreamAnimationModule } from "../modules/empty-stream-animation/index.js";
import { streamGlitchModule } from "../modules/stream-glitch/index.js";
import enabledModuleIds from "../../modules.json" with { type: "json" };
import { BUILD_VERSION } from "../shared/version.js";

function startRenderer(): void {
  const force = window.__codexUiForce === true;
  if (window.__codexUiRuntime?.version === BUILD_VERSION && !force) return;

  window.__codexUiRuntime?.dispose();
  window.__codexSidePanelCleanup?.();
  for (const cleanup of window.__codexSidePanelCleanups || []) cleanup();

  const legacyStyle = document.createElement("style");
  legacyStyle.dataset.codexUiLegacyCleanup = "";
  legacyStyle.textContent = "#codex-side-poc-button, #codex-side-poc-panel { display: none !important; flex: 0 0 0 !important; width: 0 !important; }";
  const modules = ModuleRegistry.fromEnabled([emptyPanelModule, emptyPopoverModule, emptyStreamAnimationModule, chatBackgroundModule, workspaceBackgroundModule, streamGlitchModule], enabledModuleIds);
  const panels: UiPanel[] = [];
  const popovers: UiPopover[] = [];
  const responseRootHandlers: Array<(root: HTMLElement) => (() => void) | void> = [];
  let adapter: CodexAdapter | undefined;
  let background: { image: Blob | null; opacity: number } | undefined;
  let workspaceBackground: { image: Blob | null; opacity: number } | undefined;
  const cleanupModules = activateModules(modules.all(), {
    document,
    registerPanel: (panel) => panels.push(panel),
    registerPopover: (popover) => popovers.push(popover),
    registerResponseRootHandler: (handler) => responseRootHandlers.push(handler),
    setChatBackground: (image, opacity) => {
      background = { image, opacity };
      adapter?.setChatBackground(image, opacity);
    },
    setWorkspaceBackground: (image, opacity) => {
      workspaceBackground = { image, opacity };
      adapter?.setWorkspaceBackground(image, opacity);
    },
  });
  document.head.append(legacyStyle);
  let activeAdapter: CodexAdapter;
  try {
    activeAdapter = new CodexAdapter(document, new ModuleRegistry(panels), popovers, responseRootHandlers);
    adapter = activeAdapter;
    if (background) activeAdapter.setChatBackground(background.image, background.opacity);
    if (workspaceBackground) activeAdapter.setWorkspaceBackground(workspaceBackground.image, workspaceBackground.opacity);
    activeAdapter.start();
  } catch (error) {
    cleanupModules();
    adapter?.dispose();
    legacyStyle.remove();
    throw error;
  }
  window.__codexUiRuntime = {
    version: BUILD_VERSION,
    dispose() {
      cleanupModules();
      activeAdapter.dispose();
      legacyStyle.remove();
      delete window.__codexUiRuntime;
    },
  };
  delete window.__codexUiForce;
}

startRenderer();
