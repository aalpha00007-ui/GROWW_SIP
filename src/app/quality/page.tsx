// /quality (PRD F11): open to anyone, no demo needed. The eval result for the live version, and live
// counts of answers, fallbacks and declines with what investors chose after each.
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { getDb } from '@/db/pool';
import { qualityView } from '@/server/quality';

export const dynamic = 'force-dynamic';

const MARK = { true: { text: 'Pass', style: 'bg-primary-soft text-gain' }, false: { text: 'Fail', style: 'bg-loss-soft text-loss-strong' } } as const;

export default async function Quality() {
  const { run, live } = await qualityView(getDb(), process.env.RENDER_GIT_COMMIT);

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2">
          <Link href="/" aria-label="GROWW prototype" className="flex min-h-11 items-center">
            <Logo />
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
            Try the demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Quality</h1>
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

              <div className="mt-4 overflow-x-auto">
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

              {run.failed.length > 0 && (
                <details className="mt-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">Cases that missed ({run.failed.length})</summary>
                  <ul className="mt-1 space-y-1 text-sm">
                    {run.failed.map((f) => (
                      <li key={f.id}>
                        <span className="font-semibold">{f.id}</span> <span className="text-muted">{f.what}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
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
          <div className="mt-2 overflow-x-auto">
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
    </>
  );
}
