import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { Task } from "@prodapp/shared-types";
import { api } from "@/lib/api";
import { Card, Screen } from "@/components/ui";
import { theme } from "@/theme";

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>("/api/tasks?filter=all");
      setTasks(data);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (task: Task) => {
    const next = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    try {
      await api.post<Task>(`/api/tasks/${task.id}/complete`, { completed: next });
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const renderItem = ({ item }: { item: Task }) => (
    <Card>
      <View style={styles.row}>
        <Text
          style={[styles.check, item.completed && styles.checkDone]}
          onPress={() => void toggle(item)}>
          {item.completed ? "✓" : "○"}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, item.completed && styles.titleDone]}>{item.title}</Text>
          <Text style={styles.meta}>
            {item.dueDate ?? "no due date"}
            {item.priority === "HIGH" ? " · high priority" : ""}
          </Text>
        </View>
      </View>
    </Card>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heading}>Tasks</Text>
        <Text style={styles.subtitle}>
          {loading ? "Loading…" : `${tasks.filter((t) => !t.completed).length} open of ${tasks.length}`}
        </Text>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <Card>
              <Text style={styles.empty}>No tasks yet.</Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  heading: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  check: {
    color: theme.colors.textMuted,
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  checkDone: {
    color: theme.colors.success,
  },
  title: {
    color: theme.colors.text,
    fontSize: 15,
  },
  titleDone: {
    color: theme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
});