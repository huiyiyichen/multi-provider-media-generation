import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir, runCli } from "./test-helpers";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await removeTempDir(tempDirs.pop()!);
  }
});

describe("CLI interactive config", () => {
  it("prompts for provider config, accepts numeric provider choice, and applies defaults", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);

    const result = await runCli(["config", "set", "--interactive"], {
      cwd: process.cwd(),
      env: { MEDIA_SKILL_DATA_DIR: dir },
      stdin: [
        "4",
        "https://example.com",
        "secret-key",
        "grok-imagine-1.0, grok-imagine-1.0-edit",
      ].join("\n") + "\n",
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("进入交互式配置");
    expect(result.stdout).toContain("请选择 provider");

    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      provider: string;
      default_model?: string;
      allowed_models?: string[];
      api_key: string;
      auth_strategy: string;
      timeout_ms: number;
    };
    expect(parsed.provider).toBe("grok_imagine");
    expect(parsed.default_model).toBe("grok-imagine-1.0");
    expect(parsed.allowed_models).toEqual(["grok-imagine-1.0", "grok-imagine-1.0-edit"]);
    expect(parsed.auth_strategy).toBe("bearer");
    expect(parsed.timeout_ms).toBe(300000);
    expect(parsed.api_key).not.toBe("secret-key");

    const stored = await runCli(["config", "get", "--provider", "grok_imagine"], {
      cwd: process.cwd(),
      env: { MEDIA_SKILL_DATA_DIR: dir },
    });

    expect(stored.code).toBe(0);
    const storedParsed = JSON.parse(stored.stdout) as {
      allowed_models?: string[];
      timeout_ms: number;
      auth_strategy: string;
    };
    expect(storedParsed.allowed_models).toEqual(["grok-imagine-1.0", "grok-imagine-1.0-edit"]);
    expect(storedParsed.timeout_ms).toBe(300000);
    expect(storedParsed.auth_strategy).toBe("bearer");
  });
});
