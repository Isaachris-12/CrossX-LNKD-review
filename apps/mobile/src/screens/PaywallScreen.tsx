import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { PurchasesPackage } from "react-native-purchases";
import { useAuth } from "../auth/AuthContext";
import { IS_REVENUECAT_CONFIGURED } from "../subscription/config";
import { getSubscriptionOffering, purchaseSubscription, restorePurchases } from "../subscription/revenuecat";
import GradientButton from "../components/GradientButton";
import { colors, radius, spacing } from "../theme";

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

const FEATURES = [
  "Connect all 5 platforms",
  "Post+ to every platform at once",
  "Full analytics hub",
  "Freely connect/disconnect accounts",
];

export default function PaywallScreen() {
  const { user, refreshUser } = useAuth();
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [isLoadingOffering, setIsLoadingOffering] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const offering = await getSubscriptionOffering();
        setPkg(offering?.availablePackages[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load subscription options");
      } finally {
        setIsLoadingOffering(false);
      }
    })();
  }, []);

  async function handlePurchase() {
    if (!pkg) return;
    setError(null);
    setIsPurchasing(true);
    try {
      await purchaseSubscription(pkg);
      // The purchase itself is confirmed by RevenueCat above; our backend's
      // view of subscriptionStatus updates via RevenueCat's webhook, which
      // may land a moment after the purchase call returns.
      await refreshUser();
      Alert.alert("You're all set", "Full access unlocked.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Purchase failed";
      if (!message.toLowerCase().includes("cancel")) {
        setError(message);
      }
    } finally {
      setIsPurchasing(false);
    }
  }

  async function handleRestore() {
    setError(null);
    try {
      const isActive = await restorePurchases();
      await refreshUser();
      Alert.alert(isActive ? "Restored" : "Nothing to restore", isActive ? "Full access unlocked." : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    }
  }

  const status = user?.access;
  const statusLine =
    status?.subscriptionStatus === "trial"
      ? `Free trial - ${daysRemaining(status.trialEndsAt)} day(s) left`
      : status?.subscriptionStatus === "expired"
        ? "Your free trial has ended"
        : "You have full access";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <LinearGradient colors={[colors.primary, colors.accent]} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.heroTitle}>Full Access</Text>
          <Text style={styles.heroSubtitle}>{statusLine}</Text>
        </LinearGradient>

        <View style={styles.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.checkBadge}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.feature}>{feature}</Text>
            </View>
          ))}
        </View>

        {!IS_REVENUECAT_CONFIGURED ? (
          <Text style={styles.hint}>
            Subscriptions aren't configured yet - add your RevenueCat API keys to
            apps/mobile/app.json once the RevenueCat project is set up.
          </Text>
        ) : isLoadingOffering ? (
          <ActivityIndicator style={styles.spacingTop} color={colors.primary} />
        ) : !pkg ? (
          <Text style={styles.hint}>No subscription offering is available right now.</Text>
        ) : (
          <>
            <GradientButton
              label={`Subscribe - ${pkg.product.priceString}/${pkg.packageType.toLowerCase()}`}
              onPress={handlePurchase}
              loading={isPurchasing}
              style={styles.subscribeSpacing}
            />
            <TouchableOpacity onPress={handleRestore} style={styles.restoreButton}>
              <Text style={styles.restoreText}>Restore purchases</Text>
            </TouchableOpacity>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, alignItems: "stretch" },
  hero: {
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  heroTitle: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: spacing.xs },
  heroSubtitle: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600" },
  featureList: { marginBottom: spacing.xl },
  featureRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  checkMark: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  feature: { fontSize: 15, color: colors.textPrimary, fontWeight: "600" },
  hint: { color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: spacing.md },
  spacingTop: { marginTop: spacing.md },
  subscribeSpacing: {},
  restoreButton: { marginTop: spacing.lg, alignItems: "center" },
  restoreText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  error: { color: colors.error, marginTop: spacing.lg, textAlign: "center" },
});
