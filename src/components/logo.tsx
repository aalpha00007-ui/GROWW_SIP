// The prototype's own mark: a target, for the goal the SIP is anchored to. No real company's logo or colours.
// The name is GROWW (the user's choice), always with the Prototype tag so it never reads as the real app.
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight text-ink ${className}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="7" fill="#3f3d9e" />
        <circle cx="13" cy="13" r="7.5" fill="none" stroke="#ffffff" strokeWidth="2" />
        <circle cx="13" cy="13" r="3" fill="#d97706" />
      </svg>
      GROWW
      <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Prototype</span>
    </span>
  );
}
