import { spawn } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const services = [
  {
    name: "web",
    command: npmCommand,
    args: ["run", "dev:web"],
    cwd: process.cwd(),
  },
  {
    name: "api",
    command: npmCommand,
    args: ["--prefix", "server", "run", "dev"],
    cwd: process.cwd(),
  },
];

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) child.kill(signal);
  }
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  children.set(service.name, child);
  child.on("error", (error) => {
    console.error(`[${service.name}] failed to start: ${error.message}`);
    exitCode = 1;
    stopAll();
  });
  child.on("exit", (code, signal) => {
    children.delete(service.name);
    if (!shuttingDown) {
      if (code !== 0) {
        exitCode = code ?? 1;
        console.error(`[${service.name}] exited unexpectedly${signal ? ` (${signal})` : ""}. Stopping the other service.`);
      }
      stopAll();
    }
    if (children.size === 0) process.exitCode = exitCode;
  });
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
