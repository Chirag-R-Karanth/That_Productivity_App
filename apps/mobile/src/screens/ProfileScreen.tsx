import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { theme } from "@/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Your account and settings</Text>
      </View>

      <Card>
        <Text style={styles.name}>{user?.name ?? "—"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        <Text style={styles.planTitle}>Plans</Text>
        <Text style={styles.planBody}>
          This app is self-hosted. No subscription required.
        </Text>
      </Card>

      <Button
        title="Sign out"
        variant="danger"
        onPress={() => void logout()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  name: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  email: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  planTitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 4,
  },
  planBody: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});