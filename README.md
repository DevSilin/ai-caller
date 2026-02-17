# AI Caller - Voice AI Cold Calling System

Automated outbound calling system powered by Vapi.ai for land acquisition cold calling.

## Features

✅ **Voice AI Integration** - Powered by Vapi.ai for natural conversations
✅ **Automated Outbound Calling** - Initiate calls programmatically
✅ **Company Scripts** - Fixed, professional scripts (non-modifiable by users)
✅ **Call Summaries** - Automatic generation of call reports
✅ **Interest Level Detection** - HOT/WARM/COLD/NOT_INTERESTED classification
✅ **State Machine** - Conversation flow management (GREETING → QUALIFICATION → CLOSING → END)
✅ **Input Validation** - Zod schemas for all API endpoints
✅ **Webhook Security** - HMAC-SHA256 signature verification
✅ **Persistent Storage** - SQLite database with automatic migrations
✅ **Real-time Dashboard** - Monitor calls, transcripts, and state machine in real-time
✅ **E2E Testing** - Complete test suite for validation, webhooks, and real calls
✅ **Production Ready** - Database persistence, backups, and deployment guides

## Tech Stack

- **Backend**: Node.js + TypeScript + Fastify
- **Voice AI**: Vapi.ai
- **Database**: SQLite with WAL mode (persistent storage)
- **Library**: better-sqlite3 (high-performance synchronous SQLite)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required variables:**

```env
# Vapi.ai Configuration (REQUIRED)
VAPI_API_KEY=your_vapi_api_key_here
VAPI_PHONE_NUMBER_ID=your_phone_number_id_here
VAPI_ASSISTANT_ID=your_assistant_id_here

# Webhook Security (RECOMMENDED for production)
VAPI_WEBHOOK_SECRET=your_webhook_secret_from_vapi_dashboard

# Database Configuration
DATABASE_PATH=./data/calls.db

# Server Configuration
PORT=3000
NODE_ENV=development
```

**Database will be created automatically** on first run at `./data/calls.db`.

**⚠️ The application will fail to start if required variables are missing.**

### 3. Start Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### 4. Open Dashboard

```
http://localhost:3000/dashboard
```

Monitor calls in real-time with the web dashboard!

## API Endpoints

### Outbound Calling

#### Start a Call

```http
POST /calls/start
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+15551234567",
  "county": "Travis",
  "state": "TX",
  "acreage": 10,
  "propertyAddress": "123 Rural Road"
}
```

**Response:**

```json
{
  "success": true,
  "callId": "uuid",
  "vapiCallId": "vapi-call-id",
  "status": "CALLING",
  "message": "Call initiated to John Smith"
}
```

#### Get Call Details

```http
GET /calls/:id
```

**Response:**

```json
{
  "id": "uuid",
  "phone": "+15551234567",
  "state": "QUALIFICATION",
  "status": "IN_PROGRESS",
  "transcript": ["Hi John...", "Yes, I'm interested..."],
  "leadData": {
    "firstName": "John",
    "lastName": "Smith",
    "county": "Travis",
    "state": "TX"
  },
  "vapiCallId": "vapi-call-id",
  "startedAt": "2024-01-15T10:30:00Z",
  "createdAt": "2024-01-15T10:29:45Z",
  "updatedAt": "2024-01-15T10:30:15Z"
}
```

#### Get All Calls

```http
GET /calls?status=COMPLETED&limit=50
```

**Response:**

```json
{
  "success": true,
  "count": 25,
  "calls": [...]
}
```

#### Get Call Summary

```http
GET /calls/:id/summary
```

**Response:**

```json
{
  "success": true,
  "callId": "uuid",
  "leadData": {...},
  "summary": {
    "duration": 180,
    "outcome": "Lead qualified - needs offer",
    "interestLevel": "HOT",
    "keyPoints": [
      "Property: 10 acres in Travis County, TX",
      "Lead qualified - answered qualification questions",
      "Conversation length: 8 exchanges"
    ],
    "nextAction": "Send offer via email",
    "appointmentScheduled": false
  },
  "status": "COMPLETED"
}
```

