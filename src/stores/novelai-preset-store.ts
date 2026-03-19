import { join } from "node:path";
import { MediaSkillError } from "../errors";
import { NovelAIPresetDocumentSchema } from "../schemas";
import type { NovelAIPresetDocument, NovelAIPresetEntry, PresetType } from "../types";
import { readJsonFile, writeJsonFile } from "../utils/fs";

const EMPTY_PRESET_DOCUMENT: NovelAIPresetDocument = {
  presets: [],
  defaults: {},
};

export class NovelAIPresetStore {
  private readonly presetPath: string;

  constructor(dataDir: string) {
    this.presetPath = join(dataDir, "presets", "novelai-presets.json");
  }

  async upsert(input: {
    type: PresetType;
    name: string;
    content: string;
    enabled?: boolean;
    isDefault?: boolean;
  }) {
    const document = await this.readDocument();
    const now = new Date().toISOString();
    const existingIndex = document.presets.findIndex(
      (preset) => preset.type === input.type && preset.name === input.name,
    );

    let entry: NovelAIPresetEntry;
    if (existingIndex >= 0) {
      const existing = document.presets[existingIndex]!;
      entry = {
        ...existing,
        content: input.content,
        enabled: input.enabled ?? existing.enabled,
        updated_at: now,
      };
      document.presets[existingIndex] = entry;
    } else {
      entry = {
        type: input.type,
        name: input.name,
        content: input.content,
        enabled: input.enabled ?? true,
        created_at: now,
        updated_at: now,
      };
      document.presets.push(entry);
    }

    if (input.isDefault) {
      document.defaults[input.type] = input.name;
    }

    await this.writeDocument(document);
    return entry;
  }

  async get(type: PresetType, name: string) {
    const document = await this.readDocument();
    return document.presets.find((preset) => preset.type === type && preset.name === name) ?? null;
  }

  async list(type?: PresetType) {
    const document = await this.readDocument();
    return type ? document.presets.filter((preset) => preset.type === type) : document.presets;
  }

  async remove(type: PresetType, name: string) {
    const document = await this.readDocument();
    document.presets = document.presets.filter((preset) => !(preset.type === type && preset.name === name));
    if (document.defaults[type] === name) {
      delete document.defaults[type];
    }
    await this.writeDocument(document);
    return true;
  }

  async setEnabled(type: PresetType, name: string, enabled: boolean) {
    const document = await this.readDocument();
    const preset = document.presets.find((item) => item.type === type && item.name === name);
    if (!preset) {
      throw new MediaSkillError("PRESET_NOT_FOUND", `Preset ${type}/${name} does not exist.`);
    }

    preset.enabled = enabled;
    preset.updated_at = new Date().toISOString();
    await this.writeDocument(document);
    return preset;
  }

  async setDefault(type: PresetType, name: string) {
    const document = await this.readDocument();
    const preset = document.presets.find((item) => item.type === type && item.name === name);
    if (!preset) {
      throw new MediaSkillError("PRESET_NOT_FOUND", `Preset ${type}/${name} does not exist.`);
    }

    document.defaults[type] = name;
    await this.writeDocument(document);
    return preset;
  }

  async resolve(type: PresetType, requestedName?: string) {
    const document = await this.readDocument();
    const name = requestedName ?? document.defaults[type];
    if (!name) {
      return null;
    }

    const preset = document.presets.find((item) => item.type === type && item.name === name);
    if (!preset) {
      throw new MediaSkillError("PRESET_NOT_FOUND", `Preset ${type}/${name} does not exist.`);
    }

    if (!preset.enabled) {
      throw new MediaSkillError("PRESET_DISABLED", `Preset ${type}/${name} is disabled.`);
    }

    return preset;
  }

  async getDocument() {
    return this.readDocument();
  }

  private async readDocument() {
    const document = await readJsonFile<NovelAIPresetDocument>(this.presetPath, EMPTY_PRESET_DOCUMENT);
    return NovelAIPresetDocumentSchema.parse(document);
  }

  private async writeDocument(document: NovelAIPresetDocument) {
    await writeJsonFile(this.presetPath, document);
  }
}
