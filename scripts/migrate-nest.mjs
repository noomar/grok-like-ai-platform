#!/usr/bin/env node
/**
 * migrate-nest — one-command migration of the Aurora Nest.
 *
 *   node scripts/migrate-nest.mjs --target=fly         [--app=aurora-nest] [--region=ams]
 *   node scripts/migrate-nest.mjs --target=railway     [--project=...]
 *   node scripts/migrate-nest.mjs --target=docker      # build + run locally
 *   node scripts/migrate-nest.mjs --export=snapshot.json  # dump state only
 *   node scripts/migrate-nest.mjs --import=snapshot.json --source-url=https://…
 *
 * The script is intentionally thin — it orchestrates CLIs (flyctl / railway /
 * docker) that are already authenticated on the host it runs on. The "agent
 * finds a cloud and builds the server" workflow is: user installs the CLI
 * once, supplies the token once, then every future migration is a single
 * command. Zero clicks in any dashboard.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const { values: args } = parseArgs({
  options: {
    target: { type: "string" },
    app: { type: "string" },
    region: { type: "string" },
    project: { type: "string" },
    export: { type: "string" },
    import: { type: "string" },
    "source-url": { type: "string" },
    "source-admin-password": { type: "string" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help || (!args.target && !args.export && !args.import)) {
  console.log(readFileSync(__filename, "utf8").split("\n").slice(1, 18).join("\n").replace(/^\s*\*\s?/gm, ""));
  process.exit(0);
}

/** Shell out and inherit IO so the user sees live progress. */
function run(cmd, argv, opts = {}) {
  console.log(`\n\x1b[36m$ ${cmd} ${argv.join(" ")}\x1b[0m`);
  if (args["dry-run"]) return { status: 0 };
  const res = spawnSync(cmd, argv, { stdio: "inherit", cwd: REPO_ROOT, ...opts });
  if (res.status !== 0) {
    console.error(`\n\x1b[31m✗ ${cmd} exited ${res.status}\x1b[0m`);
    process.exit(res.status ?? 1);
  }
  return res;
}

function hasCli(name) {
  const res = spawnSync("which", [name], { stdio: "ignore" });
  return res.status === 0;
}

// ---------------------------------------------------------------------------
// Export / import state snapshots.
// ---------------------------------------------------------------------------

async function exportState(sourceUrl, adminPassword, outPath) {
  if (!sourceUrl) {
    console.error("--export requires --source-url=<running-nest-url>");
    process.exit(1);
  }
  const headers = {};
  if (adminPassword) headers["x-admin-password"] = adminPassword;
  const res = await fetch(`${sourceUrl.replace(/\/$/, "")}/api/admin/nest/export`, {
    headers,
  });
  if (!res.ok) {
    console.error(`Export failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const snapshot = await res.text();
  writeFileSync(outPath, snapshot);
  console.log(`\x1b[32m✓ wrote ${outPath} (${snapshot.length} bytes)\x1b[0m`);
}

async function importState(inPath, targetUrl, adminPassword) {
  const body = readFileSync(inPath, "utf8");
  const headers = { "content-type": "application/json" };
  if (adminPassword) headers["x-admin-password"] = adminPassword;
  const res = await fetch(`${targetUrl.replace(/\/$/, "")}/api/admin/nest/import`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    console.error(`Import failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`\x1b[32m✓ imported ${inPath} into ${targetUrl}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Target drivers.
// ---------------------------------------------------------------------------

function deployFly() {
  if (!hasCli("flyctl") && !hasCli("fly")) {
    console.error(
      "flyctl not installed. Install: curl -L https://fly.io/install.sh | sh",
    );
    process.exit(1);
  }
  const fly = hasCli("flyctl") ? "flyctl" : "fly";
  const app = args.app ?? "aurora-nest";
  const region = args.region ?? "ams";

  // `fly launch --copy-config` is idempotent — creates the app if it's new
  // and attaches the volume on first run.
  run(fly, ["apps", "list"]); // sanity-check auth
  run(fly, [
    "launch",
    "--copy-config",
    "--no-deploy",
    "--name", app,
    "--region", region,
    "--yes",
    "--config", "infra/fly/fly.toml",
  ]);
  const volRes = spawnSync(fly, ["volumes", "list", "--app", app, "--json"], {
    cwd: REPO_ROOT,
  });
  const volumes = JSON.parse(volRes.stdout?.toString() || "[]");
  if (!volumes.find((v) => v.Name === "aurora_data")) {
    run(fly, [
      "volumes", "create", "aurora_data",
      "--app", app,
      "--region", region,
      "--size", "3",
      "--yes",
    ]);
  }
  run(fly, [
    "deploy",
    "--app", app,
    "--remote-only",
    "--config", "infra/fly/fly.toml",
  ]);
  console.log(`\n\x1b[32m✓ Nest live at https://${app}.fly.dev\x1b[0m`);
}

function deployRailway() {
  if (!hasCli("railway")) {
    console.error(
      "railway CLI not installed. Install: npm i -g @railway/cli && railway login",
    );
    process.exit(1);
  }
  if (args.project) run("railway", ["link", args.project]);
  run("railway", ["up", "--detach"]);
}

function deployDocker() {
  if (!hasCli("docker")) {
    console.error("docker not installed.");
    process.exit(1);
  }
  run("docker", ["compose", "build"]);
  run("docker", ["compose", "up", "-d"]);
  console.log("\n\x1b[32m✓ Nest live at http://localhost:3000\x1b[0m");
}

// ---------------------------------------------------------------------------
// Entry.
// ---------------------------------------------------------------------------

(async () => {
  if (args.export) {
    await exportState(args["source-url"], args["source-admin-password"], args.export);
    return;
  }
  if (args.import) {
    const target = args["source-url"];
    if (!target) {
      console.error("--import requires --source-url=<destination-nest-url>");
      process.exit(1);
    }
    await importState(args.import, target, args["source-admin-password"]);
    return;
  }
  switch (args.target) {
    case "fly":
      deployFly();
      break;
    case "railway":
      deployRailway();
      break;
    case "docker":
    case "docker-compose":
      deployDocker();
      break;
    default:
      console.error(`unknown --target=${args.target}. Use fly | railway | docker.`);
      process.exit(1);
  }
})();
