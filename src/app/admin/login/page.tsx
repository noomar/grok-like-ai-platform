import { ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  if (await isAdmin()) redirect("/admin");
  const { error, from } = await searchParams;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div aria-hidden className="absolute inset-0 grid-bg" />
      <main className="relative mx-auto flex w-full max-w-lg flex-col items-center px-6 pt-24">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/70">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          Aurora · Admin
        </div>
        <h1 className="text-3xl font-semibold text-white">Admin sign-in</h1>
        <p className="mt-2 text-sm text-white/60">
          Enter your admin password to access the control panel.
        </p>

        <form
          action="/api/admin/login"
          method="POST"
          className="panel glow-ring mt-8 w-full p-6"
        >
          {from && <input type="hidden" name="next" value={from} />}
          <label className="panel-tight block px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Password</div>
            <input
              name="password"
              type="password"
              autoFocus
              className="mt-1 w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="mt-3 text-xs text-rose-300">
              Invalid password. Check your <code>ADMIN_PASSWORD</code> env.
            </p>
          )}

          <button
            type="submit"
            className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
          >
            <ShieldCheck className="h-4 w-4" /> Sign in
          </button>

          <div className="mt-4 text-center text-xs text-white/50">
            <Link href="/" className="hover:text-white">
              ← Back to home
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