#### End a Call

```http
POST /calls/:id/end
```

### Vapi.ai Webhook

```http
POST /webhook/vapi
```

Receives events from Vapi.ai:

- `call-start` - Call initiated
- `transcript` - Conversation in progress
- `call-end` - Call completed

## Company Scripts

Scripts are **fixed and cannot be modified by users**. They are configured in `src/config/index.ts`:

### Cold Call Scripts

**Greeting:**

> "Hi {firstName}, this is Alex with LandVerse. I'm calling about your property in {county} County. We buy land for cash and I wanted to see if you'd ever consider selling. Got a minute?"

**Qualification:**

> "Great! Let me ask you a few quick questions. How long have you owned the property?"

**Closing:**

> "Based on what you've told me, we'd be interested in making you an offer. Would you like to hear what we could pay?"

### Voicemail Scripts

**First Attempt:**

> "Hi {firstName}, this is Alex with LandVerse. I'm calling about your property in {county} County. We buy land for cash. Give me a call back at {phone}. Thanks!"

**Follow-up:**

> "Hi {firstName}, Alex again with LandVerse. Just following up about your property. Call me at {phone} when you get a chance. Thanks!"

## Call Flow States

```
GREETING → QUALIFICATION → CLOSING → END
```

- **GREETING**: Initial contact, gauge interest
- **QUALIFICATION**: Ask qualifying questions (ownership, timeline, decision makers)
- **CLOSING**: Discuss offer, schedule appointment
- **END**: Call completed

## Call Status Types

- `PENDING` - Call created, not yet initiated
- `CALLING` - Call being placed
- `IN_PROGRESS` - Call connected, conversation happening
- `COMPLETED` - Call finished successfully
- `FAILED` - Call failed (technical error)
- `NO_ANSWER` - No answer
- `VOICEMAIL` - Reached voicemail

## Interest Levels

- **HOT** - Very interested, ready to discuss offer
- **WARM** - Interested, needs more information
- **COLD** - Minimal interest, may follow up later
- **NOT_INTERESTED** - Not interested in selling

## Project Structure

```
src/
├── config/
│   └── index.ts              # Configuration & scripts
├── database/
│   └── db.service.ts         # SQLite database service & migrations
├── modules/
│   ├── calls/
│   │   ├── call.types.ts     # Type definitions
│   │   ├── call.service.ts   # Call management logic (SQLite)
│   │   └── call.controller.ts # API endpoints
│   ├── vapi/
│   │   ├── vapi.service.ts   # Vapi.ai integration
│   │   └── vapi.controller.ts # Webhook handler
│   └── conversation/
│       ├── state-machine.ts  # Conversation flow
│       └── intent.service.ts # Intent detection
└── app.ts                    # Main application
```

## Testing

### Quick Validation Tests

Test input validation and webhook security:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run tests
node test-validation.js        # Test input validation (11 tests)
node test-webhook-signature.js # Test webhook security (4 tests)
```

### End-to-End Testing (Real Calls)

**Quick Start:** See `QUICK-START-E2E.md` for 5-minute setup guide.

**Full Documentation:** See `E2E-TESTING.md` for complete testing guide.

**Steps:**

1. Install and run ngrok: `ngrok http 3000`
2. Configure Vapi webhook URL with your ngrok URL
3. Set `VAPI_WEBHOOK_SECRET` in `.env`
4. Run test: `node test-e2e-call.js +15551234567`

The E2E test will:

- ✅ Initiate a real call through Vapi
- ✅ Show transcripts in real-time
- ✅ Display state machine transitions
- ✅ Generate call summary

**Dashboard Monitoring:**

Open `http://localhost:3000/dashboard` to see:

- Real-time call list with auto-refresh
- Call status and state machine state
- Complete transcripts
- Interest levels and next actions
- Call summaries

### Test Files

- `test-validation.js` - Input validation tests (Zod schemas)
- `test-webhook-signature.js` - Webhook security tests (HMAC-SHA256)
- `test-e2e-call.js` - End-to-end call test with real Vapi integration
- `test-api.http` - Manual HTTP tests (VS Code REST Client)

