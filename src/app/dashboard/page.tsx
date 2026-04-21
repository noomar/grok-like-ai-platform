import Link from "next/link";
import {
  ArrowUpRight,
  Activity,
  Clapperboard,
  Factory as FactoryIcon,
  Flame,
  MessageSquare,
  Music,
  Sparkles,
  Waves,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { getStore } from "@/lib/store";
import { listJobs } from "@/lib/factory";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const jobs = listJobs().slice(0, 5);
  const store = getStore();
  const totals = {
    verifications: store.verifications,
    jobs: store.jobs.size,
    running: Array.from(store.jobs.values()).filter((j) => j.status === "running").length,
    completed: Array.from(store.jobs.values()).filter((j) => j.status === "completed").length,
  };

  return (
    <AppShell
      title="Command Center"
      subtitle="Overview of models, production jobs, and live metrics"
      actions={
        <Link
          href="/factory"
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <FactoryIcon className="h-4 w-4" /> New production
        </Link>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Verifications" value={totals.verifications.toString()} icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />} />
        <Stat label="Total jobs" value={totals.jobs.toString()} icon={<FactoryIcon className="h-4 w-4 text-violet-300" />} />
        <Stat label="Running" value={totals.running.toString()} icon={<Activity className="h-4 w-4 text-cyan-300" />} accent="pulse" />
        <Stat label="Completed" value={totals.completed.toString()} icon={<Flame className="h-4 w-4 text-amber-300" />} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70">
              Recent productions
            </h2>
            <Link href="/factory" className="text-xs text-white/60 hover:text-white">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {jobs.length === 0 && (
              <p className="text-sm text-white/50">No jobs yet. Start one in the Production Factory.</p>
            )}
            {jobs.map((job) => (
              <div key={job.id} className="panel-tight flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{job.title}</div>
                  <div className="truncate text-xs text-white/50">{job.script.slice(0, 100)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={job.status} />
                  <Link
                    href={`/factory#${job.id}`}
                    className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
                  >
                    Open <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/70">
            Pipeline modules
          </h2>
          <ul className="space-y-3 text-sm">
            <Module icon={<Waves className="h-4 w-4 text-cyan-300" />} name="Neural TTS" status="online" />
            <Module icon={<Clapperboard className="h-4 w-4 text-fuchsia-300" />} name="Scene Assembly" status="online" />
            <Module icon={<Music className="h-4 w-4 text-violet-300" />} name="Music Sync" status="online" />
            <Module icon={<MessageSquare className="h-4 w-4 text-emerald-300" />} name="Aurora Chat" status="beta" />
          </ul>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "pulse";
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/50">
        <span>{label}</span>
        <span className={accent === "pulse" ? "pulse-soft" : ""}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-white/10 text-white/70",
    running: "bg-cyan-500/15 text-cyan-200",
    completed: "bg-emerald-500/15 text-emerald-200",
    failed: "bg-rose-500/15 text-rose-200",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${map[status] ?? "bg-white/10 text-white/70"}`}>
      {status}
    </span>
  );
}

function Module({
  icon,
  name,
  status,
}: {
  icon: React.ReactNode;
  name: string;
  status: "online" | "beta" | "offline";
}) {
  const pill =
    status === "online"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "beta"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-rose-500/15 text-rose-300";
  return (
    <li className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2 text-white/80">
        {icon}
        {name}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${pill}`}>
        {status}
      </span>
    </li>
  );
}
