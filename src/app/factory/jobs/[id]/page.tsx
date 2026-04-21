import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";
import { getJob } from "@/lib/factory";
import type { FactoryJob, JobStep } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/factory"
        className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to factory
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{job.title}</h1>
          <p className="text-xs text-white/50">
            {job.id} · voice {job.voice} · mood {job.musicMood}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.status === "failed" && job.errorMessage && (
        <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-rose-200">
            <ShieldAlert className="h-4 w-4" />
            Render failed
          </div>
          <div className="mt-1 text-sm text-rose-100">{job.errorMessage}</div>
          {job.missingKeys?.length ? (
            <div className="mt-3 text-xs text-rose-100/90">
              Missing environment variables:{" "}
              {job.missingKeys.map((k) => (
                <code key={k} className="mx-1 rounded bg-rose-500/20 px-1.5 py-0.5">
                  {k}
                </code>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {job.assets?.videoUrl && job.status === "completed" && (
        <section className="panel mt-6 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
            Final render
          </div>
          <video
            controls
            preload="metadata"
            poster={job.assets.thumbnailUrl}
            src={job.assets.videoUrl}
            className="w-full rounded-lg border border-white/10 bg-black"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/60">
            <span>
              MP4 · {job.assets.durationSec ?? "?"}s ·{" "}
              {job.assets.fileSizeBytes
                ? `${(job.assets.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                : "?"}
            </span>
            <a
              href={`${job.assets.videoUrl}${job.assets.videoUrl.includes("?") ? "&" : "?"}download=1`}
              className="btn-primary inline-flex items-center gap-2 px-3 py-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Download MP4
            </a>
            {job.assets.audioUrl && (
              <a
                href={job.assets.audioUrl}
                className="btn-ghost inline-flex items-center gap-2 px-3 py-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Audio
              </a>
            )}
          </div>
        </section>
      )}

      <section className="panel mt-6 p-5">
        <div className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/70">
          Pipeline
        </div>
        <ol className="space-y-2">
          {job.steps.map((s) => (
            <li key={s.id} className="panel-tight p-3">
              <div className="flex items-center gap-3">
                <StepIcon status={s.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{s.label}</div>
                  {s.output && (
                    <div className="truncate text-xs text-white/50">{s.output}</div>
                  )}
                </div>
                <StepBadge status={s.status} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel mt-6 p-5">
        <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/70">
          Script
        </div>
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
{job.script}
        </pre>
      </section>
    </main>
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
    <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-widest ${map[status]}`}>
      {status}
    </span>
  );
}

function StepBadge({ status }: { status: JobStep["status"] }) {
  const map: Record<JobStep["status"], string> = {
    queued: "text-white/40",
    running: "text-cyan-300",
    completed: "text-emerald-300",
    failed: "text-rose-300",
  };
  return <span className={`text-[10px] uppercase tracking-widest ${map[status]}`}>{status}</span>;
}

function StepIcon({ status }: { status: JobStep["status"] }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "failed") return <X className="h-4 w-4 text-rose-400" />;
  return <Circle className="h-4 w-4 text-white/30" />;
}
