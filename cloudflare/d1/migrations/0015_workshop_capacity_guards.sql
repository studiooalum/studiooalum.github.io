CREATE TRIGGER IF NOT EXISTS trg_workshop_reservations_capacity_insert
BEFORE INSERT ON workshop_reservations
WHEN NEW.status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
BEGIN
  SELECT CASE
    WHEN (
      COALESCE((
        SELECT SUM(attendee_count)
        FROM workshop_reservations
        WHERE slot_key = NEW.slot_key
          AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
      ), 0) + NEW.attendee_count
    ) > COALESCE(
      (
        SELECT NULLIF(CAST(json_extract(slot.value, '$.capacity') AS INTEGER), 0)
        FROM workshops AS workshop, json_each(workshop.schedule_slots_json) AS slot
        WHERE workshop.slug = NEW.workshop_slug
          AND json_extract(slot.value, '$.key') = NEW.slot_key
        LIMIT 1
      ),
      (SELECT NULLIF(max_participants, 0) FROM workshop_booking_configs WHERE workshop_slug = NEW.workshop_slug),
      (SELECT NULLIF(max_capacity, 0) FROM workshops WHERE slug = NEW.workshop_slug),
      1
    )
    THEN RAISE(ABORT, 'workshop_capacity_exceeded')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_workshop_reservations_capacity_update
BEFORE UPDATE OF slot_key, attendee_count, status ON workshop_reservations
WHEN NEW.status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
BEGIN
  SELECT CASE
    WHEN (
      COALESCE((
        SELECT SUM(attendee_count)
        FROM workshop_reservations
        WHERE slot_key = NEW.slot_key
          AND id <> OLD.id
          AND status IN ('waiting_for_group', 'waiting_for_payment', 'confirmed')
      ), 0) + NEW.attendee_count
    ) > COALESCE(
      (
        SELECT NULLIF(CAST(json_extract(slot.value, '$.capacity') AS INTEGER), 0)
        FROM workshops AS workshop, json_each(workshop.schedule_slots_json) AS slot
        WHERE workshop.slug = NEW.workshop_slug
          AND json_extract(slot.value, '$.key') = NEW.slot_key
        LIMIT 1
      ),
      (SELECT NULLIF(max_participants, 0) FROM workshop_booking_configs WHERE workshop_slug = NEW.workshop_slug),
      (SELECT NULLIF(max_capacity, 0) FROM workshops WHERE slug = NEW.workshop_slug),
      1
    )
    THEN RAISE(ABORT, 'workshop_capacity_exceeded')
  END;
END;