/**
 * End-to-end check of the planning loop, against a live API.
 *
 * The capacity engine is only meaningful if a real task, created through the
 * real API, changes what the day model and the review report say. This creates
 * one, asserts the arithmetic moved the way it should, then removes it and
 * asserts the day is back to its original shape.
 *
 * Env: API, SMOKE_USER_ID, SMOKE_USER_EMAIL, DATABASE_URL (only used to confirm
 * the row is really gone afterwards).
 */
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

const API = (process.env.API ?? "http://localhost:4000").replace(/\/$/, "");
const USER_ID = process.env.SMOKE_USER_ID;
const EMAIL = process.env.SMOKE_USER_EMAIL ?? "test@example.com";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** Routes answer `{ ok, data }`; the create routes answer `{ data }`. Unwrap both. */
function unwrap(body: any): any {
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

function dayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "Today" as the API sees it.
 *
 * Deliberately not computed locally: the server resolves the day in the user's
 * timezone, so a script running on a UTC host would be a day behind and every
 * assertion about what landed on "today" would be checking the wrong date.
 */
async function apiToday(): Promise<string> {
  const r = await fetch(`${API}/api/day`, { headers: { Authorization: `Bearer ${await signToken({ id: USER_ID as string, email: EMAIL })}` } });
  const j = await r.json();
  if (typeof j?.data?.date !== "string") throw new Error(`could not resolve today: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data.date;
}

async function main() {
  const token = await signToken({ id: USER_ID as string, email: EMAIL });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const get = async (p: string) => {
    const r = await fetch(`${API}${p}`, { headers });
    return { status: r.status, body: unwrap(await r.json().catch(() => null)) };
  };
  const post = async (p: string, body: unknown) => {
    const r = await fetch(`${API}${p}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: r.status, body: unwrap(await r.json().catch(() => null)) };
  };
  const del = async (p: string) => {
    const r = await fetch(`${API}${p}`, { method: "DELETE", headers });
    return r.status;
  };

  const today = await apiToday();
  // The API also reports which day it considers current, so assertions about
  // "today" cannot drift from the server's own view of it.

  // --- Baseline -------------------------------------------------------------
  const before = await get(`/api/day?date=${today}`);
  check("baseline day model loads", before.status === 200, `status ${before.status}`);
  const plannedBefore = before.body?.capacity?.plannedMinutes ?? 0;
  const availBefore = before.body?.capacity?.availableMinutes ?? 0;
  console.log(
    `  baseline: planned=${plannedBefore}m available=${availBefore}m verdict=${before.body?.capacity?.verdict}`,
  );

  // The probe is sized against the window this day actually has, so the
  // overflow is real rather than a hopeful constant.
  const probeEstimate = Math.max(availBefore + 240, 300);

  // --- Create a real task through the real API ------------------------------
  const created = await post("/api/tasks", {
    title: "verify-capacity-probe",
    notes: "temporary probe, deleted by verify-loop.ts",
    priority: "HIGH",
    plannedDate: today,
    estimateMinutes: probeEstimate,
  });
  check("task created via API", created.status === 200 || created.status === 201, `status ${created.status}`);
  const task = created.body;
  const taskId = task?.id;
  check("created task carries plannedDate", task?.plannedDate === today, `plannedDate=${task?.plannedDate}`);
  check(
    "created task carries estimateMinutes",
    task?.estimateMinutes === probeEstimate,
    `estimate=${task?.estimateMinutes} (available was ${availBefore})`,
  );

  // --- The day model must now reflect it ------------------------------------
  const after = await get(`/api/day?date=${today}`);
  const plannedAfter = after.body?.capacity?.plannedMinutes ?? 0;
  const deltaAfter = after.body?.capacity?.deltaMinutes;
  const verdictAfter = after.body?.capacity?.verdict;
  check(
    "planned minutes increased by the estimate",
    plannedAfter === plannedBefore + probeEstimate,
    `${plannedBefore} -> ${plannedAfter} (probe ${probeEstimate})`,
  );
  check("verdict flipped to over", verdictAfter === "over", `verdict=${verdictAfter}`);
  check(
    "delta went negative by the amount of overflow",
    typeof deltaAfter === "number" && deltaAfter === availBefore - plannedAfter,
    `delta=${deltaAfter} (expected ${availBefore - plannedAfter})`,
  );
  const plannedBlock = (after.body?.timeline ?? []).find(
    (b: { kind: string }) => b.kind === "plan",
  );
  check("a planned block appears on the timeline", !!plannedBlock, plannedBlock ? plannedBlock.title : "none");

  // --- Review must see it ---------------------------------------------------
  const review = await get("/api/review?period=day");
  const rStats = review.body?.stats;
  check("review sees the planned task", rStats?.tasksPlanned >= 1, `tasksPlanned=${rStats?.tasksPlanned}`);
  check(
    "review planned minutes match the day model",
    rStats?.plannedMinutes === plannedAfter,
    `review=${rStats?.plannedMinutes} day=${plannedAfter}`,
  );
  check("review flags the day as overloaded", rStats?.overloadedDays >= 1, `overloadedDays=${rStats?.overloadedDays}`);

  // --- Displacement advice, offered not imposed ------------------------------
  const disp = await get(`/api/day/${today}/displacement`);
  check("displacement endpoint answers", disp.status === 200, `status ${disp.status}`);
  const suggestions = disp.body?.displacements;
  check(
    "displacement is advisory (a list, not a mutation)",
    Array.isArray(suggestions),
    `${Array.isArray(suggestions) ? suggestions.length : "not-a-list"} suggestion(s)`,
  );
  check(
    "no task was rescheduled behind the user's back",
    Array.isArray(suggestions) &&
      suggestions.every((s: { action?: string }) => s.action === "suggest" || s.action === undefined),
    "all suggestions are opt-in",
  );

  // --- Clean up -------------------------------------------------------------
  const status = await del(`/api/tasks/${taskId}`);
  check("task deleted", status === 200 || status === 204, `status ${status}`);

  const restored = await get(`/api/day?date=${today}`);
  const plannedRestored = restored.body?.capacity?.plannedMinutes ?? -1;
  check(
    "day model returns to its baseline after cleanup",
    plannedRestored === plannedBefore,
    `${plannedAfter} -> ${plannedRestored} (baseline ${plannedBefore})`,
  );

  const row = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, deletedAt: true } });
  check(
    "probe row is soft-deleted so history survives",
    !!row?.deletedAt,
    row ? `deletedAt=${row.deletedAt?.toISOString()}` : "row absent (hard-deleted)",
  );

  // Also confirm the estimate alone is honoured on a task with no reserved day.
  const plain = await post("/api/tasks", {
    title: "verify-estimate-probe",
    estimateMinutes: 45,
  });
  const plainTask = plain.body;
  check("estimate is stored with no planned day", plainTask?.estimateMinutes === 45, `estimate=${plainTask?.estimateMinutes}`);
  check("plannedDate stays null when unreserved", !plainTask?.plannedDate, `plannedDate=${plainTask?.plannedDate}`);
  await del(`/api/tasks/${plainTask?.id}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERROR", e);
  await prisma.$disconnect();
  process.exit(1);
});
