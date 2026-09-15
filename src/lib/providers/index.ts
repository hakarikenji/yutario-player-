/**
 * Provider registry — the single source of pluggable catalogs.
 * Add a provider by implementing MusicProvider and registering it here.
 */
import type { MusicProvider } from "./types";
import { jamendoProvider } from "./jamendoProvider";
import { archiveProvider } from "./archiveProvider";
import { ccmixterProvider } from "./ccmixterProvider";

export const PROVIDERS: MusicProvider[] = [jamendoProvider, archiveProvider, ccmixterProvider];

export function getProvider(id: string): MusicProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export type { MusicProvider, FetchOpts, ProviderCapabilities } from "./types";
