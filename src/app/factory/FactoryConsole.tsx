"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clapperboard,
  Factory as FactoryIcon,
  Loader2,
  Music,
  Play,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import type { FactoryJob } from "@/lib/store";

const VOICES = [
  { id: "aria-neural", label: "Aria · warm" },
  { id: "orion-tts", label: "Orion · deep" },
  { id: "lumen-tts", label: "Lumen · crisp" },
  { id: "mira-tts", label: "Mira · youthful" },
];

const MOODS = [
  { id: "cinematic-uplift", label: "Cinematic uplift" },
  { id: "lofi-chill", label: "Lo-fi chill" },
  { id: "trailer-epic", label: "Trailer epic" },
  { id: "corporate-clean", label: "Corporate clean" },
  { id: "dark-tension", label: "Dark tension" },
  { id: "pop-energetic", label: "Pop energetic" },
];

export default function FactoryConsole({ initialJobs }: { initialJobs: FactoryJob[] }) {
  const [jobs, setJobs] = useState<FactoryJob[]>(initialJobs);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [mood, setMood] = useState(MOODS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeJob = jobs.find((j) => j.id === selectedId) ?? jobs[0];

  useEffect(() => {
    async function refresh() {
      const res = await fetch("/api/factory/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: FactoryJob[] };
      setJobs(data.jobs);
    }
    timerRef.current = setInterval(refresh, 1200);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!script.trim() || submitting) return;
    setSubmitting(true);
    const res = await fetch("/api/factory/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, script, voice, musicMood: mood }),
    });
    const data = (await res.json()) as { job: FactoryJob };
    setJobs((prev) => [data.job, ...prev]);
    setSelectedId(data.job.id);
    setTitle("");
    setScript("");
    setSubmitting(false);
  }

  async function cancel(id: string) {
    await fetch(`/api/factory/jobs/${id}/cancel`, { method: "POST" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
          <FactoryIcon className="h-4 w-4 text-fuchsia-300" />
          New production
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Product teaser — v1"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
          </Field>
          <Field label="Script">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              placeholder="Paste or type your script. One paragraph per scene works best."
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/40 focus:outline-none"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Voice">
              <div className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-cyan-300" />
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full bg-transparent text-sm text-white focus:outline-none"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id} className="bg-black">
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Music mood">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-violet-300" />
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full bg-transparent text-sm text-white focus:outline-none"
                >
                  {MOODS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-black">
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>
          <button
            type="submit"
            disabled={!script.trim() || submitting}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {submitting ? "Queuing…" : "Start production"}
          </button>
        </form>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Pipeline
          </div>
          {activeJob && (
            <div className="text-xs text-white/50">
              {new Date(activeJob.updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {!activeJob && (
          <p className="text-sm text-white/50">
            Start a production to see the live pipeline.
          </p>
        )}

        {activeJob && (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">{activeJob.title}</div>
                <div className="text-xs text-white/50">
                  {activeJob.voice} · {activeJob.musicMood}
                </div>
              </div>
              <StatusBadge status={activeJob.status} />
            </div>

            <ol className="mt-4 space-y-2">
              {activeJob.steps.map((s) => (
                <li key={s.id} className="panel-tight flex items-center gap-3 p-3">
                  <StepIcon status={s.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">{s.label}</div>
                    {s.output && (
                      <div className="truncate text-xs text-white/50">{s.output}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {activeJob.assets && (
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="panel-tight p-3">
                  <div className="text-white/50">Scenes</div>
                  <div className="mt-1 text-base text-white">{activeJob.assets.sceneCount}</div>
                </div>
                <div className="panel-tight p-3">
                  <div className="text-white/50">Duration</div>
                  <div className="mt-1 text-base text-white">{activeJob.assets.durationSec}s</div>
                </div>
              </div>
            )}

            {(activeJob.status === "queued" || activeJob.status === "running") && (
              <button
                onClick={() => cancel(activeJob.id)}
                className="btn-ghost mt-4 inline-flex items-center gap-2 px-3 py-2 text-xs"
              >
                <X className="h-3.5 w-3.5" /> Cancel job
              </button>
            )}
          </div>
        )}
      </section>

      <section className="panel p-5 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
          <Clapperboard className="h-4 w-4 text-fuchsia-300" />
          All productions
        </div>
        <div className="grid gap-2">
          {jobs.length === 0 && <p className="text-sm text-white/50">No productions yet.</p>}
          {jobs.map((job) => (
            <button
              key={job.id}
              id={job.id}
              onClick={() => setSelectedId(job.id)}
              className={`panel-tight flex items-center justify-between gap-4 p-3 text-left transition hover:border-white/20 ${
                selectedId === job.id ? "border-white/20 bg-white/[0.04]" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{job.title}</div>
                <div className="truncate text-xs text-white/50">
                  {job.voice} · {job.musicMood} ·{" "}
                  {new Date(job.createdAt).toLocaleString()}
                </div>
              </div>
              <StatusBadge status={job.status} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="panel-tight block px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-white/50">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StatusBadge({ status }: { status: FactoryJob["status"] }) {
  const map: Record<FactoryJob["status"], string> = {
    queued: "bg-white/10 text-white/70",
    running: "bg-cyan-500/15 text-cyan-200",
    completed: "bg-emerald-500/15 text-emerald-200",
    failed: "bg-rose-500/15 text-rose-200",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${map[status]}`}>
      {status}
    </span>
  );
}

function StepIcon({ status }: { status: FactoryJob["steps"][number]["status"] }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "failed") return <X className="h-4 w-4 text-rose-400" />;
  return <Circle className="h-4 w-4 text-white/30" />;
}
