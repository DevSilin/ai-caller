# Security Implementation Guide

## Environment Variables

### Required Variables
The application will **fail to start** if these are not set:
- `VAPI_API_KEY` - Your Vapi.ai API key
- `VAPI_PHONE_NUMBER_ID` - Vapi phone number ID
- `VAPI_ASSISTANT_ID` - Vapi assistant ID

### Recommended Variables
- `VAPI_WEBHOOK_SECRET` - **CRITICAL for production!** Used to verify webhook signatures from Vapi.ai
  - Without this, your webhook endpoint is vulnerable to spoofed requests
  - Get this from your Vapi.ai dashboard webhook settings
  - The app will log a warning if this is not set

### Optional Variables
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (default: development)

## Webhook Security

### Signature Verification
All webhook requests from Vapi.ai are verified using HMAC-SHA256 signatures:

1. Vapi sends signature in `x-vapi-signature` header
2. Server computes expected signature using `VAPI_WEBHOOK_SECRET`
3. Timing-safe comparison prevents timing attacks
4. Invalid signatures return 401 Unauthorized

**Implementation:**
- File: `src/modules/vapi/webhook-verification.ts`
- Runs as Fastify preHandler hook on `/webhook/vapi`

### Input Validation
All API endpoints validate input using Zod schemas:

**Call Endpoints (`/calls/*`):**
- Phone number format validation (E.164 or US format)
- Required field validation
- UUID validation for call IDs
- Query parameter sanitization

**Webhook Endpoint (`/webhook/vapi`):**
- Event type discrimination (call-start, transcript, call-end, function-call)
- Required fields validation
- Type-safe event handling

**Validation Errors:**
Returns 400 Bad Request with detailed field-level errors:
```json
{
  "error": "Validation error",
  "details": [
    {
      "field": "phone",
      "message": "Phone number must be in valid format"
    }
  ]
}
```

## Security Checklist for Production

- [ ] Set `VAPI_WEBHOOK_SECRET` in production environment
- [ ] Use HTTPS for all endpoints (configure reverse proxy/load balancer)
- [ ] Configure rate limiting (TODO: not yet implemented)
- [ ] Set `NODE_ENV=production`
- [ ] Review and restrict CORS settings (TODO: not yet configured)
- [ ] Monitor logs for failed webhook verifications
- [ ] Rotate API keys periodically
- [ ] Use secrets manager for sensitive variables (AWS Secrets Manager, HashiCorp Vault, etc.)

## Known Security Limitations

1. **No rate limiting** - Endpoints can be spammed (Phase 2 improvement needed)
2. **No CORS configuration** - All origins allowed by default
3. **In-memory storage** - Call data not encrypted at rest (use DB encryption in production)
4. **No audit logging** - Should log all state changes for compliance

## Reporting Security Issues

If you discover a security vulnerability, please email [your-security-email] instead of creating a public issue.
