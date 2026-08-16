# Deploying Joy Emmanuel Hospital HMIS to Vercel

This guide walks you through deploying the HMIS to Vercel with your existing Neon PostgreSQL database.

## Prerequisites

- A Vercel account (free Hobby tier works fine; Pro recommended for production)
- The GitHub repo: https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis
- A Neon PostgreSQL database (already configured — connection string in your `.env`)

## Deployment Steps

### 1. Import the repo to Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Find and select `kingstechplc-lang/joy-emmanuel-hospital-hmis`
4. Click **Import**

### 2. Configure the Project

Vercel will auto-detect Next.js. Leave the defaults but verify:

- **Framework Preset**: Next.js
- **Build Command**: `next build` (auto-detected)
- **Install Command**: `bun install` (auto-detected from `vercel.json`)
- **Output Directory**: `.next` (auto-detected)

### 3. Add Environment Variables

In the **Environment Variables** section, add these 4 variables:

| Name | Value | Environments |
|---|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Production, Preview, Development |
| `DIRECT_URL` | `postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Production, Preview, Development |
| `NEXTAUTH_SECRET` | (generate with `openssl rand -base64 32`) | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://your-app-name.vercel.app` (use your actual Vercel URL after first deploy) | Production |

> ⚠️ **Rotate the Neon password** before pasting it into Vercel — the one you shared earlier should be considered compromised. See "Security Hardening" below.

### 4. Deploy

Click **Deploy**. The build will take ~2-4 minutes:
1. Vercel runs `bun install` (installs dependencies)
2. The `postinstall` hook runs `prisma generate` (regenerates the Prisma client)
3. Vercel runs `next build` (compiles the app)
4. Vercel deploys ~50 serverless functions (one per API route) + the Next.js frontend

### 5. Update NEXTAUTH_URL

After the first deploy completes:
1. Copy your Vercel URL (e.g., `https://joy-emmanuel-hospital-hmis.vercel.app`)
2. Go to Vercel → Project Settings → Environment Variables
3. Update `NEXTAUTH_URL` to your new URL
4. Trigger a redeploy (Deployments → ⋮ → Redeploy)

### 6. Verify

Visit your Vercel URL and:
1. Login with `superadmin / Password@2026`
2. Verify the dashboard shows real data (3 patients, etc.)
3. Click through several views to confirm API routes work
4. Check Vercel → Functions tab to see API route invocations and logs

## Security Hardening (Do This Before Production Use)

### Rotate the Neon Password
1. Go to https://console.neon.tech → your project
2. Settings → Connection → Reset password
3. Update the password in:
   - Your local `.env` file
   - Vercel environment variables (`DATABASE_URL` and `DIRECT_URL`)
4. Test that the app still works after the password change

### Rotate the GitHub PAT
1. Go to https://github.com/settings/tokens
2. Delete the PAT you shared earlier
3. Create a new PAT only when needed for git pushes

### Change Default User Passwords
The seed creates 13 users all with password `Password@2026`. Change these immediately:
1. Login as `superadmin`
2. Go to Administration → Users
3. Click each user and set a new strong password
4. Or — better — disable the demo users and create real staff accounts

### Set a Strong NEXTAUTH_SECRET
Generate a strong secret locally:
```bash
openssl rand -base64 32
```
Use that value for `NEXTAUTH_SECRET` in Vercel.

## Vercel-Specific Considerations

### Function Timeouts
- **Hobby tier**: max 10 seconds per serverless function
- **Pro tier**: max 60 seconds per serverless function
- We've set `maxDuration = 30` on the slowest routes (dashboard stats, patient 360°)
- On Hobby, these will use the 10s default — still enough since most queries complete in <3s on a warm Neon DB
- Neon cold starts can add 1-2s on the first request after idle

### Neon Cold Starts
Neon's free tier "scales to zero" after ~5 minutes of inactivity. The first request after idle takes an extra ~1-2 seconds. To mitigate:
- **Option A**: Upgrade Neon to a paid plan (always-on compute)
- **Option B**: Add a Vercel Cron job that pings the dashboard stats endpoint every 5 minutes to keep Neon warm:
  ```bash
  # In vercel.json, add:
  "crons": [{
    "path": "/api/dashboard/stats",
    "schedule": "*/5 * * * *"
  }]
  ```
  Note: this requires the endpoint to allow unauthenticated pings, OR you set up a special "warmup" token. For simplicity, just upgrade Neon if this becomes an issue.

### Region
Vercel's default region is `iad1` (Washington, DC, US East). Your Neon DB is in `us-east-2` (Ohio). Latency between them is ~10-15ms — fine for most operations.

To use a Vercel region closer to Ohio, add to `vercel.json`:
```json
{
  "regions": ["cle1"]
}
```
`cle1` is Cleveland — closest to Ohio. Note: only available on Pro tier.

### Database Connection Limits
- Neon free tier: max 100 concurrent connections
- Vercel serverless: each function instance opens a new Prisma client connection
- The connection pooler (the `-pooler` host in your DATABASE_URL) handles this automatically
- If you see "too many connections" errors, ensure you're using the pooler URL (not the direct URL) for `DATABASE_URL`

## Re-Running the Seed (If You Reset the Database)

If you ever need to repopulate the database:

```bash
# Clone the repo locally
git clone https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis.git
cd joy-emmanuel-hospital-hmis

# Install dependencies
bun install

# Set up env vars
cp .env.example .env
# Edit .env with your Neon connection string

# Push schema (in case it drifted)
bun run db:push

# Run phase 1 seed (org, facilities, roles, permissions, users, lab tests)
bun tsx scripts/seed.ts

# Run phase 2 seed (services, medications, inventory, suppliers, sample patients)
bun tsx scripts/seed-phase2.ts
```

The seed scripts are idempotent — they can be re-run safely without creating duplicates.

## Troubleshooting

### Build fails with "Prisma Client not generated"
Make sure the `postinstall` script is in `package.json`:
```json
"scripts": {
  "postinstall": "prisma generate"
}
```
This is already configured.

### Build fails with "DATABASE_URL must start with postgresql://"
You're using an old env var. In Vercel, make sure `DATABASE_URL` starts with `postgresql://` (not `file:`).

### Login fails with 401
Check that `NEXTAUTH_SECRET` is set and `NEXTAUTH_URL` matches your Vercel domain exactly (including `https://`).

### API returns 500 with Prisma errors
Check Vercel → Functions → Logs. Common issues:
- Missing env var (DATABASE_URL not set)
- Database connection issue (Neon password rotated but not updated in Vercel)
- Schema out of sync (run `bun run db:push` locally against Neon)

### Slow first request after idle
This is Neon warming up. Subsequent requests will be fast. If unacceptable, upgrade Neon to always-on.

## Vercel Dashboard URLs

After deployment, you can manage your app at:
- **Project**: https://vercel.com/kingstechplc-lang/joy-emmanuel-hospital-hmis
- **Deployments**: https://vercel.com/kingstechplc-lang/joy-emmanuel-hospital-hmis/deployments
- **Analytics**: https://vercel.com/kingstechplc-lang/joy-emmanuel-hospital-hmis/analytics
- **Logs**: https://vercel.com/kingstechplc-lang/joy-emmanuel-hospital-hmis/logs
- **Settings**: https://vercel.com/kingstechplc-lang/joy-emmanuel-hospital-hmis/settings
