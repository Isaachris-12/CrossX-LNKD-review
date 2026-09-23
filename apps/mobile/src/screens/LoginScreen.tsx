import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import type { AuthStackParamList } from "../navigation/types";
import GradientButton from "../components/GradientButton";
import { colors, radius, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
      <Text style={[typography.title, styles.title]}>Log in</Text>
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
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <GradientButton
        label="Log in"
        onPress={handleSubmit}
        disabled={!email || !password}
        loading={submitting}
        style={styles.buttonSpacing}
      />
      <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
        <Text style={styles.link}>Need an account? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl, backgroundColor: colors.background },
  brandRow: { alignItems: "center", marginBottom: spacing.lg },
  logo: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  title: { textAlign: "center", marginBottom: spacing.xl },
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
