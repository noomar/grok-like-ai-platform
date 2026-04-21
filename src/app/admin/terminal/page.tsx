import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, Terminal as TerminalIcon } from "lucide-react";
import { isAdmin } from "@/lib/session";
import TerminalClient from "./TerminalClient";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const host =
    process.env.AURORA_NEST_HOST ??
    (process.env.VERCEL === "1"
      ? "vercel"
      : process.env.FLY_APP_NAME
      ? "fly.io"
      : process.env.RAILWAY_PROJECT_ID
      ? "railway"
      : "self-hosted");

  return (
    <div className="relative flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/5 bg-black/30 backdrop-blur-xl md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 via-violet-500 to-cyan-400">
            <ShieldCheck className="absolute inset-0 m-auto h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Admin Console</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Terminal</div>
          </div>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3 text-sm text-white/70">
          <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Overview</Link>
          <Link href="/admin/jobs" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Production line</Link>
          <Link href="/admin/users" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">User requests</Link>
          <Link href="/admin/settings" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Settings</Link>
          <Link href="/admin/nest" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Nest control</Link>
          <Link href="/admin/terminal" className="rounded-lg bg-white/5 px-3 py-2 text-white">Terminal</Link>
          <Link href="/dashboard" className="mt-4 rounded-lg px-3 py-2 text-white/60 hover:bg-white/5 hover:text-white">← Back to dashboard</Link>
        </nav>
        <div className="px-3 py-4">
          <form action="/api/admin/logout" method="POST">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-black/40 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <TerminalIcon className="h-5 w-5 text-emerald-300" />
            <div>
              <h1 className="text-lg font-semibold text-white">Nest terminal</h1>
              <p className="text-xs text-white/60">
                Direct shell on <code className="text-emerald-300">{host}</code> · full root inside the sandbox
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
            <strong className="text-amber-200">Warning.</strong> Anyone with this admin password gets a shell on the server. On Vercel
            the shell runs in an ephemeral Lambda sandbox (no persistent writes outside <code>/tmp</code>, no package installs).
            On the Docker Nest it&apos;s a real container shell.
          </div>
          <TerminalClient host={host} />
        </main>
      </div>
    </div>
  );
}
