import { join, resolve } from "node:path";
import { createAdapters } from "../adapters";
import { MediaSkillError } from "../errors";
import { GenerateAssetInputSchema } from "../schemas";
import { AssetStorageService } from "../services/asset-storage-service";
import { NovelAIPromptComposer } from "../services/novelai-prompt-composer";
import { ProviderCapabilityRegistry } from "../services/provider-capability-registry";
import { NovelAIProfileStore } from "../stores/novelai-profile-store";
import { NovelAIPresetStore } from "../stores/novelai-preset-store";
import { ProviderConfigStore } from "../stores/provider-config-store";
import type { CliContext, GenerateAssetInput } from "../types";
import { createRequestId } from "../utils/common";

export class MediaGenerationService {
  readonly configStore: ProviderConfigStore;
  readonly presetStore: NovelAIPresetStore;
  readonly profileStore: NovelAIProfileStore;
  readonly capabilityRegistry: ProviderCapabilityRegistry;
  readonly promptComposer: NovelAIPromptComposer;

  private readonly assetStorage: AssetStorageService;
  private readonly adapters: ReturnType<typeof createAdapters>;

  constructor(readonly context: CliContext) {
    this.configStore = new ProviderConfigStore(context.data_dir);
    this.presetStore = new NovelAIPresetStore(context.data_dir);
    this.profileStore = new NovelAIProfileStore(context.data_dir);
    this.capabilityRegistry = new ProviderCapabilityRegistry();
    this.promptComposer = new NovelAIPromptComposer(this.presetStore, this.profileStore);
    this.assetStorage = new AssetStorageService(context.data_dir);
    this.adapters = createAdapters(this.assetStorage, this.capabilityRegistry);
  }

  static create(rootDir = process.cwd(), dataDir = join(rootDir, "data")) {
    return new MediaGenerationService({
      root_dir: resolve(rootDir),
      data_dir: resolve(dataDir),
    });
  }

  async previewCapabilities(input: {
    provider: GenerateAssetInput["provider"];
    operation: GenerateAssetInput["operation"];
    model?: string;
    request_style?: GenerateAssetInput["provider"] extends "novelai_compatible" ? string : string;
  }) {
    return this.capabilityRegistry.preview({
      provider: input.provider,
      operation: input.operation,
      model: input.model,
      request_style: input.request_style as never,
    });
  }

  async generate(inputUnknown: unknown) {
    const input = GenerateAssetInputSchema.parse(inputUnknown);
    const config = await this.configStore.requireConfig(input.provider);
    const adapter = this.adapters[input.provider];
    if (!adapter) {
      throw new MediaSkillError("UNSUPPORTED_PROVIDER", `Unsupported provider ${input.provider}.`);
    }

    adapter.validateConfig(config);
    const resolvedCapability = adapter.resolveCapabilities(config, input);
    const promptBundle = input.provider.startsWith("novelai")
      ? await this.promptComposer.compose(input)
      : {
          final_positive_prompt: input.prompt,
          final_negative_prompt: input.negative_prompt,
        };

    const resolvedRequest = await adapter.normalizeInput({
      request_id: createRequestId(),
      provider: input.provider,
      operation: input.operation,
      request_style: resolvedCapability.request_style,
      model: resolvedCapability.model,
      config,
      capabilities: resolvedCapability.capabilities,
      input,
      filtered_input: resolvedCapability.filtered_input,
      prompt_bundle: promptBundle,
      source_images: resolvedCapability.source_images,
    });

    const httpRequest = await adapter.buildRequest(resolvedRequest);
    const httpResponse = await adapter.sendRequest(httpRequest, config);
    const parsedResponse = await adapter.parseResponse(httpResponse, resolvedRequest);
    return adapter.saveAssets(resolvedRequest, parsedResponse);
  }
}
