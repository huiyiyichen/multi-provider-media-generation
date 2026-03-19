import { MediaSkillError } from "../errors";
import type {
  AdapterHttpResponse,
  AssetKind,
  GenerateAssetInput,
  GenerateAssetResult,
  HttpRequestSpec,
  ParsedAdapterResponse,
  ParsedAssetSource,
  ProviderConfig,
  ProviderId,
  ResolvedRequest,
} from "../types";
import { AssetStorageService } from "../services/asset-storage-service";
import { ProviderCapabilityRegistry } from "../services/provider-capability-registry";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export abstract class BaseProviderAdapter {
  constructor(
    readonly provider: ProviderId,
    protected readonly assetStorage: AssetStorageService,
    protected readonly capabilityRegistry: ProviderCapabilityRegistry,
  ) {}

  validateConfig(config: ProviderConfig) {
    if (config.provider !== this.provider) {
      throw new MediaSkillError(
        "CONFIG_PROVIDER_MISMATCH",
        `Adapter ${this.provider} received config for ${config.provider}.`,
      );
    }
  }

  resolveCapabilities(config: ProviderConfig, input: GenerateAssetInput) {
    return this.capabilityRegistry.resolve(config, input);
  }

  async normalizeInput(request: ResolvedRequest) {
    return request;
  }

  abstract buildRequest(request: ResolvedRequest): Promise<HttpRequestSpec> | HttpRequestSpec;

  async sendRequest(request: HttpRequestSpec, config: ProviderConfig): Promise<AdapterHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout_ms ?? 300000);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...config.headers,
        ...request.headers,
        ...this.buildAuthHeaders(config),
      };

      let url = request.url;
      if (config.auth_strategy === "query") {
        const parsed = new URL(url);
        parsed.searchParams.set(config.auth_header ?? "api_key", config.api_key);
        url = parsed.toString();
      }

      const response = await fetch(url, {
        method: request.method,
        headers,
        body: JSON.stringify(request.json),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      if (!response.ok) {
        const text = await response.text();
        throw new MediaSkillError("HTTP_ERROR", `${response.status} ${response.statusText}`, {
          url,
          body: text.slice(0, 500),
        });
      }

      if (contentType.includes("json")) {
        return {
          status: response.status,
          ok: true,
          content_type: contentType,
          headers: response.headers,
          json_body: await response.json(),
        };
      }

      if (contentType.includes("text/event-stream") || contentType.startsWith("text/")) {
        return {
          status: response.status,
          ok: true,
          content_type: contentType,
          headers: response.headers,
          text_body: await response.text(),
        };
      }

      return {
        status: response.status,
        ok: true,
        content_type: contentType,
        headers: response.headers,
        binary_body: new Uint8Array(await response.arrayBuffer()),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  abstract parseResponse(
    response: AdapterHttpResponse,
    request: ResolvedRequest,
  ): Promise<ParsedAdapterResponse> | ParsedAdapterResponse;

  async saveAssets(request: ResolvedRequest, parsed: ParsedAdapterResponse): Promise<GenerateAssetResult> {
    return this.assetStorage.saveRun(request, parsed);
  }

  protected buildAuthHeaders(config: ProviderConfig): Record<string, string> {
    switch (config.auth_strategy) {
      case "bearer":
        return { Authorization: `Bearer ${config.api_key}` };
      case "x-api-key":
        return { [config.auth_header ?? "x-api-key"]: config.api_key };
      case "custom-header":
        if (!config.auth_header) {
          throw new MediaSkillError(
            "CONFIG_INVALID",
            "auth_header is required when auth_strategy is custom-header.",
          );
        }
        return { [config.auth_header]: config.api_key };
      case "query":
      default:
        return {};
    }
  }

  protected parseGenericMediaResponse(
    response: AdapterHttpResponse,
    kind: AssetKind,
  ): ParsedAdapterResponse {
    if (response.json_body !== undefined) {
      return {
        assets: this.extractAssetsFromJson(response.json_body, kind),
        metadata: {
          content_type: response.content_type,
          status: response.status,
        },
        raw_response: response.json_body,
      };
    }

    if (response.text_body !== undefined) {
      return {
        assets: this.extractAssetsFromJson(response.text_body, kind),
        metadata: {
          content_type: response.content_type,
          status: response.status,
        },
        raw_response: response.text_body,
      };
    }

    if (!response.binary_body) {
      throw new MediaSkillError("NO_RESPONSE_BODY", "Provider returned an empty response body.");
    }

    if (response.content_type.includes("application/zip")) {
      return {
        assets: [
          {
            kind,
            data_type: "zip",
            value: response.binary_body,
            mime_type: "application/zip",
            filename: "assets.zip",
          },
        ],
        metadata: {
          content_type: response.content_type,
          status: response.status,
        },
        raw_response: response.binary_body,
      };
    }

    return {
      assets: [
        {
          kind,
          data_type: "binary",
          value: response.binary_body,
          mime_type: response.content_type,
          filename: kind === "video" ? "asset.mp4" : "asset.png",
        },
      ],
      metadata: {
        content_type: response.content_type,
        status: response.status,
      },
      raw_response: response.binary_body,
    };
  }

  protected extractAssetsFromJson(payload: unknown, defaultKind: AssetKind): ParsedAssetSource[] {
    const candidates = this.collectAssetCandidates(payload);
    const assets = candidates
      .map((candidate) => this.toParsedAsset(candidate, defaultKind))
      .filter((asset): asset is ParsedAssetSource => asset !== null);

    if (assets.length === 0) {
      throw new MediaSkillError("NO_ASSETS", "Provider response did not contain any parseable assets.");
    }

    return assets;
  }

  private collectAssetCandidates(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!isRecord(payload)) {
      return [];
    }

    for (const key of ["assets", "images", "videos", "data", "media", "artifacts", "results"]) {
      const candidate = payload[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    for (const key of ["result", "output"]) {
      if (payload[key] !== undefined) {
        const nested = this.collectAssetCandidates(payload[key]);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    const choiceCandidates = this.collectChoiceContentCandidates(payload.choices);
    if (choiceCandidates.length > 0) {
      return choiceCandidates;
    }

    if (
      payload.url ||
      payload.b64_json ||
      payload.base64 ||
      payload.video_url ||
      payload.image_url ||
      payload.mime_type
    ) {
      return [payload];
    }

    return [];
  }

  private collectChoiceContentCandidates(choices: unknown): unknown[] {
    if (!Array.isArray(choices)) {
      return [];
    }

    const candidates: unknown[] = [];
    for (const choice of choices) {
      if (!isRecord(choice)) {
        continue;
      }

      for (const key of ["message", "delta"] as const) {
        const container = choice[key];
        if (!isRecord(container)) {
          continue;
        }

        const content = container.content;
        if (typeof content === "string") {
          candidates.push(...this.extractAssetCandidatesFromText(content));
          continue;
        }

        if (!Array.isArray(content)) {
          continue;
        }

        for (const part of content) {
          if (!isRecord(part)) {
            continue;
          }

          const imageUrl = part.image_url;
          if (typeof imageUrl === "string" && imageUrl.length > 0) {
            candidates.push({ url: imageUrl });
            continue;
          }

          if (isRecord(imageUrl) && typeof imageUrl.url === "string" && imageUrl.url.length > 0) {
            candidates.push({ url: imageUrl.url });
            continue;
          }

          const partText = this.stringValue(part.text);
          if (partText) {
            candidates.push(...this.extractAssetCandidatesFromText(partText));
          }
        }
      }
    }

    return candidates;
  }

  private extractAssetCandidatesFromText(text: string): Array<{ url: string }> {
    const matches = text.match(/https?:\/\/[^\s)]+/g) ?? [];
    return matches.map((url) => ({ url }));
  }

  private toParsedAsset(candidate: unknown, defaultKind: AssetKind): ParsedAssetSource | null {
    if (typeof candidate === "string") {
      return {
        kind: defaultKind,
        data_type: candidate.startsWith("http") ? "url" : "base64",
        value: candidate,
      };
    }

    if (!isRecord(candidate)) {
      return null;
    }

    const kind = candidate.kind === "video" ? "video" : defaultKind;
    const filename = this.stringValue(candidate.filename) ?? this.stringValue(candidate.name) ?? undefined;
    const mimeType = this.stringValue(candidate.mime_type) ?? this.stringValue(candidate.mimeType) ?? undefined;

    const url =
      this.stringValue(candidate.url) ??
      this.stringValue(candidate.image_url) ??
      this.stringValue(candidate.video_url);
    if (url) {
      return {
        kind,
        data_type: "url",
        value: url,
        mime_type: mimeType,
        filename,
      };
    }

    const base64 = this.stringValue(candidate.b64_json) ?? this.stringValue(candidate.base64);
    if (base64) {
      return {
        kind,
        data_type: "base64",
        value: base64,
        mime_type: mimeType,
        filename,
      };
    }

    if (candidate.binary instanceof Uint8Array) {
      return {
        kind,
        data_type: "binary",
        value: candidate.binary,
        mime_type: mimeType,
        filename,
      };
    }

    return null;
  }

  private stringValue(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}