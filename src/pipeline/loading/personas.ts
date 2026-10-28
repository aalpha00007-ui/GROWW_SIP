import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { addDays, addMonths, firstDueDate, monthlyDueDates, monthStart } from './dates';
import { PERSONA_KEYS, type AssetSeed, type FundSeed, type GoalSeed, type PersonaKey, type PersonaSeed } from './raw';

/** Fixed ids for the persona templates; visitors get copies with fresh ids. */
export const TEMPLATE_IDS: Record<PersonaKey, string> = {
  riya: '00000000-0000-4000-8000-000000000001',
  arjun: '00000000-0000-4000-8000-000000000002',
  meera: '00000000-0000-4000-8000-000000000003',
  kabir: '00000000-0000-4000-8000-000000000004',
  sana: '00000000-0000-4000-8000-000000000005',
  vikram: '00000000-0000-4000-8000-000000000006',
  dev: '00000000-0000-4000-8000-000000000007',
};

export function isTemplateId(investorId: string): boolean {
  return Object.values(TEMPLATE_IDS).includes(investorId);
}

export interface TemplateContext {
  today: string;
  funds: FundSeed[];
  assets: AssetSeed[];
  /** fund id -> date -> NAV */
  navs: Map<number, Map<string, number>>;
  /** asset id -> date -> price */
  prices: Map<number, Map<string, number>>;
}

/** Writes one persona template: its goals, SIPs, instalments priced at each day's NAV, and demo holdings. */
export async function insertTemplate(tx: Db, persona: PersonaSeed, ctx: TemplateContext): Promise<{ sips: number; instalments: number }> {
  const investorId = TEMPLATE_IDS[persona.key];
  await tx.query('INSERT INTO investors (id, persona_key, display_name) VALUES ($1, $2, $3)', [investorId, persona.key, persona.display_name]);

  for (const mandate of persona.mandates) {
    await tx.query('INSERT INTO mandates (investor_id, bank_label, method) VALUES ($1, $2, $3)', [investorId, mandate.bank_label, mandate.method]);
  }

  const startedOn = new Map(persona.sips.map((s) => [s.ref, addMonths(ctx.today, -s.started_months_ago)]));
  const goalIds = new Map<string, number>();
  for (const goal of persona.goals) {
    const { rows } = await tx.query<{ id: number }>(
      'INSERT INTO goals (investor_id, kind, name, target_month) VALUES ($1, $2, $3, $4) RETURNING id',
      [investorId, goal.kind, goal.name, targetMonth(goal, persona, startedOn)],
    );
    goalIds.set(goal.ref, rows[0].id);
  }

  let instalments = 0;
  for (const sip of persona.sips) {
    const fund = ctx.funds.find((f) => f.name === sip.fund)!;
    const started = startedOn.get(sip.ref)!;
    const { rows } = await tx.query<{ id: number }>(
      'INSERT INTO sips (investor_id, fund_id, goal_id, amount, day_of_month, started_on) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [investorId, fund.id, sip.goal ? goalIds.get(sip.goal) : null, sip.amount, sip.day_of_month, started],
    );
    const sipId = rows[0].id;

    const stoppedOn = sip.stopped_months_ago === undefined ? null : addMonths(ctx.today, -sip.stopped_months_ago);
    const due = monthlyDueDates(started, sip.day_of_month, stoppedOn ?? ctx.today);
    const skipped = new Set(sip.skipped_instalments ?? []);
    const paid = due.filter((_, i) => !skipped.has(i + 1));
    await tx.query(
      `INSERT INTO instalments (sip_id, due_on, paid_on, amount, nav, units)
       SELECT $1::int, d, d, $2::int, n, round($2::numeric / n, 4)
       FROM unnest($3::date[], $4::numeric[]) AS t(d, n)`,
      [sipId, sip.amount, paid, paid.map((d) => valueOn(ctx.navs, fund.id, d, 'NAV'))],
    );
    instalments += paid.length;

    if (stoppedOn) {
      await tx.query("INSERT INTO sip_events (sip_id, kind, detail, created_at) VALUES ($1, 'cancelled', '{}', $2)", [sipId, `${stoppedOn}T09:00:00+05:30`]);
    }

    for (const position of skipped) {
      const dueOn = due[position - 1];
      if (!dueOn) throw new Error(`${persona.key}: SIP "${sip.ref}" has no instalment ${position} to skip`);
      await tx.query("INSERT INTO sip_events (sip_id, kind, detail, created_at) VALUES ($1, 'skipped', $2, $3)", [
        sipId,
        { due_on: dueOn },
        `${addDays(dueOn, -1)}T09:00:00+05:30`,
      ]);
    }
  }

  for (const order of persona.demo_orders) {
    const asset = ctx.assets.find((a) => a.symbol === order.symbol)!;
    const date = addDays(ctx.today, -order.days_ago);
    await tx.query('INSERT INTO demo_orders (investor_id, asset_id, side, qty, price, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      investorId,
      asset.id,
      order.side,
      order.qty,
      valueOn(ctx.prices, asset.id, date, 'price'),
      `${date}T10:30:00+05:30`,
    ]);
  }

  for (const symbol of persona.watchlist) {
    const asset = ctx.assets.find((a) => a.symbol === symbol)!;
    await tx.query('INSERT INTO watchlist (investor_id, asset_id) VALUES ($1, $2)', [investorId, asset.id]);
  }

  return { sips: persona.sips.length, instalments };
}

