import Link from "next/link";
import { Cloud, Database, GitBranch, HardDrive, LogOut, ShieldCheck } from "lucide-react";
import { isAdmin } from "@/lib/session";
import { redirect } from "next/navigation";
import { getStorageAdapter } from "@/lib/persistence";
import { ensureHydrated, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Target = {
  id: string;
  label: string;
  config: string;
  command: string;
  hint: string;
};

const TARGETS: Target[] = [
  {
    id: "fly",
    label: "Fly.io",
    config: "infra/fly/fly.toml",
    command: "node scripts/migrate-nest.mjs --target=fly --app=aurora-nest --region=ams",
    hint: "Needs flyctl + FLY_API_TOKEN. Best free-tier default.",
  },
  {
    id: "railway",
    label: "Railway",
    config: "infra/railway/railway.json",
    command: "node scripts/migrate-nest.mjs --target=railway",
    hint: "Needs `npm i -g @railway/cli && railway login`.",
  },
  {
    id: "oracle",
    label: "Oracle Cloud Free Tier",
    config: "infra/oracle-cloud/cloud-init.yml",
    command: "Paste cloud-init.yml into an ARM A1.Flex VM on Oracle Cloud.",
    hint: "Free forever, 4 ARM cores + 24 GB RAM, painful onboarding.",
  },
  {
    id: "docker",
    label: "Any Docker host",
    config: "docker-compose.yml",
    command: "node scripts/migrate-nest.mjs --target=docker",
    hint: "VPS, laptop, Raspberry Pi — anywhere Docker runs.",
  },
  {
    id: "terraform",
    label: "Terraform (Fly)",
    config: "infra/terraform/main.tf",
    command: "cd infra/terraform && terraform apply -var app_name=aurora-nest",
    hint: "For reproducible, version-controlled provisioning.",
  },
];

export default async function NestControl() {
  if (!(await isAdmin())) redirect("/admin/login");

  await ensureHydrated();
  const adapter = await getStorageAdapter();
  const store = getStore();

  const host =
    process.env.AURORA_NEST_HOST ??
    (process.env.VERCEL === "1"
      ? "vercel"
      : process.env.FLY_APP_NAME
      ? "fly.io"
      : process.env.RAILWAY_PROJECT_ID
      ? "railway"
      : "self-hosted");
  const region = process.env.AURORA_NEST_REGION ?? "—";
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.FLY_IMAGE_REF ??
    "local-dev";
  const storageLine = adapter.describe();

  return (
    <div className="relative flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/5 bg-black/30 backdrop-blur-xl md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 via-violet-500 to-cyan-400">
            <ShieldCheck className="absolute inset-0 m-auto h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Admin Console</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Nest control</div>
          </div>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3 text-sm text-white/70">
          <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Overview</Link>
          <Link href="/admin/jobs" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Production line</Link>
          <Link href="/admin/users" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">User requests</Link>
          <Link href="/admin/settings" className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Settings</Link>
          <Link href="/admin/nest" className="rounded-lg bg-white/5 px-3 py-2 text-white">Nest control</Link>
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
          <div>
            <h1 className="text-lg font-semibold text-white">Nest control</h1>
            <p className="text-xs text-white/60">Where the empire lives. Where it can move to.</p>
          </div>
        </header>

        <main className="flex-1 space-y-6 px-6 py-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Host" value={host} icon={<Cloud className="h-4 w-4 text-cyan-300" />} />
            <Stat label="Region" value={region} icon={<Cloud className="h-4 w-4 text-fuchsia-300" />} />
            <Stat label="Storage" value={storageLine} icon={<Database className="h-4 w-4 text-emerald-300" />} />
            <Stat label="Jobs on disk" value={String(store.jobs.size)} icon={<HardDrive className="h-4 w-4 text-violet-300" />} />
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
                <GitBranch className="h-4 w-4 text-cyan-300" /> Deployment identity
              </h2>
            </div>
            <dl className="grid gap-3 text-sm text-white/80 sm:grid-cols-2">
              <Info label="Commit" value={commit} />
              <Info label="Storage kind" value={adapter.kind} />
              <Info label="Build at" value={process.env.AURORA_BUILD_AT ?? "—"} />
              <Info label="Sovereign SQLite" value={adapter.kind === "sqlite" ? "yes" : "no (memory only)"} />
            </dl>
          </section>

          <section className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
                <Cloud className="h-4 w-4 text-fuchsia-300" /> Migration targets
              </h2>
            </div>
            <div className="grid gap-3">
              {TARGETS.map((t) => (
                <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{t.label}</div>
                      <div className="text-xs text-white/50">{t.hint}</div>
                    </div>
                    <code className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/70">
                      {t.config}
                    </code>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-black/60 p-3 text-xs text-emerald-200">
{t.command}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-5">
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/70">
                <HardDrive className="h-4 w-4 text-emerald-300" /> Snapshot / restore
              </h2>
              <p className="mt-1 text-xs text-white/50">
                Export produces a JSON dump of every job, request, and the verification counter —
                everything needed to rebuild state on a new host.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/admin/nest/export"
                className="rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-sm font-medium text-black hover:from-cyan-300 hover:to-violet-400"
              >
                Download snapshot
              </a>
              <code className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/70">
                curl -H &quot;x-admin-password: $PW&quot; $NEW_HOST/api/admin/nest/import \
                <br />
                &nbsp;&nbsp;-H &quot;content-type: application/json&quot; --data-binary @aurora-nest.json
              </code>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/60">
        {icon} {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-white/40">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm text-white/90">{value}</dd>
    </div>
  );
}
