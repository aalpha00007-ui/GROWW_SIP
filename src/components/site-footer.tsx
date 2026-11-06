// The slim footer on every page: the disclaimer, how the AI is checked (/quality) and the official places to learn more.
import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-5 text-center text-xs text-muted sm:justify-between">
        <p>Case-study prototype · Demo data · Not investment advice</p>
        <p className="flex flex-wrap justify-center gap-x-4">
          <Link className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2" href="/quality">
            How we check the AI
          </Link>
          <a className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2" href="https://investor.sebi.gov.in/index.html" target="_blank" rel="noreferrer">
            SEBI Investor Website
          </a>
          <a className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2" href="https://www.amfiindia.com" target="_blank" rel="noreferrer">
            AMFI
          </a>
        </p>
      </div>
    </footer>
  );
}
