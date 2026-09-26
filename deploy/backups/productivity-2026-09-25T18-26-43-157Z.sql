--
-- PostgreSQL database dump
--

\restrict Naph8eE5kFaak2gNoadHp5AY4nMPAKEfdkBm39Hov886bEiUp1428oKAOvXsO3o

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


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
    source public."CalendarEventSource" DEFAULT 'LOCAL'::public."CalendarEventSource" NOT NULL,
    "googleEventId" text,
    "sourceCalendarId" text,
    title text NOT NULL,
    description text,
    "startTime" timestamp(3) without time zone NOT NULL,
    "endTime" timestamp(3) without time zone NOT NULL,
    "allDay" boolean DEFAULT false NOT NULL,
    location text,
    color text,
    "isDedupedDuplicate" boolean DEFAULT false NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "googleUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
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
-- Name: linked_google_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linked_google_calendars (
    id text NOT NULL,
    "userId" text NOT NULL,
    summary text NOT NULL,
    "backgroundColor" text,
    "accessRole" text,
    "isLinked" boolean DEFAULT true NOT NULL
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
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    "courseId" text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
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
    "pomodoroLongBreakMinutes" integer,
    "pomodoroSessionsPerCycle" integer
);


--
-- Data for Name: PendingSync; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PendingSync" (id, "userId", "actionType", payload, "idempotencyKey", status, error, "createdAt", "appliedAt") FROM stdin;
cmu312nq4000rwvlsjvkz8gst	cmu312ftk000qwvlse4xob6mq	POST	{"path": "/api/tasks", "idempotencyKey": "8970f516-44da-40c1-8490-d37e29ac4703"}	8970f516-44da-40c1-8490-d37e29ac4703	APPLIED	\N	2026-09-15 18:51:22.396	2026-09-15 18:51:22.449
cmu313ont000twvlse1zeirmk	cmu313gmi000swvls98anezt8	POST	{"path": "/api/tasks", "idempotencyKey": "62c843d1-bb93-4ef0-acb7-f9a4952d4547"}	62c843d1-bb93-4ef0-acb7-f9a4952d4547	APPLIED	\N	2026-09-15 18:52:10.265	2026-09-15 18:52:10.303
cmu314g4j000vwvls191726c0	cmu3148ag000uwvlsafbejvr5	POST	{"path": "/api/tasks", "idempotencyKey": "858569d5-7629-4b86-af61-e4b919e43d13"}	858569d5-7629-4b86-af61-e4b919e43d13	APPLIED	\N	2026-09-15 18:52:45.859	2026-09-15 18:52:45.898
cmu31a1f7000xwvlssnmr8fay	cmu319ta4000wwvls02znvlh7	POST	{"path": "/api/tasks", "idempotencyKey": "6f05c1ab-4903-4db0-b9ec-b2cca88853f6"}	6f05c1ab-4903-4db0-b9ec-b2cca88853f6	APPLIED	\N	2026-09-15 18:57:06.74	2026-09-15 18:57:06.792
cmu4b119l00057tlsln871e2t	cmu4b0o0v00047tlsqww5ldlw	POST	{"path": "/api/tasks", "idempotencyKey": "1514e6cb-6072-43f6-bfac-69e60878f0da"}	1514e6cb-6072-43f6-bfac-69e60878f0da	APPLIED	\N	2026-09-16 16:17:48.97	2026-09-16 16:17:49.037
cmu4clsop000d7tlsqooczsj5	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "d1c37429-9730-4f57-bef8-50c6e76890d7"}	d1c37429-9730-4f57-bef8-50c6e76890d7	APPLIED	\N	2026-09-16 17:01:57.241	2026-09-16 17:01:57.272
cmu4cve84000f7tlszff5fk00	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "d4a3080f-b4fb-4660-b0cb-54671407b5a8"}	d4a3080f-b4fb-4660-b0cb-54671407b5a8	APPLIED	\N	2026-09-16 17:09:25.06	2026-09-16 17:09:25.177
cmu4cwcq7000h7tlshb9bq1g7	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "244f336f-bd22-4afe-9d16-b5ce754cac20"}	244f336f-bd22-4afe-9d16-b5ce754cac20	APPLIED	\N	2026-09-16 17:10:09.776	2026-09-16 17:10:09.803
cmu4cy7td000j7tlshp0p8t6v	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "11c1548a-08c3-49ad-be3d-907de4a93c59"}	11c1548a-08c3-49ad-be3d-907de4a93c59	APPLIED	\N	2026-09-16 17:11:36.721	2026-09-16 17:11:36.742
cmu4cyt01000l7tlsspkjmgol	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "5ec0206d-006b-4514-8cbc-6e164dee77ce"}	5ec0206d-006b-4514-8cbc-6e164dee77ce	APPLIED	\N	2026-09-16 17:12:04.177	2026-09-16 17:12:04.196
cmu4czjel000n7tlsqgk01zhe	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "c6a68e6c-4d3b-4a7f-a3b2-37847cecbd36"}	c6a68e6c-4d3b-4a7f-a3b2-37847cecbd36	APPLIED	\N	2026-09-16 17:12:38.397	2026-09-16 17:12:38.414
cmu4d042j000p7tlsl1gp8ojo	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "81cd5f7e-909e-4bb8-b151-a7554de1d49d"}	81cd5f7e-909e-4bb8-b151-a7554de1d49d	APPLIED	\N	2026-09-16 17:13:05.179	2026-09-16 17:13:05.205
cmu4d0pa7000r7tls4x1jafor	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/courses", "idempotencyKey": "eb75f76a-ed4a-40a6-8bd0-c0b9e40373ae"}	eb75f76a-ed4a-40a6-8bd0-c0b9e40373ae	APPLIED	\N	2026-09-16 17:13:32.671	2026-09-16 17:13:32.69
cmu4d15sa000t7tlstxob4sww	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cyt0a000m7tls1p6cxihn", "idempotencyKey": "78cf56ec-b5e2-492d-a546-6706b1f4d9d3"}	78cf56ec-b5e2-492d-a546-6706b1f4d9d3	APPLIED	\N	2026-09-16 17:13:54.058	2026-09-16 17:13:54.097
cmu4d2h7s000u7tls0xhzrae9	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cy7to000k7tls88hgr5e9", "idempotencyKey": "5cdc2933-d693-491c-979b-17dd97bc0a51"}	5cdc2933-d693-491c-979b-17dd97bc0a51	APPLIED	\N	2026-09-16 17:14:55.528	2026-09-16 17:14:55.551
cmu4d3u53000v7tls3i9ipndd	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4d0pag000s7tlsngd6udpp", "idempotencyKey": "5157934d-1ca7-4d83-a789-0e69ec181c41"}	5157934d-1ca7-4d83-a789-0e69ec181c41	APPLIED	\N	2026-09-16 17:15:58.935	2026-09-16 17:15:58.964
cmu4d4d54000w7tlstzr4rbjp	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cveay000g7tls9p7pzaum", "idempotencyKey": "4b3fd893-e2c5-42c8-85c3-7c644b0696b9"}	4b3fd893-e2c5-42c8-85c3-7c644b0696b9	APPLIED	\N	2026-09-16 17:16:23.56	2026-09-16 17:16:23.581
cmu4d4m40000x7tlss0xyqkhu	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cveay000g7tls9p7pzaum", "idempotencyKey": "c03328fc-ecf2-4720-b7f5-f6c4fc0fdd0e"}	c03328fc-ecf2-4720-b7f5-f6c4fc0fdd0e	APPLIED	\N	2026-09-16 17:16:35.184	2026-09-16 17:16:35.208
cmu4d4pjn000y7tlsnssjyvqn	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cveay000g7tls9p7pzaum", "idempotencyKey": "85eb3cd4-402c-4373-94a7-e3a315761ad4"}	85eb3cd4-402c-4373-94a7-e3a315761ad4	APPLIED	\N	2026-09-16 17:16:39.635	2026-09-16 17:16:39.655
cmu4dcfh5000z7tlstd04zuc8	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cy7to000k7tls88hgr5e9", "idempotencyKey": "7d3a4952-2c99-4efc-9c0e-7749eac32a40"}	7d3a4952-2c99-4efc-9c0e-7749eac32a40	APPLIED	\N	2026-09-16 17:22:39.833	2026-09-16 17:22:39.858
cmu4ddr7v00107tlsba7y7mkr	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cwcqj000i7tls7y5rvi6v", "idempotencyKey": "13beabfe-f045-4c79-b04b-8c0412b591fb"}	13beabfe-f045-4c79-b04b-8c0412b591fb	APPLIED	\N	2026-09-16 17:23:41.707	2026-09-16 17:23:41.729
cmu4dec0400117tlsqh7dc8vx	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4czjeu000o7tls4rp5nxrt", "idempotencyKey": "fe1dc15d-7eff-44c4-8901-c439b0c6ae0e"}	fe1dc15d-7eff-44c4-8901-c439b0c6ae0e	APPLIED	\N	2026-09-16 17:24:08.644	2026-09-16 17:24:08.672
cmu4dfcnq00127tlsibr4jflm	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4d042x000q7tlsym115hqz", "idempotencyKey": "cceb1e1f-7070-48ba-8ee7-28f4f23abdef"}	cceb1e1f-7070-48ba-8ee7-28f4f23abdef	APPLIED	\N	2026-09-16 17:24:56.15	2026-09-16 17:24:56.178
cmu4dfpb200137tlsh5u9mbp9	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4d042x000q7tlsym115hqz", "idempotencyKey": "3d09dbfc-0eb8-4c19-abed-e8dc50802b82"}	3d09dbfc-0eb8-4c19-abed-e8dc50802b82	APPLIED	\N	2026-09-16 17:25:12.542	2026-09-16 17:25:12.565
cmu4dfr9v00147tlscdhtjij9	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4d042x000q7tlsym115hqz", "idempotencyKey": "6aa0f37a-7718-420c-9fa9-ab03de56ca02"}	6aa0f37a-7718-420c-9fa9-ab03de56ca02	APPLIED	\N	2026-09-16 17:25:15.091	2026-09-16 17:25:15.112
cmu4dgnjq00157tls1lo9t5g7	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cwcqj000i7tls7y5rvi6v", "idempotencyKey": "75397586-49c2-4681-96a9-d7f8a4f1f6c9"}	75397586-49c2-4681-96a9-d7f8a4f1f6c9	APPLIED	\N	2026-09-16 17:25:56.918	2026-09-16 17:25:56.942
cmu4dh97v00167tlszni7ypg7	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cyt0a000m7tls1p6cxihn", "idempotencyKey": "23fed9c6-6270-41bd-818e-9bd3f4179338"}	23fed9c6-6270-41bd-818e-9bd3f4179338	APPLIED	\N	2026-09-16 17:26:25.003	2026-09-16 17:26:25.029
cmu4di0br00177tlsfuh1l66z	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cy7to000k7tls88hgr5e9", "idempotencyKey": "e2b0f099-0568-4af6-b0d8-5a3e0a7fea4d"}	e2b0f099-0568-4af6-b0d8-5a3e0a7fea4d	APPLIED	\N	2026-09-16 17:27:00.135	2026-09-16 17:27:00.162
cmu4dil7y00187tls0lhpwg2h	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cyt0a000m7tls1p6cxihn", "idempotencyKey": "66c2c44e-37d5-4e1b-8d3b-4457eda77f8d"}	66c2c44e-37d5-4e1b-8d3b-4457eda77f8d	APPLIED	\N	2026-09-16 17:27:27.214	2026-09-16 17:27:27.234
cmu4djb1c00197tlsnuo5zbai	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cveay000g7tls9p7pzaum", "idempotencyKey": "6c0ff126-70c2-4c03-8d61-c079d63a5519"}	6c0ff126-70c2-4c03-8d61-c079d63a5519	APPLIED	\N	2026-09-16 17:28:00.672	2026-09-16 17:28:00.693
cmu4djz7i001a7tls3o0iipgz	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4czjeu000o7tls4rp5nxrt", "idempotencyKey": "3230cea8-704d-4302-86d3-823716f8c379"}	3230cea8-704d-4302-86d3-823716f8c379	APPLIED	\N	2026-09-16 17:28:31.998	2026-09-16 17:28:32.03
cmu4dkty2001b7tlswz4ievnk	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cwcqj000i7tls7y5rvi6v", "idempotencyKey": "80c96b8c-1ecf-4485-a006-3bdd023b7c2e"}	80c96b8c-1ecf-4485-a006-3bdd023b7c2e	APPLIED	\N	2026-09-16 17:29:11.834	2026-09-16 17:29:11.862
cmu4dl2vo001c7tlsv7krhlzw	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4czjeu000o7tls4rp5nxrt", "idempotencyKey": "74204dd1-22dd-4710-9719-9a29aa6c3a9a"}	74204dd1-22dd-4710-9719-9a29aa6c3a9a	APPLIED	\N	2026-09-16 17:29:23.412	2026-09-16 17:29:23.435
cmu4dlfiz001d7tlsgreko9yc	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4czjeu000o7tls4rp5nxrt", "idempotencyKey": "b45a7d9a-fb46-4406-a512-341adf8a6caf"}	b45a7d9a-fb46-4406-a512-341adf8a6caf	APPLIED	\N	2026-09-16 17:29:39.803	2026-09-16 17:29:39.825
cmu4dlkno001e7tls8ygs9e6n	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4czjeu000o7tls4rp5nxrt", "idempotencyKey": "135385c7-a077-4b13-886f-752956834327"}	135385c7-a077-4b13-886f-752956834327	APPLIED	\N	2026-09-16 17:29:46.452	2026-09-16 17:29:46.478
cmu4dmabq001f7tlspg0bhaei	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cy7to000k7tls88hgr5e9", "idempotencyKey": "d4c8ec48-e288-4136-ba47-7b5c2134847d"}	d4c8ec48-e288-4136-ba47-7b5c2134847d	APPLIED	\N	2026-09-16 17:30:19.718	2026-09-16 17:30:19.748
cmu4dmrkn001g7tlsmk6dysoi	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cwcqj000i7tls7y5rvi6v", "idempotencyKey": "97e542f5-b9da-46e8-afb8-846336afce99"}	97e542f5-b9da-46e8-afb8-846336afce99	APPLIED	\N	2026-09-16 17:30:42.071	2026-09-16 17:30:42.098
cmu4dn84e001h7tlsnwd798ka	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cveay000g7tls9p7pzaum", "idempotencyKey": "d5029626-1d10-48cc-a54f-d59d4161c047"}	d5029626-1d10-48cc-a54f-d59d4161c047	APPLIED	\N	2026-09-16 17:31:03.518	2026-09-16 17:31:03.544
cmu4dnlgq001i7tlsof70yfvy	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/courses/cmu4cyt0a000m7tls1p6cxihn", "idempotencyKey": "df11f22a-2334-4f97-80b1-a396de0c5a74"}	df11f22a-2334-4f97-80b1-a396de0c5a74	APPLIED	\N	2026-09-16 17:31:20.81	2026-09-16 17:31:20.838
cmucflpot00002mlsznq2gy97	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmucd0ake0002ellsk1b5sbr6/resolve", "idempotencyKey": "c73f6181-c690-4102-9e2d-cad35770e57c"}	c73f6181-c690-4102-9e2d-cad35770e57c	APPLIED	\N	2026-09-22 08:48:01.618	2026-09-22 08:48:02.2
cmucflqxj00022mlsatikcyxu	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmucd0ajk0000ells4mjfbfyr/resolve", "idempotencyKey": "2a17810f-e54a-4a2e-ace0-e231ac7617af"}	2a17810f-e54a-4a2e-ace0-e231ac7617af	APPLIED	\N	2026-09-22 08:48:03.223	2026-09-22 08:48:03.825
cmucflrhn00042mlsha7yfiwi	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmucd0ak40001ells3eiafd64/resolve", "idempotencyKey": "33ea477a-64b5-49ee-bc54-b92e65665a0f"}	33ea477a-64b5-49ee-bc54-b92e65665a0f	APPLIED	\N	2026-09-22 08:48:03.948	2026-09-22 08:48:04.027
cmucflsps00062mlss2zaw23o	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmucd0akl0003ells4lhjjuh4/resolve", "idempotencyKey": "f167aa5e-754d-441e-b2ac-f08c74149dfc"}	f167aa5e-754d-441e-b2ac-f08c74149dfc	APPLIED	\N	2026-09-22 08:48:05.536	2026-09-22 08:48:05.588
cmucfub5700009jls6br8uh5k	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/tasks", "idempotencyKey": "3a8162d4-d5ae-4d38-bfe3-423ca8c5a839"}	3a8162d4-d5ae-4d38-bfe3-423ca8c5a839	APPLIED	\N	2026-09-22 08:54:42.667	2026-09-22 08:54:42.691
cmucg4a0e00029jls6200bde4	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/tasks/6641e112-1dcc-48cc-97ae-5b968fcdc408", "idempotencyKey": "9a7a2434-ea99-4bb4-8087-1c2886e0d306"}	9a7a2434-ea99-4bb4-8087-1c2886e0d306	APPLIED	\N	2026-09-22 09:02:27.758	2026-09-22 09:02:27.765
cmucg4mkh00039jlsx6omuvhy	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/tasks/6641e112-1dcc-48cc-97ae-5b968fcdc408", "idempotencyKey": "5fd62238-47cf-4525-b498-b4d6a829af57"}	5fd62238-47cf-4525-b498-b4d6a829af57	APPLIED	\N	2026-09-22 09:02:44.033	2026-09-22 09:02:44.037
cmucg7v4900049jls6iwz8ag4	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/tasks/6641e112-1dcc-48cc-97ae-5b968fcdc408/complete", "idempotencyKey": "3f7a0b12-43ed-47a1-ad4e-09b1434fb46f"}	3f7a0b12-43ed-47a1-ad4e-09b1434fb46f	APPLIED	\N	2026-09-22 09:05:15.081	2026-09-22 09:05:15.105
cmucheq7o00071rlsyw3kdux4	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "761de18b-affa-4d64-aaff-aeb261a8645a"}	761de18b-affa-4d64-aaff-aeb261a8645a	APPLIED	\N	2026-09-22 09:38:34.932	2026-09-22 09:38:34.944
cmuchhfph000a1rlsyrbroyxr	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmucheq7v00081rlswsblp79p/end", "idempotencyKey": "4086053a-c0e4-416b-9de9-e971e26f20d5"}	4086053a-c0e4-416b-9de9-e971e26f20d5	APPLIED	\N	2026-09-22 09:40:41.285	2026-09-22 09:40:41.304
cmuchiw4a000c1rlsu0mdfd0n	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/tasks", "idempotencyKey": "e602716c-51b0-41da-a3e8-d269a73d5c87"}	e602716c-51b0-41da-a3e8-d269a73d5c87	APPLIED	\N	2026-09-22 09:41:49.21	2026-09-22 09:41:49.232
cmuchj56q000e1rls42yjv7mu	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "97b917b8-c1c9-4df1-944a-559b99535ee7"}	97b917b8-c1c9-4df1-944a-559b99535ee7	APPLIED	\N	2026-09-22 09:42:00.963	2026-09-22 09:42:00.972
cmuchj9zh000h1rls2092pxfj	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmuchj56w000f1rls1u0wu1ms/end", "idempotencyKey": "07b98035-b89f-4d4b-bc49-e484a7419dbe"}	07b98035-b89f-4d4b-bc49-e484a7419dbe	APPLIED	\N	2026-09-22 09:42:07.181	2026-09-22 09:42:07.202
cmucieghc000j1rlsm301r4ro	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "eec2746d-2e4d-4b95-be0a-feb8c20b7f01"}	eec2746d-2e4d-4b95-be0a-feb8c20b7f01	APPLIED	\N	2026-09-22 10:06:21.936	2026-09-22 10:06:21.945
cmucieklo000m1rlsp2dm3klh	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "e22b3eb2-7da1-4a52-97a4-a36e7caa4508"}	e22b3eb2-7da1-4a52-97a4-a36e7caa4508	APPLIED	\N	2026-09-22 10:06:27.276	2026-09-22 10:06:27.284
cmucievhq000p1rlsi2sx16bt	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmucieklt000n1rlsxiothfoj/end", "idempotencyKey": "316abd59-1907-4424-b260-7977e9c0d3de"}	316abd59-1907-4424-b260-7977e9c0d3de	APPLIED	\N	2026-09-22 10:06:41.39	2026-09-22 10:06:41.401
cmuciie9c000r1rls25tuquj9	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "9f7b9ed2-4b8a-4b81-9586-b64e57c9d66a"}	9f7b9ed2-4b8a-4b81-9586-b64e57c9d66a	APPLIED	\N	2026-09-22 10:09:25.68	2026-09-22 10:09:25.695
cmuclsfyw000u1rls3enjvf4j	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "87178c1f-956e-4d5c-8449-ee68dc86677d"}	87178c1f-956e-4d5c-8449-ee68dc86677d	APPLIED	\N	2026-09-22 11:41:13.304	2026-09-22 11:41:13.321
cmuclu6aj000x1rls1ndkds0l	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmuclsfz5000v1rlsjde6c2fm/end", "idempotencyKey": "d022ad87-877e-444e-92aa-2a8bdced6453"}	d022ad87-877e-444e-92aa-2a8bdced6453	APPLIED	\N	2026-09-22 11:42:34.075	2026-09-22 11:42:34.086
cmucluev1000z1rls7lv26pev	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "4393fe92-2e44-4588-9e70-91bd9880255f"}	4393fe92-2e44-4588-9e70-91bd9880255f	APPLIED	\N	2026-09-22 11:42:45.181	2026-09-22 11:42:45.19
cmucm17l200121rls5z4fepgu	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "e8c5e6d4-4e8d-4fc0-8c3a-b1419115b114"}	e8c5e6d4-4e8d-4fc0-8c3a-b1419115b114	APPLIED	\N	2026-09-22 11:48:02.342	2026-09-22 11:48:02.352
cmucm5fu200151rlst2w43uqm	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmucm17l700131rlstzcn3ohg/end", "idempotencyKey": "d0ac0936-02b8-4836-8992-e53e5639e46b"}	d0ac0936-02b8-4836-8992-e53e5639e46b	APPLIED	\N	2026-09-22 11:51:19.658	2026-09-22 11:51:19.67
cmufiwcp80005hxlsyytl6y35	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmufivs090000hxls1ek2ed42/resolve", "idempotencyKey": "ae7c6790-d43d-450e-8033-cd035e70f68d"}	ae7c6790-d43d-450e-8033-cd035e70f68d	APPLIED	\N	2026-09-24 12:43:35.372	2026-09-24 12:43:35.443
cmufiwdpe0007hxlsorcq9opn	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmufivs2z0003hxls5i375dn7/resolve", "idempotencyKey": "a70aa776-a070-49c3-981a-daa7a0c468b7"}	a70aa776-a070-49c3-981a-daa7a0c468b7	APPLIED	\N	2026-09-24 12:43:36.674	2026-09-24 12:43:36.705
cmufiweyc0009hxlstxstcqju	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmufivs2g0002hxlscyfzhqzo/resolve", "idempotencyKey": "62f3b657-b436-46c0-bb4c-3933b60980ea"}	62f3b657-b436-46c0-bb4c-3933b60980ea	APPLIED	\N	2026-09-24 12:43:38.292	2026-09-24 12:43:38.319
cmufiwg9h000bhxls6m66ik8k	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmufivs1w0001hxlsntvbkgv3/resolve", "idempotencyKey": "aff40af7-2a23-477f-a232-c58bd92c271b"}	aff40af7-2a23-477f-a232-c58bd92c271b	APPLIED	\N	2026-09-24 12:43:39.989	2026-09-24 12:43:40.016
cmufiwh9h000dhxls8iwhtjw3	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/attendance/cmufivs3f0004hxlsv8lc9pdh/resolve", "idempotencyKey": "34efe9ec-7d09-4b6a-a168-b724c97b1e80"}	34efe9ec-7d09-4b6a-a168-b724c97b1e80	APPLIED	\N	2026-09-24 12:43:41.285	2026-09-24 12:43:41.312
cmufiy9sq000fhxlsypwgajs3	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "c346de8a-e569-47f7-88f9-0f43d452b27c"}	c346de8a-e569-47f7-88f9-0f43d452b27c	APPLIED	\N	2026-09-24 12:45:04.922	2026-09-24 12:45:04.973
cmufkowmo0000swls7tprf7he	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "cd093e5a-5283-4d23-b0de-369e6a5ac1f1"}	cd093e5a-5283-4d23-b0de-369e6a5ac1f1	APPLIED	\N	2026-09-24 13:33:47.185	2026-09-24 13:33:47.297
cmufkp3ah0003swls9o0tr8dg	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmufkowoo0001swlsk9d44jig/end", "idempotencyKey": "4b37ae2a-9f19-4504-b876-72a36fa4a7bb"}	4b37ae2a-9f19-4504-b876-72a36fa4a7bb	APPLIED	\N	2026-09-24 13:33:55.817	2026-09-24 13:33:55.875
cmufkpz9u0005swlspmpqs8fg	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "f8629e2c-9b19-45f7-90b0-9e6d69db79b8"}	f8629e2c-9b19-45f7-90b0-9e6d69db79b8	APPLIED	\N	2026-09-24 13:34:37.267	2026-09-24 13:34:37.31
cmufqrex00008swlslsq984os	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmufkpzaf0006swlszdsg71e7/end", "idempotencyKey": "272c042e-3876-4758-aa6e-753bdb5e5fea"}	272c042e-3876-4758-aa6e-753bdb5e5fea	APPLIED	\N	2026-09-24 16:23:41.894	2026-09-24 16:23:41.968
cmufqwss0000aswlsc4mppqwa	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "0c26d805-d433-4af6-8a32-a70b79e8001f"}	0c26d805-d433-4af6-8a32-a70b79e8001f	APPLIED	\N	2026-09-24 16:27:53.136	2026-09-24 16:27:53.171
cmufri0ha000dswlsw1gtvwcn	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmufqwssj000bswlsj2j7657g/end", "idempotencyKey": "5c749304-608b-4935-a95f-779f5f44e645"}	5c749304-608b-4935-a95f-779f5f44e645	APPLIED	\N	2026-09-24 16:44:22.894	2026-09-24 16:44:22.967
cmufri2xq000fswlsg51qvw4d	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "5b63d30d-7463-4dbe-849d-3a4971f74925"}	5b63d30d-7463-4dbe-849d-3a4971f74925	APPLIED	\N	2026-09-24 16:44:26.078	2026-09-24 16:44:26.113
cmufria2h000iswlsifvhrkun	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmufri2y9000gswlspvflswo3/end", "idempotencyKey": "3d5d72e4-03e0-48fb-9fbf-6c2a80fd4f46"}	3d5d72e4-03e0-48fb-9fbf-6c2a80fd4f46	APPLIED	\N	2026-09-24 16:44:35.321	2026-09-24 16:44:35.351
cmufrikf3000kswlsjt830maa	cmu4clecz000c7tls0er85lln	POST	{"path": "/api/pomodoro", "idempotencyKey": "e18c2cb4-73c3-4e4d-9717-aadd8d317edb"}	e18c2cb4-73c3-4e4d-9717-aadd8d317edb	APPLIED	\N	2026-09-24 16:44:48.736	2026-09-24 16:44:48.762
cmufseq4k000nswls03b2d68o	cmu4clecz000c7tls0er85lln	PATCH	{"path": "/api/pomodoro/cmufrikfi000lswlsmlh1vh5o/end", "idempotencyKey": "b7fefdf5-c99d-48bb-b642-72ee9188d0a9"}	b7fefdf5-c99d-48bb-b642-72ee9188d0a9	APPLIED	\N	2026-09-24 17:09:49.125	2026-09-24 17:09:49.214
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
6c82fe23-14e9-4d7c-93e8-a18d120efdc2	6fa1b271ccf9d640836a3adfba7feca25522ba21635fbb56bb8e32b4fd1d6513	2026-09-22 07:17:30.540119+00	20260915152548_init		\N	2026-09-22 07:17:30.540119+00	0
a9ff9bf0-df86-43ba-9d70-586899026499	899f17efd84b78ff1cbbd02ff21437f7ee41afd2e14e79ecf960d31ca2c3bcaf	2026-09-22 07:17:34.115073+00	20260915164854_calendar_local_events		\N	2026-09-22 07:17:34.115073+00	0
d7c9ccb3-9698-45fa-9a01-ec5ed093f016	47532cfeca70d3b13f184ae74273e85c6119f96ae1897820ff2452b567f39305	2026-09-22 07:17:36.916246+00	20260915181119_user_name		\N	2026-09-22 07:17:36.916246+00	0
bc93ecd7-49e3-40dd-9515-6eb4f40d00f6	6b8bcb1c381b40f6a99f4f6324d683e13db3a0e029c7313a428d6dca628b3793	2026-09-22 07:21:14.972148+00	20260922072102_phase1_events	\N	\N	2026-09-22 07:21:14.905311+00	1
4bd90c92-7ad8-4165-929c-f907752addd0	4ebaea9774ba1f7f57baf263dd823b7a885c064bd976a517e04289cdd9d0bfbe	2026-09-22 09:12:09.093904+00	20260922091123_phase4_zen	\N	\N	2026-09-22 09:12:09.037295+00	1
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_records (id, "userId", "courseId", date, status, "confirmedAt", "createdAt", "updatedAt") FROM stdin;
cmucd0ake0002ellsk1b5sbr6	cmu4clecz000c7tls0er85lln	cmu4cveay000g7tls9p7pzaum	2026-09-22	MISSED	2026-09-22 08:48:01.714	2026-09-22 07:35:23.006	2026-09-22 08:48:01.758
cmucd0ajk0000ells4mjfbfyr	cmu4clecz000c7tls0er85lln	cmu4cy7to000k7tls88hgr5e9	2026-09-22	MISSED	2026-09-22 08:48:03.397	2026-09-22 07:35:22.977	2026-09-22 08:48:03.486
cmucd0ak40001ells3eiafd64	cmu4clecz000c7tls0er85lln	cmu4cwcqj000i7tls7y5rvi6v	2026-09-22	MISSED	2026-09-22 08:48:03.978	2026-09-22 07:35:22.996	2026-09-22 08:48:03.98
cmucd0akl0003ells4lhjjuh4	cmu4clecz000c7tls0er85lln	cmu4czjeu000o7tls4rp5nxrt	2026-09-22	MISSED	2026-09-22 08:48:05.559	2026-09-22 07:35:23.013	2026-09-22 08:48:05.561
cmufivs090000hxls1ek2ed42	cmu4clecz000c7tls0er85lln	cmu4cy7to000k7tls88hgr5e9	2026-09-24	MISSED	2026-09-24 12:43:35.404	2026-09-24 12:43:08.553	2026-09-24 12:43:35.418
cmufivs2z0003hxls5i375dn7	cmu4clecz000c7tls0er85lln	cmu4cyt0a000m7tls1p6cxihn	2026-09-24	MISSED	2026-09-24 12:43:36.689	2026-09-24 12:43:08.651	2026-09-24 12:43:36.691
cmufivs2g0002hxlscyfzhqzo	cmu4clecz000c7tls0er85lln	cmu4cveay000g7tls9p7pzaum	2026-09-24	ATTENDED	2026-09-24 12:43:38.305	2026-09-24 12:43:08.632	2026-09-24 12:43:38.308
cmufivs1w0001hxlsntvbkgv3	cmu4clecz000c7tls0er85lln	cmu4cwcqj000i7tls7y5rvi6v	2026-09-24	ATTENDED	2026-09-24 12:43:40.001	2026-09-24 12:43:08.612	2026-09-24 12:43:40.002
cmufivs3f0004hxlsv8lc9pdh	cmu4clecz000c7tls0er85lln	cmu4czjeu000o7tls4rp5nxrt	2026-09-24	ATTENDED	2026-09-24 12:43:41.298	2026-09-24 12:43:08.668	2026-09-24 12:43:41.299
\.


