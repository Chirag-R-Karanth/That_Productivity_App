import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { TodayClass, FocusTimeSummary, Task } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { Card, Screen } from "@/components/ui";
import { theme } from "@/theme";

function subtitleToday() {
  const now = new Date();
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
  const date = now.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return `${weekday}, ${date}`;
}

export default function TodayScreen() {
  const [classes, setClasses] = useState<TodayClass[]>([]);
  const [focus, setFocus] = useState<FocusTimeSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [c, f, t] = await Promise.all([
        api.get<TodayClass[]>("/api/attendance/today"),
        api.get<FocusTimeSummary>("/api/pomodoro/summary"),
        api.get<Task[]>("/api/tasks?filter=today"),
      ]);
      setClasses(c);
      setFocus(f);
      setTasks(t);
    } catch {
      // UI shows empty states if fetch fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const classStatus = (c: TodayClass) =>
    c.attendanceRecord?.status === "ATTENDED"
      ? "✓ attended"
      : c.attendanceRecord?.status === "MISSED"
        ? "✕ missed"
        : c.attendanceRecord?.status === "CANCELLED"
          ? "cancelled"
          : "unconfirmed";

  const pendingClasses = classes.filter((c) => c.attendanceRecord?.status === "UNCONFIRMED").length;
  const doneTasks = tasks.filter((t) => t.completed).length;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.subtitle}>{subtitleToday()}</Text>
        </View>

        {!loading && (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{focus?.todayMinutes ?? 0}</Text>
                <Text style={styles.statLabel}>focus min</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{doneTasks}/{tasks.length}</Text>
                <Text style={styles.statLabel}>tasks done</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{classes.length}</Text>
                <Text style={styles.statLabel}>classes</Text>
              </Card>
            </View>

            <Text style={styles.sectionTitle}>Classes</Text>
            {classes.length === 0 ? (
              <Card>
                <Text style={styles.empty}>No classes today</Text>
              </Card>
            ) : (
              classes.map((c) => (
                <Card key={c.course.id}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{c.course.name}</Text>
                      <Text style={styles.rowSub}>
                        {c.slot.startTime}–{c.slot.endTime}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.badge,
                        c.attendanceRecord?.status === "ATTENDED" && styles.badgeOk,
                        c.attendanceRecord?.status === "MISSED" && styles.badgeNo,
                        c.attendanceRecord?.status === "CANCELLED" && styles.badgeMuted,
                      ]}>
                      {classStatus(c)}
                    </Text>
                  </View>
                </Card>
              ))
            )}

            {pendingClasses > 0 && (
              <Text style={styles.hint}>{pendingClasses} class{pendingClasses > 1 ? "es" : ""} need confirmation on Attendance.</Text>
            )}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
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
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    marginBottom: 0,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  rowSub: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    color: theme.colors.warning,
    fontSize: 12,
    fontWeight: "600",
  },
  badgeOk: {
    color: theme.colors.success,
  },
  badgeNo: {
    color: theme.colors.danger,
  },
  badgeMuted: {
    color: theme.colors.textMuted,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 12,
  },
});