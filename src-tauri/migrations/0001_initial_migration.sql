CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT NOT NULL,
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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

CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY NOT NULL,
    external_id TEXT,
    legal_name TEXT,
    trade_name TEXT,
    cnpj TEXT,
    department TEXT,
    email TEXT,
    phone TEXT,
    street TEXT,
    neighborhood TEXT,
    number TEXT,
    city TEXT,
    state TEXT,
    zipcode TEXT,
    country TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
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

CREATE TABLE IF NOT EXISTS posture_calibrations (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER,
    baseline_neck_angle REAL NOT NULL,
    baseline_shoulder_balance REAL NOT NULL,
    baseline_distance_cm REAL NOT NULL,
    baseline_eye_distance_px REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_posture_calibrations_active ON posture_calibrations(is_active);
CREATE INDEX IF NOT EXISTS idx_posture_calibrations_user_id ON posture_calibrations(user_id);

CREATE TABLE IF NOT EXISTS monitoring_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    average_score REAL NOT NULL DEFAULT 100.0,
    good_posture_percentage REAL NOT NULL DEFAULT 100.0,
    warning_posture_percentage REAL NOT NULL DEFAULT 0.0,
    danger_posture_percentage REAL NOT NULL DEFAULT 0.0,
    total_alerts_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_user_id ON monitoring_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_started_at ON monitoring_sessions(started_at);
