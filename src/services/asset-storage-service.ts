import { access, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { MediaSkillError } from "../errors";
import type {
  GenerateAssetResult,
  ParsedAdapterResponse,
  ParsedAssetSource,
  ResolvedRequest,
  SavedAsset,
} from "../types";
import { dataUrlToBase64, dateStamp, fileNameFromUrl, inferExtension } from "../utils/common";
import { ensureDir, writeJsonFile } from "../utils/fs";

const SKILL_NAME = "multi-provider-media-generation";
const NON_ASCII_PATTERN = /[^\u0000-\u007F]/;

export class AssetStorageService {
  private readonly displayDataDir?: string;

  constructor(private readonly dataDir: string) {
    this.displayDataDir = this.resolveDisplayDataDir();
  }

  async saveRun(request: ResolvedRequest, parsed: ParsedAdapterResponse): Promise<GenerateAssetResult> {
    const stamp = dateStamp();
    const outputDir = join(this.dataDir, "runs", stamp);
    const displayOutputDir = join(this.displayDataDir ?? this.dataDir, "runs", stamp);
    await ensureDir(outputDir);
    if (displayOutputDir !== outputDir) {
      await ensureDir(displayOutputDir);
    }

    const assets: SavedAsset[] = [];
    for (const [index, asset] of parsed.assets.entries()) {
      const saved = await this.saveAsset(outputDir, displayOutputDir, request.request_id, index + 1, asset);
      assets.push(...saved);
    }

    let rawResponsePath: string | undefined;
    if (request.input.save_raw_response && parsed.raw_response !== undefined) {
      rawResponsePath = await this.saveRawResponse(outputDir, request.request_id, parsed.raw_response);
    }

    return {
      request_id: request.request_id,
      provider: request.provider,
      operation: request.operation,
      request_style: request.request_style,
      model: request.model,
      output_dir: outputDir,
      display_output_dir: displayOutputDir,
      raw_response_path: rawResponsePath,
      assets,
    };
  }

  private async saveRawResponse(outputDir: string, requestId: string, rawResponse: unknown) {
    if (rawResponse instanceof Uint8Array) {
      const rawPath = await this.createUniquePath(outputDir, `${requestId}-raw-response`, "bin");
      await writeFile(rawPath, rawResponse);
      return rawPath;
    }

    const rawPath = await this.createUniquePath(outputDir, `${requestId}-raw-response`, "json");
    await writeJsonFile(rawPath, rawResponse);
    return rawPath;
  }

  private async saveAsset(
    outputDir: string,
    displayOutputDir: string,
    requestId: string,
    index: number,
    asset: ParsedAssetSource,
  ): Promise<SavedAsset[]> {
    switch (asset.data_type) {
      case "url": {
        const response = await fetch(String(asset.value));
        if (!response.ok) {
          throw new MediaSkillError(
            "URL_FETCH_FAILED",
            `Failed to download asset from ${String(asset.value)} (${response.status}).`,
          );
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const mimeType = asset.mime_type ?? response.headers.get("content-type") ?? undefined;
        const filename = asset.filename ?? fileNameFromUrl(String(asset.value));
        if (mimeType === "application/zip" || filename?.endsWith(".zip")) {
          return this.saveZipBytes(outputDir, displayOutputDir, requestId, index, bytes);
        }

        return [
          await this.writeBinaryAsset(
            outputDir,
            displayOutputDir,
            requestId,
            index,
            asset.kind,
            bytes,
            filename,
            mimeType,
            "url",
          ),
        ];
      }
      case "base64": {
        const decoded = dataUrlToBase64(String(asset.value));
        const base64Payload = decoded?.payload ?? String(asset.value);
        const mimeType = decoded?.mimeType ?? asset.mime_type;
        const bytes = new Uint8Array(Buffer.from(base64Payload, "base64"));
        if (mimeType === "application/zip" || asset.filename?.endsWith(".zip")) {
          return this.saveZipBytes(outputDir, displayOutputDir, requestId, index, bytes);
        }

        return [
          await this.writeBinaryAsset(
            outputDir,
            displayOutputDir,
            requestId,
            index,
            asset.kind,
            bytes,
            asset.filename,
            mimeType,
            "base64",
          ),
        ];
      }
      case "binary":
        return [
          await this.writeBinaryAsset(
            outputDir,
            displayOutputDir,
            requestId,
            index,
            asset.kind,
            asset.value as Uint8Array,
            asset.filename,
            asset.mime_type,
            "binary",
          ),
        ];
      case "zip":
        return this.saveZipBytes(outputDir, displayOutputDir, requestId, index, asset.value as Uint8Array);
      default:
        throw new MediaSkillError("UNSUPPORTED_ASSET_SOURCE", `Unsupported asset source type: ${asset.data_type}.`);
    }
  }

  private async saveZipBytes(
    outputDir: string,
    displayOutputDir: string,
    requestId: string,
    index: number,
    bytes: Uint8Array,
  ): Promise<SavedAsset[]> {
    const extracted = unzipSync(bytes);
    const assets: SavedAsset[] = [];
    let entryIndex = 0;

    for (const [filename, fileBytes] of Object.entries(extracted)) {
      entryIndex += 1;
      assets.push(
        await this.writeBinaryAsset(
          outputDir,
          displayOutputDir,
          requestId,
          Number(`${index}${String(entryIndex).padStart(2, "0")}`),
          this.kindFromFilename(filename),
          fileBytes,
          filename,
          undefined,
          "zip",
        ),
      );
    }

    return assets;
  }

  private async writeBinaryAsset(
    outputDir: string,
    displayOutputDir: string,
    requestId: string,
    index: number,
    kind: SavedAsset["kind"],
    bytes: Uint8Array,
    filename: string | undefined,
    mimeType: string | undefined,
    sourceType: SavedAsset["source_type"],
  ): Promise<SavedAsset> {
    const extension = inferExtension(filename, mimeType, kind === "video" ? "mp4" : "png");
    const baseName = filename ? `${requestId}-${basename(filename)}` : `${requestId}-${kind}-${String(index).padStart(2, "0")}`;
    const targetPath = await this.createUniquePath(outputDir, baseName.replace(/\.[^.]+$/, ""), extension);
    await ensureDir(outputDir);
    await writeFile(targetPath, bytes);

    const displayPath = await this.writeDisplayAsset(displayOutputDir, targetPath, extension, bytes);

    return {
      kind,
      path: targetPath,
      display_path: displayPath,
      filename: basename(targetPath),
      source_type: sourceType,
      mime_type: mimeType,
      size_bytes: bytes.byteLength,
    };
  }

  private async writeDisplayAsset(displayOutputDir: string, targetPath: string, extension: string, bytes: Uint8Array) {
    if (resolve(displayOutputDir) === resolve(dirname(targetPath))) {
      return targetPath;
    }

    await ensureDir(displayOutputDir);
    const displayBaseName = basename(targetPath).replace(/\.[^.]+$/, "");
    const displayPath = await this.createUniquePath(displayOutputDir, displayBaseName, extension);
    await writeFile(displayPath, bytes);
    return displayPath;
  }

  private resolveDisplayDataDir() {
    const explicit = process.env.MEDIA_SKILL_DISPLAY_DATA_DIR?.trim();
    if (explicit) {
      return resolve(explicit);
    }

    const normalizedDataDir = resolve(this.dataDir);
    if (!NON_ASCII_PATTERN.test(normalizedDataDir) && process.env.MEDIA_SKILL_FORCE_DISPLAY_MIRROR !== "1") {
      return undefined;
    }

    const codexHome = process.env.CODEX_HOME?.trim();
    if (codexHome) {
      return resolve(codexHome, "skills", SKILL_NAME, "data");
    }

    const userHome = process.env.USERPROFILE?.trim() || process.env.HOME?.trim() || homedir();
    if (!userHome) {
      return undefined;
    }

    return resolve(userHome, ".codex", "skills", SKILL_NAME, "data");
  }

  private async createUniquePath(outputDir: string, baseName: string, extension: string) {
    const safeBase = baseName.replace(/[\\/:*?"<>|]/g, "-");
    const normalizedExtension = extension.replace(/^\./, "");
    let candidate = join(outputDir, `${safeBase}.${normalizedExtension}`);
    let suffix = 1;

    while (true) {
      try {
        await access(candidate);
        candidate = join(outputDir, `${safeBase}-${suffix}.${normalizedExtension}`);
        suffix += 1;
      } catch {
        return candidate;
      }
    }
  }

  private kindFromFilename(filename: string): SavedAsset["kind"] {
    if (/\.(mp4|mov|webm)$/i.test(filename)) {
      return "video";
    }

    return "image";
  }
}

