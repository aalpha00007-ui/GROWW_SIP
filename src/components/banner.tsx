// On every page (PRD §6, Brand; F1), and on top of the sign-up modal.
export const BANNER_TEXT = 'Case-study prototype · Not made by or affiliated with Groww · Demo data · Not investment advice';

export function Banner() {
  return (
    <div role="note" className="bg-accent-tint px-4 py-1.5 text-center text-xs font-medium text-accent-ink">
      {BANNER_TEXT}
    </div>
  );
}
