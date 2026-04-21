import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { getStore, putRequest } from "@/lib/store";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { resolved?: boolean };
  const store = getStore();
  const req = store.userRequests.get(id);
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (typeof body.resolved === "boolean") req.resolved = body.resolved;
  putRequest(req);
  return NextResponse.json({ request: req });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const ok = getStore().userRequests.delete(id);
  return NextResponse.json({ ok });
}
