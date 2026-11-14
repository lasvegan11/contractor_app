import type { ReactNode } from 'react'
import type { JobKindId } from '../data/jobKinds'

// Simple line drawings in the same style as the other icons, inline so they work offline.
const PATHS: Record<JobKindId, ReactNode> = {
  handyman: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />
  ),
  drywall: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M8.5 6.5h.01M15.5 6.5h.01M8.5 17.5h.01M15.5 17.5h.01M8.5 12h.01M15.5 12h.01" />
    </>
  ),
  paint: (
    <>
      <rect x="3" y="3" width="14" height="6" rx="1.5" />
      <path d="M17 6h2.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H12v3" />
      <rect x="10" y="14.5" width="4" height="7" rx="1" />
    </>
  ),
  bath: (
    <>
      <path d="M3 12h18v2.5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" />
      <path d="M6 12V5.5A2.5 2.5 0 0 1 8.5 3 2.5 2.5 0 0 1 11 5.5M7 19.5 6 21.5M17 19.5l1 2" />
    </>
  ),
  kitchen: (
    <>
      <path d="M3 11h18M5 11v7a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-7" />
      <path d="M8 4.5v3M12 3v4.5M16 4.5v3" />
    </>
  ),
  tile: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M12 3v18M3 12h18" />
    </>
  ),
  roofing: <path d="M2 13 12 4l10 9M5 11v9h14v-9M9 20v-5h6v5" />,
  stucco: (
    // a trowel: pointed blade, handle underneath
    <>
      <path d="M12 2.5 18.5 9 12 15.5 5.5 9z" />
      <path d="M12 15.5v2.5" />
      <rect x="10" y="18" width="4" height="4" rx="1" />
    </>
  ),
  framing: <path d="M3 4h18M3 20h18M6 4v16M12 4v16M18 4v16" />,
  plumbing: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />,
  electrical: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  concrete: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 12h18M9.5 5v7M14.5 12v7" />
    </>
  ),
  fence: <path d="M5 21V8l2-3 2 3v13M15 21V8l2-3 2 3v13M2.5 11h19M2.5 17h19M10 21V8l2-3 2 3v13" />,
}

export function JobKindIcon({ kind, className = 'size-6' }: { kind: JobKindId; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  )
}
