import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { MediaSkillError } from "../errors";
import { readClipboardImageDataUrl } from "../utils/clipboard";
import { joinUrl } from "../utils/common";
import type {
  AdapterHttpResponse,
  HttpRequestSpec,
  ImageSource,
  ParsedAdapterResponse,
  ParsedAssetSource,
  ProviderConfig,
  ResolvedRequest,
} from "../types";
import { BaseProviderAdapter } from "./base-adapter";

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";
const IMAGE_MARKDOWN_URL_PATTERN = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
const IMAGE_URL_PATTERN = /https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/gi;
const DATA_URL_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

const resolveEndpoint = (baseUrl: string) =>
  /\/chat\/completions\/?$/i.test(baseUrl) ? baseUrl : joinUrl(baseUrl, CHAT_COMPLETIONS_SUFFIX);

const mimeTypeFromPath = (path: string) => {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".png":
    default:
      return "image/png";
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractStringContent = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStringContent(item));
  }

  if (isRecord(value)) {
    return [value.content, value.text].flatMap((item) => extractStringContent(item));
  }

  return [];
};

const mimeTypeFromUnknown = (value: unknown) =>
  typeof value === "string" && value.startsWith("image/") ? value : undefined;

const stringValue = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);

export class NanobananaAdapter extends BaseProviderAdapter {
  validateConfig(config: ProviderConfig) {
    super.validateConfig(config);

    if (!config.default_model) {
      throw new MediaSkillError(
        "CONFIG_INVALID",
        "nanobanana requires default_model in provider config for chat/completions routing.",
      );
    }
  }

  async buildRequest(request: ResolvedRequest): Promise<HttpRequestSpec> {
    const messages = await this.buildMessages(request);
    const body: Record<string, unknown> = {
      ...request.config.fixed_fields,
      model: request.model ?? request.config.default_model,
      messages,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    };

    return {
      url: resolveEndpoint(request.config.base_url),
      method: "POST",
      headers: {},
      body_type: "json",
      json: body,
    };
  }

  parseResponse(response: AdapterHttpResponse): ParsedAdapterResponse {
    if (!response.text_body) {
      return this.parseGenericMediaResponse(response, "image");
    }

    const events: unknown[] = [];
    const fragments: string[] = [];
    let usage: unknown;

    for (const rawLine of response.text_body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        events.push(parsed);

        if (parsed.usage !== undefined) {
          usage = parsed.usage;
        }

        for (const choice of Array.isArray(parsed.choices) ? parsed.choices : []) {
          if (!isRecord(choice)) {
            continue;
          }

          fragments.push(...extractStringContent(choice.delta));
          fragments.push(...extractStringContent(choice.message));
        }
      } catch {
        continue;
      }
    }

    const assets = this.extractAssets(events, fragments);
    if (assets.length === 0) {
      throw new MediaSkillError(
        "NO_ASSETS",
        "nanobanana chat/completions response did not contain any parseable image asset.",
        {
          raw_preview: response.text_body.slice(0, 2000),
          content_fragments_preview: fragments.slice(0, 10),
          event_count: events.length,
        },
      );
    }

