import { useState } from "react";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { AnalyticsPeriod, ConnectedAccountSummary } from "@crossx/shared";
import { PLATFORM_LABEL } from "../mocks/accounts";
import { PLATFORM_URL } from "../lib/platformLinks";
import { useAccounts } from "../hooks/useAccounts";
import { useAnalytics } from "../hooks/useAnalytics";
import LineChart from "../components/LineChart";
import PlatformIcon from "../components/PlatformIcon";
import { PLATFORM_COLOR, cardShadow, colors, radius, spacing, typography } from "../theme";

// What "views" (the charted metric) actually means differs per platform -
// see the matching comments in server/src/platforms/*.ts. Shown so the
// numbers aren't mistaken for directly comparable across platforms.
const METRIC_NOTE: Record<ConnectedAccountSummary["platform"], string> = {
  INSTAGRAM: "Views = daily reach. Likes/comments from your 25 most recent posts.",
  FACEBOOK: "Views = daily Page impressions. Likes/comments/shares from your 25 most recent posts.",
  TIKTOK: "Lifetime follower & like totals (TikTok's basic profile API doesn't expose per-period views yet).",
  LINKEDIN: "Not available yet - needs LinkedIn's partner-restricted analytics access.",
  YOUTUBE: "Lifetime channel subscriber & view totals.",
  REDDIT: "Followers = profile subscribers. \"Likes\" is total karma, comments is comment karma - not per-post counts.",
  BLUESKY: "Followers only for now - Bluesky's profile API doesn't expose engagement totals.",
  PINTEREST: "Followers only for now - full pin analytics need Pinterest's Standard API access.",
  MASTODON: "Followers only for now - Mastodon's API has no aggregate engagement endpoint.",
};

function formatShortDate(iso: string, period: AnalyticsPeriod): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, period === "monthly" ? { month: "short" } : { month: "short", day: "numeric" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AccountAnalyticsCard({ account }: { account: ConnectedAccountSummary }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("daily");
  const { series, isLoading, error } = useAnalytics(account.id, period);
  const accentColor = PLATFORM_COLOR[account.platform];

  const points = series?.points ?? [];
  const latest = points[points.length - 1];

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: `${accentColor}1A` }]}>
          <PlatformIcon platform={account.platform} size={24} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.platform}>{PLATFORM_LABEL[account.platform]}</Text>
          <Text style={styles.accountName}>{account.displayName}</Text>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(PLATFORM_URL[account.platform])}>
          <Text style={[styles.openLink, { color: accentColor }]}>Open ↗</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.periodToggle}>
        {(["daily", "monthly"] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodButtonText, period === p && styles.periodButtonTextActive]}>
              {p === "daily" ? "Daily" : "Monthly"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <Text style={styles.hint}>Loading…</Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : points.length === 0 ? (
        <Text style={styles.hint}>No analytics collected yet - the ingestion job runs hourly.</Text>
      ) : (
        <>
          <LineChart
            values={points.map((p) => p.views)}
            labels={points.map((p) => formatShortDate(p.capturedAt, period))}
            color={accentColor}
          />
          {latest ? (
            <View style={styles.statsRow}>
              <Stat label="Followers" value={latest.followers} />
              <Stat label="Views" value={latest.views} />
              <Stat label="Likes" value={latest.likes} />
              <Stat label="Comments" value={latest.comments} />
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.metricNote}>{METRIC_NOTE[account.platform]}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { accounts, isLoading } = useAccounts();
  const connected = accounts.filter((a) => a.status === "connected");

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={typography.title}>Analytics</Text>
        {isLoading ? (
          <Text style={styles.hint}>Loading accounts…</Text>
        ) : connected.length === 0 ? (
          <Text style={styles.hint}>Connect a platform on the Hub tab to see analytics here.</Text>
        ) : (
          connected.map((account) => <AccountAnalyticsCard key={account.id} account={account} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  scroll: { paddingBottom: spacing.xl },
  hint: { color: colors.textSecondary, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  cardHeaderText: { flex: 1 },
  platform: { fontWeight: "700", fontSize: 15, color: colors.textPrimary },
  accountName: { color: colors.textSecondary, fontSize: 12 },
  openLink: { fontSize: 13, fontWeight: "700" },
  periodToggle: { flexDirection: "row", marginBottom: spacing.md, gap: spacing.sm },
  periodButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  periodButtonText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  periodButtonTextActive: { color: "#fff" },
  error: { color: colors.error, fontSize: 13 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  stat: { alignItems: "center", flex: 1 },
  statValue: { fontWeight: "800", fontSize: 16, color: colors.textPrimary },
  statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  metricNote: { color: colors.textSecondary, fontSize: 11, marginTop: spacing.sm, fontStyle: "italic" },
});
