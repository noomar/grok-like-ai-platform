# Tunnels — expose the Nest without a public IP

You own the tunnel. Aurora doesn't phone home — these configs just give you a
way to reach your self-hosted Nest from outside the network it runs on.

Pick ONE of the two options below.

---

## Option A — Cloudflare Tunnel (recommended)

Public HTTPS URL, zero NAT/port-forwarding, free for personal use. You need a
Cloudflare account and (ideally) a domain on Cloudflare DNS.

### 1. Authenticate + create the tunnel (once, on your laptop)

```bash
brew install cloudflared                           # macOS
# or  apt install cloudflared  (Debian/Ubuntu)

cloudflared tunnel login                           # opens browser, log in to CF
cloudflared tunnel create aurora-nest              # prints a TUNNEL ID + JSON cred file
cloudflared tunnel route dns aurora-nest empire.example.com
```

The login step writes a credentials JSON to `~/.cloudflared/<TUNNEL_ID>.json`.
Copy it to `infra/tunnel/cloudflared.json` (gitignored — never commit it).

### 2. Drop the config into this folder

Create `infra/tunnel/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/cloudflared.json

ingress:
  - hostname: empire.example.com
    service: http://app:3000
  - service: http_status:404
```

### 3. Uncomment the `cloudflared` service in `docker-compose.tunnel.yml`

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
```

`cloudflared` shares the `app` network and proxies `empire.example.com` →
`app:3000` via Cloudflare's edge. Set `AURORA_PUBLIC_URL=https://empire.example.com`
in `.env` so the heartbeat reports the right URL.

---

## Option B — Tailscale (private mesh)

Works without a domain; you reach the Nest over a private `100.x` IP that only
your devices see.

### 1. Auth key (once, on your laptop)

Go to https://login.tailscale.com/admin/settings/keys → generate a **reusable
auth key**. Paste into `.env`:

```
TAILSCALE_AUTHKEY=tskey-auth-...
```

### 2. Launch with the tailscale overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d
```

The sidecar joins your tailnet and advertises the app. Visit
`http://<nest-hostname>:3000` from any device on your Tailscale.

---

## What neither of these does

- Neither one hides the Nest. Both route normal outbound HTTPS; your hosting
  provider sees egress to `cloudflare.com` or `tailscale.com` in netflow.
- Neither encrypts the admin password; rotate it regularly.
- Neither replaces authentication. Keep `ADMIN_PASSWORD` strong — these tunnels
  are transport, not auth.
