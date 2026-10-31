// /quality (PRD F11): open to anyone, no demo needed. The eval result for the live version, and live
// counts of answers, fallbacks and declines with what investors chose after each.
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { SiteFooter } from '@/components/site-footer';
import { getDb } from '@/db/pool';
import { toRupeeSign } from '@/server/money';
import { qualityView } from '@/server/quality';

export const dynamic = 'force-dynamic';

const MARK = { true: { text: 'Pass', style: 'bg-primary-soft text-gain' }, false: { text: 'Fail', style: 'bg-loss-soft text-loss-strong' } } as const;

export default async function Quality() {
  const { run, live } = await qualityView(getDb(), process.env.RENDER_GIT_COMMIT);

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2">
          <Link href="/" aria-label="Groww prototype home" className="flex min-h-11 items-center">
            <Logo />
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
            Try the demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">How we check the AI</h1>
          <p className="text-muted">How the AI check-in is tested before each release, and what it has done since.</p>
        </div>

        <section className="rounded-xl border border-line bg-surface p-4">
          {run ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{run.title}</h2>
                  <p className="text-sm text-muted">
                    {run.date} · {run.model} · prompt {run.promptVersion}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${run.passed ? MARK.true.style : MARK.false.style}`}>
                  {run.passed ? 'Gate passed' : 'Gate failed'}
                </span>
              </div>
              {run.note && <p className="mt-2 rounded-lg bg-page px-3 py-2 text-sm text-muted">{run.note}</p>}

              <div className="relative mt-4 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 font-medium">Check</th>
                      <th className="py-2 pr-3 font-medium">Result</th>
                      <th className="py-2 pr-3 font-medium">Rule</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">Pass or fail</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {run.rows.map((row) => (
                      <tr key={row.label}>
                        <td className="py-2 pr-3 font-medium">{row.label}</td>
                        <td className="tabular py-2 pr-3">{row.value}</td>
                        <td className="py-2 pr-3 text-muted">{row.rule}</td>
                        <td className="py-2">
                          {row.ok !== null && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${MARK[`${row.ok}`].style}`}>{MARK[`${row.ok}`].text}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {run.checkFailures.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold">Check failures</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {run.checkFailures.map((f) => (
                      <li key={f.id}>
                        <span className="font-semibold">{f.id}</span> <span className="text-muted">failed {f.failed.join(', ')}, so it showed facts only</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <h3 className="mt-5 font-semibold">Where the AI disagreed with the labels ({run.disagreements.length})</h3>
              {run.disagreements.length > 0 ? (
                <div className="relative mt-2 overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="text-muted">
                      <tr className="border-b border-line">
                        <th className="py-2 pr-3 font-medium">Case</th>
                        <th className="py-2 pr-3 font-medium">Label</th>
                        <th className="py-2 pr-3 font-medium">AI output</th>
                        <th className="py-2 font-medium">Why it failed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line align-top">
                      {run.disagreements.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2 pr-3">
                            <span className="font-semibold">{d.id}</span>
                            {d.input && <span className="block text-xs text-muted">{d.input}</span>}
                          </td>
                          <td className="py-2 pr-3">{d.label}</td>
                          <td className="py-2 pr-3">{toRupeeSign(d.ai)}</td>
                          <td className="py-2 text-muted">{d.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">None: every case matched its label.</p>
              )}
              <p className="mt-3 text-xs text-muted">Golden-set posts are real public posts, so they are listed by id only.</p>
            </>
          ) : (
            <p className="text-muted">No eval has run yet.</p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-lg font-bold">Live use</h2>
          <p className="text-sm text-muted">
            {live.total} AI check-ins from demo visitors ({live.dipExplainers} dip explainers). The eval&apos;s and our own test visitors are left out.
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            {live.outcomes.map((o) => (
              <div key={o.label} className="rounded-lg bg-page p-3">
                <dt className="text-sm text-muted">{o.label}</dt>
                <dd className="tabular text-2xl font-bold text-strong">{o.count}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 font-semibold">What investors chose at Before you stop</h3>
          <div className="relative mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">After</th>
                  {live.choiceLabels.map((label) => (
                    <th key={label} className="py-2 pr-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {live.choices.map((row) => (
                  <tr key={row.outcome}>
                    <td className="py-2 pr-3 font-medium">{row.outcome}</td>
                    {row.counts.map((n, i) => (
                      <td key={live.choiceLabels[i]} className="py-2 pr-3">
                        {n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-sm text-muted">
          CI runs this eval whenever the AI&apos;s code, prompts or data change, and a version that fails the gate is not deployed. The gate: every
          must-pass safety case passes, golden-set theme agreement stays at or above the floor, at most one routing miss, and no answer breaks an
          invariant.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
