import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

export const makeTempDir = async () => mkdtemp(join(tmpdir(), "media-skill-"));

export const removeTempDir = async (target: string) => {
  await rm(target, { recursive: true, force: true });
};

export const runCli = async (args: string[], options?: { cwd?: string; stdin?: string; env?: NodeJS.ProcessEnv }) => {
  const cliPath = join(process.cwd(), "dist", "cli.js");
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options?.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...options?.env,
      },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });

    if (options?.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
};

export const createJsonServer = async (
  handler: (request: IncomingMessage, response: ServerResponse, bodyText: string) => void,
) => {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    handler(request, response, Buffer.concat(chunks).toString("utf8"));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server address.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
};
