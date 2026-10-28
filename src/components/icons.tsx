// Simple 24px line icons, drawn for this prototype. They take the text colour (currentColor).
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  explore: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5z',
  sips: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  portfolio: 'M12 3v9h9a9 9 0 1 1-9-9Zm3 0a6 6 0 0 1 6 6h-6z',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  goals: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.6-4.6',
  chevron: 'm9 5 7 7-7 7',
  index: 'M3 20h18M4 16l5-5 4 3 7-8',
  elss: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  equity: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  liquid: 'M12 3c3.5 4.5 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-11Z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1zM4 7l11-3v3M16 13h4',
  orders: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  report: 'M6 3h9l3 3v15H6zM9 13v4M12 10v7M15 14v3',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01',
  switch: 'M7 7h13l-3-3M17 17H4l3 3',
  cart: 'M3 4h2l2.4 11h11l2-8H6.2M10 20h.01M17 20h.01',
  logout: 'M15 4h4v16h-4M10 16l-4-4 4-4M6 12h10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  calculator: 'M6 3h12v18H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01',
  compare: 'M8 4v16M16 4v16M4 8h8M12 16h8',
  import: 'M12 3v12M8 11l4 4 4-4M4 19h16',
  tax: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  nfo: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  gold: 'M4 17h16l-2-6H6zM8 11l1.5-4h5L16 11',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  largeCap: 'M5 20V8M12 20V4M19 20V8M3 20h18',
  midCap: 'M5 20v-6M12 20V9M19 20v-6M3 20h18',
  smallCap: 'M5 20v-3M12 20v-6M19 20v-3M3 20h18',
  sipStar: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M12 9l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  bond: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  ipo: 'M12 3l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z',
  etf: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6',
  screener: 'M4 5h16l-6 8v6l-4-2v-4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
