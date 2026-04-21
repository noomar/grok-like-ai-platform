import { NextResponse } from "next/server";
import { environmentStatus } from "@/lib/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(environmentStatus());
}
