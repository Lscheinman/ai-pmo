// src/components/icons/index.js
import React from "react";

export const AddIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DeleteIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const SendIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);


export const SaveIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <polyline points="5 13 10 18 19 7" />
  </svg>
);

export const CloseIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
  </svg>
);

export const ImportIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
    <path d="M12 19V5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const ExportIcon = ({ size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    stroke="currentColor"
    fill="none"
    strokeWidth="2"
  >
    {/* vertical line */}
    <path d="M12 5v14" strokeLinecap="round" strokeLinejoin="round" />
    {/* arrow pointing down */}
    <path d="M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CopyIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {/* back sheet */}
    <rect x="8" y="3" width="12" height="12" rx="2.5" />
    {/* front sheet */}
    <rect x="4" y="9" width="12" height="12" rx="2.5" />
  </svg>
);

export const CopyEmailIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Email envelope */}
    <rect x="3" y="5" width="14" height="12" rx="2" ry="2" />
    <polyline points="3,7 10,13 17,7" />

    {/* Copy symbol (small overlapping sheet) */}
    <rect
      x="14"
      y="9"
      width="7"
      height="9"
      rx="1.5"
      ry="1.5"
      strokeWidth="1.5"
    />
    <line x1="14" y1="11" x2="21" y2="11" strokeWidth="1.2" />
  </svg>
);

export const PeopleIcon = ({ size = 22, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Two heads */}
    <circle cx="9" cy="7" r="4" />
    <circle cx="17" cy="11" r="4" />
    {/* Bodies */}
    <path d="M2 21v-2a4 4 0 0 1 4-4h4" />
    <path d="M15 21v-2a4 4 0 0 1 4-4h3" />
  </svg>
);

export const TasksIcon = ({ size = 22, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Clipboard */}
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <path d="M9 2h6v4H9z" />
    {/* Checklist */}
    <path d="M9 10h8" />
    <path d="M9 14h8" />
    <path d="M9 18h5" />
  </svg>
);

export const TagIcon = ({ size = 22, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Tag shape */}
    <path d="M20.59 13.41L11.17 4H4v7.17l9.41 9.41a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.82z" />
    {/* Tag hole */}
    <circle cx="6.5" cy="6.5" r="1.5" />
  </svg>
);

export const EditIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Pencil body */}
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export const ChevronDownIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const HomeIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 11l9-8 9 8" />
    <path d="M9 22V12h6v10" />
  </svg>
);

export const ChevronRightIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export const SearchIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const RefreshIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 11V7a8 8 0 0 1 8-8h8" />
    <path d="M20 13v4a8 8 0 0 1-8 8H4" />
    <polyline points="16 6 20 10 16 14" />
    <polyline points="8 18 4 14 8 10" />
  </svg>
);

export const InfoIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const ChevronLeftIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export const ProjectIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {/* outer board */}
    <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
    {/* columns */}
    <line x1="9"  y1="4"  x2="9"  y2="20" />
    <line x1="15" y1="4"  x2="15" y2="20" />
    {/* a few minimal “cards” hints for legibility at 20px */}
    <line x1="6"  y1="8"  x2="8"   y2="8"  />
    <line x1="6"  y1="12" x2="8"   y2="12" />
    <line x1="12" y1="8"  x2="14"  y2="8"  />
    <line x1="18" y1="9"  x2="18"  y2="13" />
  </svg>
);


// Trash icon (outline)
export function TrashIcon({ size = 18, stroke = 2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* lid */}
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      {/* top bar */}
      <path d="M3 6h18" />
      {/* can body */}
      <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14" />
      {/* inner lines */}
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
};

export function CalendarIcon({ size = 18, stroke = 2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* binding rings */}
      <path d="M8 2v4M16 2v4" />
      {/* outer frame */}
      <rect x="3" y="4" width="18" height="18" rx="2" />
      {/* header separator */}
      <path d="M3 10h18" />
      {/* date dots */}
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
};

export function GoToIcon({ size = 18, stroke = 2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* outer circle */}
      <circle cx="12" cy="12" r="9" />
      {/* crosshair lines */}
      <line x1="12" y1="3" x2="12" y2="7" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="3" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="21" y2="12" />
      {/* center point */}
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
};

export function CommAgentIcon(props) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 5h18v14H3z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M16 3l-2 2 2 2M20 3l-2 2 2 2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
};

export const EyeIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const PinIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* map-pin shape */}
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const UnpinIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* map-pin shape */}
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
    {/* slash to indicate unpin */}
    <line x1="22" y1="2" x2="2" y2="22" />
  </svg>
);

export const CheckIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const ClipboardCheckIcon = ({ size = 18, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* clipboard */}
    <path d="M8 4h8a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1h1V6a2 2 0 0 1 2-2z" />
    <rect x="9" y="2" width="6" height="4" rx="1.5" />
    {/* check */}
    <path d="M9.5 13.5l2 2 4-4" />
  </svg>
);

// src/components/icons/index.jsx (or wherever your icons live)
export function MoreIcon({ size = 16, vertical = false, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"          // uses currentColor, so it matches your button color
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {vertical ? (
        <>
          <circle cx="12" cy="5"  r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </>
      ) : (
        <>
          <circle cx="5"  cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </>
      )}
    </svg>
  );
}


export function SpinnerIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden="true">
      <circle
        cx="25" cy="25" r="20"
        stroke="currentColor" strokeWidth="6" fill="none"
        strokeDasharray="31.4 31.4" strokeLinecap="round"
        opacity="0.9"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 25 25"
          to="360 25 25"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

// RefreshCycleIcon: single arrow, optional spin
export function RefreshCycleIcon({ size = 16, spinning = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g>
        <path d="M20.5 12a8.5 8.5 0 1 1-2.52-6.02" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M21 4v6h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        )}
      </g>
    </svg>
  );
}

// Bolt for "Do now"
export function BoltIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2L4 14h6l-2 8 11-13h-6l2-7z" fill="currentColor" />
    </svg>
  );
}

// Warning triangle for "Risks"
export function RiskIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3L1.8 20.5c-.3.5.1 1.2.7 1.2h19c.6 0 1-.7.7-1.2L12 3z" fill="currentColor" />
      <rect x="11" y="9" width="2" height="6" fill="#000" opacity="0.85" />
      <rect x="11" y="16.8" width="2" height="2" fill="#000" opacity="0.85" />
    </svg>
  );
}


// Add to src/components/icons/index.js

export const LinkIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* left link */}
    <path d="M8.5 14.5l-2 2a4 4 0 1 1-5.66-5.66l2-2" />
    {/* right link */}
    <path d="M15.5 9.5l2-2a4 4 0 1 1 5.66 5.66l-2 2" />
    {/* connector */}
    <path d="M9 15l6-6" />
  </svg>
);

export const ExternalLinkIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* box */}
    <path d="M4 9v11a2 2 0 0 0 2 2h11" />
    {/* arrow out */}
    <path d="M14 4h6v6" />
    <path d="M10 14L20 4" />
  </svg>
);
