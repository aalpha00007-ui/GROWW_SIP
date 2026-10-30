-- GROWW_SIP schema (build spec §6, PRD Appendix B). Safe to re-run.
-- Store facts, compute answers: no column holds a total, a return, a planned amount or a
-- pass rate. SIP status is computed from sip_events.

CREATE TABLE IF NOT EXISTS funds (
  id             serial PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  category       text NOT NULL,
  risk_level     text NOT NULL,
  min_sip        int NOT NULL CHECK (min_sip > 0),
  exit_load_text text NOT NULL,
  expense_ratio  numeric(4,2) NOT NULL
);
-- Added for the Explore and fund pages: made-up sub-category, fund size (₹ crore) and rating (1-5).
-- Added with ALTER so a deploy's db:migrate adds them to a database that already has the table.
ALTER TABLE funds ADD COLUMN IF NOT EXISTS sub_category text NULL;
ALTER TABLE funds ADD COLUMN IF NOT EXISTS aum_cr int NULL;
ALTER TABLE funds ADD COLUMN IF NOT EXISTS rating int NULL CHECK (rating BETWEEN 1 AND 5);

CREATE TABLE IF NOT EXISTS nav_history (
  fund_id  int NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  nav_date date NOT NULL,
  nav      numeric(12,4) NOT NULL,
  PRIMARY KEY (fund_id, nav_date)
);