--
-- Data for Name: calendar_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.calendar_events (id, "userId", source, "googleEventId", "sourceCalendarId", title, description, "startTime", "endTime", "allDay", location, color, "isDedupedDuplicate", "isDeleted", "googleUpdatedAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.courses (id, "userId", name, code, schedule, "attendanceThreshold", "createdAt", "updatedAt") FROM stdin;
cmu4cy7to000k7tls88hgr5e9	cmu4clecz000c7tls0er85lln	Digital Communication	EC353IA	[{"endTime": "11:00", "dayOfWeek": 1, "startTime": "10:00"}, {"endTime": "11:00", "dayOfWeek": 2, "startTime": "10:00"}, {"endTime": "10:00", "dayOfWeek": 4, "startTime": "09:00"}, {"endTime": "12:30", "dayOfWeek": 5, "startTime": "11:30"}]	80	2026-09-16 17:11:36.732	2026-09-16 17:30:19.737
cmu4cwcqj000i7tls7y5rvi6v	cmu4clecz000c7tls0er85lln	Digital VLSI	EC352IA	[{"endTime": "12:30", "dayOfWeek": 2, "startTime": "11:30"}, {"endTime": "12:30", "dayOfWeek": 3, "startTime": "11:30"}, {"endTime": "13:30", "dayOfWeek": 4, "startTime": "12:30"}, {"endTime": "13:30", "dayOfWeek": 5, "startTime": "12:30"}]	80	2026-09-16 17:10:09.788	2026-09-16 17:30:42.086
cmu4d0pag000s7tlsngd6udpp	cmu4clecz000c7tls0er85lln	Communication LAB	\N	[{"endTime": "13:30", "dayOfWeek": 1, "startTime": "11:30"}]	80	2026-09-16 17:13:32.68	2026-09-16 17:15:58.956
cmu4cveay000g7tls9p7pzaum	cmu4clecz000c7tls0er85lln	Entrepreneurship	HS351TA	[{"endTime": "10:00", "dayOfWeek": 2, "startTime": "09:00"}, {"endTime": "12:30", "dayOfWeek": 4, "startTime": "11:30"}, {"endTime": "15:30", "dayOfWeek": 5, "startTime": "14:30"}]	80	2026-09-16 17:09:25.162	2026-09-16 17:31:03.536
cmu4cyt0a000m7tls1p6cxihn	cmu4clecz000c7tls0er85lln	Embedded System	EC345TA	[{"endTime": "10:00", "dayOfWeek": 1, "startTime": "09:00"}, {"endTime": "13:30", "dayOfWeek": 3, "startTime": "12:30"}, {"endTime": "11:00", "dayOfWeek": 4, "startTime": "10:00"}, {"endTime": "16:30", "dayOfWeek": 5, "startTime": "15:30"}]	80	2026-09-16 17:12:04.186	2026-09-16 17:31:20.829
cmu4d042x000q7tlsym115hqz	cmu4clecz000c7tls0er85lln	VLSI LAB	\N	[{"endTime": "11:00", "dayOfWeek": 3, "startTime": "09:00"}]	80	2026-09-16 17:13:05.193	2026-09-16 17:25:15.104
cmu4czjeu000o7tls4rp5nxrt	cmu4clecz000c7tls0er85lln	Computer Architecture	EC355TBF	[{"endTime": "13:30", "dayOfWeek": 2, "startTime": "12:30"}, {"endTime": "15:30", "dayOfWeek": 3, "startTime": "14:30"}, {"endTime": "15:30", "dayOfWeek": 4, "startTime": "14:30"}]	80	2026-09-16 17:12:38.406	2026-09-16 17:29:46.469
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, "userId", type, "occurredAt", payload) FROM stdin;
cmucflq1900012mlslz1vls8q	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-22 08:48:01.927	{"date": "2026-09-22", "status": "MISSED", "courseId": "cmu4cveay000g7tls9p7pzaum", "recordId": "cmucd0ake0002ellsk1b5sbr6"}
cmucflre200032mlsbgxiefz5	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-22 08:48:03.765	{"date": "2026-09-22", "status": "MISSED", "courseId": "cmu4cy7to000k7tls88hgr5e9", "recordId": "cmucd0ajk0000ells4mjfbfyr"}
cmucflrjn00052mlsn2fv5dzc	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-22 08:48:04.01	{"date": "2026-09-22", "status": "MISSED", "courseId": "cmu4cwcqj000i7tls7y5rvi6v", "recordId": "cmucd0ak40001ells3eiafd64"}
cmucflsr700072mls2z8l2qx0	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-22 08:48:05.58	{"date": "2026-09-22", "status": "MISSED", "courseId": "cmu4czjeu000o7tls4rp5nxrt", "recordId": "cmucd0akl0003ells4lhjjuh4"}
cmucfub5v00019jlsaooudnnt	cmu4clecz000c7tls0er85lln	TASK_CREATED	2026-09-22 08:54:42.69	{"title": "Gym", "taskId": "6641e112-1dcc-48cc-97ae-5b968fcdc408", "dueDate": "2026-09-22", "courseId": null, "priority": "LOW", "recurrenceRule": null}
cmucg7v4x00059jls04qup623	cmu4clecz000c7tls0er85lln	TASK_COMPLETED	2026-09-22 09:05:15.103	{"title": "Gym", "taskId": "6641e112-1dcc-48cc-97ae-5b968fcdc408"}
cmucheq8000091rlse0w5sojl	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 09:38:34.943	{"taskId": null, "sessionId": "cmucheq7v00081rlswsblp79p", "plannedMinutes": 25}
cmuchhfq0000b1rls7qywpevl	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-22 09:40:41.3	{"taskId": null, "sessionId": "cmucheq7v00081rlswsblp79p", "plannedMinutes": 25}
cmuchiw4w000d1rlsxug7jivd	cmu4clecz000c7tls0er85lln	TASK_CREATED	2026-09-22 09:41:49.232	{"title": "Exams", "taskId": "c73f6d06-9716-461b-877e-d96401c80fd7", "dueDate": null, "courseId": null, "priority": "MEDIUM", "recurrenceRule": null}
cmuchj570000g1rlsf782tm9b	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 09:42:00.972	{"taskId": "c73f6d06-9716-461b-877e-d96401c80fd7", "sessionId": "cmuchj56w000f1rls1u0wu1ms", "plannedMinutes": 25}
cmuchja01000i1rls33e20dk3	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-22 09:42:07.2	{"taskId": "c73f6d06-9716-461b-877e-d96401c80fd7", "sessionId": "cmuchj56w000f1rls1u0wu1ms", "plannedMinutes": 25}
cmucieghk000l1rlsukycsii6	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 10:06:21.944	{"taskId": null, "sessionId": "cmucieghg000k1rlsu0xwmacl", "plannedMinutes": 25}
cmucieklw000o1rls81xwbw4m	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 10:06:27.284	{"taskId": null, "sessionId": "cmucieklt000n1rlsxiothfoj", "plannedMinutes": 25}
cmucievi1000q1rlspdn2z19h	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-22 10:06:41.401	{"taskId": null, "sessionId": "cmucieklt000n1rlsxiothfoj", "plannedMinutes": 25}
cmuciie9r000t1rlsbg9v9zez	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 10:09:25.694	{"taskId": null, "sessionId": "cmuciie9l000s1rls4762qe96", "plannedMinutes": 25}
cmuclsfzc000w1rlsdox4rq1j	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 11:41:13.319	{"taskId": null, "sessionId": "cmuclsfz5000v1rlsjde6c2fm", "plannedMinutes": 25}
cmuclu6au000y1rlsbvw1tinc	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-22 11:42:34.086	{"taskId": null, "sessionId": "cmuclsfz5000v1rlsjde6c2fm", "plannedMinutes": 25}
cmucluev900111rlsf2sxf242	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 11:42:45.189	{"taskId": null, "sessionId": "cmucluev500101rlsqwnr6q3i", "plannedMinutes": 60}
cmucm17lc00141rlswzj1a1c7	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-22 11:48:02.351	{"taskId": null, "sessionId": "cmucm17l700131rlstzcn3ohg", "plannedMinutes": 25}
cmucm5fud00161rls01kqzcbg	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-22 11:51:19.669	{"taskId": null, "sessionId": "cmucm17l700131rlstzcn3ohg", "plannedMinutes": 25}
cmufiwcr50006hxlsr85o0mhm	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-24 12:43:35.435	{"date": "2026-09-24", "status": "MISSED", "courseId": "cmu4cy7to000k7tls88hgr5e9", "recordId": "cmufivs090000hxls1ek2ed42"}
cmufiwdq80008hxlsswr678l6	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-24 12:43:36.703	{"date": "2026-09-24", "status": "MISSED", "courseId": "cmu4cyt0a000m7tls1p6cxihn", "recordId": "cmufivs2z0003hxls5i375dn7"}
cmufiwez2000ahxlskse49gly	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-24 12:43:38.317	{"date": "2026-09-24", "status": "ATTENDED", "courseId": "cmu4cveay000g7tls9p7pzaum", "recordId": "cmufivs2g0002hxlscyfzhqzo"}
cmufiwga7000chxlshwa6g1jc	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-24 12:43:40.014	{"date": "2026-09-24", "status": "ATTENDED", "courseId": "cmu4cwcqj000i7tls7y5rvi6v", "recordId": "cmufivs1w0001hxlsntvbkgv3"}
cmufiwha8000ehxls00x0fg6n	cmu4clecz000c7tls0er85lln	ATTENDANCE_RECORDED	2026-09-24 12:43:41.31	{"date": "2026-09-24", "status": "ATTENDED", "courseId": "cmu4czjeu000o7tls4rp5nxrt", "recordId": "cmufivs3f0004hxlsv8lc9pdh"}
cmufiy9u4000hhxlspxxd7jaf	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-24 12:45:04.966	{"taskId": null, "sessionId": "cmufiy9ti000ghxls1cpcq9vo", "plannedMinutes": 45}
cmufkowpq0002swlsrz0dwbnb	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-24 13:33:47.288	{"taskId": null, "sessionId": "cmufkowoo0001swlsk9d44jig", "plannedMinutes": 25}
cmufkp3c10004swls0yuoin8s	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-24 13:33:55.865	{"taskId": null, "sessionId": "cmufkowoo0001swlsk9d44jig", "plannedMinutes": 25}
cmufkpzb00007swlsz7cdy7x8	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-24 13:34:37.307	{"taskId": null, "sessionId": "cmufkpzaf0006swlszdsg71e7", "plannedMinutes": 25}
cmufqrez20009swlsnb3daeew	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-24 16:23:41.963	{"taskId": null, "sessionId": "cmufkpzaf0006swlszdsg71e7", "plannedMinutes": 25}
cmufqwssy000cswlshxbq1vmq	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-24 16:27:53.168	{"taskId": null, "sessionId": "cmufqwssj000bswlsj2j7657g", "plannedMinutes": 25}
cmufri0j8000eswlszx3b07gz	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-24 16:44:22.957	{"taskId": null, "sessionId": "cmufqwssj000bswlsj2j7657g", "plannedMinutes": 25}
cmufri2yo000hswls6tm42qb4	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-24 16:44:26.11	{"taskId": null, "sessionId": "cmufri2y9000gswlspvflswo3", "plannedMinutes": 25}
cmufria38000jswlsreodt7eu	cmu4clecz000c7tls0er85lln	FOCUS_CANCELLED	2026-09-24 16:44:35.346	{"taskId": null, "sessionId": "cmufri2y9000gswlspvflswo3", "plannedMinutes": 25}
cmufrikft000mswlswkuia6u3	cmu4clecz000c7tls0er85lln	FOCUS_STARTED	2026-09-24 16:44:48.76	{"taskId": null, "sessionId": "cmufrikfi000lswlsmlh1vh5o", "plannedMinutes": 25}
cmufseq70000oswlssn7oa9fd	cmu4clecz000c7tls0er85lln	FOCUS_COMPLETED	2026-09-24 17:09:49.17	{"taskId": null, "sessionId": "cmufrikfi000lswlsmlh1vh5o", "plannedMinutes": 25}
\.


