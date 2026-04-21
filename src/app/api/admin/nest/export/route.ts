import { NextResponse } from "next/server";
import { isAdmin, isAdminHeader } from "@/lib/session";
import { getStorageAdapter } from "@/lib/persistence";
import { ensureHydrated, getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export the full Nest state (jobs + requests + verification counter) as a
 * JSON blob. The migration script downloads this from the old Nest and
 * uploads it to the new one via `POST /api/admin/nest/import`.
 *
 * Auth: either an active admin session cookie OR an `x-admin-password`
 * header. The header path lets the CLI work without cookie juggling.
 */
export async function GET(request: Request) {
  const sessionOk = await isAdmin();
  const headerOk = isAdminHeader(
    request.headers.get("x-admin-password") ?? undefined,
  );
  if (!sessionOk && !headerOk) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await ensureHydrated();
  const adapter = await getStorageAdapter();
  // Prefer the adapter's export if SQLite is live (it's canonical); otherwise
  // dump what's in memory.
  if (adapter.kind === "sqlite") {
    const snap = await adapter.export();
    return NextResponse.json(
      { ...snap, exportedAt: new Date().toISOString(), from: adapter.describe() },
      { headers: { "content-disposition": "attachment; filename=aurora-nest.json" } },
    );
  }
  const store = getStore();
  return NextResponse.json(
    {
      jobs: Array.from(store.jobs.values()),
      userRequests: Array.from(store.userRequests.values()),
      verifications: store.verifications,
      exportedAt: new Date().toISOString(),
      from: adapter.describe(),
    },
    { headers: { "content-disposition": "attachment; filename=aurora-nest.json" } },
  );
}
