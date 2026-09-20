import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { CourseAttendanceSummary, TodayClass } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { Button, Card, Screen } from "@/components/ui";
import { theme } from "@/theme";

export default function AttendanceScreen() {
  const [today, setToday] = useState<TodayClass[]>([]);
  const [summaries, setSummaries] = useState<CourseAttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        api.get<TodayClass[]>("/api/attendance/today"),
        api.get<CourseAttendanceSummary[]>("/api/courses/summaries"),
      ]);
      setToday(t);
      setSummaries(s);
    } catch {
      // empty states
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (recordId: string, status: "ATTENDED" | "MISSED" | "CANCELLED") => {
    setBusyId(recordId);
    try {
      await api.patch(`/api/attendance/${recordId}/resolve`, { status });
      await load();
    } catch {
      // leave as-is
    } finally {
      setBusyId(null);
    }
  };

  const pending = today.filter((c) => c.attendanceRecord?.status === "UNCONFIRMED");

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Attendance</Text>
          <Text style={styles.subtitle}>
            {loading ? "Loading…" : `${pending.length} unconfirmed · ${today.length} class${today.length === 1 ? "" : "es"} today`}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Today</Text>
        {!loading && today.length === 0 && (
          <Card>
            <Text style={styles.empty}>No classes scheduled today.</Text>
          </Card>
        )}
        {pending.map((c) => (
          <Card key={c.course.id}>
            <Text style={styles.rowTitle}>{c.course.name}</Text>
            <Text style={styles.rowSub}>
              {c.slot.startTime}–{c.slot.endTime}
            </Text>
            <View style={styles.actions}>
              <View style={styles.actionBtn}>
                <Button title="Attended" onPress={() => void resolve(c.attendanceRecord!.id, "ATTENDED")}
                  loading={busyId === c.attendanceRecord!.id} />
              </View>
              <View style={styles.actionBtn}>
                <Button title="Missed" variant="danger" onPress={() => void resolve(c.attendanceRecord!.id, "MISSED")}
                  loading={busyId === c.attendanceRecord!.id} />
              </View>
            </View>
          </Card>
        ))}
        {today.filter((c) => c.attendanceRecord?.status !== "UNCONFIRMED").map((c) => (
          <Card key={c.course.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{c.course.name}</Text>
                <Text style={styles.rowSub}>
                  {c.slot.startTime}–{c.slot.endTime}
                </Text>
              </View>
              <Text style={styles.resolved}>{c.attendanceRecord!.status.toLowerCase()}</Text>
            </View>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Courses</Text>
        {!loading && summaries.length === 0 && (
          <Card>
            <Text style={styles.empty}>No courses added yet.</Text>
          </Card>
        )}
        {summaries.map((s) => (
          <Card key={s.course.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{s.course.name}</Text>
                <Text style={styles.rowSub}>
                  {s.attended} attended · {s.missed} missed
                  {s.unconfirmed > 0 ? ` · ${s.unconfirmed} pending` : ""}
                </Text>
              </View>
              <Text style={[styles.pct, s.atRisk && styles.pctBad]}>
                {s.percentage !== null ? `${s.percentage}%` : "—"}
              </Text>
            </View>
          </Card>
        ))}
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
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resolved: {
    color: theme.colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  pct: {
    color: theme.colors.success,
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pctBad: {
    color: theme.colors.danger,
  },
});