import { afterEach, describe, expect, it } from "vitest";
import { createAdapters } from "../src/adapters";
import { AssetStorageService } from "../src/services/asset-storage-service";
import { ProviderCapabilityRegistry } from "../src/services/provider-capability-registry";
import type { ProviderConfig } from "../src/types";
import { makeTempDir, removeTempDir } from "./test-helpers";

const tempDirs: string[] = [];
const previousClipboardEnv = process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL;

afterEach(async () => {
  process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL = previousClipboardEnv;
  while (tempDirs.length > 0) {
    await removeTempDir(tempDirs.pop()!);
  }
});

describe("adapter request mapping", () => {
  it("keeps provider separate from the remote model and only forwards whitelisted fields", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const adapters = createAdapters(new AssetStorageService(dir), new ProviderCapabilityRegistry());

    const config: ProviderConfig = {
      provider: "grok_imagine",
      api_key: "secret",
      base_url: "https://example.invalid",
      auth_strategy: "bearer",
      allowed_models: ["grok-imagine-1.0"],
    };

    const resolved = adapters.grok_imagine.resolveCapabilities(config, {
      provider: "grok_imagine",
      operation: "txt2img",
      model: "grok-imagine-1.0",
      prompt: "hello",
      n: 2,
    });

    const request = await adapters.grok_imagine.buildRequest({
      request_id: "req-1",
      provider: "grok_imagine",
      operation: "txt2img",
      request_style: resolved.request_style,
      model: resolved.model,
      config,
      capabilities: resolved.capabilities,
      input: {
        provider: "grok_imagine",
        operation: "txt2img",
        model: "grok-imagine-1.0",
        prompt: "hello",
        n: 2,
      },
      filtered_input: resolved.filtered_input,
      prompt_bundle: { final_positive_prompt: "hello" },
      source_images: [],
    });

    expect(request.json).toEqual({
      model: "grok-imagine-1.0",
      prompt: "hello",
      n: 2,
    });
    expect(request.json).not.toHaveProperty("provider");
  });

  it("maps novelai nai_compatible to chat/completions style fields", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const adapters = createAdapters(new AssetStorageService(dir), new ProviderCapabilityRegistry());

    const config: ProviderConfig = {
      provider: "novelai_compatible",
      api_key: "secret",
      base_url: "https://example.invalid",
      auth_strategy: "bearer",
      request_style: "nai_compatible",
      style_templates: {
        nai_compatible: {
          endpoint: "/v1/chat/completions",
        },
      },
    };

    const resolved = adapters.novelai_compatible.resolveCapabilities(config, {
      provider: "novelai_compatible",
      operation: "txt2img",
      prompt: "1girl, thick eyebrows",
      model: "nai-diffusion-4-5-full",
      size: "1024:1024",
      steps: 28,
      cfg_scale: 6,
      sampler: "Euler Ancestral",
    });

    const request = await adapters.novelai_compatible.buildRequest({
      request_id: "req-nai",
      provider: "novelai_compatible",
      operation: "txt2img",
      request_style: resolved.request_style,
      model: resolved.model,
      config,
      capabilities: resolved.capabilities,
      input: {
        provider: "novelai_compatible",
        operation: "txt2img",
        prompt: "1girl, thick eyebrows",
        model: "nai-diffusion-4-5-full",
        size: "1024:1024",
        steps: 28,
        cfg_scale: 6,
        sampler: "Euler Ancestral",
      },
      filtered_input: resolved.filtered_input,
      prompt_bundle: {
        final_positive_prompt: "1girl, thick eyebrows, artist:alpha",
        final_negative_prompt: "lowres, blurry",
      },
      source_images: [],
    });

    expect(request.url).toBe("https://example.invalid/v1/chat/completions");
    expect(request.json).toMatchObject({
      model: "nai-diffusion-4-5-full",
      size: "1024:1024",
      image_size: "1024:1024",
      steps: 28,
      scale: 6,
      sampler: "Euler Ancestral",
      negative_prompt: "lowres, blurry",
      stream: false,
    });
    expect(request.json).not.toHaveProperty("provider");

    const messages = request.json.messages as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("1girl, thick eyebrows, artist:alpha");
  });

  it("parses image urls returned in choices message content", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const adapters = createAdapters(new AssetStorageService(dir), new ProviderCapabilityRegistry());

    const parsed = adapters.novelai_compatible.parseResponse({
      status: 200,
      ok: true,
      content_type: "application/json",
      headers: new Headers(),
      json_body: {
        choices: [
          {
            message: {
              role: "assistant",
              content: "https://example.invalid/generated.png",
            },
          },
        ],
      },
    });

    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]).toMatchObject({
      kind: "image",
      data_type: "url",
      value: "https://example.invalid/generated.png",
    });
  });

  it("maps nanobanana to chat/completions and honors an input-selected allowed model", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const adapters = createAdapters(new AssetStorageService(dir), new ProviderCapabilityRegistry());

    const config: ProviderConfig = {
      provider: "nanobanana",
      api_key: "secret",
      base_url: "https://example.invalid/v1",
      auth_strategy: "bearer",
      default_model: "internal-model",
      allowed_models: ["internal-model", "alt-model"],
      fixed_fields: {
        temperature: 0.7,
      },
    };

    const resolved = adapters.nanobanana.resolveCapabilities(config, {
      provider: "nanobanana",
      operation: "img2img",
      prompt: "touch up",
      model: "alt-model",
      source_image: { type: "base64", value: "aGVsbG8=" },
    });

    const request = await adapters.nanobanana.buildRequest({
      request_id: "req-2",
      provider: "nanobanana",
      operation: "img2img",
      request_style: resolved.request_style,
      model: resolved.model,
      config,
      capabilities: resolved.capabilities,
      input: {
        provider: "nanobanana",
        operation: "img2img",
        prompt: "touch up",
        model: "alt-model",
        source_image: { type: "base64", value: "aGVsbG8=" },
      },
      filtered_input: resolved.filtered_input,
      prompt_bundle: { final_positive_prompt: "touch up" },
      source_images: resolved.source_images,
    });

    expect(request.url).toBe("https://example.invalid/v1/chat/completions");
    expect(request.json).toMatchObject({
      temperature: 0.7,
      model: "alt-model",
      stream: true,
      stream_options: {
        include_usage: true,
      },
    });
    expect(request.json).not.toHaveProperty("negative_prompt");
    expect(request.json).not.toHaveProperty("provider");
    expect(request.json).toHaveProperty("messages");

    const typedMessages = request.json.messages as Array<Record<string, unknown>>;
    expect(typedMessages).toHaveLength(1);
    expect(Array.isArray(typedMessages[0].content)).toBe(true);
  });

  it("uses the current clipboard image when source_image.type is clipboard", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const adapters = createAdapters(new AssetStorageService(dir), new ProviderCapabilityRegistry());
    process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL = "data:image/png;base64,aGVsbG8=";

    const config: ProviderConfig = {
      provider: "nanobanana",
      api_key: "secret",
      base_url: "https://example.invalid/v1",
      auth_strategy: "bearer",
      default_model: "internal-model",
    };

    const resolved = adapters.nanobanana.resolveCapabilities(config, {
      provider: "nanobanana",
      operation: "img2img",
      prompt: "night neon",
      source_image: { type: "clipboard", value: "current" },
    });

    const request = await adapters.nanobanana.buildRequest({
      request_id: "req-3",
      provider: "nanobanana",
      operation: "img2img",
      request_style: resolved.request_style,
      model: resolved.model,
      config,
      capabilities: resolved.capabilities,
      input: {
        provider: "nanobanana",
        operation: "img2img",
        prompt: "night neon",
        source_image: { type: "clipboard", value: "current" },
      },
      filtered_input: resolved.filtered_input,
      prompt_bundle: { final_positive_prompt: "night neon" },
      source_images: resolved.source_images,
    });

    const messages = request.json.messages as Array<Record<string, unknown>>;
    const content = messages[0].content as Array<Record<string, unknown>>;
    const imagePart = content.find((part) => part.type === "image_url");
    expect(imagePart).toBeDefined();
    expect((imagePart?.image_url as Record<string, unknown>).url).toBe("data:image/png;base64,aGVsbG8=");
  });
});