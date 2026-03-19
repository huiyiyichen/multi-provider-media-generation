import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type {
  CapabilityDescriptor,
  GenerateAssetField,
  GenerateAssetInput,
  ImageSource,
  ProviderConfig,
  ProviderId,
  RequestStyle,
} from "../types";

export const maskSecret = (secret: string) => {
  if (secret.length <= 6) {
    return `${secret.slice(0, 1)}***${secret.slice(-1)}`;
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
};

export const createRequestId = () => randomUUID();

export const dateStamp = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const joinUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

export const collectProvidedFields = (input: GenerateAssetInput): GenerateAssetField[] => {
  const provided: GenerateAssetField[] = [];

  for (const [key, value] of Object.entries(input) as [keyof GenerateAssetInput, unknown][]) {
    if (key === "provider" || key === "operation") {
      continue;
    }

    if (value !== undefined) {
      provided.push(key as GenerateAssetField);
    }
  }

  return provided;
};

export const normalizeSourceImages = (input: GenerateAssetInput): ImageSource[] => {
  const images: ImageSource[] = [];

  if (input.source_image) {
    images.push(input.source_image);
  }

  if (input.source_images) {
    images.push(...input.source_images);
  }

  return images;
};

export const pickAllowedFields = (
  input: GenerateAssetInput,
  capability: CapabilityDescriptor,
): Partial<Record<GenerateAssetField, unknown>> => {
  const picked: Partial<Record<GenerateAssetField, unknown>> = {};

  for (const field of capability.allowed_fields) {
    const typedField = field as GenerateAssetField;
    const value = input[typedField];
    if (value !== undefined) {
      picked[typedField] = value;
    }
  }

  return picked;
};

export const defaultRequestStyleForProvider = (
  provider: ProviderId,
  config: ProviderConfig,
): RequestStyle | undefined => {
  if (provider === "novelai_official") {
    return "official";
  }

  return config.request_style;
};

export const mergeStringArrays = (left: readonly string[], right?: readonly string[]) => {
  const set = new Set(left);
  for (const item of right ?? []) {
    set.add(item);
  }
  return [...set];
};

export const inferExtension = (filename?: string, mimeType?: string, fallback = "bin") => {
  if (filename) {
    const extension = extname(filename);
    if (extension) {
      return extension.replace(/^\./, "");
    }
  }

  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "application/zip":
      return "zip";
    default:
      return fallback;
  }
};

export const fileNameFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.at(-1);
  } catch {
    return undefined;
  }
};

export const dataUrlToBase64 = (value: string) => {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return undefined;
  }

  return {
    mimeType: match[1],
    payload: match[2],
  };
};
