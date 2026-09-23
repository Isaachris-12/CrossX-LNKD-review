import Purchases, { type PurchasesOffering, type PurchasesPackage } from "react-native-purchases";
import { IS_REVENUECAT_CONFIGURED, REVENUECAT_API_KEY, REVENUECAT_ENTITLEMENT_ID } from "./config";

let configuredForUserId: string | null = null;

// Idempotent: safe to call on every app launch / login. RevenueCat's SDK
// wants configure() called once per session, keyed to our own user id so its
// webhook payloads (see server/src/routes/revenuecat.ts) reference the same
// id our backend already uses - no separate mapping table needed.
export function ensurePurchasesConfigured(userId: string): void {
  if (!IS_REVENUECAT_CONFIGURED) return;
  if (configuredForUserId === userId) return;

  Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
  configuredForUserId = userId;
}

export async function getSubscriptionOffering(): Promise<PurchasesOffering | null> {
  if (!IS_REVENUECAT_CONFIGURED) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchaseSubscription(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return Boolean(customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]);
}

export async function restorePurchases(): Promise<boolean> {
  const customerInfo = await Purchases.restorePurchases();
  return Boolean(customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]);
}
