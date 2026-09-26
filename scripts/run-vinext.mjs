import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
if (!command) throw new Error("Expected a vinext command: dev, build, or start.");

const cli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const env = {
  ...process.env,
  WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
};

const child = spawn(process.execPath, [cli, command, ...process.argv.slice(3)], {
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
