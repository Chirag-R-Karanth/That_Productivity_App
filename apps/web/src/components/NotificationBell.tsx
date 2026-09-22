"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { BellIcon, CloseIcon } from "@/components/icons";

interface EventItem {
  id: string;
  type: string;
  title: string;
  occurredAt: string;
}

const READ_KEY = "prodapp:events-read";

function readIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveRead(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* private mode */
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell({ className }: { className?: string }) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(() => readIds());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void api.get<EventItem[]>("/api/events").then((res) => {
      if ("ok" in res && res.ok) setItems(res.data);
    });
  }, [open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const unread = items.filter((i) => !read.has(i.id)).length;

  const markAllRead = () => {
    const next = new Set(read);
    for (const i of items) next.add(i.id);
    setRead(next);
    saveRead(next);
  };

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} new)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:text-text"
      >
        <BellIcon className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-medium text-text">Activity</h3>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-muted">
                No activity yet — your latest actions will appear here.
              </p>
            ) : (
              <ul>
                {items.map((i) => (
                  <li key={i.id} className="border-b border-border last:border-b-0">
                    <div className={`px-4 py-3 ${read.has(i.id) ? "" : "bg-accent-soft/40"}`}>
                      <p className="text-sm text-text">{i.title}</p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-text-muted">
                        {i.type.replace(/_/g, " ").toLowerCase()} · {timeAgo(i.occurredAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/settings?tab=data-sync"
            className="block border-t border-border px-4 py-2.5 text-xs text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Sync &amp; data settings
          </Link>
        </div>
      )}
    </div>
  );
}