-- One row per persona template and per demo visitor (visitors are linked by an httpOnly cookie).
CREATE TABLE IF NOT EXISTS investors (
  id           uuid PRIMARY KEY,
  persona_key  text NOT NULL,
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- "Simulate a market fall" (PRD F12): NAV facts labelled demo that only this visitor sees.
CREATE TABLE IF NOT EXISTS demo_nav_history (
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  fund_id     int NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  nav_date    date NOT NULL,
  nav         numeric(12,4) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (investor_id, fund_id, nav_date)
);

CREATE TABLE IF NOT EXISTS goals (
  id           serial PRIMARY KEY,
  investor_id  uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('home','education','retirement','emergency','custom')),
  name         text NOT NULL,
  target_month date NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- The goal step's optional target amount (whole rupees). Shown to the investor only; the AI's facts leave it out.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_amount bigint NULL CHECK (target_amount > 0);

CREATE TABLE IF NOT EXISTS sips (
  id           serial PRIMARY KEY,
  investor_id  uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  fund_id      int NOT NULL REFERENCES funds(id),
  goal_id      int NULL REFERENCES goals(id) ON DELETE SET NULL,
  frequency    text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','weekly','daily')),
  amount       int NOT NULL CHECK (amount > 0),
  day_of_month int NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  started_on   date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sip_events (
  id         serial PRIMARY KEY,
  sip_id     int NOT NULL REFERENCES sips(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('amount_changed','date_changed','skipped','paused','stepped_up','goal_changed','cancelled')),
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instalments (
  id      serial PRIMARY KEY,
  sip_id  int NOT NULL REFERENCES sips(id) ON DELETE CASCADE,
  due_on  date NOT NULL,
  paid_on date NULL,
  amount  int NOT NULL,
  nav     numeric(12,4) NULL,
  units   numeric(14,4) NULL
);

CREATE TABLE IF NOT EXISTS lumpsums (
  id          serial PRIMARY KEY,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  fund_id     int NOT NULL REFERENCES funds(id),
  goal_id     int NULL REFERENCES goals(id) ON DELETE SET NULL,
  amount      int NOT NULL,
  nav         numeric(12,4) NOT NULL,
  units       numeric(14,4) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id           serial PRIMARY KEY,
  investor_id  uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  fund_id      int NOT NULL REFERENCES funds(id),
  kind         text NOT NULL CHECK (kind IN ('sip','one_time')),
  amount       int NOT NULL,
  day_of_month int NULL,
  goal         jsonb NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz NULL
);

CREATE TABLE IF NOT EXISTS mandates (
  id          serial PRIMARY KEY,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  bank_label  text NOT NULL,
  method      text NOT NULL CHECK (method IN ('UPI','NACH')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id     serial PRIMARY KEY,
  kind   text NOT NULL CHECK (kind IN ('stock','etf','us_stock','gold','silver','bond')),
  name   text NOT NULL UNIQUE,
  symbol text NOT NULL UNIQUE,
  sector text NULL,
  extra  jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS asset_prices (
  asset_id   int NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price_date date NOT NULL,
  price      numeric(12,2) NOT NULL,
  PRIMARY KEY (asset_id, price_date)
);

CREATE TABLE IF NOT EXISTS ipos (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  status     text NOT NULL CHECK (status IN ('open','upcoming','closed')),
  price_band text NOT NULL,
  lot_size   int NOT NULL,
  opens_on   date NOT NULL,
  closes_on  date NOT NULL
);

CREATE TABLE IF NOT EXISTS ipo_applications (
  id          serial PRIMARY KEY,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  ipo_id      int NOT NULL REFERENCES ipos(id),
  lots        int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demo_orders (
  id          serial PRIMARY KEY,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  asset_id    int NOT NULL REFERENCES assets(id),
  side        text NOT NULL CHECK (side IN ('buy','sell')),
  qty         numeric(14,4) NOT NULL,
  price       numeric(12,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist (
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  asset_id    int NOT NULL REFERENCES assets(id),
  PRIMARY KEY (investor_id, asset_id)
);

-- Mutual Funds -> Watchlist: the funds an investor added from a fund page.
CREATE TABLE IF NOT EXISTS fund_watchlist (
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  fund_id     int NOT NULL REFERENCES funds(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (investor_id, fund_id)
);

CREATE TABLE IF NOT EXISTS ai_checks (
  id             serial PRIMARY KEY,
  investor_id    uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  sip_id         int NULL REFERENCES sips(id) ON DELETE SET NULL,
  moment         text NOT NULL CHECK (moment IN ('before_stop','is_this_normal')),
  user_text      text NULL,
  model          text NOT NULL,
  prompt_version text NOT NULL,
  understood     jsonb NULL,
  route          text NULL,
  explanation    text NULL,
  checks         jsonb NULL,
  outcome        text NOT NULL CHECK (outcome IN ('answer','fallback','declined')),
  latency_ms     int NULL,
  user_choice    text NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id             serial PRIMARY KEY,
  commit_sha     text NOT NULL,
  model          text NOT NULL,
  prompt_version text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_results (
  id       serial PRIMARY KEY,
  run_id   int NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_set text NOT NULL CHECK (case_set IN ('golden','safety')),
  case_id  text NOT NULL,
  input    text NOT NULL,
  expected jsonb NOT NULL,
  got      jsonb NULL,
  passed   boolean NOT NULL
);

-- Demo accounts (made by "Create demo account"): a username and a hashed 4-digit PIN, never an email,
-- phone or real password. The account is an investor row, so deleting the investor deletes it all.
CREATE TABLE IF NOT EXISTS accounts (
  investor_id   uuid PRIMARY KEY REFERENCES investors(id) ON DELETE CASCADE,
  username      text NOT NULL UNIQUE CHECK (username = lower(username)),
  pin_hash      text NOT NULL,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until  timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per signed-in browser. The cookie holds a random token; only its SHA-256 is stored here.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Sign-ups per network, for the rate limit. Only a salted hash of the IP address is kept.
CREATE TABLE IF NOT EXISTS signup_attempts (
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- What investors did, for the case study's funnel (npm run events). No free text, no personal data.
CREATE TABLE IF NOT EXISTS app_events (
  id          serial PRIMARY KEY,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  event       text NOT NULL CHECK (event IN (
                'goal_step_shown', 'goal_saved', 'goal_skipped', 'sip_started', 'market_fall_simulated',
                'dip_context_viewed', 'ai_question_asked', 'stop_checkin_opened', 'sip_stopped', 'sip_kept',
                'goal_tooltip_dismissed')),
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The NAVs one visitor sees: the shared history plus their own demo market-fall days. A demo
-- day wins over a shared row on the same date, so a fall the visitor made stays visible.
CREATE OR REPLACE FUNCTION visible_nav_history(p_investor uuid)
RETURNS TABLE (fund_id int, nav_date date, nav numeric, is_demo boolean)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (v.fund_id, v.nav_date) v.fund_id, v.nav_date, v.nav, v.is_demo
  FROM (
    SELECT n.fund_id, n.nav_date, n.nav, false AS is_demo FROM nav_history n
    UNION ALL
    SELECT d.fund_id, d.nav_date, d.nav, true AS is_demo FROM demo_nav_history d WHERE d.investor_id = p_investor
  ) v
  ORDER BY v.fund_id, v.nav_date, v.is_demo DESC
$$;

CREATE INDEX IF NOT EXISTS goals_investor_idx ON goals (investor_id);
CREATE INDEX IF NOT EXISTS sips_investor_idx ON sips (investor_id);
CREATE INDEX IF NOT EXISTS sip_events_sip_idx ON sip_events (sip_id);
CREATE INDEX IF NOT EXISTS instalments_sip_idx ON instalments (sip_id);
CREATE INDEX IF NOT EXISTS demo_orders_investor_idx ON demo_orders (investor_id);
CREATE INDEX IF NOT EXISTS ai_checks_investor_idx ON ai_checks (investor_id);
CREATE INDEX IF NOT EXISTS sessions_investor_idx ON sessions (investor_id);
CREATE INDEX IF NOT EXISTS signup_attempts_ip_idx ON signup_attempts (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS app_events_investor_idx ON app_events (investor_id, event);
