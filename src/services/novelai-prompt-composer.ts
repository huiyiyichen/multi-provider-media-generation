import { MediaSkillError } from "../errors";
import type { GenerateAssetInput, PromptBundle } from "../types";
import { NovelAIProfileStore } from "../stores/novelai-profile-store";
import { NovelAIPresetStore } from "../stores/novelai-preset-store";

const joinPromptParts = (parts: Array<string | undefined>) => {
  const compact = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return compact.length > 0 ? compact.join(", ") : undefined;
};

export class NovelAIPromptComposer {
  constructor(
    private readonly presetStore: NovelAIPresetStore,
    private readonly profileStore: NovelAIProfileStore,
  ) {}

  async compose(input: GenerateAssetInput): Promise<PromptBundle> {
    const mode = input.prompt_mode ?? "raw";
    const profile = await this.profileStore.resolve(input.profile_name);

    if (mode === "raw") {
      const compositionOnlyFields = [
        input.content_prompt,
        input.artist_preset,
        input.style_preset,
        input.negative_preset,
        input.extra_positive,
        input.extra_negative,
      ];
      if (compositionOnlyFields.some((value) => value !== undefined)) {
        throw new MediaSkillError(
          "PROMPT_MODE_CONFLICT",
          "content_prompt, presets, and extra prompt fragments are only allowed when prompt_mode is composed.",
        );
      }

      const finalPositive = joinPromptParts([input.prompt, profile?.positive_prompt]);
      const finalNegative = joinPromptParts([profile?.negative_prompt, input.negative_prompt]);

      if (!finalPositive) {
        throw new MediaSkillError(
          "PROMPT_REQUIRED",
          "prompt is required when prompt_mode is raw unless a default or requested NovelAI profile provides positive_prompt.",
        );
      }

      return {
        final_positive_prompt: finalPositive,
        final_negative_prompt: finalNegative,
      };
    }

    if (input.prompt) {
      throw new MediaSkillError(
        "PROMPT_MODE_CONFLICT",
        "prompt must be omitted when prompt_mode is composed. Use content_prompt instead.",
      );
    }

    const artistPreset = await this.presetStore.resolve("artist", input.artist_preset);
    const stylePreset = await this.presetStore.resolve("style", input.style_preset);
    const negativePreset = await this.presetStore.resolve("negative", input.negative_preset);

    const finalPositive = joinPromptParts([
      input.content_prompt,
      profile?.positive_prompt,
      artistPreset?.content,
      stylePreset?.content,
      input.extra_positive,
    ]);
    const finalNegative = joinPromptParts([
      profile?.negative_prompt,
      negativePreset?.content,
      input.negative_prompt,
      input.extra_negative,
    ]);

    if (!finalPositive) {
      throw new MediaSkillError(
        "PROMPT_REQUIRED",
        "composed prompt mode requires content_prompt, a profile positive_prompt, a default preset, or extra_positive content.",
      );
    }

    return {
      final_positive_prompt: finalPositive,
      final_negative_prompt: finalNegative,
    };
  }
}
