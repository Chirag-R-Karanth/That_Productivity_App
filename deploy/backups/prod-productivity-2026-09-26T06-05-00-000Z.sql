--
-- PostgreSQL database dump
--

\restrict xalDG1DWrOYXNHTRL9ektbjdHO0q4HsqyewGv22TvmererSQnXiAaIEffGbZAH6

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AttendanceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceStatus" AS ENUM (
    'ATTENDED',
    'MISSED',
    'CANCELLED',
    'UNCONFIRMED'
);


--
-- Name: AuthProvider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuthProvider" AS ENUM (
    'PASSWORD',
    'GOOGLE'
);


--
-- Name: CalendarEventSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CalendarEventSource" AS ENUM (
    'LOCAL',
    'GOOGLE'
);


--
-- Name: EventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventType" AS ENUM (
    'TASK_CREATED',
    'TASK_COMPLETED',
    'TASK_UNCOMPLETED',
    'TASK_UPDATED',
    'TASK_DELETED',
    'FOCUS_STARTED',
    'FOCUS_COMPLETED',
    'FOCUS_CANCELLED',
    'ATTENDANCE_RECORDED',
    'CLASS_SCHEDULED',
    'CALENDAR_EVENT_SYNCED',
    'CALENDAR_EVENT_UPDATED',
    'GOOGLE_TASK_SYNCED'
);


--
-- Name: TaskPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
);


--
-- Name: TimetableEntryKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimetableEntryKind" AS ENUM (
    'EXAM',
    'HOLIDAY',
    'EXCEPTION',
    'RESCHEDULED',
    'EVENT'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: PendingSync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PendingSync" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "actionType" text NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "appliedAt" timestamp(3) without time zone
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id text NOT NULL,
    "userId" text NOT NULL,
    "courseId" text NOT NULL,
    date text NOT NULL,
    status public."AttendanceStatus" DEFAULT 'UNCONFIRMED'::public."AttendanceStatus" NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id text NOT NULL,
    "userId" text NOT NULL,
    "googleEventId" text,
    "sourceCalendarId" text,
    title text NOT NULL,
    "startTime" timestamp(3) without time zone NOT NULL,
    "endTime" timestamp(3) without time zone NOT NULL,
    "isDedupedDuplicate" boolean DEFAULT false NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "googleUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "allDay" boolean DEFAULT false NOT NULL,
    color text,
    description text,
    location text,
    source public."CalendarEventSource" DEFAULT 'LOCAL'::public."CalendarEventSource" NOT NULL,
    "connectionId" text
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    code text,
    schedule jsonb DEFAULT '[]'::jsonb NOT NULL,
    "attendanceThreshold" integer DEFAULT 80 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."EventType" NOT NULL,
    "occurredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: google_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_connections (
    id text NOT NULL,
    "userId" text NOT NULL,
    "googleAccountId" text NOT NULL,
    email text NOT NULL,
    "displayName" text,
    "accessToken" text NOT NULL,
    "refreshToken" text,
    "tokenExpiresAt" timestamp(3) without time zone,
    scopes text,
    "defaultTaskListId" text,
    "needsRelink" boolean DEFAULT false NOT NULL,
    "lastSyncedAt" timestamp(3) without time zone,
    "lastError" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: linked_google_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linked_google_calendars (
    id text NOT NULL,
    "userId" text NOT NULL,
    summary text NOT NULL,
    "backgroundColor" text,
    "accessRole" text,
    "isLinked" boolean DEFAULT true NOT NULL,
    "includeInDay" boolean DEFAULT true NOT NULL,
    "connectionId" text NOT NULL
);


--
-- Name: pomodoro_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pomodoro_sessions (
    id text NOT NULL,
    "userId" text NOT NULL,
    "taskId" text,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "durationMinutes" integer NOT NULL,
    completed boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actualMinutes" integer,
    "endedAt" timestamp(3) without time zone
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    notes text,
    "dueDate" text,
    "dueTime" text,
    completed boolean DEFAULT false NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "deletedAt" timestamp(3) without time zone,
    priority public."TaskPriority" DEFAULT 'MEDIUM'::public."TaskPriority" NOT NULL,
    "recurrenceRule" text,
    "lastCompletedOccurrence" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "courseId" text,
    "estimateMinutes" integer,
    "plannedDate" text,
    "connectionId" text,
    "googleDeleted" boolean DEFAULT false NOT NULL,
    "googleETag" text,
    "googlePushedAt" timestamp(3) without time zone,
    "googleTaskId" text,
    "googleTaskListId" text
);


--
-- Name: timetable_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_entries (
    id text NOT NULL,
    "userId" text NOT NULL,
    "courseId" text,
    title text NOT NULL,
    kind public."TimetableEntryKind" DEFAULT 'EVENT'::public."TimetableEntryKind" NOT NULL,
    date text NOT NULL,
    "startTime" text,
    "endTime" text,
    location text,
    notes text,
    "replacesSlot" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    "authProvider" public."AuthProvider" DEFAULT 'PASSWORD'::public."AuthProvider" NOT NULL,
    "googleRefreshToken" text,
    "googleAccessToken" text,
    "googleTokenExpiresAt" timestamp(3) without time zone,
    "fcmToken" text,
    "attendanceAutoMarkHours" integer,
    "pomodoroWorkMinutes" integer,
    "pomodoroBreakMinutes" integer,
    "chimeOnTheHour" boolean DEFAULT true NOT NULL,
    "onboardingComplete" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    "pomodoroLongBreakMinutes" integer,
    "pomodoroSessionsPerCycle" integer,
    "bufferMinutes" integer,
    "dayEndMinutes" integer,
    "dayStartMinutes" integer,
    timezone text
);


