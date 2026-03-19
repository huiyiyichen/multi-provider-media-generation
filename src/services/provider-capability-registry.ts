import { MediaSkillError } from "../errors";
import type {
  CapabilityDescriptor,
  CapabilityDescriptorOverride,
  GenerateAssetInput,
  ProviderConfig,
  ProviderId,
  RequestStyle,
} from "../types";
import {
  collectProvidedFields,
  defaultRequestStyleForProvider,
  mergeStringArrays,
  normalizeSourceImages,
  pickAllowedFields,
} from "../utils/common";

type CapabilityFlags = Pick<
  CapabilityDescriptor,
  | "supports_txt2img"
  | "supports_img2img"
  | "supports_img2video"
  | "supports_multi_image_input"
  | "supports_mask_image"
  | "supports_negative_prompt"
  | "supports_model"
  | "supports_size"
  | "supports_width_height"
  | "supports_steps"
  | "supports_cfg_scale"
  | "supports_seed"
  | "supports_sampler"
  | "supports_n"
  | "supports_response_format"
  | "supports_presets"
  | "supports_raw_prompt_mode"
  | "supports_composed_prompt_mode"
>;

const ALL_FLAGS: CapabilityFlags = {
  supports_txt2img: false,
  supports_img2img: false,
  supports_img2video: false,
  supports_multi_image_input: false,
  supports_mask_image: false,
  supports_negative_prompt: false,
  supports_model: false,
  supports_size: false,
  supports_width_height: false,
  supports_steps: false,
  supports_cfg_scale: false,
  supports_seed: false,
  supports_sampler: false,
  supports_n: false,
  supports_response_format: false,
  supports_presets: false,
  supports_raw_prompt_mode: false,
  supports_composed_prompt_mode: false,
};

const descriptor = (
  input: Omit<CapabilityDescriptor, keyof CapabilityFlags> & Partial<CapabilityFlags>,
): CapabilityDescriptor => ({
  ...ALL_FLAGS,
  ...input,
});

const GROK_MODELS = {
  txt2img: "grok-imagine-1.0",
  img2img: "grok-imagine-1.0-edit",
  img2video: "grok-imagine-1.0-video",
} as const;

export class ProviderCapabilityRegistry {
  resolve(config: ProviderConfig, input: GenerateAssetInput) {
    const requestStyle = this.resolveRequestStyle(config.provider, config);
    const model = this.resolveModel(config, input);
    const base = this.baseDescriptor(config.provider, input.operation, requestStyle, model);
    const withTemplates = this.applyTemplateCapabilities(base, config, requestStyle);
    const capabilities = this.applyOverrides(withTemplates, config.capability_overrides);

    const configuredAllowedModels =
      config.allowed_models ??
      (config.provider === "nanobanana" && config.default_model ? [config.default_model] : undefined);

    if (configuredAllowedModels && model && configuredAllowedModels.length > 0 && !configuredAllowedModels.includes(model)) {
      throw new MediaSkillError(
        "MODEL_NOT_ALLOWED",
        `Model ${model} is not allowed by the provider configuration for ${config.provider}.`,
      );
    }

    if (capabilities.allowed_models.length > 0 && model && !capabilities.allowed_models.includes(model)) {
      throw new MediaSkillError(
        "MODEL_NOT_ALLOWED",
        `Model ${model} is not supported for ${config.provider} / ${input.operation}.`,
      );
    }

    const sourceImages = normalizeSourceImages(input);
    const providedFields = collectProvidedFields(input);
    const unsupportedFields = providedFields.filter((field) => !capabilities.allowed_fields.includes(field));

    if (unsupportedFields.length > 0) {
      throw new MediaSkillError(
        "UNSUPPORTED_FIELD",
        `${config.provider} / ${input.operation} does not support: ${unsupportedFields.join(", ")}.`,
      );
    }

    const missingFields = capabilities.required_fields.filter(
      (field) => input[field as keyof GenerateAssetInput] === undefined,
    );
    if (missingFields.length > 0) {
      throw new MediaSkillError(
        "REQUIRED_FIELD_MISSING",
        `Missing required field(s): ${missingFields.join(", ")}.`,
      );
    }

    if (capabilities.requires_source_image && sourceImages.length === 0) {
      throw new MediaSkillError(
        "SOURCE_IMAGE_REQUIRED",
        `${config.provider} / ${input.operation} requires at least one source image.`,
      );
    }

    if (sourceImages.length > capabilities.max_input_images) {
      throw new MediaSkillError(
        "TOO_MANY_SOURCE_IMAGES",
        `${config.provider} / ${input.operation} accepts at most ${capabilities.max_input_images} source image(s).`,
      );
    }

    return {
      capabilities,
      request_style: requestStyle,
      model,
      source_images: sourceImages,
      filtered_input: pickAllowedFields(input, capabilities),
    };
  }

