# AI Caller Deployment Guide

Complete guide to deploying AI Caller to production.

## Table of Contents

1. [Quick Deploy (Railway.app)](#quick-deploy-railwayapp) - 5 minutes
2. [Free Deploy (Render.com)](#free-deploy-rendercom) - 10 minutes
3. [Production Deploy (DigitalOcean VPS)](#production-deploy-digitalocean-vps) - 30 minutes
4. [After Deployment](#after-deployment) - Configure Vapi webhooks

---

## Option 1: Quick Deploy (Railway.app)

**Best for:** Quick testing, staging environments
**Cost:** Free tier ($5 credit), then ~$5-10/month
**Pros:** Fastest setup, automatic HTTPS, persistent storage
**Cons:** Can get expensive with scale

### Steps

1. **Create Railway account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Install Railway CLI** (optional)
   ```bash
   npm install -g @railway/cli
   railway login
   ```

3. **Deploy from GitHub**

   **Option A: Via Railway Dashboard (Easier)**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Node.js

   **Option B: Via CLI**
   ```bash
   # In your project directory
   railway init
   railway up
   ```

4. **Add Environment Variables**

   In Railway Dashboard → Your Project → Variables:
   ```
   VAPI_API_KEY=your_vapi_api_key
   VAPI_PHONE_NUMBER_ID=your_phone_number_id
   VAPI_ASSISTANT_ID=your_assistant_id
   VAPI_WEBHOOK_SECRET=your_webhook_secret
   PORT=3000
   NODE_ENV=production
   DATABASE_PATH=/app/data/calls.db
   ```

5. **Add Persistent Storage**
   - Go to your service → Settings → Volumes
   - Click "New Volume"
   - Mount Path: `/app/data`
   - This ensures SQLite database persists across deploys

6. **Generate Domain**
   - Settings → Domains → "Generate Domain"
   - You'll get: `your-app.up.railway.app`
   - Or add custom domain

7. **Deploy**
   - Railway auto-deploys on git push
   - Check logs: Dashboard → Deployments → View Logs

**Your app URL:** `https://your-app.up.railway.app`

---

## Option 2: Free Deploy (Render.com)

**Best for:** Free testing, demos
**Cost:** Free tier (sleeps after 15min inactivity)
**Pros:** Free, easy setup, automatic HTTPS
**Cons:** Sleeps on free tier, slower cold starts

### Steps

1. **Create Render account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Create Web Service**
   - Dashboard → "New +" → "Web Service"
   - Connect your GitHub repository
   - Select repository

3. **Configure Service**
   ```
   Name: ai-caller
   Region: (choose closest to you)
   Branch: main
   Root Directory: (leave blank)
   Runtime: Node
   Build Command: npm install
   Start Command: npm run dev
   Instance Type: Free
   ```

4. **Add Environment Variables**

   In "Environment" section, add:
   ```
   VAPI_API_KEY=your_vapi_api_key
   VAPI_PHONE_NUMBER_ID=your_phone_number_id
   VAPI_ASSISTANT_ID=your_assistant_id
   VAPI_WEBHOOK_SECRET=your_webhook_secret
   PORT=3000
   NODE_ENV=production
   DATABASE_PATH=/app/data/calls.db
   ```

5. **Add Persistent Disk**
   - Scroll to "Disk"
   - Click "Add Disk"
   - Name: `data`
   - Mount Path: `/app/data`
   - Size: 1GB (free tier)

6. **Deploy**
   - Click "Create Web Service"
   - Render builds and deploys automatically
   - First deploy takes ~5 minutes

7. **Get URL**
   - After deployment: `https://ai-caller-xxx.onrender.com`
   - Or add custom domain in Settings

**Note:** Free tier sleeps after 15min of inactivity. First request after sleep takes ~30 seconds to wake up.

---

## Option 3: Production Deploy (DigitalOcean VPS)

**Best for:** Production, 24/7 uptime, full control
**Cost:** $6/month (1GB RAM droplet)
**Pros:** Always on, full control, cheap at scale
**Cons:** Requires more setup

### Steps

#### 1. Create Droplet

1. Sign up at https://digitalocean.com
2. Create → Droplets
3. Choose:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($6/month, 1GB RAM)
   - **Datacenter:** Closest to you
   - **Authentication:** SSH key (recommended) or Password
   - **Hostname:** ai-caller

#### 2. Initial Server Setup

```bash
# SSH into your droplet
ssh root@your_droplet_ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install nginx (reverse proxy)
apt install -y nginx

# Install certbot (SSL certificates)
apt install -y certbot python3-certbot-nginx

# Create app user (security)
adduser --disabled-password --gecos "" appuser
```

#### 3. Deploy Application

```bash
# Switch to app user
su - appuser

# Clone your repository
git clone https://github.com/yourusername/ai-caller.git
cd ai-caller

# Install dependencies
npm ci --only=production

# Create data directory
mkdir -p data

# Create .env file
nano .env
```

Add your environment variables:
```env
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER_ID=your_phone_number_id
VAPI_ASSISTANT_ID=your_assistant_id
VAPI_WEBHOOK_SECRET=your_webhook_secret
PORT=3000
NODE_ENV=production
DATABASE_PATH=./data/calls.db
```

Save and exit (Ctrl+X, Y, Enter).

#### 4. Start with PM2

```bash
# Start app with PM2
pm2 start npm --name "ai-caller" -- run dev

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Copy and run the command it outputs

# Check status
pm2 status
pm2 logs ai-caller
```

#### 5. Setup Nginx Reverse Proxy

```bash
# Exit to root user
exit

# Create nginx config
nano /etc/nginx/sites-available/ai-caller
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
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

Enable site:
```bash
ln -s /etc/nginx/sites-available/ai-caller /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### 6. Setup SSL with Let's Encrypt

```bash
# Get SSL certificate (replace with your domain)
certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
# Test renewal:
certbot renew --dry-run
```

#### 7. Setup Firewall

```bash
# Enable firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

### Updating Application (VPS)

```bash
# SSH into server
ssh root@your_droplet_ip
su - appuser
cd ai-caller

# Pull latest changes
git pull

# Install new dependencies
npm ci --only=production

# Restart app
pm2 restart ai-caller

# Check logs
pm2 logs ai-caller
```

---

## After Deployment

### 1. Get Your Deployment URL

- **Railway:** `https://your-app.up.railway.app`
- **Render:** `https://ai-caller-xxx.onrender.com`
- **VPS:** `https://your-domain.com`

### 2. Test Your Deployment

```bash
# Check health
curl https://your-deployment-url.com/dashboard

# Should redirect to dashboard and show UI
```

### 3. Configure Vapi Webhooks

1. Go to https://dashboard.vapi.ai
2. Navigate to **Phone Numbers** → Select your number
3. Find **Server URL** field
4. Enter: `https://your-deployment-url.com/webhook/vapi`
5. Add **Server URL Secret**: Your `VAPI_WEBHOOK_SECRET` value
6. Click **Save**

### 4. Update Assistant

After deployment, update your assistant configuration:

```bash
curl -X POST https://your-deployment-url.com/calls/update-assistant
```

Or the assistant will auto-update when the server starts.

### 5. Test End-to-End

1. Open dashboard: `https://your-deployment-url.com/dashboard`
2. Fill in the Quick Start Call form
3. Make a test call to your phone
4. Verify:
   - ✅ Call connects
   - ✅ AI waits for you to say "Hello?"
   - ✅ AI responds with greeting
   - ✅ Transcripts appear in dashboard
   - ✅ Call summary generated

---

## Troubleshooting

### Railway/Render

**Problem:** App crashes on startup
```bash
# Check logs in dashboard
# Common issues:
# - Missing environment variables
# - Port binding (use process.env.PORT)
# - Database path not writable
```

**Problem:** Database not persisting
```bash
# Ensure volume/disk is mounted to /app/data
# Check DATABASE_PATH=/app/data/calls.db
```

### VPS

**Problem:** PM2 app not starting
```bash
# Check logs
pm2 logs ai-caller

# Check environment variables
pm2 env 0

# Restart
pm2 restart ai-caller
```

**Problem:** Can't access from outside
```bash
# Check nginx
systemctl status nginx
nginx -t

# Check firewall
ufw status

# Check app is running
pm2 status
curl http://localhost:3000/dashboard
```

**Problem:** SSL not working
```bash
# Check certbot
certbot certificates

# Renew manually
certbot renew

# Check nginx config
nginx -t
```

---

## Monitoring & Logs

### Railway
- Dashboard → Your Project → Deployments → Logs
- Real-time logs in browser

### Render
- Dashboard → Your Service → Logs
- Limited log history on free tier

### VPS
```bash
# PM2 logs
pm2 logs ai-caller
pm2 logs ai-caller --lines 100

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u nginx -f
```

---

## Cost Comparison

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| Railway | $5 credit | ~$5-10/mo | Quick testing |
| Render | Yes (sleeps) | $7/mo | Free demos |
| DigitalOcean | No | $6/mo | Production |
| AWS/GCP | Limited | Varies | Enterprise |

---

## Recommended: Railway for Quick Start

For getting started quickly and letting others test:

1. **Railway.app** - fastest, easiest, works immediately
2. Add GitHub repo
3. Set environment variables
4. Add volume for `/app/data`
5. Deploy in 5 minutes
6. Share URL: `https://your-app.up.railway.app`

You can always migrate to VPS later for production.

---

## Security Checklist

- ✅ Use `VAPI_WEBHOOK_SECRET` for webhook verification
- ✅ Use HTTPS (automatic on Railway/Render, certbot on VPS)
- ✅ Don't commit `.env` file (use `.env.example` template)
- ✅ Keep dependencies updated (`npm audit`)
- ✅ Use strong passwords/SSH keys for VPS
- ✅ Enable firewall on VPS
- ✅ Regular backups of SQLite database

---

## Need Help?

Check deployment logs for errors:
- Railway/Render: Dashboard → Logs
- VPS: `pm2 logs ai-caller`

Common issues:
- Missing environment variables
- Database permissions
- Port already in use
- Webhook URL not configured in Vapi
