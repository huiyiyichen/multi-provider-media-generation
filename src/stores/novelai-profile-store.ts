import { join } from "node:path";
import { MediaSkillError } from "../errors";
import { NovelAIProfileDocumentSchema } from "../schemas";
import type { NovelAIProfileDocument, NovelAIProfileEntry } from "../types";
import { readJsonFile, writeJsonFile } from "../utils/fs";

const EMPTY_PROFILE_DOCUMENT: NovelAIProfileDocument = {
  profiles: [],
};

export class NovelAIProfileStore {
  private readonly profilePath: string;

  constructor(dataDir: string) {
    this.profilePath = join(dataDir, "presets", "novelai-profiles.json");
  }

  async upsert(input: {
    name: string;
    positive_prompt?: string;
    negative_prompt?: string;
    enabled?: boolean;
    isDefault?: boolean;
  }) {
    const document = await this.readDocument();
    const now = new Date().toISOString();
    const existingIndex = document.profiles.findIndex((profile) => profile.name === input.name);

    let entry: NovelAIProfileEntry;
    if (existingIndex >= 0) {
      const existing = document.profiles[existingIndex]!;
      entry = {
        ...existing,
        positive_prompt: input.positive_prompt ?? existing.positive_prompt,
        negative_prompt: input.negative_prompt ?? existing.negative_prompt,
        enabled: input.enabled ?? existing.enabled,
        updated_at: now,
      };
      if (!entry.positive_prompt && !entry.negative_prompt) {
        throw new MediaSkillError(
          "PROFILE_INVALID",
          `NovelAI profile ${input.name} must define positive_prompt or negative_prompt.`,
        );
      }
      document.profiles[existingIndex] = entry;
    } else {
      if (!input.positive_prompt && !input.negative_prompt) {
        throw new MediaSkillError(
          "PROFILE_INVALID",
          `NovelAI profile ${input.name} must define positive_prompt or negative_prompt.`,
        );
      }
      entry = {
        name: input.name,
        positive_prompt: input.positive_prompt,
        negative_prompt: input.negative_prompt,
        enabled: input.enabled ?? true,
        created_at: now,
        updated_at: now,
      };
      document.profiles.push(entry);
    }

    if (input.isDefault) {
      document.default_profile = input.name;
    }

    await this.writeDocument(document);
    return entry;
  }

  async get(name: string) {
    const document = await this.readDocument();
    return document.profiles.find((profile) => profile.name === name) ?? null;
  }

  async list() {
    const document = await this.readDocument();
    return document.profiles;
  }

  async remove(name: string) {
    const document = await this.readDocument();
    document.profiles = document.profiles.filter((profile) => profile.name !== name);
    if (document.default_profile === name) {
      delete document.default_profile;
    }
    await this.writeDocument(document);
    return true;
  }

  async setEnabled(name: string, enabled: boolean) {
    const document = await this.readDocument();
    const profile = document.profiles.find((item) => item.name === name);
    if (!profile) {
      throw new MediaSkillError("PROFILE_NOT_FOUND", `NovelAI profile ${name} does not exist.`);
    }

    profile.enabled = enabled;
    profile.updated_at = new Date().toISOString();
    await this.writeDocument(document);
    return profile;
  }

  async setDefault(name: string) {
    const document = await this.readDocument();
    const profile = document.profiles.find((item) => item.name === name);
    if (!profile) {
      throw new MediaSkillError("PROFILE_NOT_FOUND", `NovelAI profile ${name} does not exist.`);
    }

    document.default_profile = name;
    await this.writeDocument(document);
    return profile;
  }

  async resolve(requestedName?: string) {
    const document = await this.readDocument();
    const name = requestedName ?? document.default_profile;
    if (!name) {
      return null;
    }

    const profile = document.profiles.find((item) => item.name === name);
    if (!profile) {
      throw new MediaSkillError("PROFILE_NOT_FOUND", `NovelAI profile ${name} does not exist.`);
    }

    if (!profile.enabled) {
      throw new MediaSkillError("PROFILE_DISABLED", `NovelAI profile ${name} is disabled.`);
    }

    return profile;
  }

  async getDocument() {
    return this.readDocument();
  }

  private async readDocument() {
    const document = await readJsonFile<NovelAIProfileDocument>(this.profilePath, EMPTY_PROFILE_DOCUMENT);
    return NovelAIProfileDocumentSchema.parse(document);
  }

  private async writeDocument(document: NovelAIProfileDocument) {
    await writeJsonFile(this.profilePath, document);
  }
}
