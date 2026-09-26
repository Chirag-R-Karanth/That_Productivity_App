/**
 * Runtime copies of the timetable kind lists.
 *
 * `@prodapp/shared-types` is compiled with `emitDeclarationOnly`, so it ships
 * types and no JavaScript. The API is plain Node ESM and therefore cannot
 * `import` a value from it — doing so compiles fine and then dies at boot with
 * `ERR_MODULE_NOT_FOUND`.
 *
 * The `satisfies` clauses are the guard against the two copies drifting: if a
 * kind is added to the union in the shared contract and not here, this file
 * stops compiling. The shared package keeps the canonical arrays for the web
 * app, which bundles TypeScript and can import them directly.
 */
import type { CourseSlotType, TimetableEntryKind } from '@prodapp/shared-types';

export const COURSE_SLOT_TYPES = [
  'CLASS',
  'LAB',
  'EXAM',
  'INTERNAL',
  'HOLIDAY',
  'EVENT',
] as const satisfies readonly CourseSlotType[];

export const TIMETABLE_ENTRY_KINDS = [
  'EXAM',
  'HOLIDAY',
  'EXCEPTION',
  'RESCHEDULED',
  'EVENT',
] as const satisfies readonly TimetableEntryKind[];

/** True for a slot type the API accepts. */
export const isCourseSlotType = (value: unknown): value is CourseSlotType =>
  typeof value === 'string' && (COURSE_SLOT_TYPES as readonly string[]).includes(value);

/** True for an entry kind the API accepts. */
export const isTimetableEntryKind = (value: unknown): value is TimetableEntryKind =>
  typeof value === 'string' && (TIMETABLE_ENTRY_KINDS as readonly string[]).includes(value);
