// The mark keeps the shape of Groww's logo, at the user's request: a circle split by a rising zig-zag line.
// It was measured from the public logo and matches it to within 0.2% of its pixels. The colours are the
// prototype's own (dark navy above the line, dark green below), never Groww's. The wordmark is Groww and it
// always has the Prototype tag, so with the banner it never reads as the real app.

/** The zig-zag that splits the mark's circle, on a 32-unit grid; app/apple-icon.tsx draws it too. */
export const LOGO_PATH = 'M1.9 23.57L11.43 16.05A2 2 0 0 1 13.68 15.89L17.9 18.36A2 2 0 0 0 20.27 18.1L30.31 8.84A16 16 0 0 1 1.9 23.57Z';

/** The mark alone, on a 32-unit grid. The green part is drawn over the full navy circle so no seam shows. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="16" className="fill-logo-navy" />
      <path d={LOGO_PATH} className="fill-logo-green" />
    </svg>
  );
}

/** The mark, the wordmark and the Prototype badge, as in the header and on the welcome screen. */
export function Logo({ className = '', size = 32 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight text-strong ${className}`}>
      <LogoMark size={size} />
      Groww
      <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Prototype</span>
    </span>
  );
}
