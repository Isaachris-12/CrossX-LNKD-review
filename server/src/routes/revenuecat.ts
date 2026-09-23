import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { env } from "../env.js";

// Event types that mean "this user now has full access" - see
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
const ACTIVATING_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "REFUND_REVERSED",
]);

// CANCELLATION means auto-renew was turned off, but access continues until
// the current period actually ends - RevenueCat sends EXPIRATION for that,
// so CANCELLATION itself doesn't change access. BILLING_ISSUE similarly
// doesn't revoke access immediately; RevenueCat retries and eventually sends
// EXPIRATION if it never recovers.
const DEACTIVATING_EVENTS = new Set(["EXPIRATION"]);

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  expiration_at_ms?: number;
}

interface RevenueCatWebhookPayload {
  api_version: string;
  event: RevenueCatEvent;
}

export async function revenueCatRoutes(app: FastifyInstance) {
  // RevenueCat's own server calls this, not the mobile app - authenticated
  // via the shared secret configured in the RevenueCat dashboard's webhook
  // settings (sent as the Authorization header), not a user's Bearer token.
  app.post<{ Body: RevenueCatWebhookPayload }>("/webhooks/revenuecat", async (request, reply) => {
    if (!env.revenueCatWebhookSecret) {
      request.log.error("Received a RevenueCat webhook but REVENUECAT_WEBHOOK_SECRET is not set");
      return reply.status(503).send({ error: "Webhook not configured" });
    }
    if (request.headers.authorization !== env.revenueCatWebhookSecret) {
      return reply.status(401).send({ error: "Invalid webhook authorization" });
    }

    const event = request.body?.event;
    if (!event?.app_user_id || !event.type) {
      // Acknowledge anyway (200) - RevenueCat retries non-200 responses up to
      // 5 times, which would just repeat a malformed payload pointlessly.
      request.log.warn({ body: request.body }, "RevenueCat webhook missing event/app_user_id");
      return reply.status(200).send({ received: true });
    }

    // The mobile app configures RevenueCat's SDK with our own User.id as the
    // appUserID, so app_user_id maps directly - no separate mapping table.
    const user = await prisma.user.findUnique({ where: { id: event.app_user_id } });
    if (!user) {
      request.log.warn({ appUserId: event.app_user_id }, "RevenueCat webhook for unknown user");
      return reply.status(200).send({ received: true });
    }

    if (ACTIVATING_EVENTS.has(event.type)) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "active",
          subscriptionExpiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
        },
      });
    } else if (DEACTIVATING_EVENTS.has(event.type)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "expired" },
      });
    }
    // Every other event type (CANCELLATION, BILLING_ISSUE, TEST, etc.) is
    // acknowledged but doesn't change access - see comments above.

    return reply.status(200).send({ received: true });
  });
}
