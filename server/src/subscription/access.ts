import type { User } from "@prisma/client";

// Free/trial users can connect at most this many platforms at once, and
// cannot disconnect any of them - upgrading is the only way to change which
// platforms are connected or to add more. This applies whether they're still
// within the 3-day trial window or the trial has expired; "expired" only
// changes whether they can still post (see canPost below).
export const FREE_PLATFORM_LIMIT = 2;
export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export function trialEndsAtFromNow(): Date {
  return new Date(Date.now() + TRIAL_DURATION_MS);
}

function isSubscriptionActive(user: User): boolean {
  return user.subscriptionStatus === "active";
}

function isTrialLive(user: User): boolean {
  return user.subscriptionStatus === "trial" && user.trialEndsAt.getTime() > Date.now();
}

// How many platforms this user may have connected at once. Subscribed users
// are effectively uncapped (bounded only by how many platforms exist).
export function getPlatformLimit(user: User): number {
  return isSubscriptionActive(user) ? Number.MAX_SAFE_INTEGER : FREE_PLATFORM_LIMIT;
}

// Once connected, an account can only be disconnected by a subscribed user -
// this is the retention mechanic requested: free/trial users are locked into
// whichever platforms they picked first.
export function canDisconnectAccounts(user: User): boolean {
  return isSubscriptionActive(user);
}

// Posting works during an active subscription OR a still-live trial; it stops
// the moment the trial clock runs out for an unsubscribed user.
export function canPost(user: User): boolean {
  return isSubscriptionActive(user) || isTrialLive(user);
}

export interface AccessSummary {
  subscriptionStatus: User["subscriptionStatus"];
  trialEndsAt: string;
  platformLimit: number;
  canPost: boolean;
  canDisconnect: boolean;
}

export function summarizeAccess(user: User): AccessSummary {
  return {
    subscriptionStatus: user.subscriptionStatus,
    trialEndsAt: user.trialEndsAt.toISOString(),
    platformLimit: getPlatformLimit(user),
    canPost: canPost(user),
    canDisconnect: canDisconnectAccounts(user),
  };
}
