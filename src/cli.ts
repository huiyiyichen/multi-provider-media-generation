#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { MediaSkillError, toErrorPayload } from "./errors";
import { ProviderConfigSchema } from "./schemas";
import { MediaGenerationService } from "./runtime/media-generation-service";
import { PROVIDERS } from "./types";
import type { AuthStrategy, GenerateAssetInput, PresetType, ProviderConfig, ProviderId, RequestStyle } from "./types";

const printJson = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | string[]>;
};

type InteractiveQuestionFn = (prompt: string) => Promise<string>;

const AUTH_STRATEGIES = ["bearer", "x-api-key", "custom-header", "query"] as const;
const NOVELAI_COMPATIBLE_STYLES: readonly RequestStyle[] = ["oai_images", "nai_compatible", "wrapped"];
const DEFAULT_TIMEOUT_MS = 300000;

const parseArgs = (args: string[]): ParsedArgs => {
  const positionals: string[] = [];
  const flags: ParsedArgs["flags"] = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current || !current.startsWith("--")) {
      if (current) {
        positionals.push(current);
      }
      continue;
    }

    const key = current.slice(2);
    const next = args[index + 1];
    const parsedValue = !next || next.startsWith("--") ? "true" : next;
    if (parsedValue !== "true") {
      index += 1;
    }

    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = parsedValue;
    } else if (Array.isArray(existing)) {
      existing.push(parsedValue);
    } else {
      flags[key] = [existing, parsedValue];
    }
  }

  return { positionals, flags };
};

const getStringFlag = (parsed: ParsedArgs, key: string) => {
  const value = parsed.flags[key];
  if (Array.isArray(value)) {
    return value.at(-1);
  }
  return value;
};

const getBooleanFlag = (parsed: ParsedArgs, key: string) => {
  const value = getStringFlag(parsed, key);
  return value === "true" || value === undefined ? value === "true" : value !== "false";
};

const requireStringFlag = (parsed: ParsedArgs, key: string) => {
  const value = getStringFlag(parsed, key);
  if (!value) {
    throw new MediaSkillError("CLI_ARGUMENT_REQUIRED", `Missing required --${key} option.`);
  }
  return value;
};

const splitCommaSeparated = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const isOneOf = <T extends string>(value: string, allowed: readonly T[]): value is T =>
  allowed.includes(value as T);

const resolveChoiceValue = <T extends string>(value: string, allowed: readonly T[]) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (isOneOf(trimmed, allowed)) {
    return trimmed;
  }

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    return allowed[index] ?? null;
  }

  return null;
};

const parsePositiveInteger = (value: string | undefined, fieldName: string) => {
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new MediaSkillError("CLI_ARGUMENT_INVALID", `--${fieldName} must be a positive integer.`);
  }

  return Number(value);
};

const askText = async (
  ask: InteractiveQuestionFn,
  label: string,
  options?: {
    defaultValue?: string;
    required?: boolean;
    validate?: (value: string) => string | null;
    hint?: string;
  },
) => {
  while (true) {
    const lines = [label];
    if (options?.hint) {
      lines.push(options.hint);
    }
    if (options?.defaultValue) {
      lines.push(`默认值: ${options.defaultValue}`);
    }

    const answer = (await ask(lines.join("\n"))).trim();
    const value = answer || options?.defaultValue || "";

    if (!value && options?.required) {
      process.stderr.write("此项不能为空，请重新输入。\n");
      continue;
    }

    if (value && options?.validate) {
      const error = options.validate(value);
      if (error) {
        process.stderr.write(`${error}\n`);
        continue;
      }
    }

    return value;
  }
};

