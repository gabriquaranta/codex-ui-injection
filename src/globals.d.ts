declare const __BUILD_VERSION__: string;
declare const __CHAT_BACKGROUND__: string | null;
declare const __WORKSPACE_BACKGROUND__: string | null;

interface Window {
  __codexUiForce?: boolean;
  __codexUiRuntime?: {
    version: string;
    dispose(): void;
  };
  __codexSidePanelCleanup?: () => void;
  __codexSidePanelCleanups?: Array<() => void>;
}
