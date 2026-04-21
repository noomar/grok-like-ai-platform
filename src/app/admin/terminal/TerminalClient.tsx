"use client";

import { useEffect, useRef, useState } from "react";

type Entry = {
  id: number;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cwd: string;
};

const SUGGESTIONS = [
  "uname -a",
  "ls -lah",
  "cat /proc/self/status | head",
  "env | grep -iE 'aurora|node|vercel|fly' | sort",
  "node -v && npm -v",
  "df -h /tmp || true",
  "ls /data 2>/dev/null || echo 'no /data (not on Docker Nest)'",
  "curl -sS localhost:3000/api/providers/health | head -c 400",
];

export default function TerminalClient({ host }: { host: string }) {
  const [command, setCommand] = useState("uname -a");
  const [cwd, setCwd] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length]);

  async function run(cmd?: string) {
    const c = (cmd ?? command).trim();
    if (!c || running) return;
    setRunning(true);
    try {
      const res = await fetch("/api/admin/terminal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: c, cwd: cwd || undefined }),
      });
      const data = await res.json();
      setHistory((h) => [
        ...h,
        {
          id: Date.now(),
          command: c,
          stdout: data.stdout ?? "",
          stderr: data.stderr ?? "",
          exitCode: data.exitCode ?? null,
          durationMs: data.durationMs ?? 0,
          timedOut: Boolean(data.timedOut),
          cwd: data.cwd ?? "",
        },
      ]);
      if (!cmd) setCommand("");
    } catch (err) {
      setHistory((h) => [
        ...h,
        {
          id: Date.now(),
          command: c,
          stdout: "",
          stderr: String((err as Error).message),
          exitCode: null,
          durationMs: 0,
          timedOut: false,
          cwd: cwd || "",
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span className="rounded bg-black/40 px-2 py-1 font-mono text-emerald-300">{host}</span>
          <span>working dir:</span>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="(default)"
            className="w-48 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-emerald-200 focus:border-emerald-400 focus:outline-none"
          />
          <span className="ml-auto">Enter to run · Shift+Enter for newline</span>
        </div>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
          rows={2}
          spellCheck={false}
          disabled={running}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-sm text-emerald-200 focus:border-emerald-400 focus:outline-none"
          placeholder="uname -a"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => run()}
            disabled={running || !command.trim()}
            className="rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running…" : "Run"}
          </button>
          <button
            onClick={() => setHistory([])}
            disabled={running || history.length === 0}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40"
          >
            Clear
          </button>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => run(s)}
              disabled={running}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {history.length === 0 && (
          <p className="text-sm text-white/40">No output yet. Run a command above.</p>
        )}
        {history.map((e) => (
          <div key={e.id} className="panel p-4 font-mono text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-white/50">
              <span className="text-emerald-300">$ {e.command}</span>
              <span>cwd={e.cwd}</span>
              <span>exit={String(e.exitCode)}</span>
              <span>{e.durationMs}ms</span>
              {e.timedOut && <span className="text-rose-300">(timed out)</span>}
            </div>
            {e.stdout && (
              <pre className="whitespace-pre-wrap break-words text-emerald-100">{e.stdout}</pre>
            )}
            {e.stderr && (
              <pre className="mt-2 whitespace-pre-wrap break-words text-rose-300">{e.stderr}</pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
