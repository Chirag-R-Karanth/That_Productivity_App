import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Screen, Card, Button, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theme } from "@/theme";

interface MeData {
  name: string;
  email: string;
  pomodoroWorkMinutes: number | null;
  pomodoroBreakMinutes: number | null;
  attendanceAutoMarkHours: number | null;
  chimeOnTheHour: boolean;
  googleCalendarLinked: boolean;
}

export default function SettingsScreen() {
  const { logout } = useAuth();
  const [me, setMe] = useState<MeData | null>(null);
  const [name, setName] = useState("");
  const [workMin, setWorkMin] = useState("25");
  const [breakMin, setBreakMin] = useState("5");
  const [autoMark, setAutoMark] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<MeData>("/api/auth/me").then((m) => {
      setMe(m);
      setName(m.name ?? "");
      setWorkMin(String(m.pomodoroWorkMinutes ?? 25));
      setBreakMin(String(m.pomodoroBreakMinutes ?? 5));
      setAutoMark(m.attendanceAutoMarkHours != null ? String(m.attendanceAutoMarkHours) : "");
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/auth/me", {
        name: name.trim() || undefined,
        pomodoroWorkMinutes: Number(workMin) || 25,
        pomodoroBreakMinutes: Number(breakMin) || 5,
        attendanceAutoMarkHours: autoMark.trim() === "" ? null : Number(autoMark),
      });
      Alert.alert("Saved", "Your preferences were updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Couldn't save.");
    }
    setSaving(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.muted}>{me?.email ?? "Loading…"}</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Profile</Text>
        <TextField label="Name" value={name} onChangeText={setName} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Pomodoro</Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Work (min)" value={workMin} onChangeText={setWorkMin} keyboardType="numeric" />
          </View>
          <View style={styles.half}>
            <TextField label="Break (min)" value={breakMin} onChangeText={setBreakMin} keyboardType="numeric" />
          </View>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Attendance</Text>
        <TextField
          label="Auto-mark after (hrs, blank = never)"
          value={autoMark}
          onChangeText={setAutoMark}
          keyboardType="numeric"
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Google Calendar</Text>
        <Text style={styles.muted}>
          {me?.googleCalendarLinked ? "Google Calendar is connected." : "Not connected yet."}
        </Text>
        <Text style={styles.hint}>
          To connect, open the web app in a browser and go to Settings → Google Calendar.
        </Text>
      </Card>

      <Button title={saving ? "Saving…" : "Save all"} onPress={() => void save()} disabled={saving} />

      <View style={{ height: 16 }} />
      <Button title="Sign out" variant="danger" onPress={() => logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "600", marginBottom: 4 },
  muted: { color: theme.colors.textMuted, fontSize: 14 },
  sectionTitle: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  hint: { color: theme.colors.textMuted, fontSize: 12, marginTop: 6 },
});