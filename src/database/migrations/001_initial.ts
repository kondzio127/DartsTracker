/** Immutable migration: change the schema through a new numbered migration. */
export const initialSchema = `
CREATE TABLE players (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT,
    flag TEXT,
    is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
    created_at TEXT NOT NULL
);
CREATE TABLE x01_matches (
    id TEXT PRIMARY KEY NOT NULL,
    start_score INTEGER NOT NULL CHECK (typeof(start_score) = 'integer' AND start_score > 0),
    best_of_legs INTEGER CHECK (best_of_legs IS NULL OR (typeof(best_of_legs) = 'integer' AND best_of_legs > 0)),
    best_of_sets INTEGER CHECK (best_of_sets IS NULL OR (typeof(best_of_sets) = 'integer' AND best_of_sets > 0)),
    status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    created_at TEXT NOT NULL,
    finished_at TEXT,
    abandoned_at TEXT
);
CREATE TABLE x01_match_players (
    match_id TEXT NOT NULL REFERENCES x01_matches(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
    PRIMARY KEY (match_id, player_id),
    UNIQUE (match_id, position)
);
CREATE INDEX x01_matches_status_created_at ON x01_matches(status, created_at DESC);
CREATE INDEX x01_match_players_player_id ON x01_match_players(player_id);
`;
