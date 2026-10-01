CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    interval INTEGER NOT NULL,
    period TEXT NOT NULL,
    frequency TEXT NOT NULL,
    notification_tone INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ativo',
    start_time TEXT,
    end_time TEXT,
    reminder_date TEXT,
    custom_days TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY NOT NULL,
    device_type TEXT NOT NULL DEFAULT 'desktop',
    is_webcam_front INTEGER NOT NULL DEFAULT 1,
    has_external_keyboard INTEGER NOT NULL DEFAULT 1,
    has_external_mouse INTEGER NOT NULL DEFAULT 1,
    adjustable_desk INTEGER NOT NULL DEFAULT 0,
    adjustable_chair INTEGER NOT NULL DEFAULT 1,
    adjustable_monitor INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE VIEW IF NOT EXISTS workspace AS SELECT * FROM workspaces;
