# Production Deployment Guide

Complete guide for deploying AI Caller to production environment.

## ✅ Pre-Deployment Checklist

### 1. Environment Variables

Required variables in production `.env`:

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_PATH=./data/calls.db

# Vapi.ai (REQUIRED)
VAPI_API_KEY=your_production_api_key
VAPI_PHONE_NUMBER_ID=your_phone_number_id
VAPI_ASSISTANT_ID=your_assistant_id

# Security (REQUIRED in production)
VAPI_WEBHOOK_SECRET=your_webhook_secret
```

**⚠️ IMPORTANT:** Always set `VAPI_WEBHOOK_SECRET` in production for webhook security!

### 2. Database Setup

The application uses SQLite for persistent storage:

- Database file location: `./data/calls.db`
- Data persists across server restarts ✅
- Automatic migrations on startup ✅
- WAL mode enabled for better performance ✅

**Backup Strategy:**

```bash
# Create database backup
cp data/calls.db data/calls.db.backup

# Scheduled backup (add to cron)
0 2 * * * cp /path/to/ai-caller/data/calls.db /backups/calls-$(date +\%Y\%m\%d).db
```

### 3. Security Considerations

**Webhook Security:**
- ✅ HMAC-SHA256 signature verification enabled
- ✅ Timing-safe comparison prevents timing attacks
- ✅ Returns 401 for invalid signatures

**Input Validation:**
- ✅ Zod schemas validate all API inputs
- ✅ Phone number validation (E.164 format)
- ✅ UUID validation for IDs
- ✅ Type-safe error handling

**Data Protection:**
- ✅ Database file excluded from git (`.gitignore`)
- ✅ Sensitive data in environment variables
- ✅ No hardcoded credentials

## 🚀 Deployment Options

### Option 1: Traditional VPS/Server

**Requirements:**
- Node.js 18+ installed
- 512MB RAM minimum
- 1GB disk space

**Steps:**

1. **Clone repository:**
```bash
git clone <your-repo-url>
cd ai-caller
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment:**
```bash
cp .env.example .env
nano .env  # Edit with production values
```

4. **Build TypeScript:**
```bash
npx tsc
```

5. **Start with PM2 (recommended):**
```bash
npm install -g pm2
pm2 start dist/app.js --name ai-caller
pm2 startup  # Enable auto-start on boot
pm2 save     # Save PM2 configuration
```

6. **Monitor:**
```bash
pm2 status
pm2 logs ai-caller
pm2 monit
```

### Option 2: Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npx tsc

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/app.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  ai-caller:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/data/calls.db
      - VAPI_API_KEY=${VAPI_API_KEY}
      - VAPI_PHONE_NUMBER_ID=${VAPI_PHONE_NUMBER_ID}
      - VAPI_ASSISTANT_ID=${VAPI_ASSISTANT_ID}
      - VAPI_WEBHOOK_SECRET=${VAPI_WEBHOOK_SECRET}
    volumes:
      - ./data:/app/data  # Persist database
    restart: unless-stopped
```

**Deploy:**
```bash
docker-compose up -d
docker-compose logs -f  # View logs
```

### Option 3: Cloud Platforms

#### Railway.app

1. Connect GitHub repository
2. Add environment variables in dashboard
3. Deploy automatically on push

#### Render.com

1. Create new Web Service
2. Connect repository
3. Build command: `npm install && npx tsc`
4. Start command: `node dist/app.js`
5. Add environment variables
6. Add persistent disk at `/app/data`

#### DigitalOcean App Platform

1. Create new app from GitHub
2. Configure build settings
3. Add environment variables
4. Attach managed database (optional upgrade from SQLite)

## 🔧 Production Configuration

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

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

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📊 Monitoring

### Health Check Endpoint

Add to `src/app.ts`:

```typescript
app.get("/health", async (req, reply) => {
  return { status: "ok", timestamp: new Date().toISOString() };
});
```

### Logging

Application uses Fastify logger (Pino):

```bash
# View logs with PM2
pm2 logs ai-caller

# View Docker logs
docker-compose logs -f ai-caller
```

### Metrics to Monitor

- Server uptime
- API response times
- Active calls count
- Database size
- Error rates
- Webhook failures

## 🔄 Updates and Maintenance

### Deploy Updates

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Rebuild
npx tsc

# Restart server
pm2 restart ai-caller
```

### Database Migration

If database schema changes:

1. Backup existing database: `cp data/calls.db data/calls.db.backup`
2. Deploy new version (migrations run automatically on startup)
3. Verify data integrity

### Rollback Procedure

```bash
# Stop server
pm2 stop ai-caller

# Restore previous version
git checkout <previous-commit>
npm install
npx tsc

# Restore database backup if needed
cp data/calls.db.backup data/calls.db

# Restart
pm2 start ai-caller
```

## 🐛 Troubleshooting

### Server Won't Start

Check logs:
```bash
pm2 logs ai-caller --lines 100
```

Common issues:
- Missing environment variables → Check `.env` file
- Port already in use → Change `PORT` or kill existing process
- Database locked → Check for zombie processes

### Webhook Failures

1. Check webhook URL is accessible: `curl https://your-domain.com/webhook/vapi`
2. Verify `VAPI_WEBHOOK_SECRET` matches Vapi dashboard
3. Check logs for signature verification errors

### Database Issues

```bash
# Check database integrity
sqlite3 data/calls.db "PRAGMA integrity_check;"

# View database size
du -h data/calls.db

# Backup and recreate
cp data/calls.db data/calls.db.backup
rm data/calls.db
# Restart server to recreate from migrations
```

## 📞 Support

For production issues:
- Check logs first: `pm2 logs` or `docker-compose logs`
- Review environment variables
- Verify Vapi.ai configuration
- Check webhook connectivity

---

**Production Ready Checklist:**
- [ ] All environment variables configured
- [ ] `VAPI_WEBHOOK_SECRET` set
- [ ] Database backups scheduled
- [ ] SSL certificate installed
- [ ] Monitoring configured
- [ ] Error alerts setup
- [ ] Documentation reviewed
- [ ] Test calls successful
