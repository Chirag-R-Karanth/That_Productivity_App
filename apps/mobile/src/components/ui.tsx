import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "@/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
}) {
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isGhost && styles.buttonGhost,
        isDanger && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={isGhost ? theme.colors.text : "#fff"} size="small" />
      ) : (
        <Text style={[styles.buttonText, isGhost && styles.buttonTextGhost, isDanger && styles.buttonTextDanger]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: "transparent",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonTextGhost: {
    color: theme.colors.text,
  },
  buttonTextDanger: {
    color: theme.colors.danger,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});