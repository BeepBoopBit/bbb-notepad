import type {CSSProperties} from 'react';
const paths={
  settings:<><path d="m9 3 1-2h4l1 2 2 1 2-.2 2 3.4-1.2 1.8v2l1.2 1.8-2 3.4-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3.4L4.2 12v-2L3 8.2l2-3.4 2 .2 2-1Z"/><circle cx="12" cy="10.8" r="3"/></>,
  copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/></>,
  markdown:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 15V9l3 3 3-3v6m4-3 2 3 2-3m-2-3v6"/></>,
  open:<><path d="M3 9V5a1 1 0 0 1 1-1h5l2 3h9v3M3 9h18l-3 10H3L1 9Z"/></>,
  save:<><path d="M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8"/></>,
  close:<path d="m6 6 12 12M6 18 18 6"/>,
  sun:<><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
  moon:<path d="M20 14A9 9 0 0 1 10 3 9 9 0 1 0 20 14Z"/>,
  check:<path d="m5 12 4 4L20 5"/>,
};
export function Icon({name,style}:{name:keyof typeof paths;style?:CSSProperties}){return <svg viewBox="0 0 24 24" aria-hidden="true" style={style}>{paths[name]}</svg>;}
