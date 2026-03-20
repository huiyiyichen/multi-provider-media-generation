import { afterEach, describe, expect, it } from "vitest";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { AssetStorageService } from "../src/services/asset-storage-service";
import type { ParsedAdapterResponse, ResolvedRequest } from "../src/types";
import { makeTempDir, removeTempDir, createJsonServer } from "./test-helpers";

const tempDirs: string[] = [];
const servers: Array<{ close: () => void }> = [];
const previousDisplayDataDir = process.env.MEDIA_SKILL_DISPLAY_DATA_DIR;
const previousForceDisplayMirror = process.env.MEDIA_SKILL_FORCE_DISPLAY_MIRROR;

afterEach(async () => {
  process.env.MEDIA_SKILL_DISPLAY_DATA_DIR = previousDisplayDataDir;
  process.env.MEDIA_SKILL_FORCE_DISPLAY_MIRROR = previousForceDisplayMirror;
  while (servers.length > 0) {
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));
  }
  while (tempDirs.length > 0) {
    await removeTempDir(tempDirs.pop()!);
  }
});

const baseRequest = (dataDir: string): ResolvedRequest => ({
  request_id: "request-1",
  provider: "nanobanana",
  operation: "txt2img",
  request_style: undefined,
  model: undefined,
  config: {
    provider: "nanobanana",
    api_key: "secret",
    base_url: "https://example.invalid",
    auth_strategy: "bearer",
  },
  capabilities: {
    key: "nanobanana::provider::txt2img",
    provider: "nanobanana",
    operation: "txt2img",
    supports_txt2img: true,
    supports_img2img: false,
    supports_img2video: false,
    supports_multi_image_input: false,
    supports_mask_image: false,
    supports_negative_prompt: false,
    supports_model: false,
    supports_size: false,
    supports_width_height: false,
    supports_steps: false,
    supports_cfg_scale: false,
    supports_seed: false,
    supports_sampler: false,
    supports_n: false,
    supports_response_format: false,
    supports_presets: false,
    supports_raw_prompt_mode: false,
    supports_composed_prompt_mode: false,
    allowed_fields: ["prompt"],
    required_fields: ["prompt"],
    allowed_models: [],
    max_input_images: 0,
    requires_source_image: false,
  },
  input: {
    provider: "nanobanana",
    operation: "txt2img",
    prompt: "hello",
    save_raw_response: true,
  },
  filtered_input: { prompt: "hello" },
  prompt_bundle: { final_positive_prompt: "hello" },
  source_images: [],
});

describe("AssetStorageService", () => {
  it("saves assets directly under the date directory without metadata.json", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const service = new AssetStorageService(dir);
    const server = await createJsonServer((_request, response) => {
      response.writeHead(200, { "content-type": "video/mp4" });
      response.end(Buffer.from("video-bytes"));
    });
    servers.push(server.server);

    const zipBytes = zipSync({
      "first.png": strToU8("image-one"),
      "second.png": strToU8("image-two"),
    });

    const parsed: ParsedAdapterResponse = {
      assets: [
        { kind: "image", data_type: "base64", value: Buffer.from("image-data").toString("base64"), filename: "image.png", mime_type: "image/png" },
        { kind: "video", data_type: "url", value: `${server.url}/video.mp4`, filename: "video.mp4", mime_type: "video/mp4" },
        { kind: "image", data_type: "binary", value: new Uint8Array(Buffer.from("binary-image")), filename: "binary.png", mime_type: "image/png" },
        { kind: "image", data_type: "zip", value: zipBytes, filename: "bundle.zip", mime_type: "application/zip" },
      ],
      raw_response: { ok: true },
    };

    const result = await service.saveRun(baseRequest(dir), parsed);

    expect(result.assets).toHaveLength(5);
    expect(result.output_dir).toMatch(/runs[\\/][0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    expect(result.display_output_dir).toBe(result.output_dir);
    expect(result.raw_response_path).toMatch(/request-1-raw-response\.json$/);
    expect(result.metadata_path).toBeUndefined();
    expect(result.assets.every((asset) => asset.path.startsWith(result.output_dir))).toBe(true);
    expect(result.assets.every((asset) => asset.display_path === asset.path)).toBe(true);
    expect(result.assets.every((asset) => !asset.path.includes(`request-1${require("node:path").sep}request-1`))).toBe(true);

    const entries = await readdir(result.output_dir);
    expect(entries.some((entry) => entry === "metadata.json")).toBe(false);
    expect(entries.some((entry) => entry.startsWith("request-1-image"))).toBe(true);
    expect(entries.some((entry) => entry.startsWith("request-1-raw-response"))).toBe(true);

    await expect(access(result.raw_response_path!)).resolves.toBeUndefined();
    await expect(access(result.assets[0].display_path)).resolves.toBeUndefined();
    expect((await readFile(result.assets[0].path)).byteLength).toBeGreaterThan(0);
  });

  it("mirrors display assets into a stable display data directory when configured", async () => {
    const dir = await makeTempDir();
    const displayDir = await makeTempDir();
    tempDirs.push(dir, displayDir);
    process.env.MEDIA_SKILL_DISPLAY_DATA_DIR = displayDir;

    const service = new AssetStorageService(dir);
    const parsed: ParsedAdapterResponse = {
      assets: [
        { kind: "image", data_type: "base64", value: Buffer.from("mirror-image").toString("base64"), filename: "mirror.png", mime_type: "image/png" },
      ],
    };

    const result = await service.saveRun(baseRequest(dir), parsed);

    expect(result.output_dir).toMatch(/runs[\\/][0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    expect(result.display_output_dir).toBe(join(displayDir, "runs", result.output_dir.split(/[/\\]/).at(-1)!));
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].path.startsWith(result.output_dir)).toBe(true);
    expect(result.assets[0].display_path.startsWith(result.display_output_dir)).toBe(true);
    expect(result.assets[0].display_path).not.toBe(result.assets[0].path);
    expect((await readFile(result.assets[0].display_path)).toString()).toBe("mirror-image");
  });
});
