import type { Platform } from "@crossx/shared";
import type { ViewStyle } from "react-native";

// A single, shared design system so every screen looks like one cohesive
// app instead of ad-hoc StyleSheet colors per file.
export const colors = {
  primary: "#6366F1", // indigo
  primaryDark: "#4338CA",
  accent: "#EC4899", // pink - paired with primary for gradients/highlights
  background: "#F8F7FC",
  surface: "#FFFFFF",
  textPrimary: "#1E1B2E",
  textSecondary: "#6B7280",
  border: "#E9E5F5",
  success: "#10B981",
  error: "#EF4444",
  overlay: "#EEF2FF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  title: { fontSize: 26, fontWeight: "800" as const, color: colors.textPrimary },
  heading: { fontSize: 18, fontWeight: "700" as const, color: colors.textPrimary },
  body: { fontSize: 15, color: colors.textPrimary },
  caption: { fontSize: 13, color: colors.textSecondary },
};

// A soft elevation preset - used for cards so the flat white screens gain
// some depth instead of everything sitting at the same visual level.
export const cardShadow: ViewStyle = {
  shadowColor: "#4C1D95",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

// Accent color per platform - used for chips, chart lines, and icon
// backgrounds so each platform is visually distinct at a glance. These are
// generic brand-adjacent accent colors (the same approach Buffer/Hootsuite/
// Later use), not logos or exact brand marks.
export const PLATFORM_COLOR: Record<Platform, string> = {
  INSTAGRAM: "#E1306C",
  TIKTOK: "#12C2C2",
  FACEBOOK: "#1877F2",
  LINKEDIN: "#0A66C2",
  YOUTUBE: "#FF0000",
  REDDIT: "#FF4500",
  BLUESKY: "#1185FE",
  PINTEREST: "#E60023",
  MASTODON: "#6364FF",
};
