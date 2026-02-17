# 🎯 End-to-End Testing Guide

Complete guide for testing the entire system with real calls through Vapi.ai.

## 📋 What We're Testing

1. ✅ Call initiation via `/calls/start`
2. ✅ Vapi.ai makes real phone call
3. ✅ Webhook events arrive at our server
4. ✅ State machine correctly handles dialogue
5. ✅ Transcripts are saved
6. ✅ Call summary is generated correctly

---

## 🛠️ Step 1: Setup Webhook URL

Vapi.ai needs to know where to send webhook events. For local development, use **ngrok**.

### Install ngrok

**Windows:**
```bash
# Download from https://ngrok.com/download
# Or via chocolatey:
choco install ngrok

# Or via scoop:
scoop install ngrok
```

**Registration:**
```bash
# Sign up at https://ngrok.com
# Get your authtoken
ngrok config add-authtoken YOUR_AUTHTOKEN
```

### Start ngrok tunnel

```bash
# In separate terminal:
ngrok http 3000
```

You'll get a URL like: `https://abc123.ngrok-free.app`

### Configure in Vapi.ai

1. Go to [Vapi.ai Dashboard](https://dashboard.vapi.ai)
2. Navigate to **Assistants** → select your assistant
3. In **Server URL** (or **Webhooks**) section, set:
   ```
   https://YOUR_NGROK_URL.ngrok-free.app/webhook/vapi
   ```
4. Get **Webhook Secret** and set in `.env`:
   ```bash
   VAPI_WEBHOOK_SECRET=your_actual_webhook_secret_from_vapi
   ```

---

## 🚀 Step 2: Start the System

### Terminal 1: ngrok
```bash
ngrok http 3000
```
**Result:** You get a public URL

### Terminal 2: Server
```bash
npm run dev
```
**Result:** Server listening on port 3000

### Terminal 3: Monitoring (optional)
```bash
# Watch logs in real-time
npm run dev | grep -E "(webhook|transcript|state)"
```

---

## 📞 Step 3: Initiate Test Call

### Option A: Via test script (recommended)

```bash
node test-e2e-call.js +1YOUR_PHONE_NUMBER
```

Script automatically:
1. Creates call via `/calls/start`
2. Monitors call status
3. Shows transcripts in real-time
4. Outputs final summary

### Option B: Via curl

```bash
curl -X POST http://localhost:3000/calls/start \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "phone": "+1YOUR_PHONE_NUMBER",
    "county": "Test County",
    "state": "CA"
  }'
```

**IMPORTANT:** Replace `+1YOUR_PHONE_NUMBER` with your real number for testing!

### Option C: Via Web Dashboard

Open in browser:
```
http://localhost:3000/dashboard
```

---

## 🎭 Step 4: Test Scenarios

### Scenario 1: Positive Response (HOT lead)

**Dialogue:**
```
AI: Hi Test, this is Alex with LandVerse...
YOU: "Yes, I'm interested in selling"
AI: Great — can I ask a few questions about the property?
YOU: "Sure"
AI: Thanks. Based on that, we may be able to make an offer.
YOU: "How much?"
AI: Our acquisitions team will follow up shortly.
```

**Expected Result:**
- State: `GREETING → QUALIFICATION → CLOSING → END`
- Interest Level: `HOT`
- Next Action: "Send offer via email"

### Scenario 2: Not Interested (NOT_INTERESTED)

**Dialogue:**
```
AI: Hi Test, this is Alex with LandVerse...
YOU: "No, I'm not interested"
AI: No problem — thanks for your time!
```

**Expected Result:**
- State: `GREETING → END`
- Interest Level: `NOT_INTERESTED`
- Outcome: "Not interested in selling"

### Scenario 3: Maybe (WARM lead)

**Dialogue:**
```
AI: Hi Test, this is Alex with LandVerse...
YOU: "Maybe, tell me more"
AI: Just to confirm — would you consider selling?
YOU: "I'm thinking about it"
AI: Great — can I ask a few questions...
```

**Expected Result:**
- State: `GREETING → QUALIFICATION → ...`
- Interest Level: `WARM`
- Next Action: "Follow up in 1 week"

---

## 🔍 Step 5: Verify Data

### Via API

**Get all calls:**
```bash
curl http://localhost:3000/calls
```

**Get call details:**
```bash
curl http://localhost:3000/calls/CALL_ID
```

**Get call summary:**
```bash
curl http://localhost:3000/calls/CALL_ID/summary
```

### Via Web Dashboard

Open `http://localhost:3000/dashboard` and see:
- ✅ List of all calls
- ✅ Real-time status updates
- ✅ Complete transcripts
- ✅ State machine transitions
- ✅ Interest level and next action

---

## 📊 What to Check

### ✅ Call Flow
- [ ] Call initiates (status: CALLING)
- [ ] Vapi accepts request (vapiCallId present)
- [ ] Call starts (status: IN_PROGRESS)
- [ ] Webhook call-start arrives
- [ ] Call ends (status: COMPLETED)
- [ ] Webhook call-end arrives

### ✅ Transcripts
- [ ] Each message saved in `call.transcript[]`
- [ ] Transcript text is correct
- [ ] Message order is correct

### ✅ State Machine
- [ ] Initial state: `GREETING`
- [ ] Transitions to `QUALIFICATION` on "yes"
- [ ] Transitions to `END` on "no"
- [ ] State machine returns correct replies
- [ ] Replies reach Vapi (visible in conversation)

### ✅ Call Summary
- [ ] Duration recorded
- [ ] Interest level determined correctly
  - `HOT`: "yes", "interested", "how much"
  - `WARM`: "maybe", "thinking about"
  - `COLD`: everything else
  - `NOT_INTERESTED`: "not interested", "no thanks"
- [ ] Key points extracted
- [ ] Outcome determined
- [ ] Next action suggested

### ✅ Error Handling
- [ ] Invalid phone number rejected
- [ ] Webhook without signature rejected (401)
- [ ] Non-existent call ID returns 404

---

## 🐛 Troubleshooting

### Problem: Webhooks not arriving

**Check:**
1. ngrok is running and showing public URL
2. Vapi dashboard has correct webhook URL
3. Server is running on port 3000
4. No errors in server logs

**Debug:**
```bash
# Check ngrok web interface
http://127.0.0.1:4040

# You can see all incoming requests there
```

### Problem: Webhook rejected with 401

**Cause:** Incorrect `VAPI_WEBHOOK_SECRET`

**Solution:**
1. Get secret from Vapi dashboard
2. Update `.env`:
   ```bash
   VAPI_WEBHOOK_SECRET=actual_secret_from_vapi_dashboard
   ```
3. Restart server

### Problem: State machine not changing state

**Check:**
1. Reply from state machine returns in webhook response
2. Transcript events visible in logs
3. Intent detection working (check keywords)

**Debug:**
Add logging in `state-machine.ts`:
```typescript
console.log('State machine:', {
  currentState: call.state,
  userText,
  intent,
  nextState: '...'
});
```

### Problem: Vapi not calling

**Check:**
1. `VAPI_API_KEY` is correct
2. `VAPI_PHONE_NUMBER_ID` exists
3. `VAPI_ASSISTANT_ID` exists
4. Phone number in E.164 format (`+15551234567`)
5. You have balance in Vapi account
6. Number not on DNC list

---

## 🎯 Complete Test Checklist

```
□ ngrok running and URL configured in Vapi
□ VAPI_WEBHOOK_SECRET set
□ Server running on localhost:3000
□ Dashboard accessible in browser
□ Test call initiated
□ Call received (heard AI voice)
□ Conducted dialogue per scenario
□ Transcripts appeared in dashboard
□ State machine switched correctly
□ Call summary generated
□ Interest level determined correctly
□ Next action suggested
```

---

## 💡 Tips

### For Quick Testing
- Use your own phone number
- Keep dashboard open for monitoring
- Watch server logs in real-time

### For Production Testing
- Use test leads from CRM
- Record calls for analysis
- Check compliance (TCPA, DNC lists)
- Test at different times of day

### For Debugging
- Enable verbose logging in Fastify
- Use ngrok web interface (localhost:4040)
- Add console.log at critical points
- Check Vapi dashboard for call status

---

## 📚 Additional Resources

- [Vapi.ai Documentation](https://docs.vapi.ai)
- [ngrok Documentation](https://ngrok.com/docs)
- Your test scripts: `test-e2e-call.js`, `test-monitor-calls.js`
- Dashboard: `http://localhost:3000/dashboard`
