import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createJsonServer, makeTempDir, removeTempDir, runCli } from "./test-helpers";

const tempDirs: string[] = [];
const servers: Array<{ close: (cb: () => void) => void }> = [];
const previousClipboardEnv = process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL;

afterEach(async () => {
  process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL = previousClipboardEnv;
  while (servers.length > 0) {
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));
  }
  while (tempDirs.length > 0) {
    await removeTempDir(tempDirs.pop()!);
  }
});

const expectOk = (result: { code: number | null; stderr: string }) => {
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
};

describe("CLI integration", () => {
  it("runs a NovelAI-compatible txt2img flow", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);

    const api = await createJsonServer((_request, response, bodyText) => {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      expect(body.prompt).toBe("castle");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("novel-image").toString("base64"), filename: "castle.png" }],
        }),
      );
    });
    servers.push(api.server);

    const configResult = await runCli(
      [
        "config",
        "set",
        "--provider",
        "novelai_compatible",
        "--json",
        JSON.stringify({
          api_key: "secret",
          base_url: api.url,
          auth_strategy: "bearer",
          request_style: "oai_images",
          style_templates: {
            oai_images: {
              endpoint: "/images/generations",
              supports_size: true,
            },
          },
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(configResult);

    const generateResult = await runCli(
      [
        "generate",
        "--json",
        JSON.stringify({
          provider: "novelai_compatible",
          operation: "txt2img",
          prompt: "castle",
          size: "1024x1024",
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(generateResult);

    const parsed = JSON.parse(generateResult.stdout) as { assets: Array<{ path: string }> };
    expect(parsed.assets).toHaveLength(1);
    expect((await readFile(parsed.assets[0].path)).toString()).toBe("novel-image");
  });

  it("runs a NovelAI-compatible nai_compatible flow with a default persisted profile", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);

    const api = await createJsonServer((request, response, bodyText) => {
      expect(request.url).toBe("/v1/chat/completions");
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      expect(body.model).toBe("nai-diffusion-4-5-full");
      expect(body.stream).toBe(false);
      expect(body.size).toBe("1024:1024");
      expect(body.image_size).toBe("1024:1024");
      expect(body.scale).toBe(6);
      expect(body.steps).toBe(28);
      expect(body.sampler).toBe("Euler Ancestral");
      expect(body.negative_prompt).toBe("lowres, blurry");

      const messages = body.messages as Array<Record<string, unknown>>;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(String(messages[0].content)).toContain("1girl");
      expect(String(messages[0].content)).toContain("artist:alpha");
      expect(String(messages[0].content)).toContain("artist:beta");

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("nai-chat-image").toString("base64"), filename: "nai-chat.png" }],
        }),
      );
    });
    servers.push(api.server);

    const configResult = await runCli(
      [
        "config",
        "set",
        "--provider",
        "novelai_compatible",
        "--json",
        JSON.stringify({
          api_key: "secret",
          base_url: api.url,
          auth_strategy: "bearer",
          request_style: "nai_compatible",
          style_templates: {
            nai_compatible: {
              endpoint: "/v1/chat/completions",
              supports_size: true,
              supports_width_height: true,
            },
          },
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(configResult);

    const profileResult = await runCli(
      [
        "profile",
        "upsert",
        "--name",
        "anime-default",
        "--positive",
        "artist:alpha, artist:beta",
        "--negative",
        "lowres, blurry",
        "--default",
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(profileResult);

    const generateResult = await runCli(
      [
        "generate",
        "--json",
        JSON.stringify({
          provider: "novelai_compatible",
          operation: "txt2img",
          prompt_mode: "raw",
          prompt: "1girl, thick eyebrows, messy hair",
          model: "nai-diffusion-4-5-full",
          size: "1024:1024",
          steps: 28,
          cfg_scale: 6,
          sampler: "Euler Ancestral",
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(generateResult);

    const parsed = JSON.parse(generateResult.stdout) as { assets: Array<{ path: string }> };
    expect(parsed.assets).toHaveLength(1);
    expect((await readFile(parsed.assets[0].path)).toString()).toBe("nai-chat-image");
  });

  it("runs nanobanana txt2img and img2img flows through chat/completions SSE", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    let calls = 0;

    const assetServer = await createJsonServer((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.from("nano-asset"));
    });
    servers.push(assetServer.server);

    const api = await createJsonServer((request, response, bodyText) => {
      calls += 1;
      expect(request.url).toBe("/v1/chat/completions");
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      expect(body.model).toBe("internal-model");
      expect(body.stream).toBe(true);

      const messages = body.messages as Array<Record<string, unknown>>;
      if (calls === 1) {
        expect(messages[0].content).toBe("fruit crate");
      } else {
        expect(Array.isArray(messages[0].content)).toBe(true);
      }

      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        'data: {"id":"chatcmpl-heartbeat-1","object":"chat.completion.chunk","created":1773908586,"model":"vertex-ai-proxy","choices":[{"index":0,"delta":{},"finish_reason":null}]}',
        `data: {"id":"chatcmpl-proxy-1","object":"chat.completion.chunk","created":1773908586,"model":"vertex-ai-proxy","choices":[{"index":0,"delta":{"content":"![Generated Image](${assetServer.url}/generated-${calls}.png)"},"finish_reason":null}]}`,
        'data: {"id":"chatcmpl-proxy-finish","object":"chat.completion.chunk","created":1773908586,"model":"vertex-ai-proxy","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        'data: {"id":"chatcmpl-proxy-finish","object":"chat.completion.chunk","created":1773908586,"model":"vertex-ai-proxy","system_fingerprint":"","choices":[],"usage":{"prompt_tokens":1107,"completion_tokens":30,"total_tokens":1137}}',
        'data: [DONE]',
        '',
      ].join("\n"));
    });
    servers.push(api.server);

    await runCli(
      [
        "config",
        "set",
        "--provider",
        "nanobanana",
        "--json",
        JSON.stringify({
          api_key: "secret",
          base_url: `${api.url}/v1`,
          auth_strategy: "bearer",
          default_model: "internal-model",
          fixed_fields: {
            temperature: 0.7,
            top_p: 0.98,
          },
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );

    const txt2img = await runCli(
      [
        "generate",
        "--json",
        JSON.stringify({
          provider: "nanobanana",
          operation: "txt2img",
          prompt: "fruit crate",
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(txt2img);

    const txtParsed = JSON.parse(txt2img.stdout) as { assets: Array<{ path: string }> };
    expect(txtParsed.assets).toHaveLength(1);
    expect((await readFile(txtParsed.assets[0].path)).toString()).toBe("nano-asset");

    process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL = "data:image/png;base64,aGVsbG8=";
    const img2img = await runCli(
      [
        "generate",
        "--json",
        JSON.stringify({
          provider: "nanobanana",
          operation: "img2img",
          prompt: "touch up",
          source_image: { type: "clipboard", value: "current" },
        }),
      ],
      {
        cwd: process.cwd(),
        env: { MEDIA_SKILL_DATA_DIR: dir, MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL: process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL },
      },
    );
    expectOk(img2img);

    const imgParsed = JSON.parse(img2img.stdout) as { assets: Array<{ path: string }> };
    expect(imgParsed.assets).toHaveLength(1);
    expect((await readFile(imgParsed.assets[0].path)).toString()).toBe("nano-asset");
    expect(calls).toBe(2);
  });

  it("runs grok edit and grok video flows", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);

    const assetServer = await createJsonServer((_request, response) => {
      response.writeHead(200, { "content-type": "video/mp4" });
      response.end(Buffer.from("video-output"));
    });
    servers.push(assetServer.server);

    const api = await createJsonServer((_request, response, bodyText) => {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      response.writeHead(200, { "content-type": "application/json" });
      if (body.model === "grok-imagine-1.0-video") {
        response.end(
          JSON.stringify({
            data: [
              {
                url: `${assetServer.url}/video.mp4`,
                kind: "video",
              },
            ],
          }),
        );
        return;
      }

      response.end(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("grok-edit").toString("base64"), filename: "edit.png" }],
        }),
      );
    });
    servers.push(api.server);

    await runCli(
      [
        "config",
        "set",
        "--provider",
        "grok_imagine",
        "--json",
        JSON.stringify({
          api_key: "secret",
          base_url: api.url,
          auth_strategy: "bearer",
          allowed_models: ["grok-imagine-1.0-edit", "grok-imagine-1.0-video"],
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );

    const editResult = await runCli(
      [
        "generate",
        "--json",
        JSON.stringify({
          provider: "grok_imagine",
          operation: "img2img",
          model: "grok-imagine-1.0-edit",
          source_image: { type: "base64", value: "aGVsbG8=" },
        }),
      ],
      { cwd: process.cwd(), env: { MEDIA_SKILL_DATA_DIR: dir } },
    );
    expectOk(editResult);

    const videoResult = await runCli(
      [
        "generate",
        "--json",
        JSON.stringify({
          provider: "grok_imagine",
          operation: "img2video",
          model: "grok-imagine-1.0-video",
          prompt: "animate",
          source_image: { type: "base64", value: "aGVsbG8=" },
        }),
      ],
      {
        cwd: process.cwd(),
        env: {
          MEDIA_SKILL_DATA_DIR: dir,
        },
      },
    );

    expectOk(videoResult);
    const parsedVideo = JSON.parse(videoResult.stdout) as { assets: Array<{ path: string }> };
    expect(parsedVideo.assets).toHaveLength(1);
    expect((await readFile(parsedVideo.assets[0].path)).toString()).toBe("video-output");
  });
});
