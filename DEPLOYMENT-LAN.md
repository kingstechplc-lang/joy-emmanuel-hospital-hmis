# LAN Deployment Guide — Joy Emmanuel Hospital HMIS

> **Deployment model:** Single hospital server PC running the HMIS on the local network. Staff computers (reception, nurses, clinicians, pharmacy, lab, admin) access the HMIS through the server's LAN IP at `http://192.168.x.x:3000`.
>
> This guide covers a **completely offline/local** deployment — no Vercel, no cloud database, no internet required for routine operation (only for optional AI / telemedicine / NHIA integrations).

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Install PostgreSQL](#3-install-postgresql)
4. [Clone the Repo & Install Dependencies](#4-clone-the-repo--install-dependencies)
5. [Configure `.env`](#5-configure-env)
6. [Push Schema & Seed Database](#6-push-schema--seed-database)
7. [Build the Production Bundle](#7-build-the-production-bundle)
8. [Start the Server (LAN-bound)](#8-start-the-server-lan-bound)
9. [Process Manager (Auto-restart)]#9-process-manager-auto-restart)
10. [Firewall Configuration](#10-firewall-configuration)
11. [Static LAN IP](#11-static-lan-ip)
12. [Test From a Staff Computer](#12-test-from-a-staff-computer)
13. [Optional: HTTPS with Self-Signed Cert](#13-optional-https-with-self-signed-cert)
14. [Backup & Restore](#14-backup--restore)
15. [Updating the HMIS](#15-updating-the-hmis)
16. [Troubleshooting](#16-troubleshooting)
17. [Optional Integrations](#17-optional-integrations)

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  HMIS Server PC (single machine — Linux or Windows)         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Node.js 20+ runtime                                  │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │  Next.js 16 production server (next start)      │ │  │
│  │  │  Binds to 0.0.0.0:3000 → reachable from LAN     │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL 14+ (local — same machine)                │  │
│  │  Listens on 127.0.0.1:5432 (loopback only — secure)   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Process manager: PM2 (recommended) or systemd / NSSM       │
└──────────────────────────────────────────────────────────────┘
                  ↓ Hospital LAN / Wi-Fi ↓
┌──────────────────────────────────────────────────────────────┐
│  Staff computers (any device with a modern browser):         │
│  Reception • Nurses • Clinicians • Pharmacy • Lab • Admin   │
│                                                              │
│  Browser → http://192.168.x.x:3000                          │
└──────────────────────────────────────────────────────────────┘
```

**Why this works:**
- The Next.js server binds to `0.0.0.0:3000` — all network interfaces on the server PC
- PostgreSQL stays on `127.0.0.1:5432` — not exposed to the LAN (defence in depth)
- Staff browsers hit the same origin (`http://192.168.x.x:3000`) for both the page and the API — no CORS needed
- NextAuth JWT cookies work over HTTP LAN with default `sameSite=lax` + `secure=auto`

**Verified compatible:** Next.js 16 + Prisma 6 + PostgreSQL 14+ + NextAuth v4 + 317 Prisma models + 500+ API routes. No source code changes required — configuration only.

---

## 2. Prerequisites

### 2.1 Hardware

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4+ cores (Intel i3/i5 or Ryzen 3/5) |
| RAM | 4 GB | 8 GB+ (PostgreSQL + Node + browser dev) |
| Disk | 20 GB | 50+ GB SSD (DB + uploads + logs) |
| Network | 100 Mbps LAN | 1 Gbps LAN |
| OS | Ubuntu 22.04 LTS / Windows Server 2019 / Windows 10 Pro | Ubuntu 24.04 LTS |

### 2.2 Software — Linux (Ubuntu 22.04+ recommended)

```bash
# Update + base tools
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ufw

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version    # should print v20.x.x
npm --version     # should print 10.x.x

# PostgreSQL 15
sudo apt install -y postgresql postgresql-contrib

# PM2 (process manager — recommended)
sudo npm install -g pm2
```

### 2.3 Software — Windows (Server 2019+ or Windows 10/11 Pro)

1. **Node.js 20 LTS (x64)** — download from https://nodejs.org/ (use the LTS installer). Check "Add to PATH" during install.
2. **PostgreSQL 15+** — download from https://www.enterprisedb.com/downloads/postgres-postgresql-downloads (use the EDB installer). Remember the superuser password you set.
3. **Git** — download from https://git-scm.com/download/win
4. **NSSM** (optional, for Windows service) — download from https://nssm.cc/ 

Verify in PowerShell:
```powershell
node --version
npm --version
psql --version
```

---

## 3. Install PostgreSQL

### 3.1 Linux (already installed via apt in §2.2)

```bash
# Start + enable on boot
sudo systemctl enable --now postgresql

# Verify it's running
sudo systemctl status postgresql
```

### 3.2 Windows

Use the EDB installer — it sets up PostgreSQL as a Windows service that auto-starts on boot. Note the superuser password (default user is `postgres`).

### 3.3 Create the HMIS database + user

#### Linux

```bash
sudo -u postgres psql
```

#### Windows (PowerShell)

```powershell
psql -U postgres
# Enter the password you set during install
```

In the `psql` prompt, run:

```sql
-- Replace 'YOUR_STRONG_PASSWORD' with a real strong password
CREATE USER hmis_user WITH PASSWORD 'YOUR_STRONG_PASSWORD';
CREATE DATABASE hmis OWNER hmis_user;
GRANT ALL PRIVILEGES ON DATABASE hmis TO hmis_user;

-- For PostgreSQL 15+, also grant schema permissions:
\c hmis
GRANT ALL ON SCHEMA public TO hmis_user;

-- Exit
\q
```

### 3.4 Verify the connection

```bash
# Linux
PGPASSWORD='YOUR_STRONG_PASSWORD' psql -U hmis_user -d hmis -h localhost -c "SELECT version();"

# Windows PowerShell
$env:PGPASSWORD='YOUR_STRONG_PASSWORD'; psql -U hmis_user -d hmis -h localhost -c "SELECT version();"
```

You should see the PostgreSQL version string.

---

## 4. Clone the Repo & Install Dependencies

Pick a directory for the HMIS install. Recommended paths:
- Linux: `/opt/hmis/`
- Windows: `C:\hmis\`

### Linux

```bash
sudo mkdir -p /opt/hmis
sudo chown $USER:$USER /opt/hmis
cd /opt/hmis

git clone https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis.git
cd joy-emmanuel-hospital-hmis

npm install
# This triggers `postinstall` which runs `prisma generate`
```

### Windows

```powershell
mkdir C:\hmis
cd C:\hmis

git clone https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis.git
cd joy-emmanuel-hospital-hmis

npm install
```

The `npm install` step takes 1–3 minutes depending on the machine.

---

## 5. Configure `.env`

From inside the repo directory:

```bash
cp .env.example .env
```

Edit `.env` and set these values (replace placeholders with your actual values):

```env
# =====================================================================
# Joy Emmanuel Hospital HMIS — LAN Deployment .env
# =====================================================================

# ─── Database (local PostgreSQL) ───────────────────────────────────────
# NO sslmode needed on a trusted hospital LAN.
# Replace YOUR_STRONG_PASSWORD with the password from §3.3.
DATABASE_URL="postgresql://hmis_user:YOUR_STRONG_PASSWORD@localhost:5432/hmis?schema=public"
DIRECT_URL="postgresql://hmis_user:YOUR_STRONG_PASSWORD@localhost:5432/hmis?schema=public"

# ─── NextAuth.js ───────────────────────────────────────────────────────
# Generate a 32-byte secret with:  openssl rand -base64 32
# (Linux) or  $env:SECRET=[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Max 256} -AsByteStream))  (Windows PowerShell)
NEXTAUTH_SECRET="PASTE_YOUR_GENERATED_32_BYTE_SECRET_HERE"

# CRITICAL: Use the server's actual LAN IP (from §11).
# Example:  http://192.168.1.50:3000
NEXTAUTH_URL="http://YOUR_SERVER_LAN_IP:3000"

# ─── Patient Portal (optional — only if you'll use the patient portal) ──
# Generate a DIFFERENT secret:  openssl rand -base64 32
PATIENT_PORTAL_JWT_SECRET="PASTE_A_DIFFERENT_32_BYTE_SECRET_HERE"

# ─── AI Assistant (optional) ───────────────────────────────────────────
# Leave commented out if you won't use the AI Assistant.
# The AI Services admin UI can also configure providers in the database.
# ZAI_API_KEY=...
# ZAI_BASE_URL=https://api.z.ai/api/paas/v4
# ZAI_MODEL=glm-4-plus

# ─── Telemedicine (optional) ───────────────────────────────────────────
# Leave commented out if you won't use telemedicine video calls.
# DAILY_API_KEY=...
# DAILY_DOMAIN=...

# ─── NHIA CLAIM-it integration (optional — Ghana) ──────────────────────
# Leave commented out if not using NHIA XML submission.
# NHIA_API_BASE_URL=...
# NHIA_CLAIMIT_TRANSPORT=mock
# NHIA_CLAIMIT_BRIDGE_URL=http://localhost:31719
```

**Critical:** Set `NEXTAUTH_URL` to your server's actual LAN IP (from §11). If you leave it as `http://localhost:3000`, NextAuth's redirect callbacks will redirect staff browsers to `localhost`, which won't resolve from their computers.

---

## 6. Push Schema & Seed Database

This creates all 317 tables in your local PostgreSQL and seeds the initial data (organization, roles, admin user, etc.).

```bash
# Create all tables from the Prisma schema
npx prisma db push --accept-data-loss

# Regenerate the Prisma client (matches the schema)
npx prisma generate

# Seed initial data — creates:
#   - The hospital organization
#   - All 12 staff roles with permissions (doctor, nurse, pharmacist, etc.)
#   - A super-admin user (see scripts/seed.ts for default credentials)
#   - Sample facilities, departments, services
npm run seed
```

**Note on `--accept-data-loss`:** This flag is required because `prisma db push` will drop and recreate tables when the schema changes. On a fresh database, no data is lost. On an existing database, ALWAYS back up first (see §14).

After seeding, note the default admin credentials printed in the terminal — you'll need them for the first login. **Change the admin password immediately after first login.**

---

## 7. Build the Production Bundle

```bash
npm run build
```

This runs `next build` and produces the `.next/` directory containing the optimised production bundle. Takes 1–3 minutes.

**Note on TypeScript:** `next.config.ts` has `typescript.ignoreBuildErrors: true` — the build will succeed even with a few pre-existing type errors. These don't affect runtime behaviour.

---

## 8. Start the Server (LAN-bound)

### 8.1 Quick test (manual run)

```bash
npx next start -H 0.0.0.0 -p 3000
```

- `-H 0.0.0.0` — bind to all network interfaces (so the server is reachable from the LAN, not just localhost)
- `-p 3000` — listen on port 3000

You should see:
```
✓ Ready in 1.2s
- Local:   http://localhost:3000
- Network: http://192.168.1.50:3000   ← this is your LAN IP
```

Press `Ctrl+C` to stop, then proceed to §9 for production auto-restart.

### 8.2 Alternative: modify `package.json`

Edit `package.json` to make `npm start` LAN-bound by default:

```json
"start": "next start -H 0.0.0.0 -p 3000",
```

Then run:
```bash
npm start
```

---

## 9. Process Manager (Auto-restart)

For 24/7 unattended hospital operation, use a process manager so the HMIS auto-restarts on crash + auto-starts on server boot.

### 9.1 PM2 (Linux + Windows — recommended)

#### Install PM2 (if not already installed)

```bash
sudo npm install -g pm2      # Linux
npm install -g pm2          # Windows (run PowerShell as admin)
```

#### Start the HMIS under PM2

**Linux:**
```bash
cd /opt/hmis/joy-emmanuel-hospital-hmis
pm2 start "npx next start -H 0.0.0.0 -p 3000" \
  --name hmis \
  --cwd /opt/hmis/joy-emmanuel-hospital-hmis
pm2 save
pm2 startup
# PM2 will print a command to run — copy + paste it to enable boot-startup
```

**Windows (PowerShell as admin):**
```powershell
cd C:\hmis\joy-emmanuel-hospital-hmis
pm2 start "npx next start -H 0.0.0.0 -p 3000" --name hmis --cwd C:\hmis\joy-emmanuel-hospital-hmis
pm2 save
# On Windows, also install pm2-windows-startup:
npm install -g pm2-windows-startup
pm2-startup install
```

#### PM2 commands you'll use

```bash
pm2 status                  # show running processes
pm2 logs hmis               # tail live logs
pm2 restart hmis            # restart after updates
pm2 stop hmis               # stop the HMIS
pm2 delete hmis            # remove from PM2
pm2 monit                   # live CPU/memory dashboard
```

### 9.2 systemd (Linux alternative — built-in)

Create `/etc/systemd/system/hmis.service`:

```ini
[Unit]
Description=Joy Emmanuel Hospital HMIS
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=hmis
WorkingDirectory=/opt/hmis/joy-emmanuel-hospital-hmis
Environment=NODE_ENV=production
EnvironmentFile=/opt/hmis/joy-emmanuel-hospital-hmis/.env
ExecStart=/usr/bin/node node_modules/.bin/next start -H 0.0.0.0 -p 3000
Restart=always
RestartSec=5
StandardOutput=append:/var/log/hmis/app.log
StandardError=append:/var/log/hmis/error.log

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo mkdir -p /var/log/hmis
sudo touch /var/log/hmis/app.log /var/log/hmis/error.log
sudo chown -R hmis:hmis /var/log/hmis

sudo systemctl daemon-reload
sudo systemctl enable hmis
sudo systemctl start hmis
sudo systemctl status hmis
```

### 9.3 NSSM (Windows alternative — runs as a Windows service)

```powershell
# Download nssm.exe from https://nssm.cc/ and place it in your PATH
nssm install hmis "C:\Program Files\nodejs\node.exe" "C:\hmis\joy-emmanuel-hospital-hmis\node_modules\.bin\next" "start" "-H" "0.0.0.0" "-p" "3000"
nssm set hmis AppDirectory C:\hmis\joy-emmanuel-hospital-hmis
nssm set hmis AppEnvironmentExtra NODE_ENV=production
nssm set hmis AppEnvironmentExtra "PATH=C:\Program Files\nodejs;C:\Windows\System32"
nssm start hmis
```

NSSM auto-restarts on crash + starts on boot (set startup type to "Automatic").

---

## 10. Firewall Configuration

### 10.1 Linux (UFW)

```bash
# Allow SSH (don't lock yourself out)
sudo ufw allow 22/tcp

# Allow HMIS from the LAN
sudo ufw allow 3000/tcp comment 'HMIS app'

# PostgreSQL — KEEP ON LOOPBACK ONLY (default behaviour)
# Do NOT run: sudo ufw allow 5432/tcp
# (Only open 5432 if PostgreSQL is on a separate PC from the HMIS,
#  and even then only allow from the HMIS server's IP, not the whole LAN.)
# Example (if DB is on a separate PC):
#   sudo ufw allow from 192.168.1.50 to any port 5432 proto tcp

# Enable the firewall
sudo ufw enable
sudo ufw status verbose
```

### 10.2 Windows Defender Firewall

```powershell
# Allow HMIS on the Private profile (your hospital LAN)
New-NetFirewallRule -DisplayName "HMIS App" `
  -Direction Inbound -LocalPort 3000 -Protocol TCP `
  -Action Allow -Profile Private

# Verify
Get-NetFirewallRule -DisplayName "HMIS App"
```

### 10.3 Port summary

| Port | Protocol | Direction | Purpose | Open to |
|---|---|---|---|---|
| 3000 | TCP | Inbound | HMIS app | Whole LAN |
| 5432 | TCP | Inbound | PostgreSQL | Loopback only (default — don't open) |
| 22 | TCP | Inbound | SSH (Linux admin) | Admin IPs only |
| 3389 | TCP | Inbound | RDP (Windows admin) | Admin IPs only |

---

## 11. Static LAN IP

**Critical:** The server PC's LAN IP must be stable. If it changes (e.g., after a reboot, the router's DHCP assigns a different IP), staff bookmarks + `NEXTAUTH_URL` will break.

### 11.1 Option A — Router DHCP reservation (easiest)

Log into your router's admin panel (usually `http://192.168.1.1`), find the DHCP/LAN settings, and reserve an IP for the server PC's MAC address. Restart the server to pick up the reserved IP.

### 11.2 Option B — Static IP on the server PC

#### Linux (Netplan — Ubuntu)

Edit `/etc/netplan/01-netcfg.yaml` (filename may vary):

```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses: [192.168.1.50/24]
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```

Apply:
```bash
sudo netplan apply
```

#### Windows

1. Control Panel → Network and Sharing Center → Change adapter settings
2. Right-click your network adapter → Properties
3. Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
4. Choose "Use the following IP address"
5. IP: `192.168.1.50`, Subnet: `255.255.255.0`, Gateway: `192.168.1.1`
6. DNS: `8.8.8.8` and `1.1.1.1`
7. OK → close

### 11.3 Update `.env` with the static IP

If you change the IP, update `.env`:
```env
NEXTAUTH_URL="http://192.168.1.50:3000"
```

And restart the HMIS:
```bash
pm2 restart hmis
```

---

## 12. Test From a Staff Computer

On any staff PC connected to the same LAN:

1. Open a modern browser (Chrome, Edge, Firefox)
2. Navigate to `http://192.168.1.50:3000` (replace with your server's actual LAN IP)
3. You should see the HMIS login page
4. Log in with the admin credentials from §6 (the seed script prints them)
5. **Change the admin password immediately** (top-right → Profile → Change Password)
6. Create staff users for each role (Administration → Users)
7. Test creating a patient, an encounter, a prescription — verify the database round-trip works

If you see a connection error:
- Verify the HMIS is running: `pm2 status` on the server
- Verify the firewall allows port 3000
- Verify the IP is correct: `ip addr` (Linux) or `ipconfig` (Windows)
- Try pinging the server: `ping 192.168.1.50` from the staff PC

---

## 13. Optional: HTTPS with Self-Signed Cert

HTTP is fine for a trusted hospital LAN. If you want cookie security + browser warnings-free experience, set up HTTPS with a self-signed certificate + a reverse proxy (nginx).

### 13.1 Generate a self-signed cert (Linux)

```bash
sudo mkdir -p /etc/ssl/hmis
sudo openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout /etc/ssl/hmis/hmis.key \
  -out /etc/ssl/hmis/hmis.crt \
  -subj "/CN=192.168.1.50" \
  -addext "subjectAltName=IP:192.168.1.50"
sudo chmod 600 /etc/ssl/hmis/hmis.key
```

### 13.2 Install nginx

```bash
sudo apt install -y nginx
```

### 13.3 Configure nginx as a reverse proxy

Create `/etc/nginx/sites-available/hmis`:

```nginx
server {
    listen 80;
    server_name 192.168.1.50;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name 192.168.1.50;

    ssl_certificate     /etc/ssl/hmis/hmis.crt;
    ssl_certificate_key /etc/ssl/hmis/hmis.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable + reload:
```bash
sudo ln -s /etc/nginx/sites-available/hmis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo ufw allow 443/tcp
```

### 13.4 Update `.env`

```env
NEXTAUTH_URL="https://192.168.1.50"
```

Restart the HMIS:
```bash
pm2 restart hmis
```

### 13.5 Trust the cert on staff computers

Staff browsers will warn about the self-signed cert. To suppress the warning:

- **Chrome/Edge (per-machine):** Import the cert into "Trusted Root Certification Authorities" store
  - Windows: `certmgr.msc` → Trusted Root Certification Authorities → Certificates → Import → select `hmis.crt`
  - Linux: `sudo cp hmis.crt /usr/local/share/ca-certificates/hmis.crt && sudo update-ca-certificates`

OR simply click "Advanced → Proceed to 192.168.1.50 (unsafe)" on first visit — Chrome remembers the exception.

---

## 14. Backup & Restore

### 14.1 Daily PostgreSQL backup (cron)

Create `/opt/hmis/backup.sh`:

```bash
#!/bin/bash
set -e
BACKUP_DIR=/var/backups/hmis
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="hmis_backup_$TIMESTAMP.sql.gz"

# Use the password from .env to avoid prompt
export PGPASSWORD='YOUR_STRONG_PASSWORD'

pg_dump \
  --host=localhost \
  --username=hmis_user \
  --dbname=hmis \
  --format=custom \
  --file=$BACKUP_DIR/hmis_backup_$TIMESTAMP.dump

# Also keep a gzipped plain-SQL version
pg_dump \
  --host=localhost \
  --username=hmis_user \
  --dbname=hmis \
  --format=plain \
  | gzip > $BACKUP_DIR/$FILENAME

# Delete backups older than 30 days
find $BACKUP_DIR -name "hmis_backup_*" -mtime +30 -delete

echo "Backup complete: $BACKUP_DIR/$FILENAME"
```

Make it executable + schedule:
```bash
sudo chmod +x /opt/hmis/backup.sh
sudo crontab -e
# Add this line for daily 2 AM backup:
0 2 * * * /opt/hmis/backup.sh >> /var/log/hmis/backup.log 2>&1
```

### 14.2 Restore from backup

```bash
# Stop the HMIS first
pm2 stop hmis

# Drop + recreate the database (destructive — only for full restores)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS hmis;"
sudo -u postgres psql -c "CREATE DATABASE hmis OWNER hmis_user;"

# Restore
export PGPASSWORD='YOUR_STRONG_PASSWORD'
pg_restore \
  --host=localhost \
  --username=hmis_user \
  --dbname=hmis \
  --clean \
  --if-exists \
  /var/backups/hmis/hmis_backup_YYYYMMDD_HHMMSS.dump

# Restart
pm2 start hmis
```

### 14.3 Off-site backup (recommended)

For disaster recovery, copy the daily backup to:
- An external USB drive plugged into the server
- A NAS on the same LAN
- Cloud storage (if internet is available)

Schedule with rsync:
```bash
# Daily copy to NAS at 3 AM
0 3 * * * rsync -avz /var/backups/hmis/ user@nas-ip:/backups/hmis/
```

---

## 15. Updating the HMIS

When a new version is released on GitHub:

```bash
# 1. Backup the database (ALWAYS)
/opt/hmis/backup.sh

# 2. Stop the HMIS
pm2 stop hmis

# 3. Pull the latest code
cd /opt/hmis/joy-emmanuel-hospital-hmis
git pull origin main

# 4. Install any new dependencies
npm install

# 5. Apply schema changes (the --accept-data-loss flag may drop columns
#    that no longer exist in the schema — backup is critical)
npx prisma db push --accept-data-loss
npx prisma generate

# 6. Rebuild
npm run build

# 7. Restart
pm2 restart hmis

# 8. Verify in a browser — log in, click around, check the audit log
```

If anything goes wrong, restore from backup (§14.2) and rollback the code:
```bash
git log --oneline | head -5            # find the last known-good commit
git checkout <previous-commit-hash>
npm install
npx prisma db push --accept-data-loss
npm run build
pm2 restart hmis
```

---

## 16. Troubleshooting

### 16.1 "Cannot reach the page" / connection refused from staff computer

1. Check the HMIS is running: `pm2 status` on the server
2. Check the firewall: `sudo ufw status` (Linux) — port 3000 should be ALLOW
3. Check the IP: `ip addr` (Linux) / `ipconfig` (Windows) — verify the IP matches what's in `.env`
4. Ping the server from a staff PC: `ping 192.168.1.50`
5. Check the binding: `ss -tlnp | grep 3000` (Linux) — should show `0.0.0.0:3000`, not `127.0.0.1:3000`
6. If it shows `127.0.0.1:3000`, you forgot the `-H 0.0.0.0` flag

### 16.2 "Login redirects to localhost"

You left `NEXTAUTH_URL=http://localhost:3000` in `.env`. Change it to `http://192.168.1.50:3000` (your actual LAN IP) and restart: `pm2 restart hmis`.

### 16.3 "Database connection failed"

1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Verify the credentials in `.env` match §3.3
3. Test the connection manually:
   ```bash
   PGPASSWORD='YOUR_STRONG_PASSWORD' psql -U hmis_user -d hmis -h localhost -c "SELECT 1;"
   ```
4. Check PostgreSQL logs: `sudo tail -50 /var/log/postgresql/postgresql-15-main.log`

### 16.4 "404 on API routes"

You're running `next dev` instead of `next start`. Production uses `next start` after `npm run build`. Dev mode is fine for development but slower + less stable for production.

### 16.5 "Cookies not persisting"

If staff browsers don't keep their login session:
- Check `NEXTAUTH_URL` matches the actual URL staff use (including port)
- Check the cookie isn't being blocked by the browser (Chrome DevTools → Application → Cookies)
- Verify HTTP vs HTTPS — `secure: auto` means cookies are `secure: false` on HTTP (correct for LAN HTTP)

### 16.6 "AI Assistant doesn't work"

The AI Assistant requires either:
- Environment variables `ZAI_API_KEY` / `ZAI_BASE_URL` / `ZAI_MODEL` (in `.env`)
- OR a database-configured AI provider (Administration → AI Services → Add Provider)

For a fully offline LAN deployment, neither will work without internet egress to the AI provider's API. This is expected — the AI feature requires outbound internet to call the AI provider.

### 16.7 "Slow performance"

1. Check PostgreSQL config: `shared_buffers` should be ~25% of RAM (default is 128MB — too low)
   ```bash
   sudo sed -i 's/^#shared_buffers.*/shared_buffers = 2GB/' /etc/postgresql/15/main/postgresql.conf
   sudo systemctl restart postgresql
   ```
2. Check PM2 logs for errors: `pm2 logs hmis --lines 100`
3. Check server CPU/RAM: `htop` or `pm2 monit`
4. Consider running multiple HMIS instances behind nginx (cluster mode):
   ```bash
   pm2 start "npx next start -H 0.0.0.0 -p 3000" -i 2 --name hmis
   ```

### 16.8 "Service worker / PWA issues"

The HMIS includes a service worker (`public/sw.js`) for offline caching. On first visit, it caches the app shell. If you push a new version, staff may need to:
1. Hard-refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Or clear site data: Chrome DevTools → Application → Storage → Clear site data

---

## 17. Optional Integrations

### 17.1 AI Assistant (requires outbound internet)

The AI Assistant can be configured via:
- `.env` with `ZAI_API_KEY` / `ZAI_BASE_URL` / `ZAI_MODEL`
- OR the admin UI: Administration → AI Services → Add Provider (recommended — uses AES-256-GCM encrypted DB storage)

Configured providers: Z.ai, OpenAI, Anthropic, Groq, Ollama (local), or any OpenAI-compatible provider.

### 17.2 Telemedicine (requires outbound internet)

Daily.co integration for video consultations. Set `DAILY_API_KEY` + `DAILY_DOMAIN` in `.env`.

### 17.3 NHIA CLAIM-it (Ghana NHIS XML submission)

Set `NHIA_CLAIMIT_TRANSPORT=bridge` and `NHIA_CLAIMIT_BRIDGE_URL=http://localhost:31719` in `.env`. The CLAIM-it desktop app must be running on the same machine (or accessible at the configured URL) with its bridge service listening on port 31719.

### 17.4 SMS Notifications (future)

The SMS infrastructure is in place (Prisma models `PatientOtp`, `SmsLog`) but dormant. To activate, set `SMS_PROVIDER` in `.env` and configure the SMS gateway. Not required for routine HMIS operation.

---

## Summary — Quick Reference

| Step | Command / Action |
|---|---|
| Install PostgreSQL | `sudo apt install postgresql` + create `hmis_user` + `hmis` DB |
| Clone the repo | `git clone https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis.git` |
| Install deps | `npm install` |
| Configure `.env` | Set `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| Push schema | `npx prisma db push --accept-data-loss` |
| Seed | `npm run seed` |
| Build | `npm run build` |
| Start (manual) | `npx next start -H 0.0.0.0 -p 3000` |
| Start (PM2) | `pm2 start "npx next start -H 0.0.0.0 -p 3000" --name hmis` |
| Firewall | `sudo ufw allow 3000/tcp` |
| Staff URL | `http://SERVER_LAN_IP:3000` |

---

## Support

- **Repository:** https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis
- **Production (Vercel):** https://joy-emmanuel-hospital-hmis.vercel.app/
- **Vercel deployment guide:** See `DEPLOYMENT.md` for cloud deployment

For LAN-specific issues, check the troubleshooting section (§16) before reaching out. Most issues are firewall / IP / `.env` misconfiguration, not code bugs.
