import { Image, StyleSheet, type ImageSourcePropType } from "react-native";
import type { Platform } from "@crossx/shared";

// Metro needs a literal, static require() per file - it resolves these at
// bundle time and can't conditionally load a file that may or may not
// exist, so this map (rather than a dynamic template-string path) is
// required, not just a style choice. Swap the underlying files in
// assets/platforms/ for real brand assets and this needs no changes - see
// assets/platforms/README.md.
const PLATFORM_ICON_SOURCE: Record<Platform, ImageSourcePropType> = {
  INSTAGRAM: require("../../assets/platforms/instagram.png"),
  TIKTOK: require("../../assets/platforms/tiktok.png"),
  FACEBOOK: require("../../assets/platforms/facebook.png"),
  LINKEDIN: require("../../assets/platforms/linkedin.png"),
  YOUTUBE: require("../../assets/platforms/youtube.png"),
  REDDIT: require("../../assets/platforms/reddit.png"),
  BLUESKY: require("../../assets/platforms/bluesky.png"),
  PINTEREST: require("../../assets/platforms/pinterest.png"),
  MASTODON: require("../../assets/platforms/mastodon.png"),
};

interface PlatformIconProps {
  platform: Platform;
  size?: number;
}

export default function PlatformIcon({ platform, size = 24 }: PlatformIconProps) {
  return (
    <Image
      source={PLATFORM_ICON_SOURCE[platform]}
      style={[styles.icon, { width: size, height: size, borderRadius: size / 2 }]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  icon: {},
});
