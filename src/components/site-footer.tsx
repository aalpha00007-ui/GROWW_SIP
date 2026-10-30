// The slim footer on the landing page and the public pages, with the official places to learn more.
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-5 text-center text-xs text-muted sm:justify-between">
        <p>Case-study prototype · Demo data · Not investment advice</p>
        <p className="flex gap-4">
          <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline" href="https://investor.sebi.gov.in/index.html" target="_blank" rel="noreferrer">
            SEBI Investor Website
          </a>
          <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline" href="https://www.amfiindia.com" target="_blank" rel="noreferrer">
            AMFI
          </a>
        </p>
      </div>
    </footer>
  );
}
