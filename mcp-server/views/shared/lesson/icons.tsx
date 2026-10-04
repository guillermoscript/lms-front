/**
 * Minimal stroke icons for the lesson components.
 *
 * The web app pulls these from `@tabler/icons-react`; widgets ship their own so
 * the bundle stays small and the MCP server keeps one less dependency.
 */

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-4"}
    >
      {children}
    </svg>
  );
}

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </Svg>
);

export const IconAlertTriangle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.24 3.96 2.51 17.3a2 2 0 0 0 1.73 3h15.52a2 2 0 0 0 1.73-3L13.76 3.96a2 2 0 0 0-3.52 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconBulb = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M8.5 14a5.5 5.5 0 1 1 7 0c-.6.5-1 1.2-1 2h-5c0-.8-.4-1.5-1-2Z" />
  </Svg>
);

export const IconCircleCheck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const IconAlertCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16h.01" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12 5 5L20 7" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-13.6-4.6L4 9" />
    <path d="M4 5v4h4" />
    <path d="M4 13a8 8 0 0 0 13.6 4.6L20 15" />
    <path d="M20 19v-4h-4" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M21 12c-2.4 4-5.4 6-9 6s-6.6-2-9-6c2.4-4 5.4-6 9-6s6.6 2 9 6Z" />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
    <path d="M16.7 16.7A9.9 9.9 0 0 1 12 18c-3.6 0-6.6-2-9-6a17 17 0 0 1 3.2-3.9m3-1.7A9.9 9.9 0 0 1 12 6c3.6 0 6.6 2 9 6a17 17 0 0 1-2.2 3" />
    <path d="m3 3 18 18" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5a2 2 0 0 1 2-2h5v16H5a2 2 0 0 0-2 2Z" />
    <path d="M21 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2Z" />
  </Svg>
);

export const IconVolume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5 7 9H4v6h3l5 4Z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
  </Svg>
);

export const IconPlayerPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);

export const IconFileDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
    <path d="M12 11v6m-2.5-2.5L12 17l2.5-2.5" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
);

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4m0 0h13l-3 4 3 4H5" />
  </Svg>
);

export const IconArrowsExchange = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10h14l-4-4M17 14H3l4 4" />
  </Svg>
);
