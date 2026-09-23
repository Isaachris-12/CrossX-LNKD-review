import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import type { AuthStackParamList } from "../navigation/types";
import GradientButton from "../components/GradientButton";
import { colors, radius, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export default function SignupScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && email.length > 0 && password.length >= 8;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.brandRow}>
        <LinearGradient colors={[colors.primary, colors.accent]} style={styles.logo}>
          <Text style={styles.logoText}>X</Text>
        </LinearGradient>
      </View>
      <Text style={[typography.title, styles.title]}>Create your account</Text>
      <Text style={styles.subtitle}>3 days free, no credit card required</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        placeholder="Min. 8 characters"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <GradientButton
        label="Sign up"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={submitting}
        style={styles.buttonSpacing}
      />
      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl, backgroundColor: colors.background },
  brandRow: { alignItems: "center", marginBottom: spacing.lg },
  logo: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  title: { textAlign: "center" },
  subtitle: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },
  error: { color: colors.error, marginBottom: spacing.md, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    color: colors.textPrimary,
  },
  buttonSpacing: { marginTop: spacing.sm },
  link: { color: colors.primary, textAlign: "center", marginTop: spacing.lg, fontWeight: "600" },
});
