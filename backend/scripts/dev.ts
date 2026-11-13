// Starts the API and one quiz worker for development, restarting each when its code changes.
// Stops both when either exits.
import { type ChildProcess, spawn } from "node:child_process";

// Keep output on restart: the two processes share one terminal.
const NODE_ARGS = [
  "--watch",
  "--watch-preserve-output",
  "--import=vite-plus/register",
  "--env-file-if-exists=.env",
];

const children: ChildProcess[] = ["src/index.ts", "src/worker.ts"].map((entry) =>
  spawn(process.execPath, [...NODE_ARGS, entry], { stdio: "inherit" }),
);

let stopping = false;
function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}

for (const child of children) child.on("exit", (code) => stopAll(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stopAll(0));
