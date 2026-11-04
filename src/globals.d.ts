declare const __BUILD_VERSION__: string;

interface Window {
  __codexUiForce?: boolean;
  __codexUiRuntime?: {
    version: string;
    dispose(): void;
  };
  __codexSidePanelCleanup?: () => void;
  __codexSidePanelCleanups?: Array<() => void>;
}
