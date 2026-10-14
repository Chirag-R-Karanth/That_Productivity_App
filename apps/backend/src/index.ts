import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import authRouter from "./routes/auth.js";
import tasksRouter from "./routes/tasks.js";
import coursesRouter from "./routes/courses.js";
import attendanceRouter from "./routes/attendance.js";
import calendarRouter from "./routes/calendar.js";
import pomodoroRouter from "./routes/pomodoro.js";
import syncRouter from "./routes/sync.js";
import eventsRouter from "./routes/events.js";
import dayRouter from "./routes/day.js";
import reviewRouter from "./routes/review.js";
import timetableRouter from "./routes/timetable.js";
import notificationsRouter from "./routes/notifications.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { startAttendanceCron, generateCatchUp } from "./services/attendanceCron.js";
import { startNotificationCron } from "./services/notificationCron.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
// Generous limit so snapshot imports (data-export JSON) can be restored.
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, data: { status: "ok", uptime: process.uptime() } });
});

app.use("/api/auth", authRouter);

app.use("/api/tasks", tasksRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/pomodoro", pomodoroRouter);
app.use("/api/sync", syncRouter);
app.use("/api/events", eventsRouter);
app.use("/api/day", dayRouter);
app.use("/api/review", reviewRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/notifications", notificationsRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`[backend] listening on http://localhost:${env.port}`);

  // Attendance cron jobs
  startAttendanceCron();
  startNotificationCron();
  void generateCatchUp();
});