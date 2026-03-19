#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cliPath = resolve(process.cwd(), "dist", "cli.js");
const child = spawn(process.execPath, [cliPath, "generate", ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