  preview(params: {
    provider: ProviderId;
    operation: GenerateAssetInput["operation"];
    model?: string;
    request_style?: RequestStyle;
  }) {
    const styleTemplates =
      params.provider === "novelai_compatible" && params.request_style
        ? ({
            [params.request_style]: {
              endpoint: "/preview",
            },
          } as ProviderConfig["style_templates"])
        : undefined;

    return this.resolve(
      {
        provider: params.provider,
        api_key: "preview-key",
        base_url: "https://example.invalid",
        auth_strategy: "bearer",
        request_style: params.request_style,
        style_templates: styleTemplates,
      },
      {
        provider: params.provider,
        operation: params.operation,
        model: params.model,
      },
    ).capabilities;
  }

  private resolveRequestStyle(provider: ProviderId, config: ProviderConfig) {
    const requestStyle = defaultRequestStyleForProvider(provider, config);

    if (provider === "novelai_compatible" && !requestStyle) {
      throw new MediaSkillError(
        "REQUEST_STYLE_REQUIRED",
        "novelai_compatible requires request_style in the provider config or capability query.",
      );
    }

    return requestStyle;
  }

  private resolveModel(config: ProviderConfig, input: GenerateAssetInput) {
    if (config.provider === "grok_imagine") {
      return input.model ?? config.default_model ?? GROK_MODELS[input.operation];
    }

    return input.model ?? config.default_model;
  }

