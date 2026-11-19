export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  name          VARCHAR(100),
  role          VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user','manager')),
  ab_group      CHAR(1) CHECK (ab_group IN ('A','B')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id    SERIAL PRIMARY KEY,
  slug  VARCHAR(50) UNIQUE NOT NULL,
  name  VARCHAR(100) UNIQUE NOT NULL,
  icon  VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  old_price     NUMERIC(10,2) CHECK (old_price IS NULL OR old_price >= 0),
  rating        NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  reviews_count INTEGER NOT NULL DEFAULT 0,
  badge         VARCHAR(20),
  image_url     VARCHAR(500),
  gradient      SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS interactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  event_type  VARCHAR(16) NOT NULL CHECK (event_type IN ('view','select')),
  weight      SMALLINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_product ON interactions(product_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  top_categories     JSONB NOT NULL DEFAULT '[]',
  interactions_count INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   SMALLINT NOT NULL CHECK (quantity > 0),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255) UNIQUE NOT NULL,
  confirmed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS models (
  id         SERIAL PRIMARY KEY,
  algorithm  VARCHAR(32) NOT NULL,
  params     JSONB NOT NULL DEFAULT '{}',
  trained_at TIMESTAMPTZ,
  train_ms   INTEGER,
  status     VARCHAR(16) NOT NULL DEFAULT 'training' CHECK (status IN ('training','ready','failed','retired'))
);

CREATE TABLE IF NOT EXISTS experiments (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  model_a_id    INTEGER NOT NULL REFERENCES models(id),
  model_b_id    INTEGER NOT NULL REFERENCES models(id),
  traffic_split SMALLINT NOT NULL CHECK (traffic_split BETWEEN 1 AND 99),
  status        VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommendations (
  id         BIGSERIAL PRIMARY KEY,
  batch_id   UUID NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model_id   INTEGER REFERENCES models(id),
  algorithm  VARCHAR(32) NOT NULL,
  ab_group   CHAR(1),
  rank       SMALLINT NOT NULL CHECK (rank >= 1),
  score      REAL NOT NULL,
  match_pct  SMALLINT,
  reason     VARCHAR(200) NOT NULL,
  reason_type VARCHAR(20) NOT NULL,
  stale      BOOLEAN NOT NULL DEFAULT false,
  clicked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reco_user ON recommendations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_reports (
  id         BIGSERIAL PRIMARY KEY,
  kind       VARCHAR(12) NOT NULL CHECK (kind IN ('complaint','bug')),
  title      VARCHAR(150) NOT NULL,
  message    TEXT NOT NULL,
  page       VARCHAR(500),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  status     VARCHAR(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved','dismissed')),
  admin_note TEXT,
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_reports_status ON site_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS metrics (
  id            BIGSERIAL PRIMARY KEY,
  model_id      INTEGER REFERENCES models(id),
  experiment_id INTEGER REFERENCES experiments(id),
  algorithm     VARCHAR(32) NOT NULL,
  name          VARCHAR(32) NOT NULL,
  k             SMALLINT,
  segment       VARCHAR(16) NOT NULL DEFAULT 'all',
  value         DOUBLE PRECISION NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_alg ON metrics(algorithm, computed_at DESC);
`;
