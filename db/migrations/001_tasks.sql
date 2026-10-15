CREATE TABLE IF NOT EXISTS tasks (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  room       text NOT NULL DEFAULT '' CHECK (length(room) <= 100),
  done       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
