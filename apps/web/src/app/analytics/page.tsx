"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ChartIcon } from "@/components/icons";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-text-muted">Trends drawn from your tasks, focus, and attendance.</p>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <ChartIcon className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-4 text-sm text-text">Insights are coming in a later phase.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
          The raw material is already being collected — performance analytics, focus logs, and attendance
          trends will surface here. For now, the live numbers live on the{" "}
          <Link href="/" className="text-accent hover:underline">Today</Link> dashboard and{" "}
          <Link href="/attendance" className="text-accent hover:underline">Attendance</Link>.
        </p>
      </div>
    </AppShell>
  );
}