const askChoice = async <T extends string>(
  ask: InteractiveQuestionFn,
  label: string,
  allowed: readonly T[],
  options?: {
    defaultValue?: T;
  },
): Promise<T> => {
  while (true) {
    const lines = [label, ...allowed.map((item, index) => `${index + 1}. ${item}`)];
    if (options?.defaultValue) {
      lines.push(`默认值: ${options.defaultValue}`);
    }
    lines.push("可以输入编号或完整名称。");

    const answer = (await ask(lines.join("\n"))).trim();
    if (!answer && options?.defaultValue) {
      return options.defaultValue;
    }

    const resolved = resolveChoiceValue(answer, allowed);
    if (resolved) {
      return resolved;
    }

    process.stderr.write(`请输入编号或以下值之一：${allowed.join(", ")}\n`);
  }
};

const parseModelConfig = (value: string) => {
  const models = splitCommaSeparated(value);
  if (models.length === 0) {
    return {};
  }

  return {
    default_model: models[0],
    allowed_models: models,
  };
};

const resolveAuthStrategy = (parsed: ParsedArgs): AuthStrategy => {
  const flagValue = getStringFlag(parsed, "auth-strategy");
  if (!flagValue) {
    return "bearer";
  }

  const resolved = resolveChoiceValue(flagValue, AUTH_STRATEGIES);
  if (!resolved) {
    throw new MediaSkillError(
      "CLI_ARGUMENT_INVALID",
      `Invalid --auth-strategy value: ${flagValue}. Allowed values: ${AUTH_STRATEGIES.join(", ")}.`,
    );
  }

  return resolved;
};

export const promptForProviderConfig = async (
  parsed: ParsedArgs,
  ask: InteractiveQuestionFn,
): Promise<ProviderConfig> => {
  const provider = await askChoice(ask, "请选择 provider", PROVIDERS, {
    defaultValue: getStringFlag(parsed, "provider") as ProviderId | undefined,
  });
  const baseUrl = await askText(ask, "请输入 url", {
    defaultValue: getStringFlag(parsed, "base-url"),
    required: true,
    hint: "示例: https://example.com 或 https://example.com/v1",
    validate: (value) => {
      try {
        new URL(value);
        return null;
      } catch {
        return "url 格式不正确，请输入完整地址，例如 https://example.com";
      }
    },
  });
  const apiKey = await askText(ask, "请输入 apikey", {
    defaultValue: getStringFlag(parsed, "api-key"),
    required: true,
  });
  const modelInput = await askText(ask, "请输入 model", {
    defaultValue: getStringFlag(parsed, "models") ?? getStringFlag(parsed, "allowed-models"),
    hint: "多个 model 用英文逗号分隔，可直接回车跳过。",
  });

  const authStrategy = resolveAuthStrategy(parsed);
  const timeoutMs = parsePositiveInteger(getStringFlag(parsed, "timeout-ms"), "timeout-ms") ?? DEFAULT_TIMEOUT_MS;
  const authHeader = getStringFlag(parsed, "auth-header");

  const config: ProviderConfig = {
    provider,
    api_key: apiKey,
    base_url: baseUrl,
    auth_strategy: authStrategy,
    timeout_ms: timeoutMs,
    ...(authHeader ? { auth_header: authHeader } : {}),
    ...parseModelConfig(modelInput),
  };

  if (provider === "novelai_compatible") {
    const requestStyle = await askChoice(ask, "请选择 request_style", NOVELAI_COMPATIBLE_STYLES, {
      defaultValue: getStringFlag(parsed, "request-style") as RequestStyle | undefined,
    });
    const endpoint = await askText(ask, "请输入 endpoint 路径", {
      defaultValue: getStringFlag(parsed, "style-endpoint"),
      required: true,
      hint: "示例: /images/generations",
    });

    config.request_style = requestStyle;
    config.style_templates = {
      [requestStyle]: {
        endpoint,
      },
    };
  }

  return ProviderConfigSchema.parse(config);
};

const readStdin = async () => {
  if (process.stdin.isTTY) {
    return "";
  }

  let buffer = "";
  for await (const chunk of process.stdin) {
    buffer += chunk.toString();
  }
  return buffer;
};