--
-- Data for Name: PendingSync; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PendingSync" (id, "userId", "actionType", payload, "idempotencyKey", status, error, "createdAt", "appliedAt") FROM stdin;
cmu3sw3ew000601o1owrx1j5m	cmu3svuzi000501o1wcu82qbf	POST	{"path": "/api/tasks", "idempotencyKey": "f392a5ee-fbb8-474d-9488-aab09ad90b5b"}	f392a5ee-fbb8-474d-9488-aab09ad90b5b	APPLIED	\N	2026-09-16 07:50:05.384	2026-09-16 07:50:05.433
cmu434bd2000101o18defuffs	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "a33e8ea0-2899-4dbc-b7ce-ee2287871ea6"}	a33e8ea0-2899-4dbc-b7ce-ee2287871ea6	APPLIED	\N	2026-09-16 12:36:25.094	2026-09-16 12:36:25.144
cmu435hw3000301o16aycernv	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "09e165b7-5d49-41ce-b277-aa16d8b300fa"}	09e165b7-5d49-41ce-b277-aa16d8b300fa	APPLIED	\N	2026-09-16 12:37:20.211	2026-09-16 12:37:20.235
cmu4372uv000501o1a5tg0zn2	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "8fa078fd-1f51-4f75-8171-ba319a1a4154"}	8fa078fd-1f51-4f75-8171-ba319a1a4154	APPLIED	\N	2026-09-16 12:38:34.039	2026-09-16 12:38:34.058
cmu437c5p000701o1agzy6b7t	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/courses/cmu435hwe000401o1xvd8xbyj", "idempotencyKey": "2a4d112a-52c3-4381-9d93-5827ad7dc1af"}	2a4d112a-52c3-4381-9d93-5827ad7dc1af	APPLIED	\N	2026-09-16 12:38:46.093	2026-09-16 12:38:46.121
cmu437q2d000801o1xuc67u4f	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/courses/cmu4372v3000601o1cunv1ckw", "idempotencyKey": "855e9f9c-a0ab-4462-89c0-680b98d1e310"}	855e9f9c-a0ab-4462-89c0-680b98d1e310	APPLIED	\N	2026-09-16 12:39:04.117	2026-09-16 12:39:04.139
cmu439ihq000901o1yz8b54yp	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "c8061aaa-be3c-4000-b8d1-e93633f45450"}	c8061aaa-be3c-4000-b8d1-e93633f45450	APPLIED	\N	2026-09-16 12:40:27.615	2026-09-16 12:40:27.632
cmu43ao8m000b01o1cunigpma	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "33a1899e-86ed-41a4-ab68-6bec3d54474a"}	33a1899e-86ed-41a4-ab68-6bec3d54474a	APPLIED	\N	2026-09-16 12:41:21.718	2026-09-16 12:41:21.743
cmu43bvsp000d01o1sq8n23bf	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "f1754a10-fa8b-479b-98ec-1c1eeda1d16c"}	f1754a10-fa8b-479b-98ec-1c1eeda1d16c	APPLIED	\N	2026-09-16 12:42:18.169	2026-09-16 12:42:18.19
cmu43dbou000f01o1tnlge7yo	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "e4921d24-94be-4a38-ad41-7496c8706d51"}	e4921d24-94be-4a38-ad41-7496c8706d51	APPLIED	\N	2026-09-16 12:43:25.422	2026-09-16 12:43:25.44
cmu43fj52000h01o12f48m2if	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "a2f33ac3-fd5b-4161-9904-958ce513948e"}	a2f33ac3-fd5b-4161-9904-958ce513948e	APPLIED	\N	2026-09-16 12:45:08.391	2026-09-16 12:45:08.41
cmu43h8i9000j01o1zbtaw86z	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/tasks", "idempotencyKey": "d1bc608d-8089-44ac-9304-7cc6d7eff74c"}	d1bc608d-8089-44ac-9304-7cc6d7eff74c	APPLIED	\N	2026-09-16 12:46:27.921	2026-09-16 12:46:27.991
cmu43isy2000k01o1tbx8w0gy	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "33b1229f-4ea1-4029-bda5-793dd4105c4a"}	33b1229f-4ea1-4029-bda5-793dd4105c4a	APPLIED	\N	2026-09-16 12:47:41.066	2026-09-16 12:47:41.086
cmu43knpd000m01o15zxmvs40	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "412b32ae-768d-4d12-8ce7-c5e91a544759"}	412b32ae-768d-4d12-8ce7-c5e91a544759	APPLIED	\N	2026-09-16 12:49:07.585	2026-09-16 12:49:07.605
cmu43lqo8000o01o14yqeq6zl	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "897fba5d-47a6-4832-8640-aecd76de4717"}	897fba5d-47a6-4832-8640-aecd76de4717	APPLIED	\N	2026-09-16 12:49:58.088	2026-09-16 12:49:58.108
cmu43mlgs000q01o1odw0zh24	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "77d183e5-15b0-4154-8dd9-ef7ce9d9683c"}	77d183e5-15b0-4154-8dd9-ef7ce9d9683c	APPLIED	\N	2026-09-16 12:50:37.996	2026-09-16 12:50:38.016
cmu43nmya000s01o1wmxlmss0	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "161588fa-f11a-443c-a9f7-922b5d5694dc"}	161588fa-f11a-443c-a9f7-922b5d5694dc	APPLIED	\N	2026-09-16 12:51:26.578	2026-09-16 12:51:26.597
cmu43ohv2000u01o1dsz40q8f	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "95a4d901-4dae-4c90-a4e8-8cdcb74e83a9"}	95a4d901-4dae-4c90-a4e8-8cdcb74e83a9	APPLIED	\N	2026-09-16 12:52:06.638	2026-09-16 12:52:06.66
cmu43pq9l000w01o1f0r6gkvp	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "411e93b0-ab8e-4617-abb3-f38f74d3444b"}	411e93b0-ab8e-4617-abb3-f38f74d3444b	APPLIED	\N	2026-09-16 12:53:04.185	2026-09-16 12:53:04.207
cmu43qokb000y01o1ws5tng0i	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/courses", "idempotencyKey": "9a16ffe5-a79c-44b0-9d14-b1cb09593687"}	9a16ffe5-a79c-44b0-9d14-b1cb09593687	APPLIED	\N	2026-09-16 12:53:48.635	2026-09-16 12:53:48.656
cmu43vyix001001o159vnsm0n	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/pomodoro", "idempotencyKey": "47893abd-a1e1-49c2-b846-6b9f7e9f48f9"}	47893abd-a1e1-49c2-b846-6b9f7e9f48f9	APPLIED	\N	2026-09-16 12:57:54.825	2026-09-16 12:57:54.851
cmu43w266001201o16f6a38n6	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/pomodoro/cmu43vyjc001101o1plvf5knl/end", "idempotencyKey": "f623512d-cc9d-45a5-a79d-cef87e1138c6"}	f623512d-cc9d-45a5-a79d-cef87e1138c6	APPLIED	\N	2026-09-16 12:57:59.55	2026-09-16 12:57:59.571
cmu43w41x001301o1mn96mq15	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/pomodoro", "idempotencyKey": "24a98416-e021-4508-ae2c-68e1a5e243b2"}	24a98416-e021-4508-ae2c-68e1a5e243b2	APPLIED	\N	2026-09-16 12:58:01.989	2026-09-16 12:58:02.004
cmu4epzlm000501pfoig5csqh	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/tasks/30b546ec-c150-4fbf-89e8-506635fcf1f0/complete", "idempotencyKey": "3e4e86f3-a863-48d5-9b67-a109ffc14347"}	3e4e86f3-a863-48d5-9b67-a109ffc14347	APPLIED	\N	2026-09-16 18:01:12.058	2026-09-16 18:01:12.124
cmu4eqg0y000601pfdii1kd29	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu4ejdsx000001pfplcssdw7/resolve", "idempotencyKey": "a317ec89-8db8-44ad-93d9-1ab1efea60ed"}	a317ec89-8db8-44ad-93d9-1ab1efea60ed	APPLIED	\N	2026-09-16 18:01:33.347	2026-09-16 18:01:33.372
cmu4eqh0p000701pfru9qbfq5	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu4ejdu4000101pfd0wtleao/resolve", "idempotencyKey": "2b0182e8-2aa7-4bb1-b311-a3253ba9727b"}	2b0182e8-2aa7-4bb1-b311-a3253ba9727b	APPLIED	\N	2026-09-16 18:01:34.634	2026-09-16 18:01:34.657
cmu4eqi04000801pfga3cs3wx	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu4ejdv2000201pf5g7q4l4h/resolve", "idempotencyKey": "cf29590e-8b15-4c80-b6e7-1239ba78ffa6"}	cf29590e-8b15-4c80-b6e7-1239ba78ffa6	APPLIED	\N	2026-09-16 18:01:35.908	2026-09-16 18:01:35.928
cmu4gf5gh000001o6vo1jyr14	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu4fihae000001pm07xh0ntq/resolve", "idempotencyKey": "9e2a8c82-d513-4953-9bfc-d8334ab83148"}	9e2a8c82-d513-4953-9bfc-d8334ab83148	APPLIED	\N	2026-09-16 18:48:45.666	2026-09-16 18:48:45.716
cmu5umcxp000001o6q7z8gyiq	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu5kn9mb000101o6cc8kxht9/resolve", "idempotencyKey": "dc9e8777-c9aa-4818-8f84-20e29ed8639b"}	dc9e8777-c9aa-4818-8f84-20e29ed8639b	APPLIED	\N	2026-09-17 18:14:02.749	2026-09-17 18:14:02.767
cmu5ume7c000101o6tyqj6dz8	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu5kn9n0000301o6dbkxlpqr/resolve", "idempotencyKey": "2cac6120-f2a5-4c39-83a1-902e1f507fa0"}	2cac6120-f2a5-4c39-83a1-902e1f507fa0	APPLIED	\N	2026-09-17 18:14:04.392	2026-09-17 18:14:04.398
cmu5umf7i000201o6zxn4uhdp	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu5kn9nb000401o61cibk8a0/resolve", "idempotencyKey": "fbd1315f-d96e-4ec0-b2bc-b1ee3e0035a0"}	fbd1315f-d96e-4ec0-b2bc-b1ee3e0035a0	APPLIED	\N	2026-09-17 18:14:05.695	2026-09-17 18:14:05.701
cmu5umg5c000301o6zvhet06a	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu5kn9mo000201o604cjcfji/resolve", "idempotencyKey": "2589648a-cbbb-45a9-aa00-d6c67a716fb8"}	2589648a-cbbb-45a9-aa00-d6c67a716fb8	APPLIED	\N	2026-09-17 18:14:06.912	2026-09-17 18:14:06.919
cmu5umh7y000401o6dfc3vtje	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu5kn9lk000001o6j31w0p14/resolve", "idempotencyKey": "15a237f5-e7e4-4529-b5cd-f8bddef7ab3f"}	15a237f5-e7e4-4529-b5cd-f8bddef7ab3f	APPLIED	\N	2026-09-17 18:14:08.302	2026-09-17 18:14:08.311
cmu6oq6zs000901o631w0byfa	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu6ju81k000501o66mud28y7/resolve", "idempotencyKey": "36762d9d-cae7-4d52-a8ca-96007bb9b8a5"}	36762d9d-cae7-4d52-a8ca-96007bb9b8a5	APPLIED	\N	2026-09-18 08:16:50.152	2026-09-18 08:16:50.166
cmu6oq8ac000a01o6t6bsdc4q	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu6ju81t000601o6ysp6jd8w/resolve", "idempotencyKey": "78ceddfb-a79c-4d0f-9950-74befec27627"}	78ceddfb-a79c-4d0f-9950-74befec27627	APPLIED	\N	2026-09-18 08:16:51.828	2026-09-18 08:16:51.836
cmu6oq9vo000b01o6tydtrjrj	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu6ju823000801o6c3mv6jjc/resolve", "idempotencyKey": "71925d4e-af8e-4246-bef9-86b82ab51b93"}	71925d4e-af8e-4246-bef9-86b82ab51b93	APPLIED	\N	2026-09-18 08:16:53.892	2026-09-18 08:16:53.898
cmu6oqba5000c01o6xatno76e	cmu430lhu000001o1esos0ju7	PATCH	{"path": "/api/attendance/cmu6ju81x000701o6xmd6hab2/resolve", "idempotencyKey": "f11cefb4-eaea-4ae3-84f4-e66069df4a81"}	f11cefb4-eaea-4ae3-84f4-e66069df4a81	APPLIED	\N	2026-09-18 08:16:55.709	2026-09-18 08:16:55.716
cmu9dmvhr000d01o6fheg8wxw	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/pomodoro", "idempotencyKey": "0a7b8984-0f19-4719-a256-9675b4ce8cbf"}	0a7b8984-0f19-4719-a256-9675b4ce8cbf	APPLIED	\N	2026-09-20 05:29:38.031	2026-09-20 05:29:38.052
cmua3hs6q000001o6vs894s54	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/pomodoro", "idempotencyKey": "a3d7dd68-4bfb-4de0-8bf5-6cfd01652e6f"}	a3d7dd68-4bfb-4de0-8bf5-6cfd01652e6f	APPLIED	\N	2026-09-20 17:33:30.482	2026-09-20 17:33:30.5
cmua3hs7j000201o6tqoipdwj	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/pomodoro", "idempotencyKey": "fa88c958-7e43-478c-a0d6-904e5e8b15ba"}	fa88c958-7e43-478c-a0d6-904e5e8b15ba	APPLIED	\N	2026-09-20 17:33:30.511	2026-09-20 17:33:30.521
cmua3j4xo000401o676005h2m	cmu430lhu000001o1esos0ju7	POST	{"path": "/api/pomodoro", "idempotencyKey": "b692c70d-d550-42b0-a057-d06be2d1c195"}	b692c70d-d550-42b0-a057-d06be2d1c195	APPLIED	\N	2026-09-20 17:34:33.66	2026-09-20 17:34:33.667
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
a848f67e-b74b-41c1-8761-c1a508dcc682	6fa1b271ccf9d640836a3adfba7feca25522ba21635fbb56bb8e32b4fd1d6513	2026-09-16 07:31:32.548691+00	20260915152548_init	\N	\N	2026-09-16 07:31:31.998265+00	1
ad7f40f7-2e91-45d1-8880-44b2d87f2b93	899f17efd84b78ff1cbbd02ff21437f7ee41afd2e14e79ecf960d31ca2c3bcaf	2026-09-16 07:31:32.591408+00	20260915164854_calendar_local_events	\N	\N	2026-09-16 07:31:32.555737+00	1
144e7cc0-8498-4dbd-91e6-767f9a7c32e5	47532cfeca70d3b13f184ae74273e85c6119f96ae1897820ff2452b567f39305	2026-09-16 07:31:32.618855+00	20260915181119_user_name	\N	\N	2026-09-16 07:31:32.596127+00	1
cf4f79d7-c4b1-44f6-855d-78b985fda845	6b8bcb1c381b40f6a99f4f6324d683e13db3a0e029c7313a428d6dca628b3793	2026-09-25 18:31:40.105203+00	20260922072102_phase1_events	\N	\N	2026-09-25 18:31:40.040946+00	1
1a5c459a-ea86-40bb-952d-3810bc61a8d2	4ebaea9774ba1f7f57baf263dd823b7a885c064bd976a517e04289cdd9d0bfbe	2026-09-25 18:31:40.115205+00	20260922091123_phase4_zen	\N	\N	2026-09-25 18:31:40.107836+00	1
a083b194-66fb-497e-99ee-9217497b08c7	fb991a7698caa665f81eb5cd660501c046259c80e27d2a3da0cdb0968f2e0328	2026-09-25 18:41:48.057529+00	20260925183242_capacity_engine	\N	\N	2026-09-25 18:41:48.034592+00	1
77746885-3d35-470d-be8d-bb4e77d4c151	da650c3d3e627fd4bf81e779116bebc578c946bc97bef24b7f04a3b35ddecd8c	2026-09-25 18:57:55.571381+00	20260926003500_user_timezone	\N	\N	2026-09-25 18:57:55.557996+00	1
244b1dee-3e84-4184-a339-9df9f15d279f	dd7c73c34ed0f78af8f1d7368a97f1e1a86c2f6d88d0b528d0094cad19090865	2026-09-26 03:44:25.453122+00	20260926041500_calendar_include_in_day	\N	\N	2026-09-26 03:44:25.438988+00	1
734aec74-2f4d-4a24-b80a-4b1014135f19	c5f1d525e10d2674f113b7ac1193d4627f50128335cd40ee6f7ecdeec8bf03c1	2026-09-26 04:18:00.260171+00	20260926043000_timetable_entries	\N	\N	2026-09-26 04:18:00.199311+00	1
8a21d69f-2393-4e8c-be04-7a8037d95e47	5f93dd7fb14b9094b03b5d8fdc627d3399dc6d46ca852e007657a5ed902a9622	2026-09-26 06:01:42.711257+00	20260926120000_google_connections	\N	\N	2026-09-26 06:01:42.431005+00	1
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_records (id, "userId", "courseId", date, status, "confirmedAt", "createdAt", "updatedAt") FROM stdin;
cmu4ejdu4000101pfd0wtleao	cmu430lhu000001o1esos0ju7	cmu43isyb000l01o1gjymfcvt	2026-09-16	MISSED	2026-09-16 18:01:34.645	2026-09-16 17:56:03.916	2026-09-16 18:01:34.647
cmu4ejdv2000201pf5g7q4l4h	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-16	MISSED	2026-09-16 18:01:35.919	2026-09-16 17:56:03.95	2026-09-16 18:01:35.92
cmu4ejdsx000001pfplcssdw7	cmu430lhu000001o1esos0ju7	fix_9d094bb54d128b76	2026-09-16	ATTENDED	2026-09-16 18:01:33.361	2026-09-16 17:56:03.874	2026-09-16 18:01:33.364
cmu4fihae000001pm07xh0ntq	cmu430lhu000001o1esos0ju7	cmu43dbp3000g01o1kkb9evze	2026-09-16	MISSED	2026-09-16 18:48:45.695	2026-09-16 18:23:21.35	2026-09-16 18:48:45.705
cmu5kn9mb000101o6cc8kxht9	cmu430lhu000001o1esos0ju7	cmu43mlh1000r01o1ipt40at3	2026-09-17	ATTENDED	2026-09-17 18:14:02.758	2026-09-17 13:34:48.947	2026-09-17 18:14:02.76
cmu5kn9n0000301o6dbkxlpqr	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-17	ATTENDED	2026-09-17 18:14:04.395	2026-09-17 13:34:48.972	2026-09-17 18:14:04.395
cmu5kn9nb000401o61cibk8a0	cmu430lhu000001o1esos0ju7	fix_643cf67cef16b05c	2026-09-17	ATTENDED	2026-09-17 18:14:05.699	2026-09-17 13:34:48.983	2026-09-17 18:14:05.699
cmu5kn9mo000201o604cjcfji	cmu430lhu000001o1esos0ju7	cmu43isyb000l01o1gjymfcvt	2026-09-17	ATTENDED	2026-09-17 18:14:06.916	2026-09-17 13:34:48.96	2026-09-17 18:14:06.916
cmu5kn9lk000001o6j31w0p14	cmu430lhu000001o1esos0ju7	cmu43dbp3000g01o1kkb9evze	2026-09-17	ATTENDED	2026-09-17 18:14:08.309	2026-09-17 13:34:48.921	2026-09-17 18:14:08.309
cmu6ju81k000501o66mud28y7	cmu430lhu000001o1esos0ju7	cmu43mlh1000r01o1ipt40at3	2026-09-18	MISSED	2026-09-18 08:16:50.156	2026-09-18 06:00:00.056	2026-09-18 08:16:50.162
cmu6ju81t000601o6ysp6jd8w	cmu430lhu000001o1esos0ju7	cmu43isyb000l01o1gjymfcvt	2026-09-18	MISSED	2026-09-18 08:16:51.833	2026-09-18 06:00:00.065	2026-09-18 08:16:51.833
cmu6ju823000801o6c3mv6jjc	cmu430lhu000001o1esos0ju7	fix_643cf67cef16b05c	2026-09-18	MISSED	2026-09-18 08:16:53.895	2026-09-18 06:00:00.075	2026-09-18 08:16:53.896
cmu6ju81x000701o6xmd6hab2	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-18	MISSED	2026-09-18 08:16:55.713	2026-09-18 06:00:00.069	2026-09-18 08:16:55.714
cmubh0iet000001o6q0e40vek	cmu430lhu000001o1esos0ju7	fix_f891a7067985c5c1	2026-09-21	UNCONFIRMED	\N	2026-09-21 16:39:45.461	2026-09-21 16:39:45.461
cmubh0if3000101o6wcmlo4hb	cmu430lhu000001o1esos0ju7	cmu43mlh1000r01o1ipt40at3	2026-09-21	UNCONFIRMED	\N	2026-09-21 16:39:45.471	2026-09-21 16:39:45.471
cmubh0if7000201o6f763cgm4	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-21	UNCONFIRMED	\N	2026-09-21 16:39:45.475	2026-09-21 16:39:45.475
cmucz0ky0000001o6mv3erb1q	cmu430lhu000001o1esos0ju7	cmu43dbp3000g01o1kkb9evze	2026-09-22	UNCONFIRMED	\N	2026-09-22 17:51:28.008	2026-09-22 17:51:28.008
cmucz0kyc000101o68fw38v4g	cmu430lhu000001o1esos0ju7	cmu43mlh1000r01o1ipt40at3	2026-09-22	UNCONFIRMED	\N	2026-09-22 17:51:28.02	2026-09-22 17:51:28.02
cmucz0kyg000201o61ydjoz6k	cmu430lhu000001o1esos0ju7	cmu43isyb000l01o1gjymfcvt	2026-09-22	UNCONFIRMED	\N	2026-09-22 17:51:28.024	2026-09-22 17:51:28.024
cmucz0kyk000301o6u8jjgoo4	cmu430lhu000001o1esos0ju7	fix_643cf67cef16b05c	2026-09-22	UNCONFIRMED	\N	2026-09-22 17:51:28.028	2026-09-22 17:51:28.028
cmue3m1p6000001o6cgy7747i	cmu430lhu000001o1esos0ju7	cmu43dbp3000g01o1kkb9evze	2026-09-23	UNCONFIRMED	\N	2026-09-23 12:47:54.138	2026-09-23 12:47:54.138
cmue3m1q7000101o62pv1b78q	cmu430lhu000001o1esos0ju7	cmu43isyb000l01o1gjymfcvt	2026-09-23	UNCONFIRMED	\N	2026-09-23 12:47:54.175	2026-09-23 12:47:54.175
cmue3m1qr000201o6t0zgcz6r	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-23	UNCONFIRMED	\N	2026-09-23 12:47:54.195	2026-09-23 12:47:54.195
cmue3m1ra000301o6qup964xj	cmu430lhu000001o1esos0ju7	fix_9d094bb54d128b76	2026-09-23	UNCONFIRMED	\N	2026-09-23 12:47:54.215	2026-09-23 12:47:54.215
cmuge9lit000001o69sw8wnfy	cmu430lhu000001o1esos0ju7	cmu43mlh1000r01o1ipt40at3	2026-09-25	UNCONFIRMED	\N	2026-09-25 03:21:41.43	2026-09-25 03:21:41.43
cmuge9ljg000101o6csi3ebzf	cmu430lhu000001o1esos0ju7	cmu43isyb000l01o1gjymfcvt	2026-09-25	UNCONFIRMED	\N	2026-09-25 03:21:41.452	2026-09-25 03:21:41.452
cmuge9ljq000201o68gdxjars	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-25	UNCONFIRMED	\N	2026-09-25 03:21:41.462	2026-09-25 03:21:41.462
cmuge9lk0000301o640dl6ggq	cmu430lhu000001o1esos0ju7	fix_643cf67cef16b05c	2026-09-25	UNCONFIRMED	\N	2026-09-25 03:21:41.472	2026-09-25 03:21:41.472
cmuhwlk7u0007cbs4e20zoyh1	cmu430lhu000001o1esos0ju7	fix_f891a7067985c5c1	2026-09-28	UNCONFIRMED	\N	2026-09-26 04:42:38.875	2026-09-26 04:42:38.875
cmuhwlk820008cbs4o8g366my	cmu430lhu000001o1esos0ju7	cmu43mlh1000r01o1ipt40at3	2026-09-28	UNCONFIRMED	\N	2026-09-26 04:42:38.883	2026-09-26 04:42:38.883
cmuhwlk880009cbs47soonl3u	cmu430lhu000001o1esos0ju7	cmu43nmyi000t01o167z7wut7	2026-09-28	UNCONFIRMED	\N	2026-09-26 04:42:38.888	2026-09-26 04:42:38.888
\.


