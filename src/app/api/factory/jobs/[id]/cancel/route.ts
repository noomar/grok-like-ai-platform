import { NextResponse } from "next/server";
import { cancelJob, getJob } from "@/lib/factory";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const ok = cancelJob(id);
  if (!ok) return NextResponse.json({ error: "cannot cancel" }, { status: 400 });
  return NextResponse.json({ job: getJob(id) });
}
