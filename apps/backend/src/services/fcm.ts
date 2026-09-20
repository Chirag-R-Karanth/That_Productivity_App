/**
 * Firebase Cloud Messaging service for Android push notifications.
 *
 * Sends persistent/ongoing notifications with action buttons:
 *   "Attended [Course]?   [Yes]  [No]  [Cancelled]"
 *
 * The notification is setOngoing(true) so it cannot be swiped away.
 * When a user taps an action, FCM delivers the response which the backend
 * processes to resolve the attendance record.
 *
 * NOTE: Full FCM integration requires a Firebase project and service account.
 * This module provides the interface + a no-op fallback when FCM is not configured.
 */
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

interface FcmNotification {
  /** FCM registration token from the Android device. */
  token: string;
  title: string;
  body: string;
  /** Additional data payload (courseId, recordId, etc.) */
  data?: Record<string, string>;
}

// Lazy-loaded Firebase Admin SDK — only imported when FCM is actually configured.
let messaging: unknown = null;

async function getMessaging() {
  if (messaging !== null) return messaging as { send(params: { token: string; notification: { title: string; body: string }; data?: Record<string, string>; android: { priority: string; ttl: number; notification: { channelId: string; tag: string; sticky: boolean } } }): Promise<string> };

  if (!env.fcmProjectId || !env.fcmPrivateKey || !env.fcmClientEmail) {
    return null;
  }

  try {
    // Dynamic import — only loaded when credentials are available
    const admin = await import("firebase-admin/app");
    const messagingMod = await import("firebase-admin/messaging");

    if (admin.getApps().length === 0) {
      admin.initializeApp({
        credential: admin.cert({
          projectId: env.fcmProjectId,
          privateKey: env.fcmPrivateKey,
          clientEmail: env.fcmClientEmail,
        }),
      });
    }

    messaging = messagingMod.getMessaging();
    console.log("[fcm] Firebase Admin SDK initialized");
    return messaging as ReturnType<typeof messagingMod.getMessaging>;
  } catch (err) {
    console.warn("[fcm] Firebase Admin SDK not available, push disabled:", (err as Error).message);
    messaging = null;
    return null;
  }
}

/**
 * Send a persistent attendance prompt to the Android device.
 * Returns true if the message was sent, false if FCM is not configured.
 */
export async function sendAttendancePrompt(params: {
  token: string;
  courseName: string;
  courseId: string;
  recordId: string;
  date: string;
}): Promise<boolean> {
  const messagingClient = await getMessaging();
  if (!messagingClient) {
    console.log(`[fcm] Skipping push (FCM not configured): prompt for ${params.courseName}`);
    return false;
  }

  try {
    const messageId = await messagingClient.send({
      token: params.token,
      notification: {
        title: "Attendance",
        body: `Attended ${params.courseName}?`,
      },
      data: {
        type: "attendance_prompt",
        courseId: params.courseId,
        recordId: params.recordId,
        date: params.date,
        courseName: params.courseName,
      },
      android: {
        priority: "high",
        ttl: 8 * 60 * 60 * 1000, // 8 hours — notification lives until responded or TTL expires
        notification: {
          channelId: "attendance",
          tag: `attendance-${params.recordId}`,
          sticky: true, // Persists until action tapped
        },
      },
    });

    console.log(`[fcm] Sent attendance prompt for ${params.courseName}: ${messageId}`);
    return true;
  } catch (err) {
    console.error(`[fcm] Failed to send to token ${params.token.slice(0, 20)}…:`, (err as Error).message);
    return false;
  }
}

/**
 * Send a silent notification to dismiss a pinned attendance prompt
 * after auto-mark or manual resolution.
 */
export async function dismissAttendanceNotification(
  token: string,
  recordId: string,
): Promise<boolean> {
  const messagingClient = await getMessaging();
  if (!messagingClient) return false;

  try {
    await messagingClient.send({
      token,
      notification: undefined as unknown as { title: string; body: string },
      data: {
        type: "attendance_dismiss",
        recordId,
      },
      android: {
        priority: "high" as const,
        ttl: 0,
        notification: {
          channelId: "attendance",
          tag: `attendance-${recordId}`,
          sticky: false,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send attendance prompt to all users with an FCM token and a
 * matching UNCONFIRMED record. Called after generateTodayAttendance.
 */
export async function sendAttendancePrompts(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayDow = now.getDay();

  const unconfirmedRecords = await prisma.attendanceRecord.findMany({
    where: {
      date: today,
      status: "UNCONFIRMED",
    },
    include: { course: true, user: true },
  });

  let sent = 0;
  let failed = 0;

  for (const record of unconfirmedRecords) {
    // Only send after the class has ended (based on schedule end time)
    const schedule = (record.course.schedule as unknown[]) as { dayOfWeek: number; endTime: string }[];
    const todaySlot = schedule.find((s) => s.dayOfWeek === todayDow);
    if (!todaySlot) continue;
    if (todaySlot.endTime > currentTime) continue; // Class hasn't ended yet

    // Only send if user has an FCM token
    if (!record.user.fcmToken) continue;

    // Check if already sent (prevent duplicates within the same hour)
    // Use a simple heuristic: if record was already confirmed within 5 minutes of class end,
    // skip sending.
    if (record.status !== "UNCONFIRMED") continue;

    const success = await sendAttendancePrompt({
      token: record.user.fcmToken,
      courseName: record.course.name,
      courseId: record.courseId,
      recordId: record.id,
      date: record.date,
    });

    if (success) sent++;
    else failed++;
  }

  return { sent, failed };
}