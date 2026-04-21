import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { getStorageAdapter } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Snapshot of the running Nest — which host / region it thinks it's on,
 * which storage adapter is active, what the last deploy looked like, and a
 * list of available migration targets. The /admin/nest page reads this to
 * render the control center.
 *
 * No writes, no state mutation — read-only introspection.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const adapter = await getStorageAdapter();
  return NextResponse.json({
    host: process.env.AURORA_NEST_HOST ?? detectHost(),
    region: process.env.AURORA_NEST_REGION ?? null,
    storage: adapter.describe(),
    storageKind: adapter.kind,
    vercel: process.env.VERCEL === "1",
    fly: Boolean(process.env.FLY_APP_NAME),
    railway: Boolean(process.env.RAILWAY_PROJECT_ID),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.FLY_IMAGE_REF ?? null,
    buildAt: process.env.AURORA_BUILD_AT ?? null,
    targets: [
      { id: "fly", label: "Fly.io", config: "infra/fly/fly.toml" },
      { id: "railway", label: "Railway", config: "infra/railway/railway.json" },
      { id: "oracle", label: "Oracle Cloud Free Tier", config: "infra/oracle-cloud/cloud-init.yml" },
      { id: "docker", label: "Any Docker host", config: "docker-compose.yml" },
      { id: "terraform", label: "Terraform (Fly)", config: "infra/terraform/main.tf" },
    ],
  });
}

function detectHost(): string {
  if (process.env.VERCEL === "1") return "vercel";
  if (process.env.FLY_APP_NAME) return "fly.io";
  if (process.env.RAILWAY_PROJECT_ID) return "railway";
  if (process.env.KOYEB_APP_NAME) return "koyeb";
  return "self-hosted";
}
