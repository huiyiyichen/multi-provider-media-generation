import { describe, expect, it } from "vitest";
import { MediaSkillError } from "../src/errors";
import { ProviderCapabilityRegistry } from "../src/services/provider-capability-registry";
import type { GenerateAssetInput, ProviderConfig } from "../src/types";

const registry = new ProviderCapabilityRegistry();

const baseConfig = (provider: ProviderConfig["provider"]): ProviderConfig => ({
  provider,
  api_key: "secret-key",
  base_url: "https://example.invalid",
  auth_strategy: "bearer",
});

describe("ProviderCapabilityRegistry", () => {
  it("resolves the novelai_official txt2img descriptor", () => {
    const result = registry.resolve(baseConfig("novelai_official"), {
      provider: "novelai_official",
      operation: "txt2img",
      prompt: "hello",
    });

    expect(result.capabilities.supports_txt2img).toBe(true);
    expect(result.capabilities.supports_presets).toBe(true);
    expect(result.capabilities.allowed_fields).toContain("profile_name");
    expect(result.request_style).toBe("official");
  });

  it("rejects unsupported operations without silently downgrading", () => {
    expect(() =>
      registry.resolve(baseConfig("novelai_official"), {
        provider: "novelai_official",
        operation: "img2img",
        source_image: { type: "base64", value: "aGVsbG8=" },
      } as GenerateAssetInput),
    ).toThrowError(MediaSkillError);
  });

  it("rejects forbidden minimal-provider fields on nanobanana", () => {
    expect(() =>
      registry.resolve(baseConfig("nanobanana"), {
        provider: "nanobanana",
        operation: "txt2img",
        prompt: "hello",
        negative_prompt: "forbidden",
      }),
    ).toThrowError(/does not support/);
  });

  it("requires exactly one source image for grok video", () => {
    const config: ProviderConfig = {
      ...baseConfig("grok_imagine"),
      allowed_models: ["grok-imagine-1.0-video"],
    };

    expect(() =>
      registry.resolve(config, {
        provider: "grok_imagine",
        operation: "img2video",
        model: "grok-imagine-1.0-video",
      }),
    ).toThrowError(/requires at least one source image/);

    expect(() =>
      registry.resolve(config, {
        provider: "grok_imagine",
        operation: "img2video",
        model: "grok-imagine-1.0-video",
        source_images: [
          { type: "base64", value: "aGVsbG8=" },
          { type: "base64", value: "d29ybGQ=" },
        ],
      }),
    ).toThrowError(/accepts at most 1 source image/);
  });

  it("allows nanobanana model selection only from configured models", () => {
    const config: ProviderConfig = {
      ...baseConfig("nanobanana"),
      default_model: "gemini-3-pro-image-preview",
      allowed_models: ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"],
    };

    const result = registry.resolve(config, {
      provider: "nanobanana",
      operation: "txt2img",
      prompt: "hello",
      model: "gemini-3.1-flash-image-preview",
    });

    expect(result.model).toBe("gemini-3.1-flash-image-preview");
    expect(result.filtered_input.model).toBe("gemini-3.1-flash-image-preview");

    expect(() =>
      registry.resolve(config, {
        provider: "nanobanana",
        operation: "txt2img",
        prompt: "hello",
        model: "not-allowed-model",
      }),
    ).toThrowError(/not allowed/);
  });

  it("enables style-template declared compatible features", () => {
    const config: ProviderConfig = {
      ...baseConfig("novelai_compatible"),
      request_style: "oai_images",
      style_templates: {
        oai_images: {
          endpoint: "/images/generations",
          supports_n: true,
          supports_response_format: true,
          supports_size: true,
        },
      },
    };

    const result = registry.resolve(config, {
      provider: "novelai_compatible",
      operation: "txt2img",
      prompt: "hello",
      n: 2,
      response_format: "b64_json",
      size: "1024x1024",
    });

    expect(result.capabilities.supports_n).toBe(true);
    expect(result.capabilities.allowed_fields).toContain("n");
    expect(result.capabilities.allowed_fields).toContain("response_format");
  });

  it("supports nai_compatible chat-completions style fields", () => {
    const config: ProviderConfig = {
      ...baseConfig("novelai_compatible"),
      request_style: "nai_compatible",
      style_templates: {
        nai_compatible: {
          endpoint: "/v1/chat/completions",
          supports_size: true,
          supports_width_height: true,
        },
      },
    };

    const result = registry.resolve(config, {
      provider: "novelai_compatible",
      operation: "txt2img",
      prompt: "1girl",
      profile_name: "anime-default",
      model: "nai-diffusion-4-5-full",
      size: "1024:1024",
      steps: 28,
      cfg_scale: 6,
      sampler: "Euler Ancestral",
    });

    expect(result.capabilities.allowed_fields).toContain("profile_name");
    expect(result.capabilities.allowed_fields).toContain("size");
    expect(result.capabilities.allowed_fields).toContain("cfg_scale");
    expect(result.capabilities.allowed_fields).toContain("sampler");
  });
});
