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
