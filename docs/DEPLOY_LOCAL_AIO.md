# Deploying PTP-KPU on a local All-in-One (AIO) PC

This guide turns one office AIO PC into the server for the PTP-KPU website. Staff
open it in a browser like any other website; all data and the KIRANA AI model stay
on that PC.

```
 Staff browsers ──HTTPS──▶ AIO PC ─┬─ Caddy (HTTPS, port 443)            ← installed on the host
 (office LAN, or VPN)              └─▶ 127.0.0.1:8080 ── nginx (frontend container)
                                                     └─▶ backend (FastAPI + KIRANA model)
                                                          └─▶ MySQL 8 (container)
                                       Volumes: mysql_data · uploads · backups · kirana_models
```

---

## 1. Hardware and operating system

| Item | Minimum | Recommended |
|---|---|---|
| RAM | 8 GB | **16 GB**: the AI model alone uses ~3 GB while answering |
| CPU | 4 cores | 6+ cores (AI answers are CPU-bound; no GPU needed) |
| Disk | 60 GB free SSD | 250 GB+ SSD (uploads and backups grow over time) |
| Network | Wired Ethernet | Wired Ethernet + fixed IP (DHCP reservation on the router) |
| Power | — | **UPS**, and BIOS "Restore on AC power loss = Power On" |

**Operating system: Ubuntu Server 24.04 LTS is recommended** over Windows:

- Docker Engine on Linux is free. Docker Desktop (the Windows option) needs a paid
  subscription for government organisations. Check Docker's current terms.
- On Linux, Docker starts at boot with no user logged in. Docker Desktop on Windows
  normally starts only after someone logs in.
- Linux keeps the real client IP addresses, which the login brute-force protection uses.

If the PC must stay on Windows 11: install Docker Desktop (WSL 2 backend), enable
"Start Docker Desktop when you sign in", configure Windows to sign in automatically,
and install Caddy for Windows. The steps below otherwise stay the same.

## 2. Prepare the server (Ubuntu)

```bash
sudo timedatectl set-timezone Asia/Makassar          # WITA (Manado)
sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades git openssl
curl -fsSL https://get.docker.com | sudo sh           # Docker Engine + compose plugin
sudo usermod -aG docker $USER && newgrp docker
sudo systemctl enable docker
```

Reserve a fixed IP for the AIO in the office router (e.g. `192.168.1.50`).

## 3. Put the project on the server and configure secrets

```bash
sudo mkdir -p /opt/ptp-kpu && sudo chown $USER /opt/ptp-kpu
git clone <repository-url> /opt/ptp-kpu      # or copy the folder from a USB drive
cd /opt/ptp-kpu
```

Create `/opt/ptp-kpu/.env` with **new random values**. Never reuse the examples or
development values, and never commit this file:

```bash
cat > .env <<EOF
SECRET_KEY=$(openssl rand -hex 32)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
MYSQL_PASSWORD=$(openssl rand -hex 16)
BOOTSTRAP_ADMIN_NIP=<NIP of the first administrator>
BOOTSTRAP_ADMIN_NAME=<full name>
BOOTSTRAP_ADMIN_PASSWORD=<at least 12 characters>
EOF
chmod 600 .env
```

## 4. Build, download the AI model, start

```bash
cd /opt/ptp-kpu
docker compose -f docker-compose.production.yml build
# Download the 2.1 GB AI model once, while the PC has internet:
docker compose -f docker-compose.production.yml run --rm backend python -m kirana_llm --download
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps        # all three should be "healthy"/"running"
curl http://127.0.0.1:8080/health/ready                   # {"status":"ready"}
```

On first start, the backend sees the empty database and runs `bootstrap.py`
automatically: it creates the tables and **one** administrator from the `.env`
values, with no demo data.

> **Do not run `setup_local_database.py` on the real server.** It seeds the demo
> accounts listed in the README, whose passwords (`admin123`, `123456`) are public.

Log in as the bootstrap administrator, then create departments (Bagian), users,
budget years, and so on. The `BOOTSTRAP_ADMIN_PASSWORD` line can be removed from
`.env` after the first start.

