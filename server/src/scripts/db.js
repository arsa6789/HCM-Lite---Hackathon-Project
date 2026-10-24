import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
const dataRoot = path.join(serverRoot, ".data");
const dbPath = process.env.MONGO_DATA_DIR ?? path.join(dataRoot, "mongo");
const logPath = path.join(dataRoot, "mongod.log");
const pidPath = path.join(dataRoot, "mongod.pid");
const port = process.env.MONGO_PORT ?? "27017";
const action = process.argv[2] ?? "start";

function isRunning() {
  if (!existsSync(pidPath)) {
    return false;
  }

  const pid = Number(readFileSync(pidPath, "utf8").trim());

  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("mongod", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`mongod exited with code ${code}`));
    });
  });
}

async function start() {
  if (isRunning()) {
    console.log(`MongoDB is already running on port ${port}.`);
    return;
  }

  mkdirSync(dbPath, { recursive: true });

  await run([
    "--dbpath",
    dbPath,
    "--port",
    port,
    "--bind_ip",
    "127.0.0.1",
    "--fork",
    "--logpath",
    logPath,
    "--pidfilepath",
    pidPath,
  ]);

  console.log(`MongoDB started: mongodb://127.0.0.1:${port}`);
  console.log(`Data directory: ${dbPath}`);
}

async function stop() {
  if (!isRunning()) {
    rmSync(pidPath, { force: true });
    console.log("MongoDB is not running.");
    return;
  }

  await run(["--dbpath", dbPath, "--shutdown"]);
  rmSync(pidPath, { force: true });
  console.log("MongoDB stopped.");
}

function status() {
  console.log(isRunning() ? `MongoDB is running on port ${port}.` : "MongoDB is not running.");
}

try {
  if (action === "start") {
    await start();
  } else if (action === "stop") {
    await stop();
  } else if (action === "status") {
    status();
  } else {
    console.error(`Unknown action: ${action}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error.code === "ENOENT" ? "mongod is not installed or not on PATH." : error.message
  );
  process.exitCode = 1;
}
