import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MediaSkillError } from "../errors";

const execFileAsync = promisify(execFile);
const MAX_CLIPBOARD_BUFFER = 20 * 1024 * 1024;

const CLIPBOARD_IMAGE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "Add-Type -AssemblyName System.Drawing",
  "if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { throw 'No image in clipboard.' }",
  "$image = [System.Windows.Forms.Clipboard]::GetImage()",
  "try {",
  "  $stream = New-Object System.IO.MemoryStream",
  "  try {",
  "    $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)",
  "    [Convert]::ToBase64String($stream.ToArray())",
  "  } finally {",
  "    $stream.Dispose()",
  "  }",
  "} finally {",
  "  $image.Dispose()",
  "}",
].join("; ");

export const readClipboardImageDataUrl = async () => {
  const envValue = process.env.MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL?.trim();
  if (envValue) {
    return envValue;
  }

  if (process.platform !== "win32") {
    throw new MediaSkillError(
      "CLIPBOARD_UNSUPPORTED",
      "Clipboard image source is currently supported only on Windows, or via MEDIA_SKILL_CLIPBOARD_IMAGE_DATA_URL.",
    );
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Sta", "-Command", CLIPBOARD_IMAGE_SCRIPT],
      { maxBuffer: MAX_CLIPBOARD_BUFFER },
    );

    const base64 = stdout.trim();
    if (!base64) {
      throw new Error("PowerShell returned an empty clipboard image payload.");
    }

    return `data:image/png;base64,${base64}`;
  } catch (error) {
    throw new MediaSkillError(
      "CLIPBOARD_IMAGE_UNAVAILABLE",
      "Unable to read an image from the system clipboard.",
      {
        message: error instanceof Error ? error.message : String(error),
      },
    );
  }
};
