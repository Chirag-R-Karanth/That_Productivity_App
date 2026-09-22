"use client";

interface IconProps {
  className?: string;
}

export type IconComponent = React.ComponentType<{ className?: string }>;

function base(className?: string) {
  return {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
  };
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function TasksIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="m8 12 2.2 2.2L16 8.8" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 2.75V6" />
      <path d="M16 2.75V6" />
    </svg>
  );
}

export function TimetableIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
      <path d="m5 5 2.1 2.1" />
      <path d="m16.9 16.9 2.1 2.1" />
      <path d="m19 5-2.1 2.1" />
      <path d="m7.1 16.9-2.1 2.1" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
      <path d="M12 3v10.5" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.6-4.6" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5 1.5 6.5 1.5 6.5h-15S6 14.5 6 9.5" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 3.5v17h17" />
      <path d="M7.5 16.5v-5" />
      <path d="M12 16.5V8" />
      <path d="M16.5 16.5v-8" />
    </svg>
  );
}

export function GraduationIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z" />
      <path d="M7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4" />
      <path d="M21 9v4" />
    </svg>
  );
}

export function FocusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="M4.2 4.2l1.4 1.4" />
      <path d="m18.4 18.4 1.4 1.4" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="m4.2 19.8 1.4-1.4" />
      <path d="m18.4 5.6 1.4-1.4" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function LogoIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 13.5v-7h6L12 8h7.5v7.5" />
      <path d="M19.5 10.5V18h-15v-4.5Z" />
    </svg>
  );
}

export function AttendanceIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 2.75V6" />
      <path d="M16 2.75V6" />
      <path d="m8.5 15 2 2 4.5-4.5" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h16" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function CommandIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M15 6a3 3 0 1 1 3 3H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6Z" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M7 4.5 19 12 7 19.5V4.5Z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  );
}

export function SkipIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 5v14l9-7-9-7Z" />
      <path d="M18 5v14" />
    </svg>
  );
}

export function RestartIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 12a8 8 0 1 1 2.34 5.66" />
      <path d="M4 4v4h4" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function SpeakerOnIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 9v6h3l4 3.5v-13L7 9H4Z" />
      <path d="M15.5 8.5a4 4 0 0 1 0 7" />
      <path d="M18 5.5a7.5 7.5 0 0 1 0 13" />
    </svg>
  );
}

export function SpeakerOffIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 9v6h3l4 3.5v-13L7 9H4Z" />
      <path d="m16 9 5 6" />
      <path d="m21 9-5 6" />
    </svg>
  );
}