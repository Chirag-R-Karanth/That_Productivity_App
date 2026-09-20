import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import authRouter from "./routes/auth.js";
import tasksRouter from "./routes/tasks.js";
import coursesRouter from "./routes/courses.js";
import attendanceRouter from "./routes/attendance.js";
import calendarRouter from "./routes/calendar.js";
import pomodoroRouter from "./routes/pomodoro.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { startAttendanceCron, generateCatchUp } from "./services/attendanceCron.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, data: { status: "ok", uptime: process.uptime() } });
});

app.use("/api/auth", authRouter);

app.use("/api/tasks", tasksRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/pomodoro", pomodoroRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`[backend] listening on http://localhost:${env.port}`);

  // Attendance cron jobs
  startAttendanceCron();
  void generateCatchUp();
});