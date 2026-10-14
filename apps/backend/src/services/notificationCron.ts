/**
 * The notification crons.
 *
 * Separate from the attendance cron because the two answer different
 * questions. The attendance cron decides *whether a record is owed* (once, at
 * 06:00); this one decides *whether the user has been asked* (repeatedly,
 * because a class ending at 10:30 cannot be known at 06:00).
 */
import cron from "node-cron";
import { promptUnansweredAttendance } from "./attendanceNotifications.js";
import { pushConfigured, pushUnavailableReason } from "./webpush.js";

/**
 * How often to look for a class that has just finished.
 *
 * A quarter of an hour is a compromise: a class that ends at 10:30 gets its
 * prompt somewhere between 10:30 and 10:45, which is well inside the window
 * where the user still knows whether they attended. Asking more often buys
 * little and costs a database sweep per user per tick.
 */
const PROMPT_CRON = "*/15 * * * *";

export function startNotificationCron(): void {
  if (!pushConfigured()) {
    // Not an error: the rest of the app is unaffected, and a user with an
    // Android device registered through FCM may still get prompts.
    console.log(
      `[push] Web Push disabled — ${pushUnavailableReason() ?? "VAPID keys are not set"}`,
    );
  }

  cron.schedule(PROMPT_CRON, async () => {
    try {
      const result = await promptUnansweredAttendance();
      if (result.prompted > 0) {
        console.log(
          `[push] Prompted for ${result.prompted} attendance record(s): ` +
            `${result.sent} delivered, ${result.failed} failed` +
            (result.removed > 0 ? `, ${result.removed} dead subscription(s) removed` : ""),
        );
      }
    } catch (err) {
      console.error("[push] Attendance prompt pass failed:", err);
    }
  });

  console.log(`[push] Attendance prompt cron scheduled (${PROMPT_CRON})`);
}
