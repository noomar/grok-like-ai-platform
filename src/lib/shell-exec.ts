import { spawn } from "node:child_process";

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
};

export async function execShell(
  command: string,
  opts: { cwd?: string; timeoutMs?: number; maxOutput?: number } = {},
): Promise<ShellResult> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const maxOutput = opts.maxOutput ?? 64 * 1024;
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], {
      cwd: opts.cwd && opts.cwd.startsWith("/") ? opts.cwd : undefined,
      env: { ...process.env, PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
      if (stdout.length > maxOutput) {
        stdout = stdout.slice(0, maxOutput) + "\n…[truncated]";
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
      if (stderr.length > maxOutput) {
        stderr = stderr.slice(0, maxOutput) + "\n…[truncated]";
        child.kill("SIGKILL");
      }
    });
    child.on("error", (err) => {
      clearTimeout(killTimer);
      resolve({
        stdout,
        stderr: stderr + `\n[spawn error: ${err.message}]`,
        exitCode: null,
        timedOut,
        durationMs: Date.now() - start,
      });
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
      });
    });
  });
}
