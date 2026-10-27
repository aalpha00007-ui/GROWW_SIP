import { describe, expect, it } from 'vitest';
import {
  checkExplainerChunks, chunkExplainers, compareChunkFile, loadExplainerChunks, parseChunkFile, renderChunkFile,
} from '../pipeline/chunking/explainers';
import { buildFactsUnit, type SipFacts } from '../pipeline/chunking/facts';
import { dayMonthYear, duration, monthYear, months, numberTokens, percent, rupees, signedRupees } from '../pipeline/chunking/format';
import { EXPLAINER_KEYS, loadExplainers } from '../pipeline/loading/fixtures';

describe('explainer chunks', () => {
  it('makes one whole chunk per explainer, in a fixed order', () => {
    const raw = loadExplainers();
    const chunks = chunkExplainers();
    expect(chunks.map((c) => c.id)).toEqual(EXPLAINER_KEYS.map((k) => `explainer:${k}`));
    for (const chunk of chunks) {
      expect(chunk.text).toBe(raw[chunk.key].text);
      expect(chunk.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('builds the same file every time', () => {
    expect(renderChunkFile(chunkExplainers())).toBe(renderChunkFile(chunkExplainers()));
  });

  it('has an up-to-date data/chunks/explainers.json', () => {
    expect(() => checkExplainerChunks()).not.toThrow();
    expect(Object.keys(loadExplainerChunks())).toEqual([...EXPLAINER_KEYS]);
  });

  it('spots chunks that are behind the raw text', () => {
    const stale = renderChunkFile(chunkExplainers()).replace('does not refund any money', 'refunds nothing');
    expect(() => compareChunkFile(stale)).toThrow('out of date');
  });

  it('refuses a chunk whose text was edited by hand', () => {
    const tampered = renderChunkFile(chunkExplainers()).replace('Skipping misses the next instalment only.', 'Skipping is free.');
    expect(() => parseChunkFile(tampered)).toThrow('does not match its sha256');
  });
});

describe('number formatting', () => {
  it('formats rupees with Indian grouping and a sign on changes', () => {
    expect(rupees(120000)).toBe('Rs 1,20,000');
    expect(rupees(12340.4)).toBe('Rs 12,340');
    expect(rupees(-0.2)).toBe('Rs 0');
    expect(signedRupees(-580)).toBe('-Rs 580');
    expect(signedRupees(1200)).toBe('+Rs 1,200');
  });

  it('formats percentages, durations and dates', () => {
    expect(percent(4.24)).toBe('4.2%');
    expect(percent(-4.08, true)).toBe('-4.1%');
    expect(percent(4.2, true)).toBe('+4.2%');
    expect(months(1)).toBe('1 month');
    expect(duration(53)).toBe('4 years 5 months');
    expect(duration(12)).toBe('1 year');
    expect(duration(5)).toBe('5 months');
    expect(dayMonthYear('2026-11-02')).toBe('2 Nov 2026');
    expect(monthYear('2031-03-01')).toBe('Mar 2031');
  });

  it('lists the numbers a text states, as written', () => {
    expect(numberTokens('Put in Rs 1,20,000, down -4.1% in 4 years 5 months; 60 (53 to go) by Mar 2031.')).toEqual([
      'Rs 1,20,000', '-4.1%', '4 years', '5 months', '60', '53', '2031',
    ]);
  });
});

describe('SIP facts unit', () => {
  // Riya's Banyan Flexi Cap SIP as seeded for 27 Oct 2026.
  const riya: SipFacts = {
    sip_id: 1,
    today: '2026-10-27',
    as_of: '2026-10-27',
    fund_name: 'Banyan Flexi Cap Fund',
    fund_category: 'Equity',
    amount: 2000,
    months_invested: 7,
    instalments_paid: 7,
    instalments_skipped: 0,
    invested: 14000,
    current_value: 12086.4,
    worst_fall_since_start_pct: -14.23,
    next_due_date: '2026-11-02',
    goal: { name: 'Home down payment', target_month: '2031-03-01' },
    instalments_planned: 60,
  };

  it('formats every fact once and keeps the bundle whole', () => {
    const unit = buildFactsUnit(riya);
    expect(unit.text).toBe(
      [
        'Facts about this SIP, as of 27 Oct 2026:',
        '- Fund: Banyan Flexi Cap Fund (Equity)',
        '- Instalment: Rs 2,000 a month',
        '- Months invested: 7 months',
        '- Instalments paid: 7',
        '- Instalments skipped: 0',
        '- Put in so far: Rs 14,000',
        '- Value today: Rs 12,086',
        '- Change vs put in: -Rs 1,914 (-13.7%)',
        '- Worst fall since start: -14.2%',
        '- Next instalment: 2 Nov 2026',
        '- Goal: Home down payment, by Mar 2031',
        '- Time to go: 4 years 5 months',
        '- Instalments planned: 60 (53 to go)',
      ].join('\n'),
    );
    expect(unit.as_of).toBe('27 Oct 2026');
    expect(unit.numbers).toEqual([
      '27', '2026', 'Rs 2,000', '7 months', '7', '0', 'Rs 14,000', 'Rs 12,086', '-Rs 1,914', '-13.7%', '-14.2%',
      '2', '2031', '4 years', '5 months', '60', '53',
    ]);
  });

  it('shows no returns before the first instalment', () => {
    const unit = buildFactsUnit({
      ...riya, months_invested: 0, instalments_paid: 0, invested: 0, current_value: 0, worst_fall_since_start_pct: null,
    });
    expect(unit.text).toContain('- First instalment: due on 2 Nov 2026');
    expect(unit.text).not.toMatch(/Value today|Change vs put in|Worst fall/);
    expect(unit.text).toContain('60 (60 to go)');
  });

  it('says so when no goal is set, and never invents one', () => {
    const unit = buildFactsUnit({ ...riya, goal: null, instalments_planned: null });
    expect(unit.text).toContain('- Goal: No goal is set for this SIP');
    expect(unit.text).not.toMatch(/Time to go|Instalments planned/);
  });

  it('handles a goal without a target month', () => {
    const unit = buildFactsUnit({ ...riya, goal: { name: 'Emergency fund', target_month: null }, instalments_planned: null });
    expect(unit.text).toContain('- Goal: Emergency fund (no target month)');
    expect(unit.text).not.toContain('Time to go');
  });

  it('says the goal date is reached once the target month has passed', () => {
    const unit = buildFactsUnit({ ...riya, goal: { name: 'Home down payment', target_month: '2026-09-01' } });
    expect(unit.text).toContain('- Time to go: Goal date reached');
    expect(unit.text).not.toContain('Instalments planned');
  });

  it('counts skipped instalments out of the ones to go', () => {
    const unit = buildFactsUnit({ ...riya, instalments_paid: 6, instalments_skipped: 1 });
    expect(unit.text).toContain('- Instalments skipped: 1');
    expect(unit.text).toContain('60 (53 to go)');
  });
});