const loadJsonPayload = async (parsed: ParsedArgs) => {
  const inline = getStringFlag(parsed, "json");
  if (inline) {
    return JSON.parse(inline);
  }

  const file = getStringFlag(parsed, "file");
  if (file) {
    return JSON.parse(await readFile(resolve(file), "utf8"));
  }

  const stdin = await readStdin();
  if (stdin.trim()) {
    return JSON.parse(stdin);
  }

  throw new MediaSkillError("CLI_ARGUMENT_REQUIRED", "Provide --json, --file, or stdin input.");
};

const createBufferedQuestionFn = (buffer: string): InteractiveQuestionFn => {
  const answers = buffer.split(/\r?\n/);

  return async (prompt) => {
    process.stdout.write(`${prompt}\n> `);
    const next = answers.shift();
    if (next === undefined) {
      throw new MediaSkillError(
        "CLI_ARGUMENT_REQUIRED",
        "Interactive input ended before configuration was complete.",
      );
    }

    return next;
  };
};

const createTtyQuestionContext = () => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask: async (prompt: string) => {
      process.stdout.write(`${prompt}\n> `);
      return readline.question("");
    },
    close: () => readline.close(),
  };
};

const loadConfigSetPayload = async (parsed: ParsedArgs) => {
  const shouldPromptInteractively =
    getBooleanFlag(parsed, "interactive") ||
    (!getStringFlag(parsed, "json") && !getStringFlag(parsed, "file") && process.stdin.isTTY);

  if (!shouldPromptInteractively) {
    const provider = requireStringFlag(parsed, "provider") as ProviderId;
    const payload = await loadJsonPayload(parsed);
    return ProviderConfigSchema.parse({ ...payload, provider });
  }

  if (!process.stdin.isTTY) {
    const bufferedInput = await readStdin();
    process.stdout.write("进入交互式配置，请按提示输入。直接回车可使用默认值。\n");
    return promptForProviderConfig(parsed, createBufferedQuestionFn(bufferedInput));
  }

  const questionContext = createTtyQuestionContext();
  process.stdout.write("进入交互式配置，请按提示输入。直接回车可使用默认值。\n");

  try {
    return await promptForProviderConfig(parsed, questionContext.ask);
  } finally {
    questionContext.close();
  }
};

