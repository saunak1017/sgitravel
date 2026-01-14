PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_type TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  cost_cash REAL,
  cost_miles INTEGER,
  fees REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  class TEXT,
  secondary_class TEXT,
  ticket_end TEXT,
  issued_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  flight_number TEXT NOT NULL,
  flight_date TEXT NOT NULL,
  origin TEXT,
  destination TEXT,
  sched_departure TEXT,
  sched_arrival TEXT,
  airline TEXT,
  aircraft_type TEXT,
  segment_group TEXT NOT NULL DEFAULT 'Outbound',
  fetched_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traveler_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  pnr TEXT NOT NULL,
  category TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  refund_method TEXT,
  refund_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE INDEX IF NOT EXISTS idx_segments_booking ON segments(booking_id);
CREATE INDEX IF NOT EXISTS idx_traveler_booking ON traveler_bookings(booking_id);
CREATE INDEX IF NOT EXISTS idx_traveler_person ON traveler_bookings(person_id);
