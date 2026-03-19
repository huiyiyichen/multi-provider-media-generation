import { afterEach, describe, expect, it } from "vitest";
import { NovelAIProfileStore } from "../src/stores/novelai-profile-store";
import { NovelAIPresetStore } from "../src/stores/novelai-preset-store";
import { ProviderConfigStore } from "../src/stores/provider-config-store";
import { makeTempDir, removeTempDir } from "./test-helpers";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await removeTempDir(tempDirs.pop()!);
  }
});

describe("stores", () => {
  it("persists provider configs and masks api keys when reading for display", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const store = new ProviderConfigStore(dir);

    await store.setConfig({
      provider: "grok_imagine",
      api_key: "super-secret-token",
      base_url: "https://example.invalid",
      auth_strategy: "bearer",
      allowed_models: ["grok-imagine-1.0"],
    });

    const runtimeConfig = await store.requireConfig("grok_imagine");
    const masked = await store.getMaskedConfig("grok_imagine");

    expect(runtimeConfig.api_key).toBe("super-secret-token");
    expect(masked?.api_key).toContain("...");
    expect(masked?.api_key).not.toBe("super-secret-token");
  });

  it("supports preset CRUD, defaults, and enabled flags", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const store = new NovelAIPresetStore(dir);

    await store.upsert({ type: "artist", name: "demo", content: "artist:demo", isDefault: true });
    await store.setEnabled("artist", "demo", false);
    await expect(store.resolve("artist", "demo")).rejects.toThrow(/disabled/);
    await store.setEnabled("artist", "demo", true);

    const resolved = await store.resolve("artist", undefined);
    expect(resolved?.content).toBe("artist:demo");

    await store.remove("artist", "demo");
    expect(await store.get("artist", "demo")).toBeNull();
  });

  it("supports NovelAI profile CRUD, defaults, and enabled flags", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const store = new NovelAIProfileStore(dir);

    await store.upsert({
      name: "anime-default",
      positive_prompt: "artist:alpha, artist:beta",
      negative_prompt: "lowres, blurry",
      isDefault: true,
    });
    await store.setEnabled("anime-default", false);
    await expect(store.resolve("anime-default")).rejects.toThrow(/disabled/);
    await store.setEnabled("anime-default", true);

    const resolved = await store.resolve();
    expect(resolved?.positive_prompt).toContain("artist:alpha");
    expect(resolved?.negative_prompt).toContain("lowres");

    await store.remove("anime-default");
    expect(await store.get("anime-default")).toBeNull();
  });
});
