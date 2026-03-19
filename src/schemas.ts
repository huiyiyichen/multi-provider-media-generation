import { z } from "zod";
import { OPERATIONS, PRESET_TYPES, PROVIDERS, REQUEST_STYLES } from "./types";

const StyleTemplateSchema = z
  .object({
    endpoint: z.string().min(1),
    method: z.literal("POST").optional(),
    supports_n: z.boolean().optional(),
    supports_response_format: z.boolean().optional(),
    supports_size: z.boolean().optional(),
    supports_width_height: z.boolean().optional(),
    extra_body: z.record(z.unknown()).optional(),
  })
  .strict();

const CapabilityOverrideSchema = z
  .object({
    supports_txt2img: z.boolean().optional(),
    supports_img2img: z.boolean().optional(),
    supports_img2video: z.boolean().optional(),
    supports_multi_image_input: z.boolean().optional(),
    supports_mask_image: z.boolean().optional(),
    supports_negative_prompt: z.boolean().optional(),
    supports_model: z.boolean().optional(),
    supports_size: z.boolean().optional(),
    supports_width_height: z.boolean().optional(),
    supports_steps: z.boolean().optional(),
    supports_cfg_scale: z.boolean().optional(),
    supports_seed: z.boolean().optional(),
    supports_sampler: z.boolean().optional(),
    supports_n: z.boolean().optional(),
    supports_response_format: z.boolean().optional(),
    supports_presets: z.boolean().optional(),
    supports_raw_prompt_mode: z.boolean().optional(),
    supports_composed_prompt_mode: z.boolean().optional(),
    allowed_fields: z.array(z.string()).optional(),
    required_fields: z.array(z.string()).optional(),
    allowed_models: z.array(z.string()).optional(),
    max_input_images: z.number().int().nonnegative().optional(),
    requires_source_image: z.boolean().optional(),
  })
  .strict();

export const ImageSourceSchema = z
  .object({
    type: z.enum(["path", "url", "base64", "clipboard"]),
    value: z.string().min(1),
    mime_type: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
  })
  .strict();

export const GenerateAssetInputSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    operation: z.enum(OPERATIONS),
    prompt: z.string().min(1).optional(),
    content_prompt: z.string().min(1).optional(),
    prompt_mode: z.enum(["raw", "composed"]).optional(),
    profile_name: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    negative_prompt: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    size: z.string().min(1).optional(),
    steps: z.number().int().positive().optional(),
    cfg_scale: z.number().positive().optional(),
    seed: z.number().int().nonnegative().optional(),
    sampler: z.string().min(1).optional(),
    n: z.number().int().positive().optional(),
    response_format: z.string().min(1).optional(),
    extra_params: z.record(z.unknown()).optional(),
    source_image: ImageSourceSchema.optional(),
    source_images: z.array(ImageSourceSchema).optional(),
    mask_image: ImageSourceSchema.optional(),
    strength: z.number().min(0).max(1).optional(),
    denoise_strength: z.number().min(0).max(1).optional(),
    artist_preset: z.string().min(1).optional(),
    style_preset: z.string().min(1).optional(),
    negative_preset: z.string().min(1).optional(),
    extra_positive: z.string().min(1).optional(),
    extra_negative: z.string().min(1).optional(),
    save_raw_response: z.boolean().optional(),
  })
  .strict();

export const ProviderConfigSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    api_key: z.string().min(1),
    base_url: z.string().url(),
    request_style: z.enum(REQUEST_STYLES).optional(),
    timeout_ms: z.number().int().positive().optional(),
    auth_strategy: z.enum(["bearer", "x-api-key", "custom-header", "query"]),
    auth_header: z.string().min(1).optional(),
    default_model: z.string().min(1).optional(),
    allowed_models: z.array(z.string().min(1)).optional(),
    style_templates: z
      .object({
        official: StyleTemplateSchema.optional(),
        oai_images: StyleTemplateSchema.optional(),
        nai_compatible: StyleTemplateSchema.optional(),
        wrapped: StyleTemplateSchema.optional(),
      })
      .partial()
      .optional(),
    capability_overrides: CapabilityOverrideSchema.optional(),
    default_action: z.string().min(1).optional(),
    fixed_fields: z.record(z.unknown()).optional(),
    headers: z.record(z.string()).optional(),
  })
  .strict();

export const NovelAIPresetEntrySchema = z
  .object({
    type: z.enum(PRESET_TYPES),
    name: z.string().min(1),
    content: z.string().min(1),
    enabled: z.boolean(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict();

export const NovelAIPresetDocumentSchema = z
  .object({
    presets: z.array(NovelAIPresetEntrySchema),
    defaults: z
      .object({
        artist: z.string().min(1).optional(),
        style: z.string().min(1).optional(),
        negative: z.string().min(1).optional(),
      })
      .partial(),
  })
  .strict();

export const NovelAIProfileEntrySchema = z
  .object({
    name: z.string().min(1),
    positive_prompt: z.string().min(1).optional(),
    negative_prompt: z.string().min(1).optional(),
    enabled: z.boolean(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()
  .refine((value) => Boolean(value.positive_prompt || value.negative_prompt), {
    message: "A NovelAI profile must define positive_prompt or negative_prompt.",
  });

export const NovelAIProfileDocumentSchema = z
  .object({
    profiles: z.array(NovelAIProfileEntrySchema),
    default_profile: z.string().min(1).optional(),
  })
  .strict();
