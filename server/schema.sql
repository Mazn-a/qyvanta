-- قيفانتا: قاعدة مركزية واحدة للعميل والمطعم والإدارة.
-- المبالغ بالهللة (INTEGER). لا تُستخدم أرقام الفاصلة العائمة.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city_id TEXT NOT NULL REFERENCES cities(id),
  district TEXT NOT NULL,
  specialty TEXT NOT NULL,
  phone TEXT,
  accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_luxury INTEGER NOT NULL,
  price_regular INTEGER NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  published BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'restaurant', 'admin')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  company_email TEXT,
  company_name TEXT,
  restaurant_id TEXT REFERENCES restaurants(id),
  permissions TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  public_no TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  city_id TEXT NOT NULL REFERENCES cities(id),
  city_name TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  personal_email TEXT NOT NULL,
  company_email TEXT,
  company_name TEXT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  attendees INTEGER NOT NULL,
  event_date DATE NOT NULL,
  pickup_time TEXT NOT NULL,
  pickup_location TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending_restaurant', 'confirmed', 'rejected', 'delivered', 'cancelled')),
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_requested_at TIMESTAMPTZ,
  reject_reason TEXT,
  subtotal_halalas INTEGER NOT NULL,
  voucher_discount_halalas INTEGER NOT NULL DEFAULT 0,
  total_halalas INTEGER NOT NULL,
  voucher_id TEXT,
  voucher_use TEXT NOT NULL DEFAULT 'none' CHECK (voucher_use IN ('none', 'reserved', 'applied', 'released')),
  wifaq_covered_halalas INTEGER NOT NULL DEFAULT 0,
  reward_status TEXT NOT NULL DEFAULT 'pending' CHECK (reward_status IN ('pending', 'earned', 'not_eligible')),
  reward_halalas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  delivered_at TIMESTAMPTZ,
  delivered_by TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  rating_json TEXT,
  settlement_id TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('luxury', 'regular')),
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  line_halalas INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  value_halalas INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'used', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  reserved_order_id TEXT,
  used_order_id TEXT,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reward_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('earn', 'voucher_issued', 'voucher_reserved', 'voucher_released', 'voucher_used', 'correction')),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_halalas INTEGER NOT NULL,
  balance_after_halalas INTEGER NOT NULL,
  order_id TEXT,
  voucher_id TEXT,
  eligible_halalas INTEGER,
  reason TEXT,
  actor_id TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'delivery')),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  path TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  covered_halalas INTEGER NOT NULL DEFAULT 0,
  paid_halalas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'settled', 'review')),
  pay_ref TEXT,
  paid_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_orders (
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id),
  covered_halalas INTEGER NOT NULL,
  PRIMARY KEY (settlement_id, order_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_access_log (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  actor_id TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest', 'customer')),
  user_id TEXT REFERENCES users(id),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page TEXT NOT NULL DEFAULT 'marketing',
  step INTEGER NOT NULL DEFAULT 0,
  stop_label TEXT NOT NULL DEFAULT 'تصفّح الرئيسية',
  started_order BOOLEAN NOT NULL DEFAULT FALSE,
  reached_review BOOLEAN NOT NULL DEFAULT FALSE,
  visits INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_restaurant_idx ON orders(restaurant_id, status, event_date);
CREATE INDEX IF NOT EXISTS vouchers_user_idx ON vouchers(user_id, status);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON reward_ledger(user_id, at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  order_no TEXT NOT NULL DEFAULT '',
  media_filename TEXT,
  media_mime TEXT,
  media_kind TEXT,
  media_name TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'working', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at TIMESTAMPTZ,
  done_by TEXT
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);
