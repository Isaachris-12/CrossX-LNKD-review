import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { STORY_CAPABLE_PLATFORMS } from "@crossx/shared";
import type { PostContentType, PostDispatchSummary } from "@crossx/shared";
import { PLATFORM_LABEL } from "../mocks/accounts";
import { useAccounts } from "../hooks/useAccounts";
import { useMediaUpload } from "../hooks/useMediaUpload";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../api/client";
import type { RootStackParamList } from "../navigation/types";
import GradientButton from "../components/GradientButton";
import PlatformIcon from "../components/PlatformIcon";
import { PLATFORM_COLOR, cardShadow, colors, radius, spacing, typography } from "../theme";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30000;

async function pollUntilResolved(
  id: string,
  onUpdate: (dispatch: PostDispatchSummary) => void,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const dispatch = await apiFetch<PostDispatchSummary>(`/posts/${id}`);
    onUpdate(dispatch);
    if (dispatch.status !== "pending") return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function targetStatusLabel(status: string, errorMessage: string | null): string {
  if (status === "queued" || status === "posting") return "Posting…";
  if (status === "success") return "Posted";
  return errorMessage ?? "Failed";
}

export default function PostPlusScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const { media, isUploading, error: mediaError, pickAndUpload, clear: clearMedia } =
    useMediaUpload();
  const [caption, setCaption] = useState("");
  const [contentType, setContentType] = useState<PostContentType>("FEED");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatch, setDispatch] = useState<PostDispatchSummary | null>(null);

  const connected = accounts.filter((a) => a.status === "connected");
  const eligibleAccounts =
    contentType === "STORY"
      ? connected.filter((a) => STORY_CAPABLE_PLATFORMS.includes(a.platform))
      : connected;

  function handleContentTypeChange(next: PostContentType) {
    setContentType(next);
    setSelected(new Set());
  }

  function toggle(accountId: string, remaining: number) {
    if (remaining <= 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!media) return;
    setError(null);
    setDispatch(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<PostDispatchSummary>("/posts", {
        method: "POST",
        body: JSON.stringify({
          caption,
          mediaUrl: media.publicUrl,
          targetAccountIds: Array.from(selected),
          contentType,
        }),
      });
      setDispatch(created);
      await pollUntilResolved(created.id, setDispatch);
      setCaption("");
      clearMedia();
      setSelected(new Set());
      await refreshAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canPost = user?.access.canPost ?? true;
  const canSubmit =
    canPost &&
    !submitting &&
    !isUploading &&
    (contentType === "STORY" || caption.trim().length > 0) &&
    media !== null &&
    selected.size > 0;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={RNPlatform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[typography.title, styles.title]}>Post+</Text>

          <View style={styles.contentTypeToggle}>
            {(["FEED", "STORY"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.contentTypeButton, contentType === type && styles.contentTypeButtonActive]}
                onPress={() => handleContentTypeChange(type)}
              >
                <Text
                  style={[
                    styles.contentTypeButtonText,
                    contentType === type && styles.contentTypeButtonTextActive,
                  ]}
                >
                  {type === "FEED" ? "Feed post" : "Story"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Write a caption..."
            placeholderTextColor={colors.textSecondary}
            multiline
            value={caption}
            onChangeText={setCaption}
          />
          {contentType === "STORY" ? (
            <Text style={styles.hint}>
              Stories don't support caption text on Instagram or Facebook - this won't appear on the story itself.
            </Text>
          ) : null}

          <Text style={styles.sectionLabel}>Media</Text>
          {media ? (
            <View style={styles.mediaPreviewRow}>
              {media.isVideo ? (
                <View style={styles.mediaPreviewPlaceholder}>
                  <Text style={styles.mediaPreviewPlaceholderText}>🎬 Video</Text>
                </View>
              ) : (
                <Image source={{ uri: media.localUri }} style={styles.mediaPreview} />
              )}
              <TouchableOpacity onPress={clearMedia} style={styles.removeMediaButton}>
                <Text style={styles.removeMediaText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.pickButton}
              onPress={pickAndUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.pickButtonText}>+ Add a photo or video</Text>
              )}
            </TouchableOpacity>
          )}
          {mediaError ? <Text style={styles.error}>{mediaError}</Text> : null}

          <Text style={styles.sectionLabel}>Send to</Text>
          {connected.length === 0 ? (
            <Text style={styles.hint}>Connect a platform on the Hub tab first.</Text>
          ) : eligibleAccounts.length === 0 ? (
            <Text style={styles.hint}>
              None of your connected platforms support Stories yet - Instagram and Facebook do.
            </Text>
          ) : (
            <View style={styles.platformRow}>
              {eligibleAccounts.map((account) => {
                const isSelected = selected.has(account.id);
                const disabled = account.postsRemainingToday <= 0;
                const accentColor = PLATFORM_COLOR[account.platform];
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.platformChip,
                      isSelected && { borderColor: accentColor, backgroundColor: `${accentColor}1A` },
                      disabled && styles.platformChipDisabled,
                    ]}
                    onPress={() => toggle(account.id, account.postsRemainingToday)}
                    disabled={disabled}
                  >
                    <PlatformIcon platform={account.platform} size={18} />
                    <Text style={[styles.platformName, isSelected && { color: accentColor, fontWeight: "700" }]}>
                      {PLATFORM_LABEL[account.platform]}
                      {disabled ? " (limit reached)" : ` (${account.postsRemainingToday} left)`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!canPost ? (
            <GradientButton
              label="Your free trial has ended - Upgrade to post"
              onPress={() => navigation.navigate("Paywall")}
              style={styles.submitSpacing}
            />
          ) : (
            <GradientButton
              label={
                contentType === "STORY"
                  ? `Post to ${selected.size} stor${selected.size === 1 ? "y" : "ies"}`
                  : `Post to ${selected.size} platform${selected.size === 1 ? "" : "s"}`
              }
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
              style={styles.submitSpacing}
            />
          )}

          {dispatch ? (
            <View style={[styles.resultBox, cardShadow]}>
              <Text style={styles.resultTitle}>Status: {dispatch.status}</Text>
              {dispatch.targets.map((t) => (
                <View key={t.connectedAccountId} style={styles.resultRow}>
                  <PlatformIcon platform={t.platform} size={18} />
                  <Text style={styles.resultPlatform}>{PLATFORM_LABEL[t.platform]}</Text>
                  <Text style={styles.resultStatus}>
                    {targetStatusLabel(t.status, t.errorMessage)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  title: { marginBottom: spacing.md },
  contentTypeToggle: { flexDirection: "row", marginBottom: spacing.md, gap: spacing.sm },
  contentTypeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  contentTypeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  contentTypeButtonText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  contentTypeButtonTextActive: { color: "#fff" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    minHeight: 90,
    textAlignVertical: "top",
  },
  sectionLabel: { marginTop: 4, marginBottom: spacing.sm, fontWeight: "700", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13 },
  pickButton: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  pickButtonText: { color: colors.primary, fontWeight: "700" },
  mediaPreviewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  mediaPreview: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  mediaPreviewPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPreviewPlaceholderText: { fontSize: 12 },
  removeMediaButton: { paddingVertical: 6, paddingHorizontal: spacing.md },
  removeMediaText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  platformChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  platformChipDisabled: { opacity: 0.4 },
  platformName: { fontSize: 13, color: colors.textPrimary, marginLeft: 6 },
  error: { color: colors.error, marginTop: spacing.md },
  submitSpacing: { marginTop: spacing.xl },
  resultBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resultTitle: { fontWeight: "700", marginBottom: spacing.sm, color: colors.textPrimary },
  resultRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  resultPlatform: { flex: 1, marginLeft: 8, color: colors.textPrimary },
  resultStatus: { color: colors.textSecondary, fontSize: 12, maxWidth: 180, textAlign: "right" },
});
