/**
 * Guards for the API-targeting verification scripts.
 *
 * The dev backend and the production backend can both sit on port 4000
 * depending on what else is running, and they use *different databases* with
 * different user rows. A script that signs a token from the wrong database gets
 * a clean 401 and then either crashes on `body.data.displacements` or — worse —
 * reports a pass because every check that expects a rejection still sees one.
 *
 * These helpers make that failure loud and immediate instead.
 */

export interface ApiTarget {
  base: string;
  token: string;
}

/**
 * Fails fast unless the token is accepted and the API looks like this app.
 */
export async function assertApiTarget(target: ApiTarget): Promise<void> {
  const { base, token } = target;
  const res = await fetch(`${base}/api/day`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      [
        `${base} rejected the token (${res.status}).`,
        "",
        "The token was signed for a user row that this API's database does not have.",
        "The dev and prod databases are separate, so the user ids differ.",
        "Pass SMOKE_USER_ID and SMOKE_USER_EMAIL for the API you are targeting:",
        '  API=http://localhost:8090 SMOKE_USER_ID=<prod id> SMOKE_USER_EMAIL=<prod email>',
        "",
        "Also check that API points at the deployment you think it does; a dev",
        "server left running on :4000 will happily answer instead.",
      ].join("\n"),
    );
  }
  if (!res.ok) {
    throw new Error(`${base}/api/day returned ${res.status}`);
  }
}

/**
 * Resolves the user to sign for.
 *
 * `SMOKE_USER_ID` wins because the script may run on a host whose database is
 * not the one the target API uses.
 */
export async function resolveTargetUser(
  prisma: { user: { findFirst(): Promise<{ id: string; email: string } | null> } },
): Promise<{ id: string; email: string }> {
  const forcedId = process.env.SMOKE_USER_ID;
  if (forcedId) {
    return { id: forcedId, email: process.env.SMOKE_USER_EMAIL ?? "unknown@example.com" };
  }
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("no user in the database");
  return user;
}