/** Copies a persona template into a fresh investor, so two visitors never share data (PRD F1). */
export async function clonePersona(db: Db, personaKey: string): Promise<string> {
  if (!PERSONA_KEYS.includes(personaKey as PersonaKey)) {
    throw new Error(`Unknown persona "${personaKey}". Choose one of ${PERSONA_KEYS.join(', ')}.`);
  }
  const templateId = TEMPLATE_IDS[personaKey as PersonaKey];
  const investorId = randomUUID();

  await db.transaction(async (tx) => {
    const created = await tx.query(
      'INSERT INTO investors (id, persona_key, display_name) SELECT $1::uuid, persona_key, display_name FROM investors WHERE id = $2 RETURNING id',
      [investorId, templateId],
    );
    if (created.rows.length === 0) throw new Error(`Persona "${personaKey}" is not seeded. Run npm run db:setup.`);

    const goalIds = new Map<number, number>();
    const goals = await tx.query<{ id: number }>('SELECT id FROM goals WHERE investor_id = $1 ORDER BY id', [templateId]);
    for (const goal of goals.rows) {
      const { rows } = await tx.query<{ id: number }>(
        'INSERT INTO goals (investor_id, kind, name, target_month) SELECT $1::uuid, kind, name, target_month FROM goals WHERE id = $2 RETURNING id',
        [investorId, goal.id],
      );
      goalIds.set(goal.id, rows[0].id);
    }

    const oldSipIds: number[] = [];
    const newSipIds: number[] = [];
    const sips = await tx.query<{ id: number; goal_id: number | null }>('SELECT id, goal_id FROM sips WHERE investor_id = $1 ORDER BY id', [templateId]);
    for (const sip of sips.rows) {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO sips (investor_id, fund_id, goal_id, frequency, amount, day_of_month, started_on)
         SELECT $1::uuid, fund_id, $3::int, frequency, amount, day_of_month, started_on FROM sips WHERE id = $2 RETURNING id`,
        [investorId, sip.id, sip.goal_id === null ? null : goalIds.get(sip.goal_id)],
      );
      oldSipIds.push(sip.id);
      newSipIds.push(rows[0].id);
    }

    const sipMap = [oldSipIds, newSipIds];
    await tx.query(
      `INSERT INTO instalments (sip_id, due_on, paid_on, amount, nav, units)
       SELECT m.new_id, i.due_on, i.paid_on, i.amount, i.nav, i.units
       FROM instalments i JOIN unnest($1::int[], $2::int[]) AS m(old_id, new_id) ON i.sip_id = m.old_id
       ORDER BY i.id`,
      sipMap,
    );
    await tx.query(
      `INSERT INTO sip_events (sip_id, kind, detail, created_at)
       SELECT m.new_id, e.kind, e.detail, e.created_at
       FROM sip_events e JOIN unnest($1::int[], $2::int[]) AS m(old_id, new_id) ON e.sip_id = m.old_id
       ORDER BY e.id`,
      sipMap,
    );
    await tx.query(
      `INSERT INTO mandates (investor_id, bank_label, method, created_at, deleted_at)
       SELECT $1::uuid, bank_label, method, created_at, deleted_at FROM mandates WHERE investor_id = $2 ORDER BY id`,
      [investorId, templateId],
    );
    await tx.query(
      `INSERT INTO demo_orders (investor_id, asset_id, side, qty, price, created_at)
       SELECT $1::uuid, asset_id, side, qty, price, created_at FROM demo_orders WHERE investor_id = $2 ORDER BY id`,
      [investorId, templateId],
    );
    await tx.query('INSERT INTO watchlist (investor_id, asset_id) SELECT $1::uuid, asset_id FROM watchlist WHERE investor_id = $2', [
      investorId,
      templateId,
    ]);
  });

  return investorId;
}

function targetMonth(goal: GoalSeed, persona: PersonaSeed, startedOn: Map<string, string>): string | null {
  if (goal.target_month) return `${goal.target_month}-01`;
  if (goal.target_from_sip) {
    const sip = persona.sips.find((s) => s.ref === goal.target_from_sip!.sip)!;
    const first = firstDueDate(startedOn.get(sip.ref)!, sip.day_of_month);
    return monthStart(addMonths(first, goal.target_from_sip.instalments - 1));
  }
  return null;
}

function valueOn(series: Map<number, Map<string, number>>, id: number, date: string, what: string): number {
  const value = series.get(id)?.get(date);
  if (value === undefined) throw new Error(`No ${what} for id ${id} on ${date}`);
  return value;
}