  private baseDescriptor(
    provider: ProviderId,
    operation: GenerateAssetInput["operation"],
    requestStyle?: RequestStyle,
    model?: string,
  ): CapabilityDescriptor {
    switch (provider) {
      case "novelai_official":
        if (operation !== "txt2img") {
          throw new MediaSkillError("UNSUPPORTED_OPERATION", "novelai_official only supports txt2img.");
        }
        return descriptor({
          key: "novelai_official::official::txt2img",
          provider,
          operation,
          request_style: "official",
          model,
          supports_txt2img: true,
          supports_negative_prompt: true,
          supports_model: true,
          supports_width_height: true,
          supports_steps: true,
          supports_cfg_scale: true,
          supports_seed: true,
          supports_sampler: true,
          supports_presets: true,
          supports_raw_prompt_mode: true,
          supports_composed_prompt_mode: true,
          allowed_fields: [
            "prompt",
            "content_prompt",
            "prompt_mode",
            "profile_name",
            "model",
            "negative_prompt",
            "width",
            "height",
            "steps",
            "cfg_scale",
            "seed",
            "sampler",
            "artist_preset",
            "style_preset",
            "negative_preset",
            "extra_positive",
            "extra_negative",
            "save_raw_response",
          ],
          required_fields: [],
          allowed_models: [],
          max_input_images: 0,
          requires_source_image: false,
        });
      case "novelai_compatible":
        if (operation !== "txt2img") {
          throw new MediaSkillError("UNSUPPORTED_OPERATION", "novelai_compatible only supports txt2img.");
        }
        if (!requestStyle) {
          throw new MediaSkillError("REQUEST_STYLE_REQUIRED", "novelai_compatible requires request_style.");
        }

        if (requestStyle === "oai_images") {
          return descriptor({
            key: `novelai_compatible::${requestStyle}::txt2img`,
            provider,
            operation,
            request_style: requestStyle,
            model,
            supports_txt2img: true,
            supports_negative_prompt: true,
            supports_model: true,
            supports_size: true,
            supports_presets: true,
            supports_raw_prompt_mode: true,
            supports_composed_prompt_mode: true,
            allowed_fields: [
              "prompt",
              "content_prompt",
              "prompt_mode",
              "profile_name",
              "model",
              "negative_prompt",
              "size",
              "artist_preset",
              "style_preset",
              "negative_preset",
              "extra_positive",
              "extra_negative",
              "save_raw_response",
            ],
            required_fields: [],
            allowed_models: [],
            max_input_images: 0,
            requires_source_image: false,
          });
        }

        if (requestStyle === "nai_compatible") {
          return descriptor({
            key: `novelai_compatible::${requestStyle}::txt2img`,
            provider,
            operation,
            request_style: requestStyle,
            model,
            supports_txt2img: true,
            supports_negative_prompt: true,
            supports_model: true,
            supports_size: true,
            supports_width_height: true,
            supports_steps: true,
            supports_cfg_scale: true,
            supports_seed: true,
            supports_sampler: true,
            supports_presets: true,
            supports_raw_prompt_mode: true,
            supports_composed_prompt_mode: true,
            allowed_fields: [
              "prompt",
              "content_prompt",
              "prompt_mode",
              "profile_name",
              "model",
              "negative_prompt",
              "size",
              "width",
              "height",
              "steps",
              "cfg_scale",
              "seed",
              "sampler",
              "artist_preset",
              "style_preset",
              "negative_preset",
              "extra_positive",
              "extra_negative",
              "save_raw_response",
            ],
            required_fields: [],
            allowed_models: [],
            max_input_images: 0,
            requires_source_image: false,
          });
        }

        return descriptor({
          key: `novelai_compatible::${requestStyle}::txt2img`,
          provider,
          operation,
          request_style: requestStyle,
          model,
          supports_txt2img: true,
          supports_negative_prompt: true,
          supports_model: true,
          supports_width_height: true,
          supports_steps: true,
          supports_cfg_scale: true,
          supports_seed: true,
          supports_sampler: true,
          supports_presets: true,
          supports_raw_prompt_mode: true,
          supports_composed_prompt_mode: true,
          allowed_fields: [
            "prompt",
            "content_prompt",
            "prompt_mode",
            "profile_name",
            "model",
            "negative_prompt",
            "width",
            "height",
            "steps",
            "cfg_scale",
            "seed",
            "sampler",
            "artist_preset",
            "style_preset",
            "negative_preset",
            "extra_positive",
            "extra_negative",
            "save_raw_response",
          ],
          required_fields: [],
          allowed_models: [],
          max_input_images: 0,
          requires_source_image: false,
        });
      case "nanobanana":
        if (operation === "txt2img") {
          return descriptor({
            key: "nanobanana::provider::txt2img",
            provider,
            operation,
            model,
            supports_txt2img: true,
            supports_model: true,
            allowed_fields: ["prompt", "model", "save_raw_response"],
            required_fields: ["prompt"],
            allowed_models: [],
            max_input_images: 0,
            requires_source_image: false,
          });
        }
        if (operation === "img2img") {
          return descriptor({
            key: "nanobanana::provider::img2img",
            provider,
            operation,
            model,
            supports_img2img: true,
            supports_model: true,
            allowed_fields: [
              "prompt",
              "model",
              "source_image",
              "source_images",
              "strength",
              "denoise_strength",
              "save_raw_response",
            ],
            required_fields: [],
            allowed_models: [],
            max_input_images: 1,
            requires_source_image: true,
          });
        }
        throw new MediaSkillError("UNSUPPORTED_OPERATION", "nanobanana only supports txt2img and img2img.");
      case "grok_imagine":
        if (model === GROK_MODELS.txt2img) {
          if (operation !== "txt2img") {
            throw new MediaSkillError(
              "UNSUPPORTED_OPERATION",
              "grok-imagine-1.0 only supports txt2img.",
            );
          }
          return descriptor({
            key: `grok_imagine::${model}::txt2img`,
            provider,
            operation,
            model,
            supports_txt2img: true,
            supports_model: true,
            supports_n: true,
            allowed_fields: ["prompt", "model", "n", "save_raw_response"],
            required_fields: ["prompt"],
            allowed_models: [GROK_MODELS.txt2img],
            max_input_images: 0,
            requires_source_image: false,
          });
        }
        if (model === GROK_MODELS.img2img) {
          if (operation !== "img2img") {
            throw new MediaSkillError(
              "UNSUPPORTED_OPERATION",
              "grok-imagine-1.0-edit only supports img2img.",
            );
          }
          return descriptor({
            key: `grok_imagine::${model}::img2img`,
            provider,
            operation,
            model,
            supports_img2img: true,
            supports_model: true,
            allowed_fields: ["prompt", "model", "source_image", "source_images", "save_raw_response"],
            required_fields: [],
            allowed_models: [GROK_MODELS.img2img],
            max_input_images: 1,
            requires_source_image: true,
          });
        }
        if (model === GROK_MODELS.img2video) {
          if (operation !== "img2video") {
            throw new MediaSkillError(
              "UNSUPPORTED_OPERATION",
              "grok-imagine-1.0-video only supports img2video.",
            );
          }
          return descriptor({
            key: `grok_imagine::${model}::img2video`,
            provider,
            operation,
            model,
            supports_img2video: true,
            supports_model: true,
            allowed_fields: ["prompt", "model", "source_image", "source_images", "save_raw_response"],
            required_fields: [],
            allowed_models: [GROK_MODELS.img2video],
            max_input_images: 1,
            requires_source_image: true,
          });
        }
        throw new MediaSkillError("MODEL_REQUIRED", "grok_imagine requires a supported model.");
      default:
        throw new MediaSkillError("UNSUPPORTED_PROVIDER", `Unsupported provider: ${provider}.`);
    }
  }

