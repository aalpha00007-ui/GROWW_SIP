// The prototype's own mark, not any real company's: three rising rounded bars, the steady monthly SIP
// steps growing over time, with a dot above the tallest. Dark navy, then dark green; transparent ground.
// The name is GROWW (the user's choice), always with the Prototype tag so it never reads as the real app.

/** The mark alone. Drawn on a 32-unit grid; crisp from 16px to 64px. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect x="3" y="19" width="7" height="10" rx="2.5" className="fill-logo-navy" />
      <rect x="12.5" y="14" width="7" height="15" rx="2.5" className="fill-logo-navy" />
      <rect x="22" y="9" width="7" height="20" rx="2.5" className="fill-logo-green" />
      <circle cx="25.5" cy="4.5" r="2.5" className="fill-logo-green" />
    </svg>
  );
}

/** The mark, the wordmark and the Prototype badge, as in the header and on the welcome screen. */
export function Logo({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight text-strong ${className}`}>
      <LogoMark size={size} />
      GROWW
      <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Prototype</span>
    </span>
  );
}
