import Link from "next/link";
import { listJobs } from "@/lib/factory";
import AdminJobRow from "../AdminJobRow";

export const dynamic = "force-dynamic";

export default function AdminJobsPage() {
  const jobs = listJobs();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Production line</h1>
          <p className="text-xs text-white/60">All jobs across the platform</p>
        </div>
        <Link href="/admin" className="text-xs text-white/60 hover:text-white">
          ← Overview
        </Link>
      </div>
      <div className="space-y-2">
        {jobs.map((job) => (
          <AdminJobRow key={job.id} job={job} />
        ))}
        {jobs.length === 0 && <p className="text-sm text-white/50">No jobs.</p>}
      </div>
    </div>
  );
}
