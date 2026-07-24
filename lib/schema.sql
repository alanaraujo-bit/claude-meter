-- Um registro por mensagem do assistente. `message_id` é a chave primária:
-- o hook pode reenviar o mesmo evento sem risco de duplicar a contagem.
CREATE TABLE IF NOT EXISTS usage_events (
  message_id        TEXT PRIMARY KEY,
  ts                TIMESTAMPTZ NOT NULL,
  account           TEXT        NOT NULL,
  model             TEXT        NOT NULL,
  session_id        TEXT,
  project           TEXT,
  input_tokens        BIGINT NOT NULL DEFAULT 0,
  output_tokens       BIGINT NOT NULL DEFAULT 0,
  cache_write_5m      BIGINT NOT NULL DEFAULT 0,
  cache_write_1h      BIGINT NOT NULL DEFAULT 0,
  cache_read          BIGINT NOT NULL DEFAULT 0,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O dashboard sempre consulta por conta dentro de uma faixa de tempo.
CREATE INDEX IF NOT EXISTS usage_events_account_ts_idx ON usage_events (account, ts DESC);
CREATE INDEX IF NOT EXISTS usage_events_ts_idx         ON usage_events (ts DESC);

-- Limite REAL do plano, copiado do cache que o próprio Claude Code mantém
-- (~/.claude.json → cachedUsageUtilization). É a fonte de verdade do countdown
-- e do percentual: a janela derivada dos timestamps errava porque a coleta
-- começa no meio de uma janela já em andamento.
--
-- Uma linha por conta, sobrescrita: interessa o estado atual, não a série.
CREATE TABLE IF NOT EXISTS usage_limits (
  account              TEXT PRIMARY KEY,
  fetched_at           TIMESTAMPTZ NOT NULL,
  five_hour_pct        INT,
  five_hour_resets_at  TIMESTAMPTZ,
  seven_day_pct        INT,
  seven_day_resets_at  TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inscrições de Web Push. O endpoint é único por dispositivo/navegador.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ
);

-- Impede notificar a mesma coisa repetidas vezes. A chave é
-- (conta + nível + início da janela): mudou de nível ou virou a janela,
-- pode notificar de novo; senão, silêncio.
CREATE TABLE IF NOT EXISTS alert_state (
  account       TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  level         TEXT NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account, window_start, level)
);