const run = async (argv = process.argv.slice(2)) => {
  const parsed = parseArgs(argv);
  const dataDir = resolve(getStringFlag(parsed, "data-dir") ?? process.env.MEDIA_SKILL_DATA_DIR ?? join(process.cwd(), "data"));
  const runtime = MediaGenerationService.create(process.cwd(), dataDir);
  const [command, subcommand] = parsed.positionals;

  if (!command) {
    throw new MediaSkillError("CLI_ARGUMENT_REQUIRED", "A command is required.");
  }

  if (command === "config") {
    if (!subcommand) {
      throw new MediaSkillError("CLI_ARGUMENT_REQUIRED", "A config subcommand is required.");
    }

    if (subcommand === "set") {
      const payload = await loadConfigSetPayload(parsed);
      await runtime.configStore.setConfig(payload);
      printJson(await runtime.configStore.getMaskedConfig(payload.provider));
      return;
    }

    if (subcommand === "get") {
      const provider = requireStringFlag(parsed, "provider") as ProviderId;
      printJson(await runtime.configStore.getMaskedConfig(provider));
      return;
    }

    if (subcommand === "list") {
      printJson(await runtime.configStore.listConfigs());
      return;
    }

    if (subcommand === "validate") {
      const provider = requireStringFlag(parsed, "provider") as ProviderId;
      printJson(await runtime.configStore.validate(provider));
      return;
    }
  }

  if (command === "preset") {
    if (!subcommand) {
      throw new MediaSkillError("CLI_ARGUMENT_REQUIRED", "A preset subcommand is required.");
    }

    if (subcommand === "upsert") {
      const type = requireStringFlag(parsed, "type") as PresetType;
      const name = requireStringFlag(parsed, "name");
      const content = requireStringFlag(parsed, "content");
      printJson(
        await runtime.presetStore.upsert({
          type,
          name,
          content,
          enabled: parsed.flags.enabled === undefined ? undefined : getBooleanFlag(parsed, "enabled"),
          isDefault: getBooleanFlag(parsed, "default"),
        }),
      );
      return;
    }

    if (subcommand === "get") {
      const type = requireStringFlag(parsed, "type") as PresetType;
      const name = requireStringFlag(parsed, "name");
      printJson(await runtime.presetStore.get(type, name));
      return;
    }

    if (subcommand === "list") {
      const type = getStringFlag(parsed, "type") as PresetType | undefined;
      printJson(await runtime.presetStore.list(type));
      return;
    }

    if (subcommand === "remove") {
      const type = requireStringFlag(parsed, "type") as PresetType;
      const name = requireStringFlag(parsed, "name");
      printJson({ removed: await runtime.presetStore.remove(type, name) });
      return;
    }

    if (subcommand === "enable" || subcommand === "disable") {
      const type = requireStringFlag(parsed, "type") as PresetType;
      const name = requireStringFlag(parsed, "name");
      printJson(await runtime.presetStore.setEnabled(type, name, subcommand === "enable"));
      return;
    }

    if (subcommand === "default") {
      const type = requireStringFlag(parsed, "type") as PresetType;
      const name = requireStringFlag(parsed, "name");
      printJson(await runtime.presetStore.setDefault(type, name));
      return;
    }
  }

  if (command === "profile") {
    if (!subcommand) {
      throw new MediaSkillError("CLI_ARGUMENT_REQUIRED", "A profile subcommand is required.");
    }

    if (subcommand === "upsert") {
      const name = requireStringFlag(parsed, "name");
      const positive = getStringFlag(parsed, "positive");
      const negative = getStringFlag(parsed, "negative");
      if (!positive && !negative) {
        throw new MediaSkillError(
          "CLI_ARGUMENT_REQUIRED",
          "Provide at least one of --positive or --negative for profile upsert.",
        );
      }
      printJson(
        await runtime.profileStore.upsert({
          name,
          positive_prompt: positive,
          negative_prompt: negative,
          enabled: parsed.flags.enabled === undefined ? undefined : getBooleanFlag(parsed, "enabled"),
          isDefault: getBooleanFlag(parsed, "default"),
        }),
      );
      return;
    }

    if (subcommand === "get") {
      const name = requireStringFlag(parsed, "name");
      printJson(await runtime.profileStore.get(name));
      return;
    }

    if (subcommand === "list") {
      printJson(await runtime.profileStore.list());
      return;
    }

    if (subcommand === "remove") {
      const name = requireStringFlag(parsed, "name");
      printJson({ removed: await runtime.profileStore.remove(name) });
      return;
    }

    if (subcommand === "enable" || subcommand === "disable") {
      const name = requireStringFlag(parsed, "name");
      printJson(await runtime.profileStore.setEnabled(name, subcommand === "enable"));
      return;
    }

    if (subcommand === "default") {
      const name = requireStringFlag(parsed, "name");
      printJson(await runtime.profileStore.setDefault(name));
      return;
    }
  }
  if (command === "capabilities") {
    const provider = requireStringFlag(parsed, "provider") as ProviderId;
    const operation = requireStringFlag(parsed, "operation") as GenerateAssetInput["operation"];
    const model = getStringFlag(parsed, "model");
    const requestStyle = getStringFlag(parsed, "request-style");
    printJson(
      await runtime.previewCapabilities({
        provider,
        operation,
        model,
        request_style: requestStyle,
      }),
    );
    return;
  }

  if (command === "generate") {
    const payload = await loadJsonPayload(parsed);
    printJson(await runtime.generate(payload));
    return;
  }

  throw new MediaSkillError("CLI_ARGUMENT_INVALID", `Unknown command: ${command}.`);
};

export const main = async (argv = process.argv.slice(2)) => {
  try {
    await run(argv);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(toErrorPayload(error), null, 2)}\n`);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}

