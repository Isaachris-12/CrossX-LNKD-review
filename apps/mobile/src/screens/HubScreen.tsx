import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ALL_PLATFORMS, CREDENTIAL_AUTH_PLATFORMS, CREDENTIAL_FIELDS, OAUTH_PREP_INPUT } from "@crossx/shared";
import type { CredentialField, Platform } from "@crossx/shared";
import { PLATFORM_LABEL } from "../mocks/accounts";
import { PLATFORM_URL } from "../lib/platformLinks";
import { useAuth } from "../auth/AuthContext";
import { useAccounts } from "../hooks/useAccounts";
import type { RootStackParamList } from "../navigation/types";
import { PLATFORM_COLOR, cardShadow, colors, radius, spacing, typography } from "../theme";
import PlatformIcon from "../components/PlatformIcon";

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function HubScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    accounts,
    isLoading,
    error,
    isUpgradeError,
    connectingPlatform,
    connect,
    connectWithCredentials,
    disconnect,
    refresh,
  } = useAccounts();

  const access = user?.access;

  const connectedAccounts = accounts.filter((a) => a.status === "connected");
  const unconnectedPlatforms = ALL_PLATFORMS.filter(
    (platform) => !connectedAccounts.some((a) => a.platform === platform),
  );

  // The full platform list used to sit in one flat FlatList (connected and
  // not) - moved behind this picker so the main screen only shows what's
  // actually connected, per user request.
  const [showAddPlatform, setShowAddPlatform] = useState(false);

  // Connecting Mastodon or Bluesky needs one extra step of user input before
  // the usual connect action can run (an instance domain, or a handle + app
  // password) - this modal collects whichever fields the platform needs.
  const [formPlatform, setFormPlatform] = useState<Platform | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  function handleDisconnect(account: (typeof connectedAccounts)[number]) {
    if (access && !access.canDisconnect) {
      Alert.alert(
        "Upgrade required",
        "Changing which platforms you've connected requires an active subscription.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Upgrade", onPress: () => navigation.navigate("Paywall") },
        ],
      );
      return;
    }
    Alert.alert(`Disconnect ${PLATFORM_LABEL[account.platform]}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => disconnect(account.id) },
    ]);
  }

  function startConnect(platform: Platform) {
    if (CREDENTIAL_AUTH_PLATFORMS.includes(platform) || OAUTH_PREP_INPUT[platform]) {
      setFormValues({});
      setFormPlatform(platform);
    } else {
      connect(platform);
    }
  }

  function handleAddPlatformSelect(platform: Platform) {
    setShowAddPlatform(false);
    startConnect(platform);
  }

  const formFields: CredentialField[] = formPlatform
    ? (CREDENTIAL_FIELDS[formPlatform] ?? (OAUTH_PREP_INPUT[formPlatform] ? [OAUTH_PREP_INPUT[formPlatform]!] : []))
    : [];
  const isCredentialForm = formPlatform ? CREDENTIAL_AUTH_PLATFORMS.includes(formPlatform) : false;
  const canSubmitForm = formFields.every((f) => (formValues[f.key] ?? "").trim().length > 0);

  async function handleFormSubmit() {
    if (!formPlatform) return;
    setFormSubmitting(true);
    try {
      if (isCredentialForm) {
        const ok = await connectWithCredentials(formPlatform, formValues);
        if (ok) setFormPlatform(null);
      } else {
        setFormPlatform(null);
        await connect(formPlatform, formValues);
      }
    } finally {
      setFormSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={typography.title}>Your accounts</Text>
          <Text style={styles.subtitle}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {access && access.subscriptionStatus !== "active" ? (
        <TouchableOpacity style={[styles.planBanner, cardShadow]} onPress={() => navigation.navigate("Paywall")}>
          <Text style={styles.planBannerText}>
            {access.subscriptionStatus === "trial"
              ? `Free trial - ${daysRemaining(access.trialEndsAt)} day(s) left - up to ${access.platformLimit} platforms`
              : "Your free trial has ended"}
          </Text>
          <Text style={styles.planBannerLink}>Upgrade</Text>
        </TouchableOpacity>
      ) : null}

      {error ? (
        isUpgradeError ? (
          <TouchableOpacity style={[styles.planBanner, cardShadow]} onPress={() => navigation.navigate("Paywall")}>
            <Text style={styles.planBannerText}>{error}</Text>
            <Text style={styles.planBannerLink}>Upgrade</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.error}>{error}</Text>
        )
      ) : null}

      <FlatList
        data={connectedAccounts}
        keyExtractor={(account) => account.id}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={refresh}
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={styles.hint}>No platforms connected yet - tap "Add platform" below to get started.</Text>
          )
        }
        renderItem={({ item: account }) => {
          const accentColor = PLATFORM_COLOR[account.platform];
          return (
            <View style={[styles.row, cardShadow]}>
              <TouchableOpacity
                onPress={() => Linking.openURL(PLATFORM_URL[account.platform])}
                hitSlop={8}
                style={[styles.iconBadge, { backgroundColor: `${accentColor}1A` }]}
              >
                <PlatformIcon platform={account.platform} size={28} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.rowMain} onPress={() => handleDisconnect(account)}>
                <View style={styles.rowText}>
                  <Text style={styles.platform}>{PLATFORM_LABEL[account.platform]}</Text>
                  <Text style={styles.status}>{account.displayName}</Text>
                </View>
                <View style={[styles.countPill, { backgroundColor: `${accentColor}1A` }]}>
                  <Text style={[styles.count, { color: accentColor }]}>
                    {account.postsRemainingToday}/{account.dailyPostLimit} today
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
        ListFooterComponent={
          unconnectedPlatforms.length > 0 ? (
            <TouchableOpacity style={styles.addPlatformButton} onPress={() => setShowAddPlatform(true)}>
              <Text style={styles.addPlatformButtonText}>+ Add platform</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <Modal
        visible={showAddPlatform}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddPlatform(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.addPlatformCard, cardShadow]}>
            <View style={styles.addPlatformHeader}>
              <Text style={styles.modalTitle}>Add a platform</Text>
              <TouchableOpacity onPress={() => setShowAddPlatform(false)} hitSlop={8}>
                <Text style={styles.addPlatformDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={unconnectedPlatforms}
              keyExtractor={(platform) => platform}
              renderItem={({ item: platform }) => {
                const accentColor = PLATFORM_COLOR[platform];
                const isConnecting = connectingPlatform === platform;
                return (
                  <TouchableOpacity
                    style={styles.addPlatformRow}
                    onPress={() => handleAddPlatformSelect(platform)}
                    disabled={connectingPlatform !== null}
                  >
                    <View style={[styles.iconBadge, { backgroundColor: `${accentColor}1A` }]}>
                      <PlatformIcon platform={platform} size={26} />
                    </View>
                    <Text style={styles.addPlatformLabel}>{PLATFORM_LABEL[platform]}</Text>
                    {isConnecting ? (
                      <ActivityIndicator color={accentColor} />
                    ) : (
                      <Text style={[styles.addPlatformPlus, { color: accentColor }]}>+</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={formPlatform !== null} transparent animationType="fade" onRequestClose={() => setFormPlatform(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, cardShadow]}>
            <Text style={styles.modalTitle}>
              Connect {formPlatform ? PLATFORM_LABEL[formPlatform] : ""}
            </Text>
            {isCredentialForm ? (
              <Text style={styles.modalHint}>
                Use an app password from Bluesky's Settings → App Passwords, not your main password.
              </Text>
            ) : null}
            {formFields.map((field) => (
              <View key={field.key} style={styles.modalField}>
                <Text style={styles.modalLabel}>{field.label}</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={field.secure}
                  value={formValues[field.key] ?? ""}
                  onChangeText={(text) => setFormValues((prev) => ({ ...prev, [field.key]: text }))}
                />
              </View>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setFormPlatform(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, (!canSubmitForm || formSubmitting) && styles.modalSubmitDisabled]}
                onPress={handleFormSubmit}
                disabled={!canSubmitForm || formSubmitting}
              >
                {formSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.md },
  headerText: { flex: 1 },
  subtitle: { color: colors.textSecondary, marginTop: 4 },
  signOut: { color: colors.error, fontSize: 13, marginTop: 4, fontWeight: "600" },
  planBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  planBannerText: { color: colors.primaryDark, fontSize: 13, flex: 1, marginRight: spacing.sm, fontWeight: "600" },
  planBannerLink: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  error: { color: colors.error, marginBottom: spacing.sm },
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md },
  list: { paddingBottom: spacing.xl },
  addPlatformButton: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  addPlatformButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  rowText: { flex: 1 },
  platform: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  status: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  countPill: { borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  count: { fontSize: 12, fontWeight: "700" },
  connect: { fontSize: 13, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(30, 27, 46, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.xs },
  modalHint: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.md },
  modalField: { marginTop: spacing.sm },
  modalLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.lg, gap: spacing.sm },
  modalCancel: { paddingVertical: 10, paddingHorizontal: spacing.md },
  modalCancelText: { color: colors.textSecondary, fontWeight: "700" },
  modalSubmit: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  modalSubmitDisabled: { opacity: 0.5 },
  modalSubmitText: { color: "#fff", fontWeight: "800" },
  addPlatformCard: {
    width: "100%",
    maxHeight: "75%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  addPlatformHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  addPlatformDone: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  addPlatformRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  addPlatformLabel: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginLeft: spacing.sm },
  addPlatformPlus: { fontSize: 22, fontWeight: "800" },
});
