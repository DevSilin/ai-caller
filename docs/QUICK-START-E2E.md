# 🚀 Quick Start: E2E Testing

## 5-minute guide for complete system testing

### Step 1: Install ngrok

```bash
# Download from https://ngrok.com/download
# Or:
scoop install ngrok  # Windows
```

Register and get authtoken:
```bash
ngrok config add-authtoken YOUR_TOKEN
```

---

### Step 2: Start the System (3 terminals)

**Terminal 1 - ngrok:**
```bash
ngrok http 3000
```
**Result:** Get URL like `https://abc123.ngrok-free.app`

**Terminal 2 - Server:**
```bash
npm run dev
```
**Result:** Server starts on port 3000

**Terminal 3 - Keep free for commands**

---

### Step 3: Configure Vapi.ai

1. Open [Vapi Dashboard](https://dashboard.vapi.ai)
2. **Assistants** → your assistant → **Server URL**:
   ```
   https://YOUR_NGROK_URL.ngrok-free.app/webhook/vapi
   ```
3. Get **Webhook Secret** and add to `.env`:
   ```bash
   VAPI_WEBHOOK_SECRET=your_real_secret_from_vapi
   ```
4. Restart server (Ctrl+C in terminal 2, then `npm run dev`)

---

### Step 4: Open Dashboard

In browser:
```
http://localhost:3000/dashboard
```

You'll see a beautiful dashboard for real-time call monitoring! 🎉

---

### Step 5: Start Test Call

**Option A - Automated test (recommended):**
```bash
node test-e2e-call.js +1YOUR_PHONE_NUMBER
```

**Example:**
```bash
node test-e2e-call.js +15551234567
```

**What happens:**
1. ✅ Call initiates
2. 📞 Vapi calls your number
3. 🗣️ You talk with AI
4. 💬 Transcripts shown in terminal real-time
5. 📊 Final summary displayed after call

**Option B - Via Dashboard:**
1. Open `http://localhost:3000/dashboard`
2. Use curl or Postman:
   ```bash
   curl -X POST http://localhost:3000/calls/start \
     -H "Content-Type: application/json" \
     -d '{
       "firstName": "Test",
       "lastName": "User",
       "phone": "+1YOUR_NUMBER",
       "county": "Test",
       "state": "CA"
     }'
   ```
3. Refresh dashboard - see call in real-time!

---

## 🎭 What to Test

### Scenario 1: Interested (HOT)
```
AI: Hi Test, this is Alex with LandVerse...
YOU: "Yes, I'm interested in selling"
→ Should transition to QUALIFICATION
→ Interest Level: HOT
```

### Scenario 2: Not Interested
```
AI: Hi Test, this is Alex...
YOU: "No, not interested"
→ Should transition to END
→ Interest Level: NOT_INTERESTED
```

### Scenario 3: Maybe (WARM)
```
AI: Hi Test, this is Alex...
YOU: "Maybe, tell me more"
→ Should stay in GREETING or transition to QUALIFICATION
→ Interest Level: WARM
```

---

## 📊 Check Results

### In Dashboard (http://localhost:3000/dashboard)
- ✅ See call in list
- ✅ Status changes: CALLING → IN_PROGRESS → COMPLETED
- ✅ State changes: GREETING → QUALIFICATION → CLOSING → END
- ✅ Click card - see full transcript
- ✅ See Interest Level (HOT/WARM/COLD)
- ✅ See Next Action

### In Terminal (test-e2e-call.js)
You'll see real-time:
```
📞 Initiating call to +15551234567...
✅ Call initiated successfully!
🆔 Call ID: abc-123-def
📊 Status: CALLING
👀 Monitoring call progress...

📞 Status: IN_PROGRESS
👋 State Machine: GREETING
💬 [1] Hi Test, this is Alex...
💬 [2] Yes I'm interested
❓ State Machine: QUALIFICATION
💬 [3] Great — can I ask a few questions...
```

### Via API
```bash
# Get all calls
curl http://localhost:3000/calls

# Get call details
curl http://localhost:3000/calls/CALL_ID

# Get summary
curl http://localhost:3000/calls/CALL_ID/summary
```

---

## ✅ Success Checklist

- [ ] ngrok shows public URL
- [ ] Server running and working
- [ ] Vapi webhook URL configured
- [ ] VAPI_WEBHOOK_SECRET set
- [ ] Dashboard opens in browser
- [ ] Call initiated
- [ ] Phone rang (you received call)
- [ ] Talked with AI
- [ ] Transcripts appeared in dashboard
- [ ] State machine switched correctly
- [ ] Call summary generated
- [ ] Interest level determined correctly

---

## 🐛 Quick Troubleshooting

### Webhooks not arriving
```bash
# Check ngrok:
curl https://YOUR_NGROK_URL.ngrok-free.app/webhook/vapi
# Should return 401 (this is normal without signature)

# Check ngrok web interface:
http://127.0.0.1:4040
# Do you see requests from Vapi?
```

### 401 Unauthorized on webhook
```bash
# Make sure VAPI_WEBHOOK_SECRET is correct:
echo $VAPI_WEBHOOK_SECRET  # Linux/Mac
echo %VAPI_WEBHOOK_SECRET% # Windows

# Restart server after .env changes
```

### Vapi not calling
- Check balance in Vapi account
- Make sure number in E.164 format: `+15551234567`
- Check VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID

### Dashboard not loading
```bash
# Check file exists:
ls src/modules/dashboard/dashboard.html

# Restart server
```

---

## 📚 More Info

**Full documentation:** See `E2E-TESTING.md`

**Test scripts:**
- `test-e2e-call.js` - full E2E test with monitoring
- `test-validation.js` - validation tests
- `test-webhook-signature.js` - webhook security tests

**Endpoints:**
- `http://localhost:3000/dashboard` - Web dashboard
- `http://localhost:3000/calls` - API for calls
- `http://localhost:3000/webhook/vapi` - Vapi webhook

---

## 🎉 Done!

You can now:
- ✅ Test real calls
- ✅ See transcripts in real-time
- ✅ Check state machine transitions
- ✅ Analyze call summaries
- ✅ Monitor system via dashboard

**Next step:** Start testing with real leads! 🚀
