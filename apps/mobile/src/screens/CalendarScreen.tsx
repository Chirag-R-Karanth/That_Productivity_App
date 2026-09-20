import { useEffect, useState, useCallback } from "react";
import { FlatList, SectionList, StyleSheet, Text, View } from "react-native";
import { Screen, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { theme } from "@/theme";

interface CalEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  color: string | null;
  source: "LOCAL" | "GOOGLE";
}

interface Course {
  id: string;
  name: string;
  code: string | null;
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[];
}

interface DaySection {
  title: string;
  dateKey: string;
  data: { id: string; title: string; time: string; color: string; kind: string }[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalendarScreen() {
  const [sections, setSections] = useState<DaySection[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const firstOfMonth = new Date(year, month, 1);
      const from = new Date(firstOfMonth);
      from.setDate(1 - from.getDay());
      const to = new Date(firstOfMonth);
      to.setDate(to.getDate() + 42 - from.getDate());

      const [evRes, courseRes] = await Promise.all([
        api.get<CalEvent[]>(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`),
        api.get<Course[]>("/api/courses"),
      ]);

      const events = evRes ?? [];
      const courses = courseRes ?? [];

      const buckets = new Map<string, DaySection>();
      const todayKey = ymd(new Date());

      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const key = ymd(d);
        const dow = d.getDay();
        const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
        buckets.set(key, {
          title: `${DAYS[dow]} ${label}${key === todayKey ? " — Today" : ""}`,
          dateKey: key,
          data: [],
        });
      }

      for (const ev of events) {
        const key = ev.startTime.slice(0, 10);
        const sec = buckets.get(key);
        if (!sec) continue;
        const t = ev.allDay ? "All day" : `${ev.startTime.slice(11, 16)}`;
        sec.data.push({ id: `ev-${ev.id}`, title: ev.title, time: t, color: ev.color ?? "#8fb0ff", kind: "event" });
      }

      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      for (const c of courses) {
        for (const slot of c.schedule) {
          let d = new Date(from);
          while (d <= to) {
            if (d.getDay() === slot.dayOfWeek) {
              const key = ymd(d);
              const sec = buckets.get(key);
              if (sec) {
                sec.data.push({
                  id: `cl-${c.id}-${key}-${slot.startTime}`,
                  title: c.name,
                  time: `${slot.startTime}–${slot.endTime}`,
                  color: "#5ce09e",
                  kind: "class",
                });
              }
            }
            d.setDate(d.getDate() + 1);
          }
        }
      }

      const sorted = [...buckets.values()]
        .filter((s) => s.data.length > 0 || s.dateKey === todayKey)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

      setSections(sorted);
      setMonthLabel(`${MONTHS[month]} ${year}`);
    } catch {
      setSections([]);
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const prev = () => { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); };
  const next = () => { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <View style={styles.row}>
          <Text onPress={prev} style={styles.arrow}>‹</Text>
          <Text style={styles.month}>{monthLabel}</Text>
          <Text onPress={next} style={styles.arrow}>›</Text>
        </View>
      </View>

      {loading && <Text style={styles.muted}>Loading…</Text>}

      {!loading && sections.length === 0 && (
        <Card>
          <Text style={styles.muted}>No classes or events in this window.</Text>
        </Card>
      )}

      {!loading && sections.length > 0 && (
        <SectionList
          sections={sections.map((s) => ({ title: s.title, data: s.data, dateKey: s.dateKey }))}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={[styles.row, styles.item]}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMeta}>
                  {item.time} · {item.kind}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center" },
  arrow: { color: theme.colors.accent, fontSize: 22, paddingHorizontal: 12 },
  month: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
  muted: { color: theme.colors.textMuted, fontSize: 14 },
  sectionTitle: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, backgroundColor: theme.colors.surface },
  item: { paddingHorizontal: 12, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10, marginTop: 4 },
  itemContent: { flex: 1 },
  itemTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "500" },
  itemMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
});