    return {
      assets,
      metadata: {
        content_type: response.content_type,
        status: response.status,
        usage,
        content_fragments: fragments,
        event_count: events.length,
      },
      raw_response: response.text_body,
    };
  }

  private async buildMessages(request: ResolvedRequest) {
    const prompt = request.prompt_bundle.final_positive_prompt ?? request.filtered_input.prompt;

    if (request.operation === "txt2img") {
      if (!prompt) {
        throw new MediaSkillError("REQUIRED_FIELD_MISSING", "nanobanana txt2img requires prompt.");
      }

      return [{ role: "user", content: prompt }];
    }

    const contentParts: Array<Record<string, unknown>> = [];
    if (prompt) {
      contentParts.push({ type: "text", text: prompt });
    }

    const sourceImage = request.source_images[0];
    if (sourceImage) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: await this.toImageUrl(sourceImage),
        },
      });
    }

    if (contentParts.length === 0) {
      throw new MediaSkillError("SOURCE_IMAGE_REQUIRED", "nanobanana img2img requires source_image.");
    }

    return [{ role: "user", content: contentParts }];
  }

  private async toImageUrl(source: ImageSource) {
    if (source.type === "url") {
      return source.value;
    }

    if (source.type === "clipboard") {
      return readClipboardImageDataUrl();
    }

    if (source.type === "base64") {
      const mimeType = source.mime_type ?? "image/png";
      return source.value.startsWith("data:") ? source.value : `data:${mimeType};base64,${source.value}`;
    }

    const bytes = await readFile(source.value);
    const mimeType = source.mime_type ?? mimeTypeFromPath(source.value);
    return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  private extractAssets(events: unknown[], fragments: string[]): ParsedAssetSource[] {
    const seen = new Set<string>();
    const assets: ParsedAssetSource[] = [];

    const addAsset = (asset: ParsedAssetSource) => {
      const key = `${asset.data_type}:${typeof asset.value === "string" ? asset.value : Buffer.from(asset.value).toString("base64")}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      assets.push(asset);
    };

    for (const event of events) {
      for (const asset of this.extractAssetsFromValue(event)) {
        addAsset(asset);
      }
    }

    for (const asset of this.extractAssetsFromStrings(fragments)) {
      addAsset(asset);
    }

    return assets;
  }

  private extractAssetsFromStrings(fragments: string[]): ParsedAssetSource[] {
    const combined = fragments.join("\n");
    const assets: ParsedAssetSource[] = [];

    for (const match of combined.matchAll(IMAGE_MARKDOWN_URL_PATTERN)) {
      if (match[1]) {
        assets.push({ kind: "image", data_type: "url", value: match[1] });
      }
    }

    for (const match of combined.match(IMAGE_URL_PATTERN) ?? []) {
      assets.push({ kind: "image", data_type: "url", value: match });
    }

    for (const match of combined.match(DATA_URL_PATTERN) ?? []) {
      assets.push({ kind: "image", data_type: "base64", value: match, mime_type: "image/png" });
    }

    return assets;
  }

  private extractAssetsFromValue(value: unknown): ParsedAssetSource[] {
    const assets: ParsedAssetSource[] = [];

    if (Array.isArray(value)) {
      for (const item of value) {
        assets.push(...this.extractAssetsFromValue(item));
      }
      return assets;
    }

    if (!isRecord(value)) {
      return assets;
    }

    const directUrl = stringValue(value.url) ?? stringValue(value.image_url) ?? stringValue(value.imageUrl);
    if (directUrl) {
      assets.push({
        kind: "image",
        data_type: directUrl.startsWith("data:image/") ? "base64" : "url",
        value: directUrl,
      });
    }

    const imageUrlObject = value.image_url;
    if (isRecord(imageUrlObject) && stringValue(imageUrlObject.url)) {
      assets.push({
        kind: "image",
        data_type: String(imageUrlObject.url).startsWith("data:image/") ? "base64" : "url",
        value: String(imageUrlObject.url),
      });
    }

    const inlineData = isRecord(value.inline_data) ? value.inline_data : isRecord(value.inlineData) ? value.inlineData : undefined;
    if (inlineData) {
      const payload = stringValue(inlineData.data) ?? stringValue(inlineData.base64);
      if (payload) {
        assets.push({
          kind: "image",
          data_type: "base64",
          value: payload,
          mime_type: mimeTypeFromUnknown(inlineData.mime_type) ?? mimeTypeFromUnknown(inlineData.mimeType) ?? "image/png",
        });
      }
    }

    const directBase64 = stringValue(value.b64_json) ?? stringValue(value.base64);
    if (directBase64) {
      assets.push({
        kind: "image",
        data_type: "base64",
        value: directBase64,
        mime_type: mimeTypeFromUnknown(value.mime_type) ?? mimeTypeFromUnknown(value.mimeType) ?? "image/png",
      });
    }

    const directData = stringValue(value.data);
    const directMime = mimeTypeFromUnknown(value.mime_type) ?? mimeTypeFromUnknown(value.mimeType);
    if (directData && directMime) {
      assets.push({
        kind: "image",
        data_type: "base64",
        value: directData,
        mime_type: directMime,
      });
    }

    for (const nestedValue of Object.values(value)) {
      assets.push(...this.extractAssetsFromValue(nestedValue));
    }

    return assets;
  }
}
