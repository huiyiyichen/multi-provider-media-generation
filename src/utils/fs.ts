import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ensureDir = async (targetPath: string) => {
  await mkdir(targetPath, { recursive: true });
};

export const fileExists = async (targetPath: string) => {
  try {
    await readFile(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const readJsonFile = async <T>(targetPath: string, fallback: T): Promise<T> => {
  try {
    const raw = await readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJsonFile = async (targetPath: string, value: unknown) => {
  await ensureDir(dirname(targetPath));
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const readUtf8File = async (targetPath: string) => readFile(targetPath, "utf8");
