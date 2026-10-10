import React from 'react';

const paths: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.7"/></>,
  list: <><path d="M9 5h12M9 12h12M9 19h12"/><path d="M3 5h1M3 12h1M3 19h1"/></>,
  review: <><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M14 3h7v7M21 3 11 13"/><path d="M7 17h6"/></>,
  history: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/><path d="M12 7v5l3 2"/></>,
  settings: <><path d="m9 3-1 3-3 1-2 3 2 2v3l3 2 1 4h6l1-4 3-2v-3l2-2-2-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
  book: <><path d="M12 5C9 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-2-1-7-2-10 1Z"/><path d="M12 5v15"/></>,
  code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/></>,
  chat: <><path d="M21 11a9 9 0 0 1-9 9H4l-3 2 2-7a9 9 0 1 1 18-4Z"/><path d="M7 10h.01M12 10h.01M17 10h.01"/></>,
  bag: <><path d="M4 7h16l1 14H3L4 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
  work: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  sparkle: <><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z"/><path d="M20 2v4M18 4h4"/></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-4L3 7m0-5v5h5M4 16a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 4-6 5 7"/></>,
  zoom: <><circle cx="10" cy="10" r="7"/><path d="M7 10h6M10 7v6m6 9 5 5"/></>,
  undo: <><path d="M3 4v7h7M3 11a8 8 0 1 1 3 8"/></>,
  warning: <><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3m0 3h.01"/></>,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
  scan: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
};

export function Icon({name, size = 18, className = ''}: {name:string;size?:number;className?:string}) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.image}</svg>;
}

export function Mark() {
  return <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect width="36" height="36" rx="11" fill="#6554C0"/><path d="M11 8H8v5m17-5h3v5M8 23v5h5m15-5v5h-5" stroke="white" strokeWidth="2" strokeLinecap="round"/><rect x="11" y="13" width="14" height="11" rx="2" fill="#DBD6F8"/><path d="m13 21 3-4 3 2 3-4 3 6H13Z" fill="white"/><circle cx="15" cy="16" r="1.3" fill="#6554C0"/></svg>;
}
