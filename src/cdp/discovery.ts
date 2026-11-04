import type { CodexTarget } from "../codex/target.js";
import { isMainCodexTarget } from "../codex/target.js";

export const CDP_ENDPOINT = "http://127.0.0.1:9335";

export async function discoverTargets(): Promise<CodexTarget[]> {
  const response = await fetch(`${CDP_ENDPOINT}/json/list`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}.`);
  return response.json() as Promise<CodexTarget[]>;
}

export function findMainTarget(targets: readonly CodexTarget[]): CodexTarget | undefined {
  const matches = targets.filter(isMainCodexTarget);
  return matches.length === 1 ? matches[0] : undefined;
}
