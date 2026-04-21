"use client";

import Link from "next/link";
import { Download, ExternalLink, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import type { FactoryJob } from "@/lib/store";

export default function AdminJobRow({ job }: { job: FactoryJob }) {
  const [status, setStatus] = useState(job.status);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    const res = await fetch(`/api/factory/jobs/${job.id}/cancel`, { method: "POST" });
    if (res.ok) setStatus("failed");
    setBusy(false);
  }

  const pill: Record<FactoryJob["status"], string> = {
    queued: "bg-white/10 text-white/70",
    running: "bg-cyan-500/15 text-cyan-200",
    completed: "bg-emerald-500/15 text-emerald-200",
    failed: "bg-rose-500/15 text-rose-200",
  };

  return (
    <div className="panel-tight flex items-center justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{job.title}</div>
        <div className="truncate text-xs text-white/50">
          {job.voice} · {job.musicMood} · {new Date(job.createdAt).toLocaleString()}
        </div>
        {status === "failed" && job.errorMessage && (
          <div className="mt-1 flex items-center gap-1 text-xs text-rose-200">
            <ShieldAlert className="h-3 w-3" />
            {job.errorMessage}
          </div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {status === "failed" && job.missingKeys?.length ? (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-rose-200">
            Missing {job.missingKeys[0]}
          </span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${pill[status]}`}>
            {status}
          </span>
        )}
        {job.assets?.videoUrl && status === "completed" && (
          <a
            href={`${job.assets.videoUrl}${job.assets.videoUrl.includes("?") ? "&" : "?"}download=1`}
            className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px]"
            title="Download MP4"
          >
            <Download className="h-3 w-3" /> MP4
          </a>
        )}
        <Link
          href={`/factory/jobs/${job.id}`}
          className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px]"
          title="Open job"
        >
          <ExternalLink className="h-3 w-3" /> Open
        </Link>
        {(status === "queued" || status === "running") && (
          <button
            onClick={cancel}
            disabled={busy}
            className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] disabled:opacity-50"
            title="Cancel job"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}
