"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import type { UserRequest } from "@/lib/store";

export default function AdminRequestRow({ request }: { request: UserRequest }) {
  const [resolved, setResolved] = useState(request.resolved);
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const res = await fetch(`/api/admin/requests/${request.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    if (res.ok) setResolved(true);
    setBusy(false);
  }

  return (
    <div className="panel-tight flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-white">{request.message}</div>
        <div className="truncate text-xs text-white/50">
          {request.userLabel} · {request.kind} · {new Date(request.createdAt).toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${
            resolved ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"
          }`}
        >
          {resolved ? "resolved" : "open"}
        </span>
        {!resolved && (
          <button
            onClick={resolve}
            disabled={busy}
            className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Resolve
          </button>
        )}
      </div>
    </div>
  );
}
