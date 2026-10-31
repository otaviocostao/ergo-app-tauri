-- Snapshot metrics may be unavailable for a whole window (e.g. no face for the
-- distance estimate). Persist NULL instead of a fabricated 0. SQLite cannot drop
-- NOT NULL in place, so the table is rebuilt keeping every existing row.
CREATE TABLE posture_metrics_snapshots_new (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    avg_neck_angle REAL,
    max_neck_angle REAL,
    avg_shoulder_balance REAL,
    min_shoulder_balance REAL,
    avg_distance_cm REAL,
    blink_count INTEGER NOT NULL DEFAULT 0,
    dominant_status TEXT NOT NULL,
    score REAL NOT NULL,
    samples_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (session_id) REFERENCES monitoring_sessions(id) ON DELETE CASCADE
);

INSERT INTO posture_metrics_snapshots_new (
    id, session_id, timestamp, avg_neck_angle, max_neck_angle,
    avg_shoulder_balance, min_shoulder_balance, avg_distance_cm,
    blink_count, dominant_status, score, samples_count, created_at
)
SELECT
    id, session_id, timestamp, avg_neck_angle, max_neck_angle,
    avg_shoulder_balance, min_shoulder_balance, avg_distance_cm,
    blink_count, dominant_status, score, samples_count, created_at
FROM posture_metrics_snapshots;

DROP TABLE posture_metrics_snapshots;
ALTER TABLE posture_metrics_snapshots_new RENAME TO posture_metrics_snapshots;

CREATE INDEX IF NOT EXISTS idx_posture_metrics_snapshots_session_id ON posture_metrics_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_posture_metrics_snapshots_timestamp ON posture_metrics_snapshots(timestamp);
