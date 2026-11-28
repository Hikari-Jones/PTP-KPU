# PTP-KPU Linux AIO + Cloudflare Tunnel Quickstart (`ptp-kpu.kaiverse.site`)

Everything in the codebase, Docker stack, Nginx proxy, Cloudflare Tunnel ingress, DNS CNAME, and HTTPS settings is already configured. Follow these steps on your **Cloudflare Dashboard** and **Linux AIO Server**.

---

## Already Done For You
- **Repository (`PTP-KPU`):** All Phase 0 + Waves 1–4 upgrades, tests (53 backend + 17 frontend), `upgrade_operations.py` auto-run in `docker-compose.production.yml`, `cloudflared` Docker sidecar (`--profile cloudflare`), localhost-locked Nginx (`127.0.0.1:8081`), and tuned office login rate limits.
- **Cloudflare Tunnel (`ptp-kpu`):** Remotely-managed ingress routes `https://ptp-kpu.kaiverse.site` → `http://frontend:80`.
- **Cloudflare DNS (`kaiverse.site`):** Proxied `CNAME` `ptp-kpu.kaiverse.site` → `8db95b17-0112-45b7-8b47-62aaf7a92cb2.cfargotunnel.com`.
- **Cloudflare TLS (`kaiverse.site`):** `Always Use HTTPS = on`, `Minimum TLS = 1.2`, `Automatic HTTPS Rewrites = on`.

---

## Part 1 — Cloudflare Dashboard & Domain Registrar (5 minutes)

1. **Activate `kaiverse.site`:**
   - Finish clicking through the Cloudflare DNS confirmation page.
   - Log in to your domain registrar for `kaiverse.site` and replace the nameservers with:
     - `braelyn.ns.cloudflare.com`
     - `nicolas.ns.cloudflare.com`
   - Wait until `kaiverse.site` shows **Active** in Cloudflare (usually 5–30 minutes).
2. **Copy your Tunnel Token:**
   - Open **Cloudflare Dashboard → Zero Trust → Networks → Tunnels → `ptp-kpu` → Configure → Docker**.
   - Copy the long token string after `--token ` (keep it private; you will paste it into `.env` on the AIO in Part 2).
3. **Protect `ptp-kpu.kaiverse.site` with Cloudflare Access (Strongly Recommended):**
   - In **Zero Trust → Access → Applications → Add an application → Self-hosted**:
     - **Application name:** `PTP-KPU Sulawesi Utara`
     - **Session duration:** `24 hours` (or `12 hours`)
     - **Public Hostname:** `ptp-kpu.kaiverse.site`
   - Attach a **Reusable Policy** (Action: **Allow**), e.g., **Emails** / **Emails ending in** (`@kpu.go.id` or specific staff emails) using Cloudflare's built-in **One-Time PIN** (free up to 50 users).

---

## Part 2 — Linux AIO Server Setup (Ubuntu Server 24.04 LTS)

### Step 1: Base OS & Docker (run once on a fresh AIO)
```bash
sudo timedatectl set-timezone Asia/Makassar
sudo apt update && sudo apt -y upgrade
sudo apt -y install git openssl curl unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo systemctl enable docker
```

### Step 2: Copy/Clone the Project onto the AIO
```bash
sudo mkdir -p /opt/ptp-kpu && sudo chown $USER /opt/ptp-kpu
# Either clone your pushed git repo:
git clone <YOUR_REPO_URL> /opt/ptp-kpu
# OR copy the PTP-KPU folder from USB into /opt/ptp-kpu
cd /opt/ptp-kpu
```

### Step 3: Create `.env` (Never Commit This File)
```bash
cat > /opt/ptp-kpu/.env <<EOF
TZ=Asia/Makassar
SECRET_KEY=$(openssl rand -hex 32)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
MYSQL_PASSWORD=$(openssl rand -hex 16)
BOOTSTRAP_ADMIN_NIP=<18-digit-NIP-admin>
BOOTSTRAP_ADMIN_NAME=<Nama-Lengkap-Admin>
BOOTSTRAP_ADMIN_PASSWORD=<Password-Min-12-Karakter>
FRONTEND_PORT=8081
KIRANA_IDLE_UNLOAD_MINUTES=60
OFFICIAL_ISSUANCE_ENABLED=false
CLOUDFLARE_TUNNEL_TOKEN=<PASTE_TUNNEL_TOKEN_HERE>
EOF
chmod 600 /opt/ptp-kpu/.env
```
*(Set `OFFICIAL_ISSUANCE_ENABLED=true` later once the office approves official numbering & SK Penugasan.)*

### Step 4: Build Images & Download KIRANA AI Model Once (~2.1 GB)
```bash
cd /opt/ptp-kpu
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm backend python -m kirana_llm --download
```

### Step 5: Launch the Full Stack (MySQL + Backend + Frontend + Cloudflare Tunnel)
```bash
cd /opt/ptp-kpu
docker compose -f docker-compose.production.yml --profile cloudflare up -d
docker compose -f docker-compose.production.yml --profile cloudflare ps
```
Wait ~30 seconds until `mysql-db` and `backend` show `healthy` and `cloudflared` shows `running`.

### Step 6: Verify Everything Works
```bash
# Local health check on the AIO:
curl http://127.0.0.1:8081/health/ready
# Should return: {"status":"ready"}

# Check cloudflared connected to Cloudflare:
docker compose -f docker-compose.production.yml --profile cloudflare logs --tail 30 cloudflared
```
Then open **`https://ptp-kpu.kaiverse.site`** in any browser and log in with your `BOOTSTRAP_ADMIN_NIP` + `BOOTSTRAP_ADMIN_PASSWORD`.

### Step 7: Post-Login Setup (Inside the App as Admin)
1. Go to **Kelola User / Bagian** to create real KPU Sulut Subbagian (`BAG-02` RENDATIN, `BAG-03` Teknis, `BAG-04` Hukum, `BAG-05` Umum/Logistik, `BAG-06` Keuangan) and staff accounts (18-digit NIPs).
2. Go to **Tata Kelola Arsip → SK Penugasan (Otoritas)** to assign `verify_budget`, `sign_letter`, `access_secret_archive`, and `approve_disposal` based on official SK numbers.
3. Go to **Realisasi Anggaran → Tahun Anggaran** to create & activate the current fiscal year, then add Akun & Pagu (including `pagu_blokir` and RPD Triwulan I–IV).
4. Remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env` if desired after first login.

### Step 8: Nightly Off-Box Backup Cron (Recommended)
```bash
crontab -e
# Add this line (copies ZIP backups created in Cadangan Sistem to USB/NAS every night at 23:30):
30 23 * * * cd /opt/ptp-kpu && docker compose -f docker-compose.production.yml cp backend:/app/backups/. /mnt/backup/ptp-kpu/
```

---

## Future Updates (Zero Data Loss)
Whenever you pull a newer version on the AIO:
```bash
cd /opt/ptp-kpu
git pull
docker compose -f docker-compose.production.yml --profile cloudflare up -d --build
```
`upgrade_operations.py` runs automatically on backend startup and applies any new schema updates idempotently without touching existing data.
