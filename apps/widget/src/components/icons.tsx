import type { ReactNode } from 'react';

function Svg({ size = 13, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      className="es-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** One glyph per NER type (ORG, PERSON, GPE, …); falls back to a tag icon. */
export function EntityTypeIcon({ label, size = 13 }: { label: string; size?: number }) {
  switch (label) {
    case 'PERSON':
      return (
        <Svg size={size}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </Svg>
      );
    case 'ORG':
      return (
        <Svg size={size}>
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
        </Svg>
      );
    case 'GPE':
      return (
        <Svg size={size}>
          <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </Svg>
      );
    case 'LOC':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c3 3 3 15 0 18c-3-3-3-15 0-18z" />
        </Svg>
      );
    case 'NORP':
      return (
        <Svg size={size}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" />
          <path d="M16 5.6a3.5 3.5 0 0 1 0 6.8" />
          <path d="M17 14.2a5 5 0 0 1 4 4.8v1" />
        </Svg>
      );
    case 'PRODUCT':
      return (
        <Svg size={size}>
          <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
          <path d="M3 7l9 4 9-4" />
          <path d="M12 11v10" />
        </Svg>
      );
    case 'EVENT':
      return (
        <Svg size={size}>
          <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
          <path d="M15 7v12" />
        </Svg>
      );
    case 'FAC':
      return (
        <Svg size={size}>
          <path d="M3 21h18" />
          <path d="M4 10l8-6 8 6" />
          <path d="M6 10v11M10 10v11M14 10v11M18 10v11" />
        </Svg>
      );
    case 'WORK_OF_ART':
      return (
        <Svg size={size}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16l-5-5L5 20" />
        </Svg>
      );
    case 'LAW':
      return (
        <Svg size={size}>
          <path d="M12 3v18" />
          <path d="M5 7h14" />
          <path d="M5 7l-2.5 6a3 3 0 0 0 5 0z" />
          <path d="M19 7l2.5 6a3 3 0 0 1-5 0z" />
          <path d="M8 21h8" />
        </Svg>
      );
    case 'LANGUAGE':
      return (
        <Svg size={size}>
          <path d="M4 5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V7a2 2 0 0 1 1-2z" />
          <path d="M7 8h6M7 11h4" />
        </Svg>
      );
    case 'DATE':
      return (
        <Svg size={size}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 2v4M16 2v4" />
        </Svg>
      );
    case 'TIME':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </Svg>
      );
    case 'MONEY':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10" />
          <path d="M14.5 9.3a2.6 2 0 0 0-2.5-1.3c-1.4 0-2.5.8-2.5 1.9s1.1 1.9 2.5 1.9 2.5.8 2.5 1.9-1.1 1.9-2.5 1.9a2.6 2 0 0 1-2.5-1.3" />
        </Svg>
      );
    case 'PERCENT':
      return (
        <Svg size={size}>
          <line x1="19" y1="5" x2="5" y2="19" />
          <circle cx="7.5" cy="7.5" r="2.5" />
          <circle cx="16.5" cy="16.5" r="2.5" />
        </Svg>
      );
    case 'QUANTITY':
    case 'CARDINAL':
    case 'ORDINAL':
      return (
        <Svg size={size}>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </Svg>
      );
    default:
      return (
        <Svg size={size}>
          <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-6.2-6.2A2 2 0 0 1 3.8 13V6a2 2 0 0 1 2-2h7c.5 0 1 .2 1.4.6l6.4 6.4a2 2 0 0 1 0 2.4z" />
          <circle cx="8.5" cy="8.5" r="1.5" />
        </Svg>
      );
  }
}

export function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="es-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="es-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="es-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
