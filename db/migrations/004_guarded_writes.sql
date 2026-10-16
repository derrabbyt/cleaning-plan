-- Guarded writes for a plan shared by several people: every change states what the
-- client saw, and is refused (SQLSTATE CP001) if someone else changed it meanwhile.
-- That way a stale tab can't overwrite a roommate's swap, or apply a shift twice.

-- Rewrites future weeks. Each week must still have the assignment the client saw and
-- must not be confirmed; active weeks need an active roommate, paused weeks nobody.
CREATE FUNCTION save_weeks(
  p_start date[], p_old_assignee integer[], p_old_paused boolean[], p_assignee integer[], p_paused boolean[]
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM weeks WHERE week_start = ANY (p_start) ORDER BY week_start FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM unnest(p_start, p_old_assignee, p_old_paused) AS e(start, assignee, paused)
    LEFT JOIN weeks w ON w.week_start = e.start
    WHERE w.week_start IS NULL OR w.completed_at IS NOT NULL
       OR w.assignee_id IS DISTINCT FROM e.assignee OR w.paused IS DISTINCT FROM e.paused
  ) THEN
    RAISE EXCEPTION 'The plan was changed by someone else' USING ERRCODE = 'CP001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_assignee, p_paused) AS n(assignee, paused)
    WHERE CASE WHEN n.paused THEN n.assignee IS NOT NULL
               ELSE NOT EXISTS (SELECT 1 FROM roommates r WHERE r.id = n.assignee AND r.active) END
  ) THEN
    RAISE EXCEPTION 'Active weeks need a current roommate, paused weeks nobody' USING ERRCODE = 'CP001';
  END IF;

  UPDATE weeks w SET assignee_id = n.assignee, paused = n.paused
  FROM unnest(p_start, p_assignee, p_paused) AS n(start, assignee, paused)
  WHERE w.week_start = n.start;
END $$;

-- Saves the rotation. `p_expected` is the active order the client saw; `p_ids` is the
-- new order, where negative ids are new roommates called `p_names`. Returns the real ids.
CREATE FUNCTION save_rotation(p_expected integer[], p_ids integer[], p_names text[])
RETURNS integer[] LANGUAGE plpgsql AS $$
DECLARE
  ids integer[] := '{}';
  id integer;
BEGIN
  LOCK TABLE roommates IN SHARE ROW EXCLUSIVE MODE;

  IF array(SELECT r.id FROM roommates r WHERE r.active ORDER BY r.position, r.id) IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'The rotation was changed by someone else' USING ERRCODE = 'CP001';
  END IF;

  FOR i IN 1 .. coalesce(array_length(p_ids, 1), 0) LOOP
    IF p_ids[i] < 0 THEN
      INSERT INTO roommates (name, position) VALUES (p_names[i], i - 1) RETURNING roommates.id INTO id;
    ELSIF p_ids[i] = ANY (p_expected) THEN
      UPDATE roommates SET name = p_names[i], position = i - 1 WHERE roommates.id = p_ids[i] RETURNING roommates.id INTO id;
    ELSE
      RAISE EXCEPTION 'Unknown roommate %', p_ids[i] USING ERRCODE = 'CP001';
    END IF;
    ids := ids || id;
  END LOOP;

  UPDATE roommates SET active = false WHERE active AND NOT (roommates.id = ANY (ids));
  RETURN ids;
END $$;

REVOKE ALL ON FUNCTION save_weeks(date[], integer[], boolean[], integer[], boolean[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_rotation(integer[], integer[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_weeks(date[], integer[], boolean[], integer[], boolean[]) TO cleaning_app;
GRANT EXECUTE ON FUNCTION save_rotation(integer[], integer[], text[]) TO cleaning_app;
