import { afterEach, describe, expect, it } from "vitest";
import { NovelAIPromptComposer } from "../src/services/novelai-prompt-composer";
import { NovelAIProfileStore } from "../src/stores/novelai-profile-store";
import { NovelAIPresetStore } from "../src/stores/novelai-preset-store";
import { makeTempDir, removeTempDir } from "./test-helpers";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await removeTempDir(tempDirs.pop()!);
  }
});

describe("NovelAIPromptComposer", () => {
  it("returns the raw prompt plus default profile in raw mode", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const presetStore = new NovelAIPresetStore(dir);
    const profileStore = new NovelAIProfileStore(dir);
    await profileStore.upsert({
      name: "anime-default",
      positive_prompt: "artist:alpha, artist:beta",
      negative_prompt: "lowres, blurry",
      isDefault: true,
    });
    const composer = new NovelAIPromptComposer(presetStore, profileStore);

    await expect(
      composer.compose({
        provider: "novelai_official",
        operation: "txt2img",
        prompt_mode: "raw",
        prompt: "1girl, thick eyebrows",
      }),
    ).resolves.toEqual({
      final_positive_prompt: "1girl, thick eyebrows, artist:alpha, artist:beta",
      final_negative_prompt: "lowres, blurry",
    });
  });

  it("composes defaults, profile, and extras in composed mode", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const presetStore = new NovelAIPresetStore(dir);
    const profileStore = new NovelAIProfileStore(dir);
    await presetStore.upsert({ type: "artist", name: "artist-default", content: "artist:alpha", isDefault: true });
    await presetStore.upsert({ type: "style", name: "style-default", content: "style:cinematic", isDefault: true });
    await presetStore.upsert({ type: "negative", name: "negative-default", content: "blurry", isDefault: true });
    await profileStore.upsert({
      name: "anime-default",
      positive_prompt: "artist:beta, quality tags",
      negative_prompt: "bad anatomy",
      isDefault: true,
    });
    const composer = new NovelAIPromptComposer(presetStore, profileStore);

    await expect(
      composer.compose({
        provider: "novelai_official",
        operation: "txt2img",
        prompt_mode: "composed",
        content_prompt: "1girl, thick eyebrows, messy hair",
        extra_positive: "cinematic lighting",
        extra_negative: "low quality",
      }),
    ).resolves.toEqual({
      final_positive_prompt:
        "1girl, thick eyebrows, messy hair, artist:beta, quality tags, artist:alpha, style:cinematic, cinematic lighting",
      final_negative_prompt: "bad anatomy, blurry, low quality",
    });
  });

  it("rejects composition-only fields in raw mode", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const composer = new NovelAIPromptComposer(new NovelAIPresetStore(dir), new NovelAIProfileStore(dir));

    await expect(
      composer.compose({
        provider: "novelai_official",
        operation: "txt2img",
        prompt_mode: "raw",
        prompt: "hello",
        extra_positive: "should fail",
      }),
    ).rejects.toThrow(/only allowed when prompt_mode is composed/);
  });
});
