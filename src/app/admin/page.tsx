import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Factory as FactoryIcon,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getStore } from "@/lib/store";
import { listJobs } from "@/lib/factory";
import AdminJobRow from "./AdminJobRow";
import AdminRequestRow from "./AdminRequestRow";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const store = getStore();
  const jobs = listJobs();
  const requests = Array.from(store.userRequests.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const totals = {
    verifications: store.verifications,
    totalJobs: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    pendingRequests: requests.filter((r) => !r.resolved).length,
  };

  return (
    <div className="relative flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/5 bg-black/30 backdrop-blur-xl md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 via-violet-500 to-cyan-400">
            <ShieldCheck className="absolute inset-0 m-auto h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Admin Console</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">
              Full control
            </div>
          </div>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3 text-sm text-white/70">
          <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            Overview
          </Link>
          <Link href="/admin/jobs" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            Production line
          </Link>
          <Link href="/admin/users" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            User requests
          </Link>
          <Link href="/admin/settings" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            Settings
          </Link>
          <Link href="/admin/nest" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            Nest control
          </Link>
          <Link href="/admin/terminal" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            Terminal
          </Link>
          <Link href="/admin/agent" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            Agent
          </Link>
          <Link href="/dashboard" className="mt-4 rounded-lg px-3 py-2 text-white/60 hover:bg-white/5 hover:text-white">
            ← Back to dashboard
          </Link>
        </nav>

        <div className="px-3 py-4">
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-black/40 px-6 py-4 backdrop-blur-xl">
          <div>
            <h1 className="text-lg font-semibold text-white">Admin overview</h1>
            <p className="text-xs text-white/60">Full-access control of the platform</p>
          </div>
        </header>

        <main className="flex-1 space-y-6 px-6 py-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Stat label="Verifications" value={totals.verifications} icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />} />
            <Stat label="Total jobs" value={totals.totalJobs} icon={<FactoryIcon className="h-4 w-4 text-violet-300" />} />
            <Stat label="Running" value={totals.running} icon={<Activity className="h-4 w-4 text-cyan-300" />} />
            <Stat label="Completed" value={totals.completed} icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} />
            <Stat label="Failed" value={totals.failed} icon={<Settings className="h-4 w-4 text-rose-300" />} />
            <Stat label="Open reqs" value={totals.pendingRequests} icon={<MessageSquare className="h-4 w-4 text-amber-300" />} />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
                  <FactoryIcon className="h-4 w-4 text-violet-300" /> Production line
                </h2>
                <Link href="/admin/jobs" className="text-xs text-white/60 hover:text-white">
                  Manage →
                </Link>
              </div>
              <div className="space-y-2">
                {jobs.slice(0, 6).map((job) => (
                  <AdminJobRow key={job.id} job={job} />
                ))}
                {jobs.length === 0 && (
                  <p className="text-sm text-white/50">No jobs yet.</p>
                )}
              </div>
            </div>

            <div className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
                  <Users className="h-4 w-4 text-cyan-300" /> User requests
                </h2>
                <Link href="/admin/users" className="text-xs text-white/60 hover:text-white">
                  Manage →
                </Link>
              </div>
              <div className="space-y-2">
                {requests.slice(0, 6).map((r) => (
                  <AdminRequestRow key={r.id} request={r} />
                ))}
                {requests.length === 0 && (
                  <p className="text-sm text-white/50">No requests.</p>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/50">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
