import { NextRequest, NextResponse } from "next/server";
import { isAdmin, isAdminHeader } from "@/lib/session";
import { getStorageAdapter } from "@/lib/persistence";
import type { StorageSnapshot } from "@/lib/persistence";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Import a snapshot produced by `/api/admin/nest/export`. Overwrites the
 * current state. Use only during a migration / disaster recovery.
 */
export async function POST(request: NextRequest) {
  const sessionOk = await isAdmin();
  const headerOk = isAdminHeader(
    request.headers.get("x-admin-password") ?? undefined,
  );
  if (!sessionOk && !headerOk) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | (StorageSnapshot & { exportedAt?: string; from?: string })
    | null;
  if (!body || !Array.isArray(body.jobs) || !Array.isArray(body.userRequests)) {
    return NextResponse.json({ error: "invalid snapshot" }, { status: 400 });
  }

  const snapshot: StorageSnapshot = {
    jobs: body.jobs,
    userRequests: body.userRequests,
    verifications: body.verifications ?? 0,
  };

  const adapter = await getStorageAdapter();
  await adapter.import(snapshot);

  // Also rehydrate the in-memory store so this instance sees the new state
  // without a restart.
  const store = getStore();
  store.jobs.clear();
  store.userRequests.clear();
  for (const j of snapshot.jobs) store.jobs.set(j.id, j);
  for (const r of snapshot.userRequests) store.userRequests.set(r.id, r);
  store.verifications = snapshot.verifications;

  return NextResponse.json({
    ok: true,
    imported: {
      jobs: snapshot.jobs.length,
      userRequests: snapshot.userRequests.length,
      verifications: snapshot.verifications,
    },
    adapter: adapter.describe(),
  });
}
