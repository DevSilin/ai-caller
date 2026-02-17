# Quick Deploy to Railway.app (5 Minutes)

Deploy AI Caller in 5 minutes and get a public URL to share.

## Why Railway?

- ✅ Fastest deployment (5 minutes)
- ✅ Automatic HTTPS
- ✅ Persistent storage for SQLite
- ✅ Free $5 credit (good for testing)
- ✅ Auto-deploy on git push
- ✅ Easy to share with others

## Prerequisites

- GitHub account
- Your Vapi credentials ready

## Step-by-Step Guide

### 1. Push Code to GitHub (if not already)

```bash
# In your project directory
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/ai-caller.git
git push -u origin main
```

### 2. Create Railway Account

1. Go to https://railway.app
2. Click "Login" → "Login with GitHub"
3. Authorize Railway

### 3. Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Select your `ai-caller` repository
4. Railway automatically detects Node.js and starts deploying

### 4. Add Environment Variables

While it's deploying:

1. Click on your service
2. Go to "Variables" tab
3. Click "Add Variable" and add these:

```
VAPI_API_KEY=your_vapi_api_key_here
VAPI_PHONE_NUMBER_ID=your_phone_number_id_here
VAPI_ASSISTANT_ID=your_assistant_id_here
VAPI_WEBHOOK_SECRET=your_webhook_secret_here
PORT=3000
NODE_ENV=production
DATABASE_PATH=/app/data/calls.db
```

**Where to find these values:**
- Go to https://dashboard.vapi.ai
- **VAPI_API_KEY:** Account → API Keys
- **VAPI_PHONE_NUMBER_ID:** Phone Numbers → Copy ID
- **VAPI_ASSISTANT_ID:** Assistants → Copy ID
- **VAPI_WEBHOOK_SECRET:** (create a random string, e.g., use https://randomkeygen.com/)

After adding variables, Railway will auto-redeploy.

### 5. Add Persistent Storage

**CRITICAL:** Without this, your SQLite database will reset on every deploy!

1. Go to your service
2. Click "Settings" tab
3. Scroll to "Volumes"
4. Click "New Volume"
   - **Name:** `data`
   - **Mount Path:** `/app/data`
   - Click "Add"

Railway will redeploy again.

### 6. Generate Public URL

1. Go to "Settings" tab
2. Scroll to "Networking"
3. Under "Public Networking", click "Generate Domain"
4. Railway generates: `ai-caller-production-xxxx.up.railway.app`
5. Copy this URL

### 7. Configure Vapi Webhooks

1. Go to https://dashboard.vapi.ai
2. Navigate to **Phone Numbers**
3. Select your outbound phone number
4. Find **Server URL** field
5. Enter: `https://your-railway-url.up.railway.app/webhook/vapi`
   - Example: `https://ai-caller-production-xxxx.up.railway.app/webhook/vapi`
6. Enter **Server URL Secret**: The same `VAPI_WEBHOOK_SECRET` you used above
7. Click **Save**

### 8. Test Your Deployment

Open your Railway URL in browser:
```
https://your-railway-url.up.railway.app/dashboard
```

You should see the AI Caller Dashboard!

### 9. Make a Test Call

1. In the dashboard, fill in the Quick Start Call form:
   - Phone: Your phone number (e.g., `+1234567890`)
   - First Name: Test
   - Last Name: User
   - County: Test County
   - State: CA

2. Click "Start Call"

3. Answer your phone and say "Hello?"

4. AI should respond with greeting!

5. Check the dashboard - you should see the call appear with transcripts

## ✅ You're Done!

Your app is now deployed and accessible at:
```
https://your-railway-url.up.railway.app/dashboard
```

Share this URL with anyone who wants to test!

---

## Viewing Logs

To see what's happening:

1. Railway Dashboard → Your Project
2. Click on your service
3. Go to "Deployments" tab
4. Click on latest deployment
5. Click "View Logs"

Real-time logs will appear here.

---

## Updating Your App

Whenever you make changes to your code:

```bash
git add .
git commit -m "Your changes"
git push
```

Railway **automatically** detects the push and redeploys!

---

## Cost

Railway gives you **$5 free credit** per month.

This is usually enough for:
- Testing and demos
- ~100-200 short calls
- 24/7 uptime for small usage

After the free credit:
- **~$5-10/month** depending on usage
- You only pay for what you use
- Can set spending limits in Settings → Usage

---

## Troubleshooting

### "Service Unavailable" Error

Check logs (Deployments → View Logs):
- Look for missing environment variables
- Check if app started successfully
- Verify port is 3000

### Calls Not Working

1. **Check webhook URL in Vapi:**
   - Must be: `https://your-url.up.railway.app/webhook/vapi`
   - Must have `/webhook/vapi` at the end
   - Must use HTTPS (not HTTP)

2. **Check webhook secret matches:**
   - Vapi Dashboard: Server URL Secret
   - Railway: VAPI_WEBHOOK_SECRET variable
   - Must be exactly the same

3. **Check logs for webhook errors:**
   - Railway → Logs
   - Look for 401/400 errors on `/webhook/vapi`

### Database Resets on Deploy

- Make sure you added a Volume (Step 5)
- Mount path must be: `/app/data`
- DATABASE_PATH must be: `/app/data/calls.db`

---

## Next Steps

Now that your app is deployed:

1. ✅ Share URL with team members
2. ✅ Make test calls
3. ✅ Monitor in dashboard
4. ✅ Check logs for issues
5. ✅ Adjust assistant configuration if needed

When ready for production:
- Consider custom domain (Railway → Settings → Domains)
- Set up monitoring/alerts
- Back up database regularly
- Review Railway usage/costs

---

## Alternative: One-Click Deploy Button

You can also create a one-click deploy button for Railway by adding this to your README:

```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/yourusername/ai-caller)
```

This lets anyone deploy their own instance with one click!

---

## Support

If you run into issues:
1. Check Railway logs first
2. Check Vapi Dashboard → Calls → Logs
3. Verify all environment variables are set
4. Ensure volume is mounted

Most issues are:
- Missing environment variables
- Wrong webhook URL in Vapi
- Mismatched webhook secret
- No volume for database
