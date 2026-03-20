export const PROVIDERS = [
  "novelai_official",
  "novelai_compatible",
  "nanobanana",
  "grok_imagine",
] as const;

export const OPERATIONS = ["txt2img", "img2img", "img2video"] as const;

export const REQUEST_STYLES = ["official", "oai_images", "nai_compatible", "wrapped"] as const;

export const PRESET_TYPES = ["artist", "style", "negative"] as const;

export type ProviderId = (typeof PROVIDERS)[number];
export type Operation = (typeof OPERATIONS)[number];
export type RequestStyle = (typeof REQUEST_STYLES)[number];
export type PresetType = (typeof PRESET_TYPES)[number];
export type AuthStrategy = "bearer" | "x-api-key" | "custom-header" | "query";
export type AssetKind = "image" | "video";
export type AssetSourceType = "url" | "base64" | "binary" | "zip";

export type ImageSource = {
  type: "path" | "url" | "base64" | "clipboard";
  value: string;
  mime_type?: string;
  filename?: string;
};

export type GenerateAssetInput = {
  provider: ProviderId;
  operation: Operation;
  prompt?: string;
  content_prompt?: string;
  prompt_mode?: "raw" | "composed";
  profile_name?: string;
  model?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  size?: string;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  sampler?: string;
  n?: number;
  response_format?: string;
  extra_params?: Record<string, unknown>;
  source_image?: ImageSource;
  source_images?: ImageSource[];
  mask_image?: ImageSource;
  strength?: number;
  denoise_strength?: number;
  artist_preset?: string;
  style_preset?: string;
  negative_preset?: string;
  extra_positive?: string;
  extra_negative?: string;
  save_raw_response?: boolean;
};

export type GenerateAssetField = Exclude<keyof GenerateAssetInput, "provider" | "operation">;

export type StyleTemplate = {
  endpoint: string;
  method?: "POST";
  supports_n?: boolean;
  supports_response_format?: boolean;
  supports_size?: boolean;
  supports_width_height?: boolean;
  extra_body?: Record<string, unknown>;
};

export type CapabilityDescriptorOverride = {
  supports_txt2img?: boolean;
  supports_img2img?: boolean;
  supports_img2video?: boolean;
  supports_multi_image_input?: boolean;
  supports_mask_image?: boolean;
  supports_negative_prompt?: boolean;
  supports_model?: boolean;
  supports_size?: boolean;
  supports_width_height?: boolean;
  supports_steps?: boolean;
  supports_cfg_scale?: boolean;
  supports_seed?: boolean;
  supports_sampler?: boolean;
  supports_n?: boolean;
  supports_response_format?: boolean;
  supports_presets?: boolean;
  supports_raw_prompt_mode?: boolean;
  supports_composed_prompt_mode?: boolean;
  allowed_fields?: string[];
  required_fields?: string[];
  allowed_models?: string[];
  max_input_images?: number;
  requires_source_image?: boolean;
};

export type ProviderConfig = {
  provider: ProviderId;
  api_key: string;
  base_url: string;
  request_style?: RequestStyle;
  timeout_ms?: number;
  auth_strategy: AuthStrategy;
  auth_header?: string;
  default_model?: string;
  allowed_models?: string[];
  style_templates?: Partial<Record<RequestStyle, StyleTemplate>>;
  capability_overrides?: CapabilityDescriptorOverride;
  default_action?: string;
  fixed_fields?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type CapabilityDescriptor = {
  key: string;
  provider: ProviderId;
  operation: Operation;
  request_style?: RequestStyle;
  model?: string;
  supports_txt2img: boolean;
  supports_img2img: boolean;
  supports_img2video: boolean;
  supports_multi_image_input: boolean;
  supports_mask_image: boolean;
  supports_negative_prompt: boolean;
  supports_model: boolean;
  supports_size: boolean;
  supports_width_height: boolean;
  supports_steps: boolean;
  supports_cfg_scale: boolean;
  supports_seed: boolean;
  supports_sampler: boolean;
  supports_n: boolean;
  supports_response_format: boolean;
  supports_presets: boolean;
  supports_raw_prompt_mode: boolean;
  supports_composed_prompt_mode: boolean;
  allowed_fields: readonly string[];
  required_fields: readonly string[];
  allowed_models: readonly string[];
  max_input_images: number;
  requires_source_image: boolean;
};

export type PromptBundle = {
  final_positive_prompt?: string;
  final_negative_prompt?: string;
};

export type ResolvedRequest = {
  request_id: string;
  provider: ProviderId;
  operation: Operation;
  request_style?: RequestStyle;
  model?: string;
  config: ProviderConfig;
  capabilities: CapabilityDescriptor;
  input: GenerateAssetInput;
  filtered_input: Partial<Record<GenerateAssetField, unknown>>;
  prompt_bundle: PromptBundle;
  source_images: ImageSource[];
};

export type HttpRequestSpec = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body_type: "json";
  json: Record<string, unknown>;
};

export type AdapterHttpResponse = {
  status: number;
  ok: boolean;
  content_type: string;
  headers: Headers;
  json_body?: unknown;
  binary_body?: Uint8Array;
  text_body?: string;
};

export type ParsedAssetSource = {
  kind: AssetKind;
  data_type: AssetSourceType;
  value: string | Uint8Array;
  mime_type?: string;
  filename?: string;
};

export type ParsedAdapterResponse = {
  assets: ParsedAssetSource[];
  metadata?: Record<string, unknown>;
  raw_response?: unknown;
};

export type SavedAsset = {
  kind: AssetKind;
  path: string;
  display_path: string;
  filename: string;
  source_type: AssetSourceType;
  mime_type?: string;
  size_bytes: number;
};

export type GenerateAssetResult = {
  request_id: string;
  provider: ProviderId;
  operation: Operation;
  request_style?: RequestStyle;
  model?: string;
  output_dir: string;
  display_output_dir: string;
  metadata_path?: string;
  raw_response_path?: string;
  assets: SavedAsset[];
};

export type NovelAIPresetEntry = {
  type: PresetType;
  name: string;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type NovelAIPresetDocument = {
  presets: NovelAIPresetEntry[];
  defaults: Partial<Record<PresetType, string>>;
};

export type NovelAIProfileEntry = {
  name: string;
  positive_prompt?: string;
  negative_prompt?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type NovelAIProfileDocument = {
  profiles: NovelAIProfileEntry[];
  default_profile?: string;
};

export type ConfigValidationResult = {
  provider: ProviderId;
  ok: boolean;
  errors: string[];
  masked_config?: Omit<ProviderConfig, "api_key"> & { api_key: string };
};

export type CliContext = {
  root_dir: string;
  data_dir: string;
};


