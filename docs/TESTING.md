# 🧪 Testing Guide

## Preparation

1. **Make sure .env is configured:**
   ```bash
   # Check that all variables are set
   cat .env
   ```

2. **Install dependencies (if not already installed):**
   ```bash
   npm install
   ```

## Method 1: Automated Tests (Recommended)

### Step 1: Start the server
In the first terminal:
```bash
npm run dev
```

Expected output:
```
🚀 Server running on http://0.0.0.0:3000
📝 Environment: development
```

If you have NOT set `VAPI_WEBHOOK_SECRET`, you will see:
```
⚠️  WARNING: VAPI_WEBHOOK_SECRET is not set. Webhook signature verification is disabled.
   This is a SECURITY RISK in production.
```

If required variables are missing, the server will crash with:
```
❌ Missing required environment variables:
  - VAPI_API_KEY
  - VAPI_PHONE_NUMBER_ID
  - VAPI_ASSISTANT_ID
```

### Step 2: Input validation test
In the second terminal:
```bash
node test-validation.js
```

Expected output:
```
🚀 Starting Input Validation Tests...
📍 Base URL: http://localhost:3000
============================================================

🧪 TEST: Valid call data
✅ PASS: Got expected status 200
   Call ID: <uuid>

🧪 TEST: Invalid phone format
✅ PASS: Got expected status 400
   Error: Validation error
   Details: [
     {
       "field": "phone",
       "message": "Phone number must be in valid format (E.164 or US format)"
     }
   ]

...

📊 Results: 11 passed, 0 failed
✅ All validation tests passed!
```

### Step 3: Webhook signature verification test
```bash
node test-webhook-signature.js
```

Expected output:
```
🚀 Starting Webhook Signature Tests...
📍 Base URL: http://localhost:3000
🔑 Using secret: test_webhook_secret_for_development_only
============================================================

🧪 TEST: Webhook with VALID signature
✅ SUCCESS: 200 { success: true }

🧪 TEST: Webhook with INVALID signature
✅ CORRECTLY REJECTED: 401 Unauthorized

🧪 TEST: Webhook WITHOUT signature
✅ CORRECTLY REJECTED: 401 Unauthorized

🧪 TEST: Transcript event (tests reply return)
✅ SUCCESS: 200
📝 Response includes reply: true
💬 Reply from state machine: Just to confirm — would you consider selling?

============================================================
✅ All tests completed!
```

## Method 2: Manual Testing with curl

### Test 1: Valid request
```bash
curl -X POST http://localhost:3000/calls/start \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+15551234567",
    "county": "Los Angeles",
    "state": "CA"
  }'
```

Expected: `200 OK` with `callId` and `vapiCallId`

### Test 2: Invalid phone
```bash
curl -X POST http://localhost:3000/calls/start \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "phone": "not-a-phone",
    "county": "San Diego",
    "state": "CA"
  }'
```

Expected: `400 Bad Request` with detailed errors

### Test 3: Webhook without signature
```bash
curl -X POST http://localhost:3000/webhook/vapi \
  -H "Content-Type: application/json" \
  -d '{
    "type": "call-start",
    "call": {"id": "test-123"}
  }'
```

Expected: `401 Unauthorized`

### Test 4: Get all calls
```bash
curl http://localhost:3000/calls
```

Expected: `200 OK` with list of calls

## Method 3: Using REST Client (VS Code)

1. Install the "REST Client" extension in VS Code
2. Open the `test-api.http` file
3. Click "Send Request" above each test
4. View results in the right panel

## What is being tested

### ✅ Input validation (Zod)
- [ ] Valid data passes validation
- [ ] Invalid phone number is rejected
- [ ] Missing required fields are rejected
- [ ] Invalid UUID is rejected
- [ ] Invalid status query parameter is rejected
- [ ] Validation errors return detailed description (field + message)

### ✅ Webhook signature verification
- [ ] Webhook with correct signature is accepted
- [ ] Webhook with incorrect signature is rejected (401)
- [ ] Webhook without signature is rejected (401)
- [ ] HMAC-SHA256 is used to compute signature

### ✅ State machine reply return
- [ ] Transcript event returns reply from state machine
- [ ] Reply is included in webhook response
- [ ] Vapi.ai receives contextual responses

### ✅ Config and env validation
- [ ] Server uses PORT from .env
- [ ] Server crashes if required env vars are missing
- [ ] Server shows warning if VAPI_WEBHOOK_SECRET is missing
- [ ] Host is set to 0.0.0.0 (for Docker)

### ✅ TypeScript typing
- [ ] Code compiles without errors (`npx tsc --noEmit`)
- [ ] No `any` types in controllers
- [ ] FastifyRequest is properly typed

## Troubleshooting

### Server won't start
- Check that all dependencies are installed: `npm install`
- Check the `.env` file
- Check logs in console

### Tests fail with ECONNREFUSED
- Make sure the server is running (`npm run dev`)
- Check that port 3000 is available

### Webhook tests fail with 401 even with valid signature
- Make sure `VAPI_WEBHOOK_SECRET` in `.env` matches the secret in the test
- Check that the server was restarted after changing `.env`

### Validation tests pass but nothing is saved
- This is normal! In-memory storage is reset on restart
- For persistent storage, a database is needed (Phase 2)
