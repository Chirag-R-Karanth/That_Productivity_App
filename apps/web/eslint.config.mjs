import next from "eslint-config-next";

/**
 * Flat config for the web app.
 *
 * `next lint` was removed in Next 16, so ESLint runs directly. The Next
 * presets are kept as-is rather than reconfigured, because their rules are the
 * ones that actually catch React and Next-specific mistakes; anything relaxed
 * here would be a decision about which bugs we are willing to ship.
 */
const config = [
  {
    // Generated Prisma client and build artefacts are not ours to lint.
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      "src/generated/**",
    ],
  },
  ...next,
  {
    // Scoped to TS/TSX because that is where eslint-config-next registers the
    // @typescript-eslint plugin; a rule may only use a plugin that is in scope
    // for the files it applies to.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Unused args are legitimate when a signature is fixed by an interface or
      // a callback contract, and the leading-underscore convention is the
      // standard way to say "deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // Flagged, not fatal. The genuine cases (a loading flag written
      // synchronously in an effect, or state mirrored from a prop) have been
      // fixed by deriving the value instead — see useTasks' `loadedKey`, the
      // auth token store, and the timetable's `addCourseId`. What remains is
      // either the standard "fetch on mount, resolve into state" shape, which
      // this rule cannot see past the `void load()` call, or a deliberate
      // entrance animation that must paint once before it grows. Kept visible
      // so new cases stay noticed, without blocking on rewriting working
      // data-fetching code.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
