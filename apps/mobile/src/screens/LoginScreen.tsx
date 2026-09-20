import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, TextField } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { theme } from "@/theme";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(name.trim() || "User", email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>ProdApp</Text>
          <Text style={styles.subtitle}>Tasks, attendance, and focus — together.</Text>
        </View>

        {mode === "register" && (
          <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} />
        )}
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button title={mode === "login" ? "Sign in" : "Create account"} onPress={submit} loading={busy} />

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>
            {mode === "login" ? "New here?" : "Already have an account?"}
          </Text>
          <Text
            style={styles.switchLink}
            onPress={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  wrap: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    marginTop: 6,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    gap: 4,
  },
  switchText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  switchLink: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
});