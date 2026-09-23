import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../theme";

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

// The one bold, "pop" CTA style shared by every primary action button
// (Post+, subscribe) - a solid flat color reads as generic, a gradient
// reads as an actual product.
export default function GradientButton({ label, onPress, disabled, loading, style }: GradientButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={isDisabled ? [colors.border, colors.border] : [colors.primary, colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.button}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.text, isDisabled && styles.textDisabled]}>{label}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  text: { color: "#fff", fontWeight: "700", fontSize: 16 },
  textDisabled: { color: colors.textSecondary },
});