## 5. Make it reachable as a website (HTTPS)

The compose file publishes the site on `127.0.0.1:8080` only, so it is not yet
reachable from other PCs. Put **Caddy** in front: it adds HTTPS and listens on the network.

```bash
sudo apt -y install caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
# Office-internal name (add it to the router's DNS or each PC's hosts file),
# or replace with the AIO's IP, e.g.  https://192.168.1.50 {
ptp-kpu.lan {
    tls internal                 # Caddy's own local certificate authority
    encode gzip
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1        # stream KIRANA answers immediately
    }
}
EOF
sudo systemctl reload caddy
sudo ufw allow 22/tcp && sudo ufw allow 443/tcp && sudo ufw allow 80/tcp && sudo ufw enable
```

- **Name resolution:** add `ptp-kpu.lan → 192.168.1.50` in the router's local
  DNS, or add `192.168.1.50  ptp-kpu.lan` to `C:\Windows\System32\drivers\etc\hosts`
  on each staff PC.
- **Trust the certificate:** with `tls internal`, staff browsers show a warning
  until Caddy's root certificate is installed on their PCs. Copy
  `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt` and install it
  under *Trusted Root Certification Authorities* (by hand or via Group Policy).
- The nginx config already reads the client IP that Caddy forwards, so the login
  rate limit (5 attempts per minute) applies to each staff PC separately.

Staff now open **https://ptp-kpu.lan**.

### Access from outside the office

Choose based on how sensitive the data is:

| Option | How | Notes |
|---|---|---|
| **Tailscale (recommended)** | Install Tailscale on the AIO and on staff laptops | Private, end-to-end encrypted, no router changes, works behind ISP CGNAT. Not publicly exposed. |
| Cloudflare Tunnel | `cloudflared` on the AIO → public `https://ptp.yourdomain.go.id` | Works without a public IP, but Cloudflare decrypts the traffic: weigh this against the data-sovereignty requirement, and protect it with Cloudflare Access. |
| Port forwarding | Router forwards 443 → AIO; a real domain with Caddy obtaining a Let's Encrypt certificate | Needs a static public IP (many Indonesian ISPs use CGNAT). Exposes the server to the whole internet; needs a security review first. |

## 6. Keep it running

**Automatic start:** containers use `restart: unless-stopped` and Docker starts
at boot, so after a power cut the site returns by itself (with the BIOS setting above).

**Backups:** admins create ZIPs in the app under *Cadangan Sistem*. They are stored
on the same PC, so copy them somewhere else every night, for example to a USB/NAS
mounted at `/mnt/backup`:

```bash
# crontab -e   (runs at 23:30 daily)
30 23 * * * cd /opt/ptp-kpu && docker compose -f docker-compose.production.yml cp backend:/app/backups/. /mnt/backup/ptp-kpu/
```

Practise a restore once before go-live (RUNBOOK.md → *Backup and restore*).

**Updating to a new version:**

```bash
cd /opt/ptp-kpu
# 1. create a backup in the app first
git pull
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm backend python upgrade_operations.py
docker compose -f docker-compose.production.yml up -d
```

**Health checks:** `docker compose -f docker-compose.production.yml ps` and
`curl http://127.0.0.1:8080/health/ready`. Logs:
`docker compose -f docker-compose.production.yml logs --tail 100 backend`.

## 7. Go-live checklist

- [ ] `.env` has new random secrets and is readable only by the server user
- [ ] The demo seeder was **not** used; only real accounts exist
- [ ] The AI model is downloaded (`/api/v1/ai/status` shows `"downloaded": true`)
- [ ] Staff PCs open `https://ptp-kpu.lan` without a certificate warning
- [ ] A test user from each department can log in and finish their main workflow
      (letter registration, archive upload, budget realisation, report)
- [ ] A backup was created, copied off the PC, and test-restored
- [ ] UPS connected; BIOS power-on-after-power-loss enabled; the PC survives a reboot test