  private applyTemplateCapabilities(
    capability: CapabilityDescriptor,
    config: ProviderConfig,
    requestStyle?: RequestStyle,
  ) {
    if (config.provider !== "novelai_compatible") {
      return capability;
    }

    if (!requestStyle) {
      throw new MediaSkillError("REQUEST_STYLE_REQUIRED", "novelai_compatible requires request_style.");
    }

    const styleTemplate = config.style_templates?.[requestStyle];
    if (!styleTemplate) {
      throw new MediaSkillError(
        "STYLE_TEMPLATE_REQUIRED",
        `novelai_compatible requires a style_templates.${requestStyle} entry.`,
      );
    }

    let next: CapabilityDescriptor = capability;
    if (styleTemplate.supports_n) {
      next = {
        ...next,
        supports_n: true,
        allowed_fields: mergeStringArrays(next.allowed_fields, ["n"]),
      };
    }

    if (styleTemplate.supports_response_format) {
      next = {
        ...next,
        supports_response_format: true,
        allowed_fields: mergeStringArrays(next.allowed_fields, ["response_format"]),
      };
    }

    return next;
  }

  private applyOverrides(capability: CapabilityDescriptor, override?: CapabilityDescriptorOverride) {
    if (!override) {
      return capability;
    }

    return {
      ...capability,
      ...override,
      allowed_fields: override.allowed_fields
        ? mergeStringArrays(capability.allowed_fields, override.allowed_fields)
        : capability.allowed_fields,
      required_fields: override.required_fields
        ? mergeStringArrays(capability.required_fields, override.required_fields)
        : capability.required_fields,
      allowed_models: override.allowed_models
        ? mergeStringArrays(capability.allowed_models, override.allowed_models)
        : capability.allowed_models,
      max_input_images: override.max_input_images ?? capability.max_input_images,
      requires_source_image: override.requires_source_image ?? capability.requires_source_image,
    };
  }
}