## Development

### Run in Development Mode

```bash
npm run dev
```

### Type Checking

```bash
npx tsc --noEmit
```

### Build for Production

```bash
npm run build
npm start
```

## Database

The application uses **SQLite** for persistent storage:

- ✅ **Automatic Migrations** - Schema created on first run
- ✅ **WAL Mode** - Write-Ahead Logging for better performance
- ✅ **Data Persistence** - Survives server restarts
- ✅ **Fast Queries** - Indexed lookups (< 5ms)
- ✅ **Easy Backups** - Simple file-based backups

**Backup your database:**

```bash
# Create backup
cp data/calls.db data/calls-backup-$(date +%Y%m%d).db

# Restore from backup
cp data/calls-backup.db data/calls.db
```

**View database:**

```bash
sqlite3 data/calls.db "SELECT id, lead_first_name, status FROM calls;"
```

See `docs/DATABASE.md` for complete database documentation.

## Deployment

Deploy your AI Caller to production and share with your team!

### 🚀 Quick Deploy (5 minutes)

**Railway.app** - Fastest way to deploy:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/ai-caller)

1. Click the button or see `QUICK-DEPLOY-RAILWAY.md`
2. Connect GitHub repo
3. Add environment variables
4. Add persistent storage volume
5. Get public URL: `https://your-app.up.railway.app`

**✅ Done!** Share the URL with your team.

### 📚 Deployment Options

See `DEPLOYMENT.md` for complete guides:

1. **Railway.app** (Recommended) - 5 minutes, auto-deploy, $5/mo
2. **Render.com** - Free tier, auto-deploy, good for demos
3. **DigitalOcean VPS** - Full control, $6/mo, best for production

Each guide includes:
- ✅ Step-by-step instructions with screenshots
- ✅ Environment variable configuration
- ✅ Database persistence setup
- ✅ Vapi webhook configuration
- ✅ SSL/HTTPS setup
- ✅ Troubleshooting tips

### 🐳 Docker Support

Dockerfile included for containerized deployment:

```bash
# Build image
docker build -t ai-caller .

# Run container
docker run -p 3000:3000 --env-file .env ai-caller
```

### Production Checklist

- ✅ Database persistence (SQLite with volume)
- ✅ Automatic migrations
- ✅ Graceful shutdown
- ✅ Environment configuration
- ✅ Webhook security (HMAC-SHA256)
- ✅ HTTPS/SSL certificates
- ✅ Error monitoring

## Vapi.ai Setup

1. Create account at [vapi.ai](https://vapi.ai)
2. Create a phone number
3. Create an assistant with the company scripts
4. Configure webhook URL: `https://your-domain.com/webhook/vapi`
   - For local dev with ngrok: `https://YOUR_NGROK_URL.ngrok-free.app/webhook/vapi`
5. Get webhook secret from Vapi dashboard
6. Copy all credentials to `.env`:
   ```env
   VAPI_API_KEY=xxx
   VAPI_PHONE_NUMBER_ID=xxx
   VAPI_ASSISTANT_ID=xxx
   VAPI_WEBHOOK_SECRET=xxx
   ```

## Documentation

### Getting Started

- `README.md` - This file (overview & API reference)
- `.env.example` - Environment variables template

### Deployment

- `QUICK-DEPLOY-RAILWAY.md` - 5-minute Railway.app deployment ⚡
- `DEPLOYMENT.md` - Complete deployment guide (Railway, Render, VPS)
- `Dockerfile` - Docker containerization
- `.dockerignore` - Docker build optimization

### Testing

- `QUICK-START-E2E.md` - 5-minute E2E testing setup
- `E2E-TESTING.md` - Complete end-to-end testing guide
- `test-e2e-call.js` - Real call E2E test script
- `test-validation.js` - Input validation tests
- `test-webhook-signature.js` - Webhook security tests

### Public Documentation

- `docs/DATABASE.md` - Database schema and operations
- `docs/SECURITY.md` - Security implementation details
- `docs/TRANSCRIPT-COLLECTION.md` - Transcript collection system

## Support

For issues or questions, contact the development team.