--
-- Data for Name: linked_google_calendars; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.linked_google_calendars (id, "userId", summary, "backgroundColor", "accessRole", "isLinked") FROM stdin;
\.


--
-- Data for Name: pomodoro_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pomodoro_sessions (id, "userId", "taskId", "startedAt", "durationMinutes", completed, "createdAt") FROM stdin;
cmu4clsp6000e7tlso72jf9m3	cmu4clecz000c7tls0er85lln	\N	2026-09-16 17:01:57.255	25	f	2026-09-16 17:01:57.258
cmucheq7v00081rlswsblp79p	cmu4clecz000c7tls0er85lln	\N	2026-09-22 09:38:34.938	25	f	2026-09-22 09:38:34.939
cmuchj56w000f1rls1u0wu1ms	cmu4clecz000c7tls0er85lln	c73f6d06-9716-461b-877e-d96401c80fd7	2026-09-22 09:42:00.968	25	f	2026-09-22 09:42:00.968
cmucieghg000k1rlsu0xwmacl	cmu4clecz000c7tls0er85lln	\N	2026-09-22 10:06:21.94	25	f	2026-09-22 10:06:21.94
cmucieklt000n1rlsxiothfoj	cmu4clecz000c7tls0er85lln	\N	2026-09-22 10:06:27.28	25	f	2026-09-22 10:06:27.281
cmuciie9l000s1rls4762qe96	cmu4clecz000c7tls0er85lln	\N	2026-09-22 10:09:25.688	25	f	2026-09-22 10:09:25.689
cmuclsfz5000v1rlsjde6c2fm	cmu4clecz000c7tls0er85lln	\N	2026-09-22 11:41:13.312	25	f	2026-09-22 11:41:13.313
cmucluev500101rlsqwnr6q3i	cmu4clecz000c7tls0er85lln	\N	2026-09-22 11:42:45.185	60	f	2026-09-22 11:42:45.185
cmucm17l700131rlstzcn3ohg	cmu4clecz000c7tls0er85lln	\N	2026-09-22 11:48:02.347	25	f	2026-09-22 11:48:02.347
cmufiy9ti000ghxls1cpcq9vo	cmu4clecz000c7tls0er85lln	\N	2026-09-24 12:45:04.945	45	f	2026-09-24 12:45:04.95
cmufkowoo0001swlsk9d44jig	cmu4clecz000c7tls0er85lln	\N	2026-09-24 13:33:47.243	25	f	2026-09-24 13:33:47.256
cmufkpzaf0006swlszdsg71e7	cmu4clecz000c7tls0er85lln	\N	2026-09-24 13:34:37.285	25	f	2026-09-24 13:34:37.287
cmufqwssj000bswlsj2j7657g	cmu4clecz000c7tls0er85lln	\N	2026-09-24 16:27:53.154	25	f	2026-09-24 16:27:53.155
cmufri2y9000gswlspvflswo3	cmu4clecz000c7tls0er85lln	\N	2026-09-24 16:44:26.096	25	f	2026-09-24 16:44:26.097
cmufrikfi000lswlsmlh1vh5o	cmu4clecz000c7tls0er85lln	\N	2026-09-24 16:44:48.749	25	t	2026-09-24 16:44:48.75
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, "userId", title, notes, "dueDate", "dueTime", completed, "completedAt", "deletedAt", priority, "recurrenceRule", "lastCompletedOccurrence", "createdAt", "updatedAt", "courseId") FROM stdin;
6641e112-1dcc-48cc-97ae-5b968fcdc408	cmu4clecz000c7tls0er85lln	Gym	\N	2026-09-22	19:00	t	2026-09-22 09:05:15.091	\N	LOW	\N	\N	2026-09-22 08:54:42.682	2026-09-22 09:05:15.094	\N
c73f6d06-9716-461b-877e-d96401c80fd7	cmu4clecz000c7tls0er85lln	Exams	\N	\N	12:00	f	\N	\N	MEDIUM	\N	\N	2026-09-22 09:41:49.222	2026-09-22 09:41:49.222	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, "passwordHash", "authProvider", "googleRefreshToken", "googleAccessToken", "googleTokenExpiresAt", "fcmToken", "attendanceAutoMarkHours", "pomodoroWorkMinutes", "pomodoroBreakMinutes", "chimeOnTheHour", "onboardingComplete", "createdAt", "updatedAt", "pomodoroLongBreakMinutes", "pomodoroSessionsPerCycle") FROM stdin;
cmu4clecz000c7tls0er85lln	chiragrkaranth@gmail.com	Chirag R Karanth	$2b$12$9vQvRtAzohRCtZJAfNjHwe7a2zG9mR7tMOIPjcrgikl9HmM0W6Mke	PASSWORD	\N	\N	\N	\N	\N	\N	\N	t	t	2026-09-16 17:01:38.675	2026-09-22 08:47:17.64	\N	\N
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
-- Name: calendar_events_userId_googleEventId_sourceCalendarId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "calendar_events_userId_googleEventId_sourceCalendarId_key" ON public.calendar_events USING btree ("userId", "googleEventId", "sourceCalendarId");


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
-- Name: linked_google_calendars_userId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "linked_google_calendars_userId_id_key" ON public.linked_google_calendars USING btree ("userId", id);


--
-- Name: pomodoro_sessions_userId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pomodoro_sessions_userId_startedAt_idx" ON public.pomodoro_sessions USING btree ("userId", "startedAt");


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
-- PostgreSQL database dump complete
--

\unrestrict Naph8eE5kFaak2gNoadHp5AY4nMPAKEfdkBm39Hov886bEiUp1428oKAOvXsO3o

