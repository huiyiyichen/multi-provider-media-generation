import type { ProviderId } from "../types";
import { AssetStorageService } from "../services/asset-storage-service";
import { ProviderCapabilityRegistry } from "../services/provider-capability-registry";
import { GrokImagineAdapter } from "./grok-imagine-adapter";
import { NanobananaAdapter } from "./nanobanana-adapter";
import { NovelAICompatibleAdapter } from "./novelai-compatible-adapter";
import { NovelAIOfficialAdapter } from "./novelai-official-adapter";

export const createAdapters = (
  assetStorage: AssetStorageService,
  capabilityRegistry: ProviderCapabilityRegistry,
) => ({
  novelai_official: new NovelAIOfficialAdapter("novelai_official", assetStorage, capabilityRegistry),
  novelai_compatible: new NovelAICompatibleAdapter("novelai_compatible", assetStorage, capabilityRegistry),
  nanobanana: new NanobananaAdapter("nanobanana", assetStorage, capabilityRegistry),
  grok_imagine: new GrokImagineAdapter("grok_imagine", assetStorage, capabilityRegistry),
});

export type AdapterMap = ReturnType<typeof createAdapters>;
export type AdapterProvider = ProviderId;
