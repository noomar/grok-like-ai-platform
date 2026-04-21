import Link from "next/link";
import { getStore } from "@/lib/store";
import AdminRequestRow from "../AdminRequestRow";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  const requests = Array.from(getStore().userRequests.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">User requests</h1>
          <p className="text-xs text-white/60">
            Verifications, support tickets, and factory submissions
          </p>
        </div>
        <Link href="/admin" className="text-xs text-white/60 hover:text-white">
          ← Overview
        </Link>
      </div>
      <div className="space-y-2">
        {requests.map((r) => (
          <AdminRequestRow key={r.id} request={r} />
        ))}
        {requests.length === 0 && <p className="text-sm text-white/50">No requests.</p>}
      </div>
    </div>
  );
}
