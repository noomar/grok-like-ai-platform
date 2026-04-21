import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
          <p className="text-xs text-white/60">Platform configuration</p>
        </div>
        <Link href="/admin" className="text-xs text-white/60 hover:text-white">
          ← Overview
        </Link>
      </div>

      <div className="panel space-y-4 p-5 text-sm text-white/80">
        <Row name="WhatsApp verification line" value="+996 500 904 998" />
        <Row name="Admin password env" value="ADMIN_PASSWORD" mono />
        <Row
          name="Default TTS voice"
          value="aria-neural"
          mono
          hint="Override per-job from the Factory UI"
        />
        <Row name="Default music mood" value="cinematic-uplift" mono />
        <Row
          name="Session cookie"
          value="aurora_gate · 7d · httpOnly"
          mono
        />
        <Row name="Session admin cookie" value="aurora_admin · 7d · httpOnly" mono />
      </div>

      <p className="mt-4 text-xs text-white/50">
        To customize these, update <code>src/lib/session.ts</code> and
        <code> src/lib/factory.ts</code>, or read values from environment variables.
      </p>
    </div>
  );
}

function Row({
  name,
  value,
  mono,
  hint,
}: {
  name: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-none last:pb-0">
      <div>
        <div className="text-white">{name}</div>
        {hint && <div className="text-xs text-white/50">{hint}</div>}
      </div>
      <code className={`text-xs ${mono ? "font-mono" : ""} text-white/70`}>{value}</code>
    </div>
  );
}
