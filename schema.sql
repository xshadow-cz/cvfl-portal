-- ====================================================================
-- CVFL Portál - Relační Databázové Schéma (schema.sql)
-- Kompatibilní s SQLite a PostgreSQL
-- ====================================================================

-- 1. TABULKA KLUBŮ / TÝMŮ
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    league TEXT NOT NULL CHECK(league IN ('1_Liga', '2_Liga')),
    base_points INTEGER DEFAULT 0,
    deducted_points INTEGER DEFAULT 0,
    deduction_reason TEXT DEFAULT '',
    played INTEGER DEFAULT 0,
    won INTEGER DEFAULT 0,
    drawn INTEGER DEFAULT 0,
    lost INTEGER DEFAULT 0,
    gf INTEGER DEFAULT 0,
    ga INTEGER DEFAULT 0,
    logo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABULKA REGISTROVANÝCH HRÁČŮ
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    roblox_nick TEXT NOT NULL UNIQUE,
    discord_nick TEXT NOT NULL,
    discord_id TEXT,
    roblox_id TEXT,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    motm INTEGER DEFAULT 0,
    is_transfer_banned BOOLEAN DEFAULT 0,
    transfer_ban_until TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trainers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    roblox_nick TEXT NOT NULL UNIQUE,
    discord_nick TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Coach' CHECK(role IN ('Owner', 'Coach')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABULKA ROZHODČÍCH A DELEGÁTŮ
CREATE TABLE IF NOT EXISTS referees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roblox_nick TEXT NOT NULL UNIQUE,
    discord_nick TEXT NOT NULL,
    license TEXT NOT NULL CHECK(license IN ('A', 'B', 'C')),
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended')),
    suspension_reason TEXT,
    is_delegate BOOLEAN DEFAULT 0,
    discord_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABULKA ZÁPASŮ A ELEKTRONICKÉHO ZÁPISU (FIS ZOU)
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round INTEGER DEFAULT 1,
    competition TEXT NOT NULL,
    cup_stage TEXT,
    home_team_id INTEGER NOT NULL REFERENCES teams(id),
    away_team_id INTEGER NOT NULL REFERENCES teams(id),
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    home_penalty_score INTEGER DEFAULT 0,
    away_penalty_score INTEGER DEFAULT 0,
    stadium TEXT DEFAULT 'TBD',
    match_date TEXT DEFAULT 'TBA',
    status TEXT DEFAULT 'Scheduled' CHECK(status IN ('Scheduled', 'In_Progress', 'Completed', 'Postponed')),
    referee TEXT,
    delegate TEXT,
    fourth_ref TEXT,
    var TEXT,
    recorder TEXT DEFAULT 'Vedení Ligy',
    spectators INTEGER DEFAULT 120,
    start_time TEXT,
    end_time TEXT,
    is_ready BOOLEAN DEFAULT 0,
    is_locked BOOLEAN DEFAULT 0,
    is_forfeited BOOLEAN DEFAULT 0,
    forfeit_winner TEXT,
    forfeit_reason TEXT,
    delegate_review TEXT,
    delegate_alert_ref_mgr BOOLEAN DEFAULT 0,
    punishment_statement TEXT,
    send_statement_to_dk BOOLEAN DEFAULT 0,
    checks_json TEXT DEFAULT '{}',
    period_checks_json TEXT DEFAULT '{}',
    home_roster_json TEXT DEFAULT '[]',
    away_roster_json TEXT DEFAULT '[]',
    home_staff_json TEXT DEFAULT '[]',
    away_staff_json TEXT DEFAULT '[]',
    events_json TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suspension_served_matches (
    suspension_id INTEGER NOT NULL REFERENCES suspensions(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    PRIMARY KEY (suspension_id, match_id)
);

-- 5. TABULKA DISCIPLINÁRNÍCH TRESTŮ A STOPEK
CREATE TABLE IF NOT EXISTS suspensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    player_nick TEXT NOT NULL,
    team_name TEXT,
    type TEXT NOT NULL,
    matches_count INTEGER,
    duration_time TEXT,
    reason TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABULKA ODEČTŮ BODŮ KLUBŮM
CREATE TABLE IF NOT EXISTS points_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABULKA AUDITNÍHO LOGU DISCIPLINÁRKY
CREATE TABLE IF NOT EXISTS dk_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    type TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO site_settings (key, value) VALUES ('maintenance_mode', '0');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('maintenance_notice', '');
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('system_announcement', 'Vítejte v oficiálním CVFL Portálu!');

CREATE TABLE IF NOT EXISTS discord_users (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discord_user_roles (
    discord_id TEXT NOT NULL REFERENCES discord_users(discord_id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_id, role)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL REFERENCES discord_users(discord_id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discord_invites (
    token_hash TEXT PRIMARY KEY,
    roles_json TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    used_by TEXT,
    revoked_at DATETIME,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
