CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id    INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  text         TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL,
  start_date   TEXT,
  end_date     TEXT,
  parent_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  progress     INTEGER NOT NULL DEFAULT 0,
  done         BOOLEAN NOT NULL DEFAULT false,
  order_key    DOUBLE PRECISION NOT NULL DEFAULT 1000,
  style        JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS links (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  style      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS columns (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  color   TEXT,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_folder ON tasks(folder_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
