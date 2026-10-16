-- Replace the placeholder task list with the cleaning rotation schema.
DROP TABLE IF EXISTS tasks;

-- Removed roommates are deactivated, never deleted, so past weeks keep their names.
CREATE TABLE roommates (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  position   integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per week (keyed by its Monday). The client materialises the schedule
-- ahead of time; swaps, pauses and shifts rewrite future rows only.
CREATE TABLE weeks (
  week_start    date PRIMARY KEY CHECK (extract(isodow FROM week_start) = 1),
  assignee_id   integer REFERENCES roommates (id),
  paused        boolean NOT NULL DEFAULT false,
  cleaned_by_id integer REFERENCES roommates (id),
  completed_at  timestamptz,
  CHECK ((completed_at IS NULL) = (cleaned_by_id IS NULL)),
  CHECK (NOT (paused AND completed_at IS NOT NULL))
);

-- Completed weeks are history: their assignment can't be changed, only the
-- confirmation itself can be corrected or undone.
CREATE FUNCTION protect_completed_weeks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL
     AND (NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.paused <> OLD.paused) THEN
    RAISE EXCEPTION 'week % is completed; undo the confirmation before changing it', OLD.week_start;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER weeks_protect_completed BEFORE UPDATE ON weeks
  FOR EACH ROW EXECUTE FUNCTION protect_completed_weeks();

-- The public browser role can read and write but never delete.
GRANT SELECT, INSERT, UPDATE ON roommates, weeks TO cleaning_app;
