"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/lib/authGate";
import { HomeIcon, TasksIcon, CalendarIcon, TimetableIcon, SettingsIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Today" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/timetable", label: "Timetable" },
  { href: "/courses", label: "Courses" },
  { href: "/attendance", label: "Attendance" },
  { href: "/pomodoro", label: "Focus" },
  { href: "/settings", label: "Settings" },
];

const MOBILE_ITEMS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/tasks", label: "Tasks", Icon: TasksIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/timetable", label: "Timetable", Icon: TimetableIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

function SidebarLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface-elevated font-medium text-text"
          : "text-text-muted hover:bg-surface-elevated/60 hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
}

function MobileNavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
        active ? "text-accent" : "text-text-muted hover:text-text"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGate>
      <div className="min-h-screen">
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface px-3 py-6 md:flex">
            <Link href="/" className="mb-6 px-3 text-xl font-semibold tracking-tight">
              Productivity
            </Link>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <SidebarLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar — brand doubles as the "back to home" button */}
            <header className="sticky top-0 z-30 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
              <Link href="/" aria-label="Back to Today (home)" className="inline-flex items-center gap-2">
                <HomeIcon className="h-5 w-5 text-accent" />
                <span className="text-base font-semibold tracking-tight">Productivity</span>
              </Link>
            </header>

            <main className="flex-1 px-4 py-6 pb-24 md:px-10 md:py-8 md:pb-8">{children}</main>
          </div>
        </div>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="flex">
            {MOBILE_ITEMS.map((item) => (
              <MobileNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                Icon={item.Icon}
                active={pathname === item.href}
              />
            ))}
          </div>
        </nav>
      </div>
    </AuthGate>
  );
}