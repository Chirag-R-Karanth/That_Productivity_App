"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/lib/authGate";
import { AppKeysProvider, GlobalKeys, useAppKeys } from "@/lib/appKeys";
import { SyncStatusStrip } from "@/components/SyncStatusStrip";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { Onboarding } from "@/components/Onboarding";
import {
  HomeIcon,
  TasksIcon,
  CalendarIcon,
  GraduationIcon,
  AttendanceIcon,
  TimetableIcon,
  ChartIcon,
  FocusIcon,
  SettingsIcon,
  LogoIcon,
  SearchIcon,
  MenuIcon,
  CloseIcon,
  type IconComponent,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  Icon: IconComponent;
}

const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "Work",
    items: [
      { href: "/", label: "Today", Icon: HomeIcon },
      { href: "/tasks", label: "Tasks", Icon: TasksIcon },
      { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
    ],
  },
  {
    group: "Academics",
    items: [
      { href: "/courses", label: "Courses", Icon: GraduationIcon },
      { href: "/attendance", label: "Attendance", Icon: AttendanceIcon },
      { href: "/timetable", label: "Timetable", Icon: TimetableIcon },
    ],
  },
  {
    group: "Insights",
    items: [{ href: "/analytics", label: "Analytics", Icon: ChartIcon }],
  },
];

const QUICK_ITEMS: NavItem[] = [
  { href: "/zen", label: "Focus", Icon: FocusIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

function SidebarLink({
  href,
  label,
  Icon,
  compact,
}: {
  href: string;
  label: string;
  Icon: IconComponent;
  compact: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`focus-ring flex items-center gap-3 rounded-lg text-sm transition-colors ${
        compact ? "justify-center px-0 py-2.5" : "px-3 py-2"
      } ${active ? "bg-surface-elevated font-medium text-text" : "text-text-muted hover:bg-surface-elevated/60 hover:text-text"}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!compact && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SearchButton({ className }: { className?: string }) {
  const { openPalette } = useAppKeys();
  return (
    <button
      type="button"
      onClick={openPalette}
      className={`focus-ring flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text ${className ?? ""}`}
    >
      <SearchIcon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">Search</span>
      <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">Ctrl K</kbd>
    </button>
  );
}

function SidebarContent({ compact }: { compact: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        aria-label="That Productivity App — home"
        className={`mb-5 flex items-center gap-2.5 ${compact ? "justify-center px-0" : "px-1"}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <LogoIcon className="h-[18px] w-[18px]" />
        </span>
        {!compact && (
          <span className="text-[15px] font-semibold leading-tight tracking-tight">That Productivity App</span>
        )}
      </Link>

      {compact ? (
        <div className="mb-4 flex justify-center">
          <SearchButton className="w-9 justify-center gap-0 px-0" />
        </div>
      ) : (
        <SearchButton className="mb-6" />
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((g) => (
          <div key={g.group}>
            {!compact && (
              <h2 className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                {g.group}
              </h2>
            )}
            {compact && g.group !== "Work" && <div className="mx-2 mb-3 border-t border-border" />}
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <SidebarLink key={item.href} {...item} compact={compact} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-5 border-t border-border pt-3 space-y-0.5">
        {QUICK_ITEMS.map((item) => (
          <SidebarLink key={item.href} {...item} compact={compact} />
        ))}
        {!compact && (
          <div className="pt-3">
            <ThemeToggle className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur lg:px-8">
      <p className="text-sm text-text-muted">That Productivity App</p>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <AuthGate>
      <AppKeysProvider>
        <GlobalKeys />
        <div className="min-h-screen">
          <div className="flex min-h-screen">
            {/* Full sidebar (desktop) */}
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-surface px-4 py-6 lg:block">
              <SidebarContent compact={false} />
            </aside>

            {/* Icon rail (tablet) */}
            <aside className="sticky top-0 hidden h-screen w-[68px] shrink-0 border-r border-border bg-surface px-2.5 py-6 md:flex lg:hidden">
              <SidebarContent compact />
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Mobile top bar */}
              <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation"
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted"
                >
                  <MenuIcon className="h-4 w-4" />
                </button>
                <Link href="/" className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
                    <LogoIcon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold tracking-tight">That Productivity App</span>
                </Link>
                <NotificationBell />
              </header>

              {/* Mobile drawer */}
              {drawerOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                  <div
                    className="absolute inset-0 bg-backdrop"
                    onClick={() => setDrawerOpen(false)}
                  />
                  <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface p-4 shadow-2xl">
                    <div className="flex items-center justify-end mb-3">
                      <button
                        type="button"
                        onClick={() => setDrawerOpen(false)}
                        aria-label="Close navigation"
                        className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <SidebarContent compact={false} />
                    <div className="pt-3">
                      <ThemeToggle className="w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Desktop top bar */}
              <div className="hidden md:block">
                <TopBar />
              </div>

              <main className="flex-1 px-4 py-6 pb-16 lg:px-8 lg:py-8">{children}</main>
            </div>
          </div>

          <SyncStatusStrip />
          <CommandPalette />
          <Onboarding />
        </div>
      </AppKeysProvider>
    </AuthGate>
  );
}