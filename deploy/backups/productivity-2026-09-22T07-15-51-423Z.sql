--
-- PostgreSQL database dump
--

\restrict TSVF7IJyvOpbOuy3kZpisWtIiecOCtcMAKjde91Oq8PCvOC4zcJeXSCeM9Z5Y64

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
    "updatedAt" timestamp(3) without time zone NOT NULL
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
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_records (id, "userId", "courseId", date, status, "confirmedAt", "createdAt", "updatedAt") FROM stdin;
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
-- Data for Name: linked_google_calendars; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.linked_google_calendars (id, "userId", summary, "backgroundColor", "accessRole", "isLinked") FROM stdin;
\.


--
-- Data for Name: pomodoro_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pomodoro_sessions (id, "userId", "taskId", "startedAt", "durationMinutes", completed, "createdAt") FROM stdin;
cmu4clsp6000e7tlso72jf9m3	cmu4clecz000c7tls0er85lln	\N	2026-09-16 17:01:57.255	25	f	2026-09-16 17:01:57.258
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, "userId", title, notes, "dueDate", "dueTime", completed, "completedAt", "deletedAt", priority, "recurrenceRule", "lastCompletedOccurrence", "createdAt", "updatedAt", "courseId") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, "passwordHash", "authProvider", "googleRefreshToken", "googleAccessToken", "googleTokenExpiresAt", "fcmToken", "attendanceAutoMarkHours", "pomodoroWorkMinutes", "pomodoroBreakMinutes", "chimeOnTheHour", "onboardingComplete", "createdAt", "updatedAt") FROM stdin;
cmu4clecz000c7tls0er85lln	chiragrkaranth@gmail.com	Chirag	$2b$12$9vQvRtAzohRCtZJAfNjHwe7a2zG9mR7tMOIPjcrgikl9HmM0W6Mke	PASSWORD	\N	\N	\N	\N	\N	\N	\N	t	f	2026-09-16 17:01:38.675	2026-09-16 17:02:28.948
\.


--
-- Name: PendingSync PendingSync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PendingSync"
    ADD CONSTRAINT "PendingSync_pkey" PRIMARY KEY (id);


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

\unrestrict TSVF7IJyvOpbOuy3kZpisWtIiecOCtcMAKjde91Oq8PCvOC4zcJeXSCeM9Z5Y64

