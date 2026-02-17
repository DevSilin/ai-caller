import {createHmac, timingSafeEqual} from "crypto";
import {FastifyRequest, FastifyReply} from "fastify";

/**
 * Verify Vapi webhook signature
 * Vapi sends signatures in the 'x-vapi-signature' header
 */
export function verifyVapiSignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) {
    return false;
  }

  try {
    // Vapi uses HMAC-SHA256
    const hmac = createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");

    // Timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Fastify preHandler hook for webhook verification
 */
export async function webhookVerificationHook(
  request: FastifyRequest,
  reply: FastifyReply,
  secret?: string,
) {
  // Skip verification if no secret is configured (development only!)
  if (!secret) {
    request.log.warn(
      "Webhook signature verification disabled - no VAPI_WEBHOOK_SECRET configured",
    );
    return;
  }

  // Get raw body (saved by preParsing hook)
  const rawBody = (request as any).rawBody as string | undefined;
  if (!rawBody) {
    request.log.error("Raw body not available for signature verification");
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Raw body not available for verification",
    });
  }

  const signature = request.headers["x-vapi-signature"] as string | undefined;

  if (!verifyVapiSignature(rawBody, signature, secret)) {
    request.log.warn({signature}, "Invalid webhook signature");
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Invalid webhook signature",
    });
  }

  request.log.debug("Webhook signature verified successfully");
}
