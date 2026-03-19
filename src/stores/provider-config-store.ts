import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MediaSkillError } from "../errors";
import { ProviderConfigSchema } from "../schemas";
import type { ConfigValidationResult, ProviderConfig, ProviderId } from "../types";
import { maskSecret } from "../utils/common";
import { ensureDir, readJsonFile, writeJsonFile } from "../utils/fs";

export interface SecretBackend {
  write(provider: ProviderId, apiKey: string): Promise<void>;
  read(provider: ProviderId): Promise<string | null>;
}

type StoredProviderConfig = Omit<ProviderConfig, "api_key"> & {
  has_api_key: boolean;
};

class FileSecretBackend implements SecretBackend {
  constructor(private readonly secretDir: string) {}

  async write(provider: ProviderId, apiKey: string) {
    await ensureDir(this.secretDir);
    await writeFile(join(this.secretDir, `${provider}.key`), `${apiKey}\n`, "utf8");
  }

  async read(provider: ProviderId) {
    try {
      const secret = await readFile(join(this.secretDir, `${provider}.key`), "utf8");
      return secret.trim();
    } catch {
      return null;
    }
  }
}

export class ProviderConfigStore {
  private readonly providerConfigDir: string;
  private readonly secretBackend: SecretBackend;

  constructor(private readonly dataDir: string, secretBackend?: SecretBackend) {
    this.providerConfigDir = join(dataDir, "config", "providers");
    this.secretBackend = secretBackend ?? new FileSecretBackend(join(dataDir, "config", "secrets"));
  }

  async setConfig(input: unknown) {
    const config = ProviderConfigSchema.parse(input);
    const { api_key, ...rest } = config;
    const storedConfig: StoredProviderConfig = {
      ...rest,
      has_api_key: true,
    };

    await ensureDir(this.providerConfigDir);
    await this.secretBackend.write(config.provider, api_key);
    await writeJsonFile(this.getConfigPath(config.provider), storedConfig);
    return config;
  }

  async getConfig(provider: ProviderId): Promise<ProviderConfig | null> {
    const stored = await readJsonFile<StoredProviderConfig | null>(this.getConfigPath(provider), null);
    if (!stored) {
      return null;
    }

    const apiKey = await this.secretBackend.read(provider);
    if (!apiKey) {
      throw new MediaSkillError(
        "CONFIG_SECRET_MISSING",
        `Provider ${provider} is missing a persisted api_key secret.`,
      );
    }

    const { has_api_key: _ignored, ...configWithoutSecretFlag } = stored;
    return ProviderConfigSchema.parse({
      ...configWithoutSecretFlag,
      api_key: apiKey,
    });
  }

  async requireConfig(provider: ProviderId) {
    const config = await this.getConfig(provider);
    if (!config) {
      throw new MediaSkillError(
        "CONFIG_NOT_FOUND",
        `Provider ${provider} has not been configured yet.`,
      );
    }

    return config;
  }

  async getMaskedConfig(provider: ProviderId) {
    const config = await this.getConfig(provider);
    return config ? this.maskConfig(config) : null;
  }

  async listConfigs() {
    await ensureDir(this.providerConfigDir);

    const entries = await readdir(this.providerConfigDir, { withFileTypes: true });
    const configs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => this.getMaskedConfig(entry.name.replace(/\.json$/, "") as ProviderId)),
    );

    return configs.filter((value): value is NonNullable<typeof value> => value !== null);
  }

  async validate(provider: ProviderId): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const config = await this.getConfig(provider);

    if (!config) {
      return {
        provider,
        ok: false,
        errors: [`Provider ${provider} is not configured.`],
      };
    }

    if (config.auth_strategy === "custom-header" && !config.auth_header) {
      errors.push("auth_header is required when auth_strategy is custom-header.");
    }

    if (config.provider === "novelai_compatible") {
      if (!config.request_style) {
        errors.push("request_style is required for novelai_compatible.");
      }

      if (!config.request_style || !config.style_templates?.[config.request_style]) {
        errors.push("A style_templates entry is required for the active novelai_compatible request_style.");
      }
    }

    if (config.provider === "grok_imagine") {
      const allowed = config.allowed_models ?? [
        "grok-imagine-1.0",
        "grok-imagine-1.0-edit",
        "grok-imagine-1.0-video",
      ];
      const unexpected = allowed.filter(
        (model) => !["grok-imagine-1.0", "grok-imagine-1.0-edit", "grok-imagine-1.0-video"].includes(model),
      );
      if (unexpected.length > 0) {
        errors.push(`Unsupported grok_imagine allowed_models: ${unexpected.join(", ")}.`);
      }
    }

    return {
      provider,
      ok: errors.length === 0,
      errors,
      masked_config: this.maskConfig(config),
    };
  }

  private getConfigPath(provider: ProviderId) {
    return join(this.providerConfigDir, `${provider}.json`);
  }

  private maskConfig(config: ProviderConfig) {
    return {
      ...config,
      api_key: maskSecret(config.api_key),
    };
  }
}