--
-- Data for Name: calendar_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.calendar_events (id, "userId", "googleEventId", "sourceCalendarId", title, "startTime", "endTime", "isDedupedDuplicate", "isDeleted", "googleUpdatedAt", "createdAt", "updatedAt", "allDay", color, description, location, source, "connectionId") FROM stdin;
\.


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.courses (id, "userId", name, code, schedule, "attendanceThreshold", "createdAt", "updatedAt") FROM stdin;
fix_f891a7067985c5c1	cmu430lhu000001o1esos0ju7	Communication LAB	\N	[{"endTime": "13:30", "dayOfWeek": 1, "startTime": "11:30"}]	80	2026-09-16 18:11:00.778	2026-09-16 18:11:00.778
cmu43dbp3000g01o1kkb9evze	cmu430lhu000001o1esos0ju7	Computer Architecture	EC355TBF	[{"endTime": "13:30", "dayOfWeek": 2, "startTime": "12:30"}, {"endTime": "15:30", "dayOfWeek": 3, "startTime": "14:30"}, {"endTime": "15:30", "dayOfWeek": 4, "startTime": "14:30"}]	80	2026-09-16 12:43:25.431	2026-09-16 18:11:00.778
cmu43mlh1000r01o1ipt40at3	cmu430lhu000001o1esos0ju7	Digital Communication	EC353IA	[{"endTime": "11:00", "dayOfWeek": 1, "startTime": "10:00"}, {"endTime": "11:00", "dayOfWeek": 2, "startTime": "10:00"}, {"endTime": "10:00", "dayOfWeek": 4, "startTime": "09:00"}, {"endTime": "12:30", "dayOfWeek": 5, "startTime": "11:30"}]	80	2026-09-16 12:50:38.005	2026-09-16 18:11:00.778
cmu43isyb000l01o1gjymfcvt	cmu430lhu000001o1esos0ju7	Digital VLSI	EC352IA	[{"endTime": "12:30", "dayOfWeek": 2, "startTime": "11:30"}, {"endTime": "12:30", "dayOfWeek": 3, "startTime": "11:30"}, {"endTime": "13:30", "dayOfWeek": 4, "startTime": "12:30"}, {"endTime": "13:30", "dayOfWeek": 5, "startTime": "12:30"}]	80	2026-09-16 12:47:41.076	2026-09-16 18:11:00.778
cmu43nmyi000t01o167z7wut7	cmu430lhu000001o1esos0ju7	Embedded System	EC345TA	[{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"endTime": "13:30", "dayOfWeek": 3, "startTime": "12:30"}, {"endTime": "11:00", "dayOfWeek": 4, "startTime": "10:00"}, {"endTime": "16:30", "dayOfWeek": 5, "startTime": "15:30"}]	80	2026-09-16 12:51:26.586	2026-09-16 18:11:00.778
fix_643cf67cef16b05c	cmu430lhu000001o1esos0ju7	Entrepreneurship	HS351TA	[{"endTime": "10:00", "dayOfWeek": 2, "startTime": "09:00"}, {"endTime": "12:30", "dayOfWeek": 4, "startTime": "11:30"}, {"endTime": "15:30", "dayOfWeek": 5, "startTime": "14:30"}]	80	2026-09-16 18:11:00.778	2026-09-16 18:11:00.778
fix_9d094bb54d128b76	cmu430lhu000001o1esos0ju7	VLSI LAB	\N	[{"endTime": "11:00", "dayOfWeek": 3, "startTime": "09:00"}]	80	2026-09-16 18:11:00.778	2026-09-16 18:11:00.778
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, "userId", type, "occurredAt", payload) FROM stdin;
cmuhbgxap000101rxmpwx70il	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 18:51:10.607	{"title": "verify-capacity-probe", "taskId": "cmuhbgxae000001rxnyvmqvcs", "dueDate": null, "courseId": null, "priority": "HIGH", "recurrenceRule": null}
cmuhbgxcp000201rxlqg89d1f	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 18:51:10.679	{"title": "verify-capacity-probe", "taskId": "cmuhbgxae000001rxnyvmqvcs"}
cmuhbgxix000401rx9xf3jf3f	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 18:51:10.905	{"title": "verify-estimate-probe", "taskId": "cmuhbgxir000301rxobegof3r", "dueDate": null, "courseId": null, "priority": "MEDIUM", "recurrenceRule": null}
cmuhbgxj9000501rx1ffsh3tm	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 18:51:10.917	{"title": "verify-estimate-probe", "taskId": "cmuhbgxir000301rxobegof3r"}
cmuhbhmxw000701rxr1hu2bec	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 18:51:43.844	{"title": "verify-capacity-probe", "taskId": "cmuhbhmxm000601rx0j8ov3rs", "dueDate": null, "courseId": null, "priority": "HIGH", "recurrenceRule": null}
cmuhbhmzp000801rxglu9785j	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 18:51:43.909	{"title": "verify-capacity-probe", "taskId": "cmuhbhmxm000601rx0j8ov3rs"}
cmuhbhn53000a01rxcqtzlgq4	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 18:51:44.103	{"title": "verify-estimate-probe", "taskId": "cmuhbhn4x000901rxf2br1cx2", "dueDate": null, "courseId": null, "priority": "MEDIUM", "recurrenceRule": null}
cmuhbhn5e000b01rx0yjw6sgg	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 18:51:44.114	{"title": "verify-estimate-probe", "taskId": "cmuhbhn4x000901rxf2br1cx2"}
cmuhbqhzz000101qd89wjnrr1	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 18:58:37.341	{"title": "verify-capacity-probe", "taskId": "cmuhbqhzp000001qdxb3ra731", "dueDate": null, "courseId": null, "priority": "HIGH", "recurrenceRule": null}
cmuhbqi4k000201qdnd67aa2r	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 18:58:37.506	{"title": "verify-capacity-probe", "taskId": "cmuhbqhzp000001qdxb3ra731"}
cmuhbqiap000401qd7dw78es0	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 18:58:37.729	{"title": "verify-estimate-probe", "taskId": "cmuhbqiab000301qd23quexoe", "dueDate": null, "courseId": null, "priority": "MEDIUM", "recurrenceRule": null}
cmuhbqib3000501qd7nynkift	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 18:58:37.743	{"title": "verify-estimate-probe", "taskId": "cmuhbqiab000301qd23quexoe"}
cmuhbuhn9000101nxp7tahd2u	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 19:01:43.507	{"title": "verify-capacity-probe", "taskId": "cmuhbuhmz000001nxxdjaxmjl", "dueDate": null, "courseId": null, "priority": "HIGH", "recurrenceRule": null}
cmuhbuhr8000201nxyfckvdif	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 19:01:43.651	{"title": "verify-capacity-probe", "taskId": "cmuhbuhmz000001nxxdjaxmjl"}
cmuhbuhxv000401nxc43f2xkb	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 19:01:43.891	{"title": "verify-estimate-probe", "taskId": "cmuhbuhxk000301nxh9rr1fc9", "dueDate": null, "courseId": null, "priority": "MEDIUM", "recurrenceRule": null}
cmuhbuhy5000501nxktjpxwjz	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 19:01:43.9	{"title": "verify-estimate-probe", "taskId": "cmuhbuhxk000301nxh9rr1fc9"}
cmuhbuvvj000701nx0cqtq9ep	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 19:02:01.951	{"title": "verify-capacity-probe", "taskId": "cmuhbuvvd000601nxvioxyrrb", "dueDate": null, "courseId": null, "priority": "HIGH", "recurrenceRule": null}
cmuhbuvy4000801nxagu4n9uw	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 19:02:02.044	{"title": "verify-capacity-probe", "taskId": "cmuhbuvvd000601nxvioxyrrb"}
cmuhbuw2w000a01nxlap3gz4p	cmu430lhu000001o1esos0ju7	TASK_CREATED	2026-09-25 19:02:02.216	{"title": "verify-estimate-probe", "taskId": "cmuhbuw2r000901nxgh8pmc68", "dueDate": null, "courseId": null, "priority": "MEDIUM", "recurrenceRule": null}
cmuhbuw38000b01nxyn8z75hu	cmu430lhu000001o1esos0ju7	TASK_DELETED	2026-09-25 19:02:02.227	{"title": "verify-estimate-probe", "taskId": "cmuhbuw2r000901nxgh8pmc68"}
cmuhvwpg4000101og368mu1b3	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:23:19.249	{"courseId": "cmuhvwpfm000001og3gcncqvt", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhvwpix000301og2uc9k0w5	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:19.35	{"action": "created", "timetableEntryId": "cmuhvwpil000201ogli2xzzfu"}
cmuhvwpjy000501og37al0y1u	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:19.389	{"action": "created", "timetableEntryId": "cmuhvwpjq000401oggspsryd8"}
cmuhvwplj000601ogtsnjrv9x	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:19.446	{"action": "deleted", "timetableEntryId": "cmuhvwpjq000401oggspsryd8"}
cmuhvwpm8000801og2uon68x2	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:19.471	{"action": "created", "timetableEntryId": "cmuhvwplw000701ogn3cudxfa"}
cmuhvwpnj000901ogsf33isls	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:19.518	{"action": "deleted", "timetableEntryId": "cmuhvwplw000701ogn3cudxfa"}
cmuhvwpo7000b01ogrly6i49r	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:19.542	{"action": "created", "timetableEntryId": "cmuhvwpnz000a01ogd4q8x3ph"}
cmuhvx0hz000d01og8q0two97	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:23:33.575	{"courseId": "cmuhvx0hs000c01ogr8fq12so", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhvx0jk000f01og9am4y4xj	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:33.631	{"action": "created", "timetableEntryId": "cmuhvx0jb000e01ogbvoycl3f"}
cmuhvx0ki000h01ogybm74ihy	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:33.665	{"action": "created", "timetableEntryId": "cmuhvx0k8000g01ogiqhtx4nn"}
cmuhvx0mj000i01ognh52exmp	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:33.738	{"action": "deleted", "timetableEntryId": "cmuhvx0k8000g01ogiqhtx4nn"}
cmuhvx0n4000k01ogku6qjjfr	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:33.759	{"action": "created", "timetableEntryId": "cmuhvx0mv000j01ogten13wve"}
cmuhvx0or000l01ogwz9o8rnw	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:33.818	{"action": "deleted", "timetableEntryId": "cmuhvx0mv000j01ogten13wve"}
cmuhvx0pf000n01ogfwykwcdu	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:23:33.841	{"action": "created", "timetableEntryId": "cmuhvx0p3000m01og3c6w7e68"}
cmuhvypuk000p01ogxb01z1ih	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:24:53.083	{"courseId": "cmuhvypu8000o01oge24fzq3s", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhvypx5000r01og7mwbxci7	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.175	{"action": "created", "timetableEntryId": "cmuhvypwq000q01og3b6spied"}
cmuhvypyr000t01ogh022h24k	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.234	{"action": "created", "timetableEntryId": "cmuhvypyf000s01ogvz8vfsz8"}
cmuhvyq24000v01ogmicmgesc	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.354	{"action": "created", "timetableEntryId": "cmuhvyq1q000u01og6gx2lhec"}
cmuhvyq5c000x01ogjk2fszs2	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.471	{"action": "created", "timetableEntryId": "cmuhvyq4v000w01ogn03bsg0r"}
cmuhvyqb3000z01og0qm3tj2h	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.678	{"action": "created", "timetableEntryId": "cmuhvyqaq000y01og7vztemvw"}
cmuhvyqhc001001oghflhrfe6	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.902	{"action": "deleted", "timetableEntryId": "cmuhvypwq000q01og3b6spied"}
cmuhvyqi0001101oglp0954d2	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.926	{"action": "deleted", "timetableEntryId": "cmuhvypyf000s01ogvz8vfsz8"}
cmuhvyqif001201og0uiicny5	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.942	{"action": "deleted", "timetableEntryId": "cmuhvyq1q000u01og6gx2lhec"}
cmuhvyqix001301ogmqpjpuy0	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.959	{"action": "deleted", "timetableEntryId": "cmuhvyq4v000w01ogn03bsg0r"}
cmuhvyqjc001401ogc1mkls20	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:24:53.974	{"action": "deleted", "timetableEntryId": "cmuhvyqaq000y01og7vztemvw"}
cmuhvzdt6001601ogpzwdc5ch	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:25:24.137	{"courseId": "cmuhvzdsw001501ogz0apz68x", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhvzdvl001801ogzktizf8o	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.224	{"action": "created", "timetableEntryId": "cmuhvzdv8001701og63h03c30"}
cmuhvzdx3001a01oghwzx53a8	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.277	{"action": "created", "timetableEntryId": "cmuhvzdws001901ogzyq8m5hf"}
cmuhvzdz1001c01ogir817nyu	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.348	{"action": "created", "timetableEntryId": "cmuhvzdyu001b01oglwflezg5"}
cmuhvze0h001e01ogd8isfiis	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.4	{"action": "created", "timetableEntryId": "cmuhvze09001d01ogk32uuyra"}
cmuhvze3z001g01og01q808uj	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.525	{"action": "created", "timetableEntryId": "cmuhvze3l001f01ogjxlzu6j9"}
cmuhvze8r001h01ogak4k5dwg	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.698	{"action": "deleted", "timetableEntryId": "cmuhvzdv8001701og63h03c30"}
cmuhvze9c001i01og3xwkt82u	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.718	{"action": "deleted", "timetableEntryId": "cmuhvzdws001901ogzyq8m5hf"}
cmuhvze9t001j01og3vdqvwen	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.736	{"action": "deleted", "timetableEntryId": "cmuhvzdyu001b01oglwflezg5"}
cmuhvzea9001k01oglq55ppx4	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.752	{"action": "deleted", "timetableEntryId": "cmuhvze09001d01ogk32uuyra"}
cmuhvzeao001l01oguk7jcc53	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:25:24.767	{"action": "deleted", "timetableEntryId": "cmuhvze3l001f01ogjxlzu6j9"}
cmuhw0824001n01og1c7419ag	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:26:03.34	{"courseId": "cmuhw081y001m01ogi75uzatr", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhw0849001p01og1wxuj4ao	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.416	{"action": "created", "timetableEntryId": "cmuhw0842001o01ogxfeuussw"}
cmuhw084y001r01ogedf04rd3	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.441	{"action": "created", "timetableEntryId": "cmuhw084s001q01ogdg99si0a"}
cmuhw0865001s01ogmzvo777q	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.484	{"action": "deleted", "timetableEntryId": "cmuhw084s001q01ogdg99si0a"}
cmuhw086k001u01og8i0siclo	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.499	{"action": "created", "timetableEntryId": "cmuhw086d001t01ogafu889nj"}
cmuhw087s001v01ogn4p1fdow	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.542	{"action": "deleted", "timetableEntryId": "cmuhw086d001t01ogafu889nj"}
cmuhw088h001x01og8hcd0st1	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.567	{"action": "created", "timetableEntryId": "cmuhw0885001w01ogz5g4xtza"}
cmuhw08dt001z01og6skg3h43	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.759	{"action": "created", "timetableEntryId": "cmuhw08dg001y01ogblcwb80j"}
cmuhw08io002001og2q6rp0bg	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:03.935	{"action": "deleted", "timetableEntryId": "cmuhw0842001o01ogxfeuussw"}
cmuhw08lg002101og8qxteqpy	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:04.035	{"action": "deleted", "timetableEntryId": "cmuhw0885001w01ogz5g4xtza"}
cmuhw08m1002201ogv9u2qdjf	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:26:04.051	{"action": "deleted", "timetableEntryId": "cmuhw08dg001y01ogblcwb80j"}
cmuhw57uz000101mvq2boq17w	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:29:56.362	{"courseId": "cmuhw57ur000001mvvqyng8g2", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhw57xt000301mv3rv1rc1j	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.463	{"action": "created", "timetableEntryId": "cmuhw57xi000201mvyzscsyim"}
cmuhw57ys000501mvjwuifclb	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.5	{"action": "created", "timetableEntryId": "cmuhw57yl000401mvxwuxsasd"}
cmuhw580i000601mvy3kz18ce	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.56	{"action": "deleted", "timetableEntryId": "cmuhw57yl000401mvxwuxsasd"}
cmuhw581w000801mv69md6ja2	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.61	{"action": "created", "timetableEntryId": "cmuhw581a000701mvm90j99a7"}
cmuhw5847000901mvjpdlxzmn	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.694	{"action": "deleted", "timetableEntryId": "cmuhw581a000701mvm90j99a7"}
cmuhw5859000b01mvvpxj6qmu	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.731	{"action": "created", "timetableEntryId": "cmuhw584w000a01mvos4rw6n4"}
cmuhw58bi000d01mvaq8pqeb1	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:56.956	{"action": "created", "timetableEntryId": "cmuhw58b4000c01mvegfozxo8"}
cmuhw58ig000e01mvpnxzs9ow	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:57.207	{"action": "deleted", "timetableEntryId": "cmuhw57xi000201mvyzscsyim"}
cmuhw58j4000f01mvppv1r8cw	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:57.23	{"action": "deleted", "timetableEntryId": "cmuhw584w000a01mvos4rw6n4"}
cmuhw58jl000g01mvc1sv1hav	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:29:57.247	{"action": "deleted", "timetableEntryId": "cmuhw58b4000c01mvegfozxo8"}
cmuhwhfv5000101s42zec6zcq	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 04:39:26.605	{"courseId": "cmuhwhfun000001s4wge789u4", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhwhfzj000301s4hm09ca82	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:26.763	{"action": "created", "timetableEntryId": "cmuhwhfz7000201s4wqktxnn9"}
cmuhwhg08000501s4bjrntpsw	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:26.792	{"action": "created", "timetableEntryId": "cmuhwhg03000401s4imfq1avs"}
cmuhwhg1j000601s4qfy4e6xw	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:26.838	{"action": "deleted", "timetableEntryId": "cmuhwhg03000401s4imfq1avs"}
cmuhwhg20000801s4bwx4opl4	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:26.855	{"action": "created", "timetableEntryId": "cmuhwhg1r000701s46nvahq5r"}
cmuhwhg30000901s4vvahn0g2	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:26.891	{"action": "deleted", "timetableEntryId": "cmuhwhg1r000701s46nvahq5r"}
cmuhwhg3e000b01s4xl9pl3zz	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:26.905	{"action": "created", "timetableEntryId": "cmuhwhg38000a01s4omrmauw5"}
cmuhwhg69000d01s4hkzwa4o1	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:27.008	{"action": "created", "timetableEntryId": "cmuhwhg63000c01s4pb6z538d"}
cmuhwhga8000e01s4nktjtrjt	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:27.15	{"action": "deleted", "timetableEntryId": "cmuhwhfz7000201s4wqktxnn9"}
cmuhwhgap000f01s4dyl5xhym	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:27.168	{"action": "deleted", "timetableEntryId": "cmuhwhg38000a01s4omrmauw5"}
cmuhwhgay000g01s4dc75il4a	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 04:39:27.177	{"action": "deleted", "timetableEntryId": "cmuhwhg63000c01s4pb6z538d"}
cmuhxvg4h000101o8y22paofe	cmu430lhu000001o1esos0ju7	CLASS_SCHEDULED	2026-09-26 05:18:19.743	{"courseId": "cmuhxvg49000001o8m46q28zn", "schedule": [{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"type": "LAB", "endTime": "15:30", "location": "B-101", "dayOfWeek": 1, "startTime": "14:00"}, {"endTime": "12:00", "dayOfWeek": 3, "startTime": "11:00", "weekNumber": 2}], "courseName": "ZZ Timetable Probe"}
cmuhxvg8m000301o8hwixyni3	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:19.892	{"action": "created", "timetableEntryId": "cmuhxvg88000201o8yk4umbqr"}
cmuhxvg9c000501o8qqqutpeq	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:19.919	{"action": "created", "timetableEntryId": "cmuhxvg94000401o8cr3tg1u7"}
cmuhxvgc1000601o822kv9x6m	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.015	{"action": "deleted", "timetableEntryId": "cmuhxvg94000401o8cr3tg1u7"}
cmuhxvgdg000801o8sp22mptu	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.065	{"action": "created", "timetableEntryId": "cmuhxvgcp000701o8dbozcxc6"}
cmuhxvgg8000901o8qfk41obj	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.166	{"action": "deleted", "timetableEntryId": "cmuhxvgcp000701o8dbozcxc6"}
cmuhxvghm000b01o894euzdor	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.216	{"action": "created", "timetableEntryId": "cmuhxvgh6000a01o8bw921301"}
cmuhxvgou000d01o81a6wgjwb	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.476	{"action": "created", "timetableEntryId": "cmuhxvgoe000c01o8m0s7s9zf"}
cmuhxvgy0000e01o8r11e3556	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.806	{"action": "deleted", "timetableEntryId": "cmuhxvg88000201o8yk4umbqr"}
cmuhxvgyn000f01o8qh1g8qoj	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.829	{"action": "deleted", "timetableEntryId": "cmuhxvgh6000a01o8bw921301"}
cmuhxvgza000g01o8zt2eqskj	cmu430lhu000001o1esos0ju7	TASK_UPDATED	2026-09-26 05:18:20.853	{"action": "deleted", "timetableEntryId": "cmuhxvgoe000c01o8m0s7s9zf"}
\.


--
-- Data for Name: google_connections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.google_connections (id, "userId", "googleAccountId", email, "displayName", "accessToken", "refreshToken", "tokenExpiresAt", scopes, "defaultTaskListId", "needsRelink", "lastSyncedAt", "lastError", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: linked_google_calendars; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.linked_google_calendars (id, "userId", summary, "backgroundColor", "accessRole", "isLinked", "includeInDay", "connectionId") FROM stdin;
\.


--
-- Data for Name: pomodoro_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pomodoro_sessions (id, "userId", "taskId", "startedAt", "durationMinutes", completed, "createdAt", "actualMinutes", "endedAt") FROM stdin;
cmu43vyjc001101o1plvf5knl	cmu430lhu000001o1esos0ju7	\N	2026-09-16 12:57:54.837	25	f	2026-09-16 12:57:54.84	\N	\N
cmu43w426001401o1bl1oqomw	cmu430lhu000001o1esos0ju7	\N	2026-09-16 12:58:01.997	25	f	2026-09-16 12:58:01.998	\N	\N
cmu9dmvi7000e01o6r8gvn91t	cmu430lhu000001o1esos0ju7	\N	2026-09-20 05:29:38.041	45	f	2026-09-20 05:29:38.047	\N	\N
cmua3hs72000101o6hiy0z8g8	cmu430lhu000001o1esos0ju7	\N	2026-09-20 17:33:30.492	25	f	2026-09-20 17:33:30.494	\N	\N
cmua3hs7p000301o6o2pvv92v	cmu430lhu000001o1esos0ju7	\N	2026-09-20 17:33:30.517	25	f	2026-09-20 17:33:30.517	\N	\N
cmua3j4xt000501o63k9vb5af	cmu430lhu000001o1esos0ju7	\N	2026-09-20 17:34:33.665	25	f	2026-09-20 17:34:33.665	\N	\N
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, "userId", title, notes, "dueDate", "dueTime", completed, "completedAt", "deletedAt", priority, "recurrenceRule", "lastCompletedOccurrence", "createdAt", "updatedAt", "courseId", "estimateMinutes", "plannedDate", "connectionId", "googleDeleted", "googleETag", "googlePushedAt", "googleTaskId", "googleTaskListId") FROM stdin;
30b546ec-c150-4fbf-89e8-506635fcf1f0	cmu430lhu000001o1esos0ju7	NPTEL Assignment	\N	2026-09-16	00:00	t	2026-09-16 18:01:12.082	\N	HIGH	\N	\N	2026-09-16 12:46:27.964	2026-09-16 18:01:12.105	\N	\N	\N	\N	f	\N	\N	\N	\N
\.


--
-- Data for Name: timetable_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.timetable_entries (id, "userId", "courseId", title, kind, date, "startTime", "endTime", location, notes, "replacesSlot", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, "passwordHash", "authProvider", "googleRefreshToken", "googleAccessToken", "googleTokenExpiresAt", "fcmToken", "attendanceAutoMarkHours", "pomodoroWorkMinutes", "pomodoroBreakMinutes", "chimeOnTheHour", "onboardingComplete", "createdAt", "updatedAt", name, "pomodoroLongBreakMinutes", "pomodoroSessionsPerCycle", "bufferMinutes", "dayEndMinutes", "dayStartMinutes", timezone) FROM stdin;
cmu430lhu000001o1esos0ju7	chiragrkaranth@gmail.com	$2b$12$85U4edbTf1GykT12XZGf.ue7WMPkwHTW/k3BbCC8nAjARGcYXPUiC	PASSWORD	\N	\N	\N	\N	\N	\N	\N	t	f	2026-09-16 12:33:31.602	2026-09-25 19:19:00.573		\N	\N	\N	\N	\N	Asia/Calcutta
\.


--
-- Name: PendingSync PendingSync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PendingSync"
    ADD CONSTRAINT "PendingSync_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: google_connections google_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections
    ADD CONSTRAINT google_connections_pkey PRIMARY KEY (id);


--
-- Name: linked_google_calendars linked_google_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_google_calendars
    ADD CONSTRAINT linked_google_calendars_pkey PRIMARY KEY (id);


--
-- Name: pomodoro_sessions pomodoro_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pomodoro_sessions
    ADD CONSTRAINT pomodoro_sessions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: timetable_entries timetable_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: PendingSync_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PendingSync_idempotencyKey_key" ON public."PendingSync" USING btree ("idempotencyKey");


--
-- Name: attendance_records_courseId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "attendance_records_courseId_date_key" ON public.attendance_records USING btree ("courseId", date);


--
-- Name: attendance_records_userId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attendance_records_userId_date_idx" ON public.attendance_records USING btree ("userId", date);


--
-- Name: calendar_events_userId_connectionId_googleEventId_sourceCal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_events_userId_connectionId_googleEventId_sourceCal_idx" ON public.calendar_events USING btree ("userId", "connectionId", "googleEventId", "sourceCalendarId");


--
-- Name: calendar_events_userId_startTime_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "calendar_events_userId_startTime_idx" ON public.calendar_events USING btree ("userId", "startTime");


--
-- Name: courses_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "courses_userId_idx" ON public.courses USING btree ("userId");


--
-- Name: events_userId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "events_userId_occurredAt_idx" ON public.events USING btree ("userId", "occurredAt");


--
-- Name: events_userId_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "events_userId_type_idx" ON public.events USING btree ("userId", type);


--
-- Name: google_connections_userId_googleAccountId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "google_connections_userId_googleAccountId_key" ON public.google_connections USING btree ("userId", "googleAccountId");


--
-- Name: google_connections_userId_needsRelink_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "google_connections_userId_needsRelink_idx" ON public.google_connections USING btree ("userId", "needsRelink");


--
-- Name: linked_google_calendars_connectionId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "linked_google_calendars_connectionId_id_key" ON public.linked_google_calendars USING btree ("connectionId", id);


--
-- Name: linked_google_calendars_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "linked_google_calendars_userId_idx" ON public.linked_google_calendars USING btree ("userId");


--
-- Name: pomodoro_sessions_userId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pomodoro_sessions_userId_startedAt_idx" ON public.pomodoro_sessions USING btree ("userId", "startedAt");


--
-- Name: tasks_userId_connectionId_googleTaskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_userId_connectionId_googleTaskId_idx" ON public.tasks USING btree ("userId", "connectionId", "googleTaskId");


--
-- Name: tasks_userId_courseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_userId_courseId_idx" ON public.tasks USING btree ("userId", "courseId");


--
-- Name: tasks_userId_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_userId_deletedAt_idx" ON public.tasks USING btree ("userId", "deletedAt");


--
-- Name: tasks_userId_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_userId_dueDate_idx" ON public.tasks USING btree ("userId", "dueDate");


--
-- Name: tasks_userId_plannedDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_userId_plannedDate_idx" ON public.tasks USING btree ("userId", "plannedDate");


--
-- Name: timetable_entries_userId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "timetable_entries_userId_date_idx" ON public.timetable_entries USING btree ("userId", date);


--
-- Name: timetable_entries_userId_date_startTime_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "timetable_entries_userId_date_startTime_idx" ON public.timetable_entries USING btree ("userId", date, "startTime");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: attendance_records attendance_records_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT "attendance_records_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public.courses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT "attendance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.google_connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: courses courses_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT "courses_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: google_connections google_connections_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections
    ADD CONSTRAINT "google_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: linked_google_calendars linked_google_calendars_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_google_calendars
    ADD CONSTRAINT "linked_google_calendars_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.google_connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: linked_google_calendars linked_google_calendars_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_google_calendars
    ADD CONSTRAINT "linked_google_calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pomodoro_sessions pomodoro_sessions_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pomodoro_sessions
    ADD CONSTRAINT "pomodoro_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pomodoro_sessions pomodoro_sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pomodoro_sessions
    ADD CONSTRAINT "pomodoro_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tasks tasks_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.google_connections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tasks tasks_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public.courses(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tasks tasks_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: timetable_entries timetable_entries_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT "timetable_entries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public.courses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: timetable_entries timetable_entries_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT "timetable_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict xalDG1DWrOYXNHTRL9ektbjdHO0q4HsqyewGv22TvmererSQnXiAaIEffGbZAH6

