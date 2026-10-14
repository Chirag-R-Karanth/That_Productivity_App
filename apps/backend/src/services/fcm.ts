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
 * Which records deserve a prompt is decided in attendanceNotifications.ts,
 * which reads the timetable through the resolver and judges the clock in the
 * user's own timezone. This module only knows how to talk to FCM.
 *
 * NOTE: Full FCM integration requires a Firebase project and service account.
 * This module provides the interface + a no-op fallback when FCM is not configured.
 */
import { env } from "../lib/env.js";

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