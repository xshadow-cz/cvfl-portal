/**
 * ====================================================================
 * CVFL Portál - Backend Server (Node.js + Express + PostgreSQL / SQLite)
 * ====================================================================
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_FILE ? path.resolve(__dirname, process.env.DATABASE_FILE) : path.join(__dirname, 'cvfl.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID || '928288966162141194';
const PLAYER_BOT_API_URL = (process.env.PLAYER_BOT_API_URL || '').trim();
const PLAYER_BOT_API_TOKEN = (process.env.PLAYER_BOT_API_TOKEN || '').trim();
const PLAYER_BOT_SYNC_INTERVAL_MS = Number(process.env.PLAYER_BOT_SYNC_INTERVAL_MS || 60000);

if (!Number.isInteger(PLAYER_BOT_SYNC_INTERVAL_MS) ||
    PLAYER_BOT_SYNC_INTERVAL_MS < 10000 || PLAYER_BOT_SYNC_INTERVAL_MS > 86400000) {
    throw new Error('PLAYER_BOT_SYNC_INTERVAL_MS musí být celé číslo mezi 10000 a 86400000.');
}

const playerSyncStatus = {
    enabled: Boolean(PLAYER_BOT_API_URL || PLAYER_BOT_API_TOKEN),
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    syncedPlayers: 0,
    archivedPlayers: 0
};
let playerSyncInProgress = false;

const allowedOrigins = [
    'https://portal.cvfl.cz',
    process.env.APP_ORIGIN
].filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, origin);
        }
        callback(null, false);
    },
    credentials: true
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const databaseRelativePath = path.relative(__dirname, DB_PATH).split(path.sep).join('/');
app.use((req, res, next) => {
    const requestedPath = req.path.replace(/^\/+/, '');
    const isDatabaseFile = databaseRelativePath !== '..' &&
        (requestedPath === databaseRelativePath || requestedPath.startsWith(`${databaseRelativePath}-`));
    if (isDatabaseFile || ['schema.sql', 'server.js'].includes(requestedPath)) {
        return res.sendStatus(404);
    }
    next();
});
app.use(express.static(__dirname, { dotfiles: 'deny' }));

let isPostgres = false;
let dbClient = null;
let isDatabaseReady = false;

if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    isPostgres = true;
    dbClient = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log('✅ Připojování k PostgreSQL databázi (Supabase)...');
    initPostgresDatabase();
} else {
    const Database = require('better-sqlite3');
    try {
        dbClient = new Database(DB_PATH);
        dbClient.pragma('foreign_keys = ON');
        console.log(`✅ SQLite databáze úspěšně připojena: ${DB_PATH}`);
        initSqliteDatabase();
    } catch (err) {
        console.error('❌ Chyba při otevírání SQLite databáze:', err.message);
    }
}

async function dbAll(sql, params = []) {
    if (isPostgres) {
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`)
                         .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
                         .replace(/COLLATE NOCASE/gi, '');
        const res = await dbClient.query(pgSql, params);
        return res.rows;
    } else {
        return dbClient.prepare(sql).all(params);
    }
}

async function dbGet(sql, params = []) {
    const rows = await dbAll(sql, params);
    return rows[0] || null;
}

async function dbRun(sql, params = []) {
    if (isPostgres) {
        let paramIndex = 1;
        let pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`)
                       .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');

        if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
            pgSql += ' RETURNING id';
        }

        const res = await dbClient.query(pgSql, params);
        return {
            lastID: res.rows[0]?.id || null,
            changes: res.rowCount
        };
    } else {
        const info = dbClient.prepare(sql).run(params);
        return { lastID: info.lastInsertRowid, changes: info.changes };
    }
}

async function withDatabaseTransaction(callback) {
    if (isPostgres) {
        const client = await dbClient.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } else {
        const transaction = dbClient.transaction(callback);
        return transaction();
    }
}

async function initPostgresDatabase() {
    try {
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                league TEXT NOT NULL,
                logo TEXT,
                base_points INT DEFAULT 0,
                deducted_points INT DEFAULT 0,
                deduction_reason TEXT DEFAULT '',
                played INT DEFAULT 0,
                won INT DEFAULT 0,
                drawn INT DEFAULT 0,
                lost INT DEFAULT 0,
                gf INT DEFAULT 0,
                ga INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                team_id INT REFERENCES teams(id) ON DELETE SET NULL,
                roblox_nick TEXT NOT NULL,
                discord_nick TEXT NOT NULL,
                discord_id TEXT UNIQUE,
                roblox_id TEXT UNIQUE,
                goals INT DEFAULT 0,
                assists INT DEFAULT 0,
                clean_sheets INT DEFAULT 0,
                motm INT DEFAULT 0,
                is_transfer_banned BOOLEAN DEFAULT FALSE,
                transfer_ban_until TEXT,
                is_archived BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS referees (
                id SERIAL PRIMARY KEY,
                roblox_nick TEXT UNIQUE NOT NULL,
                discord_nick TEXT NOT NULL,
                license TEXT DEFAULT 'C',
                status TEXT DEFAULT 'Active',
                suspension_reason TEXT DEFAULT '',
                is_delegate BOOLEAN DEFAULT FALSE,
                discord_id TEXT UNIQUE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS trainers (
                id SERIAL PRIMARY KEY,
                team_id INT REFERENCES teams(id) ON DELETE CASCADE,
                roblox_nick TEXT NOT NULL,
                discord_nick TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'Coach'
            );
            CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY,
                round INT DEFAULT 1,
                competition TEXT DEFAULT 'CVFL 1. Liga',
                cup_stage TEXT,
                home_team_id INT REFERENCES teams(id) ON DELETE CASCADE,
                away_team_id INT REFERENCES teams(id) ON DELETE CASCADE,
                home_score INT DEFAULT 0,
                away_score INT DEFAULT 0,
                home_penalty_score INT DEFAULT 0,
                away_penalty_score INT DEFAULT 0,
                stadium TEXT DEFAULT 'TBD',
                match_date TEXT DEFAULT 'TBA',
                status TEXT DEFAULT 'Scheduled',
                referee TEXT,
                delegate TEXT,
                fourth_ref TEXT,
                var TEXT,
                recorder TEXT,
                spectators INT,
                start_time TEXT,
                end_time TEXT,
                is_ready BOOLEAN DEFAULT FALSE,
                is_locked BOOLEAN DEFAULT FALSE,
                is_forfeited BOOLEAN DEFAULT FALSE,
                forfeit_winner TEXT,
                forfeit_reason TEXT,
                delegate_review TEXT,
                delegate_alert_ref_mgr BOOLEAN DEFAULT FALSE,
                punishment_statement TEXT,
                send_statement_to_dk BOOLEAN DEFAULT FALSE,
                checks_json TEXT DEFAULT '{}',
                period_checks_json TEXT DEFAULT '{}',
                home_roster_json TEXT DEFAULT '[]',
                away_roster_json TEXT DEFAULT '[]',
                home_staff_json TEXT DEFAULT '[]',
                away_staff_json TEXT DEFAULT '[]',
                events_json TEXT DEFAULT '[]',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS suspensions (
                id SERIAL PRIMARY KEY,
                player_id INT REFERENCES players(id) ON DELETE CASCADE,
                team_id INT REFERENCES teams(id) ON DELETE CASCADE,
                player_nick TEXT NOT NULL,
                team_name TEXT NOT NULL,
                type TEXT NOT NULL,
                matches_count INT DEFAULT 0,
                duration_time TEXT,
                reason TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS suspension_served_matches (
                suspension_id INT REFERENCES suspensions(id) ON DELETE CASCADE,
                match_id INT REFERENCES matches(id) ON DELETE CASCADE,
                PRIMARY KEY (suspension_id, match_id)
            );
            CREATE TABLE IF NOT EXISTS points_deductions (
                id SERIAL PRIMARY KEY,
                team_id INT REFERENCES teams(id) ON DELETE CASCADE,
                points INT NOT NULL,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS dk_audit_logs (
                id SERIAL PRIMARY KEY,
                time TEXT NOT NULL,
                type TEXT NOT NULL,
                target TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS site_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS discord_users (
                discord_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                avatar_hash TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS discord_user_roles (
                discord_id TEXT REFERENCES discord_users(discord_id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                PRIMARY KEY (discord_id, role)
            );
            CREATE TABLE IF NOT EXISTS discord_invites (
                token_hash TEXT PRIMARY KEY,
                roles_json TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_by TEXT REFERENCES discord_users(discord_id) ON DELETE SET NULL,
                used_by TEXT REFERENCES discord_users(discord_id) ON DELETE SET NULL,
                used_at TIMESTAMP,
                revoked_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                discord_id TEXT REFERENCES discord_users(discord_id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL
            );
        `);
        
        await dbClient.query("INSERT INTO site_settings (key, value) VALUES ('system_announcement', 'Vítejte v oficiálním CVFL Portálu!') ON CONFLICT DO NOTHING");
        console.log('✅ PostgreSQL databáze na Supabase byla úspěšně inicializována.');
        isDatabaseReady = true;
    } catch (err) {
        console.error('❌ Chyba při inicializaci Supabase databáze:', err.message);
    }
}

function initSqliteDatabase() {
    if (!fs.existsSync(SCHEMA_PATH)) {
        console.warn(`⚠️ Soubor schema.sql nebyl nalezen na cestě: ${SCHEMA_PATH}`);
        return;
    }

    try {
        const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
        dbClient.exec(schemaSql);

        ensureDatabaseColumn('teams', 'logo', 'TEXT');
        ensureDatabaseColumn('players', 'is_transfer_banned', 'BOOLEAN DEFAULT 0');
        ensureDatabaseColumn('players', 'discord_id', 'TEXT');
        ensureDatabaseColumn('players', 'roblox_id', 'TEXT');
        ensureDatabaseColumn('players', 'transfer_ban_until', 'TEXT');
        ensureDatabaseColumn('players', 'is_archived', 'BOOLEAN NOT NULL DEFAULT 0');
        
        dbClient.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_players_discord_id ON players(discord_id) WHERE discord_id IS NOT NULL').run();
        dbClient.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_players_roblox_id ON players(roblox_id) WHERE roblox_id IS NOT NULL').run();
        
        dbClient.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('system_announcement', 'Vítejte v oficiálním CVFL Portálu!')").run();
        ensureDatabaseColumn('matches', 'home_penalty_score', 'INTEGER DEFAULT 0');
        ensureDatabaseColumn('matches', 'away_penalty_score', 'INTEGER DEFAULT 0');
        ensureDatabaseColumn('discord_invites', 'revoked_at', 'DATETIME');
        ensureDatabaseColumn('trainers', 'role', "TEXT NOT NULL DEFAULT 'Coach'");
        ensureDatabaseColumn('referees', 'discord_id', 'TEXT');
        dbClient.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_referees_discord_id ON referees(discord_id)').run();
        
        console.log('✅ Schéma SQLite databáze bylo ověřeno a inicializováno.');
        isDatabaseReady = true;
    } catch (migrationError) {
        console.error('❌ Nepodařilo se aktualizovat schéma SQLite databáze:', migrationError.message);
    }
}

function ensureDatabaseColumn(table, column, declaration) {
    if (isPostgres) return;
    const columns = dbClient.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) {
        dbClient.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`).run();
    }
}

function validateTeamLogo(logo) {
    if (logo === undefined || logo === null || logo === '') return { valid: true, value: null };
    if (typeof logo !== 'string' || logo.length > 1_400_000) return { valid: false };
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
    if (!match) return { valid: false };
    const image = Buffer.from(match[1], 'base64');
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (image.length > 1_000_000 || image.length < 24 || !image.subarray(0, 8).equals(pngSignature) ||
        image.toString('ascii', 12, 16) !== 'IHDR') return { valid: false };
    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    if (!width || width !== height || width > 1024) return { valid: false };
    return { valid: true, value: logo };
}

function normalizeTeamName(name) {
    return String(name || '').trim().toLocaleLowerCase('cs-CZ');
}

function parseTransferBanExpiry(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'number' && typeof value !== 'string') {
        throw new Error('expires_at musí být datum, časová značka nebo null.');
    }
    const numericValue = typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : null;
    const timestamp = numericValue === null
        ? Date.parse(value)
        : numericValue > 100000000000 ? numericValue : numericValue * 1000;
    if (!Number.isFinite(timestamp)) throw new Error('Hráč má neplatné expires_at.');
    return new Date(timestamp).toISOString();
}

function validateBotPlayers(payload) {
    if (!payload || payload.complete !== true || !Array.isArray(payload.players)) {
        throw new Error('Bot musí vrátit úplný snapshot ve tvaru { complete: true, players: [...] }.');
    }

    const discordIds = new Set();
    const robloxNames = new Set();
    const robloxIds = new Set();
    return payload.players.map((player, index) => {
        if (!player || typeof player !== 'object') {
            throw new Error(`Záznam hráče č. ${index + 1} není platný objekt.`);
        }
        const discordId = String(player.discord_id || '').trim();
        const discordNick = String(player.discord_username || '').trim();
        const robloxNick = String(player.roblox_username || '').trim();
        if (!/^\d{17,20}$/.test(discordId) || !discordNick || !robloxNick) {
            throw new Error(`Hráč č. ${index + 1} nemá platné discord_id, discord_username nebo roblox_username.`);
        }
        const normalizedRobloxName = robloxNick.toLocaleLowerCase('cs-CZ');
        if (discordIds.has(discordId) || robloxNames.has(normalizedRobloxName)) {
            throw new Error(`Bot vrátil duplicitního hráče: ${robloxNick}.`);
        }
        discordIds.add(discordId);
        robloxNames.add(normalizedRobloxName);
        if (!Object.prototype.hasOwnProperty.call(player, 'current_team') ||
            (player.current_team !== null &&
                (typeof player.current_team !== 'string' || !player.current_team.trim()))) {
            throw new Error(`Hráč ${robloxNick} má neplatné current_team.`);
        }
        if (!Object.prototype.hasOwnProperty.call(player, 'expires_at')) {
            throw new Error(`Hráč ${robloxNick} nemá pole expires_at.`);
        }
        const robloxId = player.roblox_id === null || player.roblox_id === undefined || player.roblox_id === ''
            ? null
            : String(player.roblox_id).trim();
        if (robloxId && !/^\d+$/.test(robloxId)) {
            throw new Error(`Hráč ${robloxNick} má neplatné roblox_id.`);
        }
        if (robloxId && robloxIds.has(robloxId)) {
            throw new Error(`Bot vrátil duplicitní Roblox ID: ${robloxId}.`);
        }
        if (robloxId) robloxIds.add(robloxId);
        const transferBanUntil = parseTransferBanExpiry(player.expires_at);
        return {
            discordId,
            discordNick,
            robloxNick,
            robloxId,
            currentTeam: String(player.current_team || '').trim(),
            transferBanUntil,
            isTransferBanned: Boolean(transferBanUntil && Date.parse(transferBanUntil) > Date.now())
        };
    });
}

async function synchronizePlayersFromBot() {
    playerSyncStatus.lastAttemptAt = new Date().toISOString();
    if (!playerSyncStatus.enabled) throw new Error('Hráčská synchronizace není nakonfigurována.');
    
    const apiUrl = new URL(PLAYER_BOT_API_URL);
    if (apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
        throw new Error('PLAYER_BOT_API_URL nesmí obsahovat přihlašovací údaje, query parametry ani fragment.');
    }
    
    if (apiUrl.protocol !== 'https:') {
        throw new Error('PLAYER_BOT_API_URL musí používat HTTPS.');
    }
    const response = await fetch(apiUrl, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${PLAYER_BOT_API_TOKEN}`
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Hráčský bot vrátil HTTP ${response.status}.`);
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Hráčský bot nevrátil JSON.');
    }
    const responseSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(responseSize) && responseSize > 10_000_000) {
        throw new Error('Snapshot hráčů překročil limit 10 MB.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Odpověď hráčského bota nemá čitelné tělo.');
    const responseChunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > 10_000_000) {
            await reader.cancel();
            throw new Error('Snapshot hráčů překročil limit 10 MB.');
        }
        responseChunks.push(Buffer.from(value));
    }
    const responseText = Buffer.concat(responseChunks).toString('utf8');
    let payload;
    try {
        payload = JSON.parse(responseText);
    } catch {
        throw new Error('Hráčský bot vrátil neplatný JSON.');
    }
    const players = validateBotPlayers(payload);
    const result = await withDatabaseTransaction(async () => {
        const teams = await dbAll('SELECT id, name FROM teams');
        const teamsByName = new Map();
        for (const team of teams) {
            const key = normalizeTeamName(team.name);
            if (teamsByName.has(key)) throw new Error(`Názvy týmů jsou nejednoznačné: ${team.name}.`);
            teamsByName.set(key, team.id);
        }
        const existingPlayers = await dbAll(
            'SELECT id, discord_id, roblox_id, roblox_nick, is_archived FROM players'
        );
        const byDiscordId = new Map(existingPlayers.filter(player => player.discord_id)
            .map(player => [player.discord_id, player]));
        const byRobloxId = new Map(existingPlayers.filter(player => player.roblox_id)
            .map(player => [player.roblox_id, player]));
        const legacyByRobloxName = new Map(existingPlayers
            .filter(player => !player.is_archived && !player.discord_id && !player.roblox_id)
            .map(player => [
            player.roblox_nick.toLocaleLowerCase('cs-CZ'), player
            ]));
        const activePlayerIds = new Set();
        const updates = [];

        for (const player of players) {
            const teamKey = normalizeTeamName(player.currentTeam);
            const teamId = teamKey ? teamsByName.get(teamKey) : null;
            if (teamKey && teamId === undefined) {
                throw new Error(`Tým „${player.currentTeam}“ hráče ${player.robloxNick} v portálu neexistuje.`);
            }
            const existing = byDiscordId.get(player.discordId) ||
                (player.robloxId ? byRobloxId.get(player.robloxId) : null) ||
                legacyByRobloxName.get(player.robloxNick.toLocaleLowerCase('cs-CZ'));
            if (existing) {
                activePlayerIds.add(existing.id);
                updates.push({ ...player, teamId: teamId ?? null, id: existing.id });
            } else {
                updates.push({ ...player, teamId: teamId ?? null, id: null });
            }
        }

        const incomingNames = new Set(players.map(player => player.robloxNick.toLocaleLowerCase('cs-CZ')));
        for (const player of existingPlayers) {
            if (!activePlayerIds.has(player.id) &&
                incomingNames.has(player.roblox_nick.toLocaleLowerCase('cs-CZ'))) {
                throw new Error(`Roblox username ${player.roblox_nick} je již používán archivovaným záznamem.`);
            }
        }

        for (const player of updates) {
            if (player.id) {
                const current = existingPlayers.find(existing => existing.id === player.id);
                if (current && current.roblox_nick !== player.robloxNick) {
                    await dbRun('UPDATE players SET roblox_nick = ? WHERE id = ?', [
                        `__cvfl_sync_pending_${player.id}_${crypto.randomUUID()}`, player.id
                    ]);
                }
            }
        }

        for (const player of updates) {
            if (player.id) {
                await dbRun(
                    `UPDATE players SET team_id = ?, roblox_nick = ?, discord_nick = ?, discord_id = ?,
                        roblox_id = ?, is_transfer_banned = ?, transfer_ban_until = ?, is_archived = FALSE,
                        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [player.teamId, player.robloxNick, player.discordNick, player.discordId,
                        player.robloxId, player.isTransferBanned, player.transferBanUntil, player.id]
                );
            } else {
                const inserted = await dbRun(
                    `INSERT INTO players
                        (team_id, roblox_nick, discord_nick, discord_id, roblox_id,
                         is_transfer_banned, transfer_ban_until, is_archived)
                     VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
                    [player.teamId, player.robloxNick, player.discordNick, player.discordId,
                        player.robloxId, player.isTransferBanned, player.transferBanUntil]
                );
                activePlayerIds.add(inserted.lastID);
            }
        }

        let archivedPlayers = 0;
        for (const player of existingPlayers) {
            if (!activePlayerIds.has(player.id)) {
                const archived = await dbRun(
                    `UPDATE players SET team_id = NULL, is_transfer_banned = FALSE,
                        transfer_ban_until = NULL, is_archived = TRUE, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND is_archived = FALSE`,
                    [player.id]
                );
                archivedPlayers += archived.changes;
            }
        }
        return { syncedPlayers: players.length, archivedPlayers };
    });

    playerSyncStatus.lastSuccessAt = new Date().toISOString();
    playerSyncStatus.lastError = null;
    playerSyncStatus.syncedPlayers = result.syncedPlayers;
    playerSyncStatus.archivedPlayers = result.archivedPlayers;
    return result;
}

async function runPlayerSync() {
    if (playerSyncInProgress) return null;
    playerSyncInProgress = true;
    try {
        return await synchronizePlayersFromBot();
    } catch (error) {
        playerSyncStatus.lastError = error.message;
        console.error(`[CVFL Player Sync] Synchronizace selhala: ${error.message}`);
        throw error;
    } finally {
        playerSyncInProgress = false;
    }
}

function parseCookies(req) {
    return Object.fromEntries((req.headers.cookie || '').split(';').map(cookie => {
        const separator = cookie.indexOf('=');
        if (separator < 0) return ['', ''];
        return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1).trim()];
    }).filter(([key]) => key));
}

function authCookieOptions(maxAge) {
    return [
        'Path=/',
        'HttpOnly',
        'SameSite=None',
        'Secure',
        `Max-Age=${maxAge}`
    ].join('; ');
}

function oauthStateCookieOptions(maxAge) {
    return [
        'Path=/',
        'HttpOnly',
        'SameSite=None',
        'Secure',
        `Max-Age=${maxAge}`
    ].join('; ');
}

function createSignedState(stateValue) {
    const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(stateValue).digest('hex');
    return `${stateValue}.${signature}`;
}

function isValidSignedState(value, expected) {
    if (!value || !expected) return false;
    const signatureSeparator = value.lastIndexOf('.');
    if (signatureSeparator < 0) return false;
    const stateValue = value.slice(0, signatureSeparator);
    const signature = value.slice(signatureSeparator + 1);
    if (stateValue !== expected || !signature) return false;
    const expectedSignature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(stateValue).digest();
    let receivedSignature;
    try {
        receivedSignature = Buffer.from(signature, 'hex');
    } catch {
        return false;
    }
    return receivedSignature.length === expectedSignature.length &&
        crypto.timingSafeEqual(receivedSignature, expectedSignature);
}

function hasDiscordOAuthConfig() {
    return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET &&
        process.env.DISCORD_REDIRECT_URI && Buffer.byteLength(process.env.SESSION_SECRET || '') >= 32);
}

async function getAssignableRoles() {
    const baseRoles = ['Admin', 'Referee_Manager', 'DK', 'Delegate', 'Referee'];
    const teams = await dbAll('SELECT id FROM teams');
    return new Set([...baseRoles, ...teams.map(team => `Team_Manager_${team.id}`)]);
}

async function validateAssignedRoles(roles) {
    if (!Array.isArray(roles) || roles.length > 100 || roles.some(role => typeof role !== 'string')) return null;
    const validRoles = await getAssignableRoles();
    if (roles.some(role => !validRoles.has(role))) return null;
    return [...new Set(roles)];
}

async function availableRolesFor(discordId) {
    const validRoles = await getAssignableRoles();
    if (discordId === OWNER_DISCORD_ID) return [...validRoles];
    const assigned = await dbAll('SELECT role FROM discord_user_roles WHERE discord_id = ?', [discordId]);
    const roles = assigned.map(row => row.role).filter(role => validRoles.has(role));
    const referee = await dbGet('SELECT is_delegate FROM referees WHERE discord_id = ?', [discordId]);
    if (referee && validRoles.has('Referee') && !roles.includes('Referee')) roles.push('Referee');
    if (!referee) return roles.filter(role => !['Referee', 'Delegate'].includes(role));
    if (referee?.is_delegate && validRoles.has('Delegate') && !roles.includes('Delegate')) roles.push('Delegate');
    if (!referee.is_delegate) return roles.filter(role => role !== 'Delegate');
    return roles;
}

async function pruneRolelessDiscordAccount(discordId) {
    if (!discordId || discordId === OWNER_DISCORD_ID) return;
    const remainingRoles = await dbGet('SELECT COUNT(*) AS count FROM discord_user_roles WHERE discord_id = ?', [discordId]);
    if (Number(remainingRoles.count) === 0) {
        await dbRun('DELETE FROM auth_sessions WHERE discord_id = ?', [discordId]);
        await dbRun('UPDATE referees SET discord_id = NULL WHERE discord_id = ?', [discordId]);
        await dbRun('DELETE FROM discord_users WHERE discord_id = ?', [discordId]);
    }
}

async function syncRegisteredDelegateRole(discordId, isDelegate) {
    if (!discordId) return;
    const account = await dbGet('SELECT discord_id FROM discord_users WHERE discord_id = ?', [discordId]);
    if (!account) return;
    if (isDelegate) {
        await dbRun('INSERT INTO discord_user_roles (discord_id, role) VALUES (?, ?) ON CONFLICT DO NOTHING', [discordId, 'Delegate']);
        return;
    }
    await dbRun('DELETE FROM discord_user_roles WHERE discord_id = ? AND role = ?', [discordId, 'Delegate']);
    await pruneRolelessDiscordAccount(discordId);
}

async function syncRegisteredRefereeRole(discordId, isRegistered) {
    if (!discordId) return;
    const account = await dbGet('SELECT discord_id FROM discord_users WHERE discord_id = ?', [discordId]);
    if (!account) return;
    if (isRegistered) {
        await dbRun('INSERT INTO discord_user_roles (discord_id, role) VALUES (?, ?) ON CONFLICT DO NOTHING', [discordId, 'Referee']);
        return;
    }
    await dbRun('DELETE FROM discord_user_roles WHERE discord_id = ? AND role = ?', [discordId, 'Referee']);
    await pruneRolelessDiscordAccount(discordId);
}

async function removeRefereeRoles(discordId) {
    if (!discordId) return;
    await dbRun(
        "DELETE FROM discord_user_roles WHERE discord_id = ? AND role IN ('Referee', 'Delegate')",
        [discordId]
    );
    await pruneRolelessDiscordAccount(discordId);
}

function refereeUniqueConflict(error) {
    if (!error) return null;
    if (error.code === 'SQLITE_CONSTRAINT' || error.code === '23505') {
        if (error.message.includes('discord_id')) {
            return 'Tento Discord účet už je propojen s jiným profilem rozhodčího nebo delegáta.';
        }
        if (error.message.includes('roblox_nick')) {
            return 'Tento Roblox účet už má profil rozhodčího nebo delegáta.';
        }
    }
    return null;
}

async function resolveAuthenticatedUser(req) {
    if (!isDatabaseReady || !hasDiscordOAuthConfig()) return null;
    const token = parseCookies(req).cvfl_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return await dbGet(
        `SELECT auth_sessions.discord_id, discord_users.username, discord_users.avatar_hash
         FROM auth_sessions
         JOIN discord_users ON discord_users.discord_id = auth_sessions.discord_id
         WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > CURRENT_TIMESTAMP`,
        [tokenHash]
    );
}

async function requireAuthenticated(req, res, next) {
    try {
        if (!isDatabaseReady) {
            return res.status(503).json({ success: false, error: 'Databáze není připravena.' });
        }
        if (!hasDiscordOAuthConfig()) {
            return res.status(503).json({ success: false, error: 'Discord OAuth není nakonfigurován.' });
        }
        const user = await resolveAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'Přihlášení přes Discord je vyžadováno.' });
        req.auth = {
            discordId: user.discord_id,
            username: user.username,
            avatarHash: user.avatar_hash,
            roles: await availableRolesFor(user.discord_id)
        };
        next();
    } catch (err) {
        console.error('Chyba při ověřování Discord relace:', err);
        res.status(500).json({ success: false, error: 'Přihlášení se nepodařilo ověřit.' });
    }
}

function requireRoles(...roles) {
    return (req, res, next) => {
        if (roles.some(role => req.auth.roles.includes(role))) return next();
        return res.status(403).json({ success: false, error: 'Pro tuto akci nemáte přidělenou roli.' });
    };
}

async function matchesVisibleToUser(matches, auth) {
    const privilegedRoles = ['Admin', 'DK', 'Referee_Manager'];
    if (auth.roles.some(role => privilegedRoles.includes(role))) return matches;
    const teamIds = auth.roles
        .filter(role => role.startsWith('Team_Manager_'))
        .map(role => Number(role.slice('Team_Manager_'.length)));
    const official = auth.roles.some(role => role === 'Referee' || role === 'Delegate')
        ? await dbGet("SELECT roblox_nick, is_delegate FROM referees WHERE discord_id = ? AND status = 'Active'", [auth.discordId])
        : null;
    return matches.filter(match =>
        teamIds.includes(match.home_team_id) || teamIds.includes(match.away_team_id) ||
        (official && auth.roles.includes('Referee') &&
            [match.referee, match.fourth_ref, match.var].includes(official.roblox_nick)) ||
        (official && official.is_delegate && auth.roles.includes('Delegate') &&
            match.delegate === official.roblox_nick)
    );
}

async function requireMatchEditor(req, res, next) {
    const privilegedRoles = ['Admin', 'DK', 'Referee_Manager'];
    if (req.auth.roles.some(role => privilegedRoles.includes(role))) return next();

    const match = await dbGet('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!match) return res.status(404).json({ success: false, error: 'Zápas nebyl nalezen.' });
    if (req.auth.roles.some(role => ['Referee', 'Delegate'].includes(role))) {
        try {
            const assignedReferee = await dbGet(
                "SELECT roblox_nick, is_delegate FROM referees WHERE discord_id = ? AND status = 'Active'",
                [req.auth.discordId]
            );
            if (assignedReferee) {
                const isAssignedReferee = req.auth.roles.includes('Referee') &&
                    [match.referee, match.fourth_ref, match.var].includes(assignedReferee.roblox_nick);
                const isAssignedDelegate = req.auth.roles.includes('Delegate') && assignedReferee.is_delegate &&
                    match.delegate === assignedReferee.roblox_nick;
                if (isAssignedReferee || isAssignedDelegate) {
                    req.assignedOfficialMatch = true;
                    req.matchRecord = match;
                    return next();
                }
            }
        } catch (err) {
            console.error('Chyba při ověřování nominovaného rozhodčího:', err);
            return res.status(500).json({ success: false, error: 'Oprávnění k zápasu se nepodařilo ověřit.' });
        }
    }
    const managedTeamIds = req.auth.roles
        .filter(role => role.startsWith('Team_Manager_'))
        .map(role => Number(role.slice('Team_Manager_'.length)));
    if (managedTeamIds.length === 0) {
        return res.status(403).json({ success: false, error: 'Pro úpravu zápasů nemáte přidělenou roli.' });
    }
    try {
        const canManageMatch = managedTeamIds.includes(match.home_team_id) || managedTeamIds.includes(match.away_team_id);
        const body = req.body || {};
        const teamsUnchanged = Number(body.homeTeamId) === match.home_team_id &&
            Number(body.awayTeamId) === match.away_team_id;
        if (!canManageMatch || !teamsUnchanged) {
            return res.status(403).json({ success: false, error: 'Vedoucí mužstva může upravovat pouze zápasy svého týmu.' });
        }

        req.teamManagerTeamIds = managedTeamIds;
        req.matchRecord = match;
        next();
    } catch (err) {
        console.error('Chyba při ověřování oprávnění k zápasu:', err);
        res.status(500).json({ success: false, error: 'Oprávnění k zápasu se nepodařilo ověřit.' });
    }
}

app.get('/api/auth/discord', async (req, res) => {
    if (!hasDiscordOAuthConfig()) {
        return res.status(503).json({ success: false, error: 'Nastavte Discord OAuth proměnné v .env.' });
    }
    if (!isDatabaseReady) return res.status(503).json({ success: false, error: 'Databáze není připravena.' });
    const inviteToken = typeof req.query.invite === 'string' ? req.query.invite : '';
    if (inviteToken && !/^[a-f0-9]{64}$/.test(inviteToken)) {
        return res.redirect('/?authError=invite_invalid');
    }
    if (inviteToken) {
        const invite = await dbGet(
            "SELECT token_hash FROM discord_invites WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
            [crypto.createHash('sha256').update(inviteToken).digest('hex')]
        );
        if (!invite) return res.redirect('/?authError=invite_expired');
    }
    const oauthState = `${crypto.randomBytes(32).toString('hex')}${inviteToken ? `~${inviteToken}` : ''}`;
    res.setHeader('Set-Cookie', `cvfl_oauth_state=${createSignedState(oauthState)}; ${oauthStateCookieOptions(600)}`);
    const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
    authorizeUrl.search = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify',
        state: oauthState
    }).toString();
    res.redirect(authorizeUrl.toString());
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const cookies = parseCookies(req);
    res.setHeader('Set-Cookie', `cvfl_oauth_state=; ${oauthStateCookieOptions(0)}`);
    if (!hasDiscordOAuthConfig() || !isValidSignedState(cookies.cvfl_oauth_state, req.query.state)) {
        return res.redirect('/?authError=discord_state');
    }
    const oauthState = req.query.state;
    const inviteSeparator = oauthState.indexOf('~');
    const inviteToken = inviteSeparator < 0 ? '' : oauthState.slice(inviteSeparator + 1);
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: req.query.code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI
            })
        });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || 'Discord OAuth token exchange failed.');
        }
        const profileResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const profile = await profileResponse.json();
        if (!profileResponse.ok || !/^\d{17,20}$/.test(profile.id || '')) {
            throw new Error('Discord did not return a valid user profile.');
        }
        const existingUser = profile.id === OWNER_DISCORD_ID
            ? { discord_id: profile.id, username: profile.global_name || profile.username }
            : await dbGet('SELECT discord_id, username FROM discord_users WHERE discord_id = ?', [profile.id]);
        const refereeRegistration = await dbGet(
            'SELECT is_delegate FROM referees WHERE discord_id = ?',
            [profile.id]
        );
        const isUnclaimedPlaceholder = existingUser?.username === `Discord user ${profile.id}`;
        if (inviteToken && existingUser && !isUnclaimedPlaceholder) throw new Error('discord_already_registered');
        if (!inviteToken && (!existingUser || isUnclaimedPlaceholder) && !refereeRegistration) {
            throw new Error('invite_required');
        }
        if (!inviteToken && profile.id !== OWNER_DISCORD_ID &&
            (await availableRolesFor(profile.id)).length === 0 && !refereeRegistration) {
            throw new Error('access_revoked');
        }

        if (inviteToken) {
            const inviteHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
            const invite = await dbGet(
                "SELECT roles_json FROM discord_invites WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
                [inviteHash]
            );
            if (!invite) throw new Error('invite_expired');
            const roles = JSON.parse(invite.roles_json);
            const assignableRoles = await getAssignableRoles();
            const rolesToAssign = [...new Set(roles)].filter(
                role => assignableRoles.has(role) && !['Delegate', 'Referee'].includes(role)
            );
            const currentRefereeRegistration = await dbGet('SELECT is_delegate FROM referees WHERE discord_id = ?', [profile.id]);
            if (currentRefereeRegistration && assignableRoles.has('Referee')) rolesToAssign.push('Referee');
            if (currentRefereeRegistration?.is_delegate && assignableRoles.has('Delegate')) rolesToAssign.push('Delegate');
            if (!rolesToAssign.length) throw new Error('invite_roles_invalid');

            await withDatabaseTransaction(async () => {
                const claimedInvite = await dbRun(
                    "UPDATE discord_invites SET used_at = CURRENT_TIMESTAMP, used_by = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
                    [profile.id, inviteHash]
                );
                if (!claimedInvite.changes) throw new Error('invite_expired');
                if (isUnclaimedPlaceholder) {
                    await dbRun(
                        `UPDATE discord_users SET username = ?, avatar_hash = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE discord_id = ?`,
                        [profile.global_name || profile.username, profile.avatar || null, profile.id]
                    );
                    await dbRun('DELETE FROM discord_user_roles WHERE discord_id = ?', [profile.id]);
                } else {
                    await dbRun(
                        `INSERT INTO discord_users (discord_id, username, avatar_hash)
                         VALUES (?, ?, ?)`,
                        [profile.id, profile.global_name || profile.username, profile.avatar || null]
                    );
                }
                for (const role of rolesToAssign) {
                    await dbRun('INSERT INTO discord_user_roles (discord_id, role) VALUES (?, ?)', [profile.id, role]);
                }
            });
        } else {
            await withDatabaseTransaction(async () => {
                await dbRun(
                    `INSERT INTO discord_users (discord_id, username, avatar_hash)
                     VALUES (?, ?, ?)
                     ON CONFLICT(discord_id) DO UPDATE SET
                        username = EXCLUDED.username,
                        avatar_hash = EXCLUDED.avatar_hash,
                        updated_at = CURRENT_TIMESTAMP`,
                    [profile.id, profile.global_name || profile.username, profile.avatar || null]
                );
                const currentRefereeRegistration = await dbGet(
                    'SELECT is_delegate FROM referees WHERE discord_id = ?',
                    [profile.id]
                );
                if ((!existingUser || isUnclaimedPlaceholder) && !currentRefereeRegistration) {
                    throw new Error('invite_required');
                }
                if (currentRefereeRegistration) {
                    await syncRegisteredRefereeRole(profile.id, true);
                    await syncRegisteredDelegateRole(profile.id, Boolean(currentRefereeRegistration.is_delegate));
                }
            });
        }
        await dbRun('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString().replace('T', ' ').slice(0, 19);
        await dbRun(
            'INSERT INTO auth_sessions (token_hash, discord_id, expires_at) VALUES (?, ?, ?)',
            [crypto.createHash('sha256').update(sessionToken).digest('hex'), profile.id, expiresAt]
        );
        res.setHeader('Set-Cookie', [
            `cvfl_oauth_state=; ${oauthStateCookieOptions(0)}`,
            `cvfl_session=${sessionToken}; ${authCookieOptions(7 * 24 * 60 * 60)}`
        ]);
        const redirectOrigin = process.env.APP_ORIGIN || 'https://portal.cvfl.cz';
        res.redirect(redirectOrigin);
    } catch (err) {
        console.error('Chyba během Discord OAuth přihlášení:', err);
        const supportedErrors = new Set([
            'discord_already_registered', 'invite_required', 'invite_expired',
            'invite_roles_invalid', 'access_revoked'
        ]);
        const code = supportedErrors.has(err.message) ? err.message : 'discord_login';
        const redirectOrigin = process.env.APP_ORIGIN || 'https://portal.cvfl.cz';
        res.redirect(`${redirectOrigin}/?authError=${code}`);
    }
});

app.get('/api/auth/me', requireAuthenticated, (req, res) => {
    res.json({
        success: true,
        user: {
            discordId: req.auth.discordId,
            username: req.auth.username,
            avatarHash: req.auth.avatarHash,
            isOwner: req.auth.discordId === OWNER_DISCORD_ID
        },
        roles: req.auth.roles
    });
});

app.post('/api/auth/logout', requireAuthenticated, async (req, res) => {
    try {
        const token = parseCookies(req).cvfl_session;
        await dbRun('DELETE FROM auth_sessions WHERE token_hash = ?', [
            crypto.createHash('sha256').update(token).digest('hex')
        ]);
        res.setHeader('Set-Cookie', `cvfl_session=; ${authCookieOptions(0)}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Odhlášení se nepodařilo.' });
    }
});

app.get('/api/announcement', async (req, res) => {
    try {
        if (!isDatabaseReady) {
            return res.status(503).json({ success: false, error: 'Databáze není připravena.' });
        }
        const setting = await dbGet("SELECT value FROM site_settings WHERE key = 'system_announcement'");
        res.json({ success: true, announcement: setting?.value ?? '' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Oznámení se nepodařilo načíst.' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        dbType: isPostgres ? 'PostgreSQL (Supabase)' : 'SQLite',
        isReady: isDatabaseReady,
        timestamp: new Date().toISOString()
    });
});

app.use('/api', requireAuthenticated);

app.put('/api/announcement', requireRoles('Admin'), async (req, res) => {
    try {
        const announcement = req.body.announcement;
        if (typeof announcement !== 'string' || announcement.length > 500) {
            return res.status(400).json({ success: false, error: 'Oznámení musí být text do 500 znaků.' });
        }
        const value = announcement.trim();
        await dbRun(
            "INSERT INTO site_settings (key, value) VALUES ('system_announcement', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            [value]
        );
        res.json({ success: true, announcement: value });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Oznámení se nepodařilo uložit.' });
    }
});

app.get('/api/admin/discord-users', requireRoles('Admin'), async (req, res) => {
    try {
        const users = await dbAll(`
            SELECT discord_users.discord_id AS "discordId", discord_users.username,
                   discord_user_roles.role
            FROM discord_users
            LEFT JOIN discord_user_roles ON discord_user_roles.discord_id = discord_users.discord_id
            ORDER BY discord_users.username ASC
        `);
        const accounts = new Map();
        users.forEach(user => {
            if (!accounts.has(user.discordId)) {
                accounts.set(user.discordId, {
                    discordId: user.discordId,
                    username: user.username,
                    isOwner: user.discordId === OWNER_DISCORD_ID,
                    roles: []
                });
            }
            if (user.role) accounts.get(user.discordId).roles.push(user.role);
        });
        if (accounts.has(OWNER_DISCORD_ID)) {
            accounts.get(OWNER_DISCORD_ID).roles = await availableRolesFor(OWNER_DISCORD_ID);
        }
        for (const account of accounts.values()) {
            if (!account.isOwner) account.roles = await availableRolesFor(account.discordId);
            const referee = await dbGet('SELECT is_delegate FROM referees WHERE discord_id = ?', [account.discordId]);
            account.isRegisteredReferee = Boolean(referee);
            account.isRegisteredDelegate = Boolean(referee?.is_delegate);
        }
        res.json({ success: true, data: [...accounts.values()] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/discord-users/:discordId', requireRoles('Admin'), async (req, res) => {
    try {
        const { discordId } = req.params;
        if (!/^\d{17,20}$/.test(discordId)) {
            return res.status(400).json({ success: false, error: 'Zadejte platné Discord ID.' });
        }
        const account = await dbGet(
            'SELECT discord_id AS "discordId", username FROM discord_users WHERE discord_id = ?',
            [discordId]
        );
        if (!account) return res.status(404).json({ success: false, error: 'Discord účet v databázi nebyl nalezen.' });
        const referee = await dbGet('SELECT is_delegate FROM referees WHERE discord_id = ?', [discordId]);
        res.json({
            success: true,
            data: {
                ...account,
                isOwner: discordId === OWNER_DISCORD_ID,
                isRegisteredReferee: Boolean(referee),
                isRegisteredDelegate: Boolean(referee?.is_delegate),
                roles: await availableRolesFor(discordId)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Discord účet se nepodařilo načíst.' });
    }
});

app.post('/api/admin/discord-invites', requireRoles('Admin'), async (req, res) => {
    try {
        const roles = await validateAssignedRoles(req.body.roles);
        if (!roles || roles.length === 0 || roles.some(role => ['Delegate', 'Referee'].includes(role))) {
            return res.status(400).json({ success: false, error: 'Vyberte alespoň jednu platnou roli.' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString().replace('T', ' ').slice(0, 19);
        await dbRun(
            'INSERT INTO discord_invites (token_hash, roles_json, expires_at, created_by) VALUES (?, ?, ?, ?)',
            [tokenHash, JSON.stringify(roles), expiresAt, req.auth.discordId]
        );
        
        const baseUrl = process.env.APP_ORIGIN || 'https://portal.cvfl.cz';
        const inviteUrl = new URL(`/api/auth/discord?invite=${token}`, baseUrl).toString();

        res.status(201).json({ success: true, inviteUrl, expiresAt });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Pozvánku se nepodařilo vytvořit.' });
    }
});

app.get('/api/admin/discord-invites', requireRoles('Admin'), async (req, res) => {
    try {
        const invites = await dbAll(
            `SELECT token_hash AS id, roles_json AS "rolesJson", expires_at AS "expiresAt", created_at AS "createdAt"
             FROM discord_invites
             WHERE used_at IS NULL AND revoked_at IS NULL
             ORDER BY created_at DESC`
        );
        res.json({
            success: true,
            data: invites.map(invite => ({
                ...invite,
                roles: JSON.parse(invite.rolesJson),
                expired: new Date(`${String(invite.expiresAt).replace(' ', 'T')}Z`) <= new Date()
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/discord-invites/:id', requireRoles('Admin'), async (req, res) => {
    try {
        const inviteId = req.params.id;
        if (!/^[a-f0-9]{64}$/.test(inviteId)) {
            return res.status(400).json({ success: false, error: 'Pozvánka nebyla nalezena.' });
        }
        const result = await dbRun(
            `UPDATE discord_invites SET revoked_at = CURRENT_TIMESTAMP
             WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL`,
            [inviteId]
        );
        if (!result.changes) {
            return res.status(404).json({ success: false, error: 'Nepoužitá pozvánka nebyla nalezena.' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Pozvánku se nepodařilo zrušit.' });
    }
});

app.put('/api/admin/discord-users/:discordId/roles', requireRoles('Admin'), async (req, res) => {
    try {
        const { discordId } = req.params;
        const roles = await validateAssignedRoles(req.body.roles);
        if (!/^\d{17,20}$/.test(discordId) || !roles) {
            return res.status(400).json({ success: false, error: 'Zadejte platné Discord ID a seznam rolí.' });
        }
        if (discordId === OWNER_DISCORD_ID) {
            return res.status(400).json({ success: false, error: 'Role vlastníka nelze upravit.' });
        }
        const account = await dbGet('SELECT discord_id FROM discord_users WHERE discord_id = ?', [discordId]);
        if (!account) return res.status(404).json({ success: false, error: 'Discord účet nebyl nalezen.' });
        const referee = await dbGet('SELECT is_delegate FROM referees WHERE discord_id = ?', [discordId]);
        const effectiveRoles = new Set(roles.filter(role => !['Referee', 'Delegate'].includes(role)));
        if (referee) effectiveRoles.add('Referee');
        if (referee?.is_delegate) effectiveRoles.add('Delegate');
        
        await withDatabaseTransaction(async () => {
            await dbRun('DELETE FROM discord_user_roles WHERE discord_id = ?', [discordId]);
            for (const role of effectiveRoles) {
                await dbRun('INSERT INTO discord_user_roles (discord_id, role) VALUES (?, ?)', [discordId, role]);
            }
            if (effectiveRoles.size === 0) {
                await dbRun('DELETE FROM auth_sessions WHERE discord_id = ?', [discordId]);
                await dbRun('UPDATE referees SET discord_id = NULL WHERE discord_id = ?', [discordId]);
                await dbRun('DELETE FROM discord_users WHERE discord_id = ?', [discordId]);
            }
        });
        res.json({ success: true, deleted: effectiveRoles.size === 0, roles: [...effectiveRoles] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/discord-users/:discordId', requireRoles('Admin'), async (req, res) => {
    try {
        const { discordId } = req.params;
        if (!/^\d{17,20}$/.test(discordId)) {
            return res.status(400).json({ success: false, error: 'Zadejte platné Discord ID.' });
        }
        if (discordId === OWNER_DISCORD_ID) {
            return res.status(400).json({ success: false, error: 'Přístup vlastníka nelze odebrat.' });
        }
        const account = await dbGet('SELECT discord_id FROM discord_users WHERE discord_id = ?', [discordId]);
        if (!account) return res.status(404).json({ success: false, error: 'Discord účet nebyl nalezen.' });
        await withDatabaseTransaction(async () => {
            await dbRun('UPDATE referees SET discord_id = NULL WHERE discord_id = ?', [discordId]);
            await dbRun('DELETE FROM discord_users WHERE discord_id = ?', [discordId]);
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Přístup se nepodařilo odebrat.' });
    }
});

app.get('/api/state', async (req, res) => {
    try {
        const teamsRaw = await dbAll('SELECT * FROM teams ORDER BY id ASC');
        const playersRaw = await dbAll('SELECT * FROM players ORDER BY id ASC');
        const trainersRaw = await dbAll('SELECT * FROM trainers ORDER BY id ASC');
        const refereesRaw = await dbAll(
            `SELECT referees.*,
                    (referees.discord_id = ? OR EXISTS (
                        SELECT 1 FROM discord_user_roles
                        WHERE discord_user_roles.discord_id = referees.discord_id
                    )) AS has_active_account
             FROM referees ORDER BY id ASC`,
            [OWNER_DISCORD_ID]
        );
        const matchesRaw = await matchesVisibleToUser(
            await dbAll('SELECT * FROM matches ORDER BY round ASC, id ASC'),
            req.auth
        );
        const suspensionsRaw = await dbAll('SELECT * FROM suspensions ORDER BY id DESC');
        const deductionsRaw = await dbAll(`
            SELECT points_deductions.*, teams.name AS team_name
            FROM points_deductions
            LEFT JOIN teams ON teams.id = points_deductions.team_id
            ORDER BY points_deductions.id DESC
        `);
        const auditLogsRaw = await dbAll('SELECT * FROM dk_audit_logs ORDER BY id DESC LIMIT 200');
        const maintenanceSetting = await dbGet("SELECT value FROM site_settings WHERE key = 'maintenance_mode'");
        const maintenanceNoticeSetting = await dbGet("SELECT value FROM site_settings WHERE key = 'maintenance_notice'");
        const announcementSetting = await dbGet("SELECT value FROM site_settings WHERE key = 'system_announcement'");

        const teams = teamsRaw.map(t => ({
            id: t.id,
            name: t.name,
            league: t.league,
            logo: t.logo || null,
            basePoints: t.base_points,
            deducted: t.deducted_points,
            deductionReason: t.deduction_reason || '',
            played: t.played,
            won: t.won,
            drawn: t.drawn,
            lost: t.lost,
            gf: t.gf,
            ga: t.ga
        }));

        const players = playersRaw.map(p => ({
            id: p.id,
            teamId: p.team_id,
            robloxNick: p.roblox_nick,
            discordNick: p.discord_nick,
            discordId: p.discord_id,
            robloxId: p.roblox_id,
            goals: p.goals,
            assists: p.assists,
            cleanSheets: p.clean_sheets,
            motm: p.motm,
            isTransferBanned: Boolean(p.is_transfer_banned),
            transferBanUntil: p.transfer_ban_until,
            isArchived: Boolean(p.is_archived)
        }));

        const referees = refereesRaw.map(r => ({
            id: r.id,
            robloxNick: r.roblox_nick,
            discordNick: r.discord_nick,
            license: r.license,
            status: r.status,
            suspensionReason: r.suspension_reason || '',
            isDelegate: Boolean(r.is_delegate),
            isRegistered: Boolean(r.has_active_account),
            isCurrentUser: r.discord_id === req.auth.discordId
        }));

        const trainers = trainersRaw.map(t => ({
            id: t.id,
            teamId: t.team_id,
            robloxNick: t.roblox_nick,
            discordNick: t.discord_nick,
            role: t.role || 'Coach'
        }));

        const matches = matchesRaw.map(m => {
            let checks = {}, periodChecks = {}, homeRoster = [], awayRoster = [], homeStaff = [], awayStaff = [], events = [];
            try { checks = JSON.parse(m.checks_json || '{}'); } catch (e) {}
            try { periodChecks = JSON.parse(m.period_checks_json || '{}'); } catch (e) {}
            try { homeRoster = JSON.parse(m.home_roster_json || '[]'); } catch (e) {}
            try { awayRoster = JSON.parse(m.away_roster_json || '[]'); } catch (e) {}
            try { homeStaff = JSON.parse(m.home_staff_json || '[]'); } catch (e) {}
            try { awayStaff = JSON.parse(m.away_staff_json || '[]'); } catch (e) {}
            try { events = JSON.parse(m.events_json || '[]'); } catch (e) {}

            return {
                id: m.id,
                round: m.round,
                competition: m.competition,
                cupStage: m.cup_stage,
                homeTeamId: m.home_team_id,
                awayTeamId: m.away_team_id,
                homeScore: m.home_score,
                awayScore: m.away_score,
                homePenaltyScore: m.home_penalty_score || 0,
                awayPenaltyScore: m.away_penalty_score || 0,
                stadium: m.stadium || 'TBD',
                matchDate: m.match_date || 'TBA',
                status: m.status,
                referee: m.referee,
                delegate: m.delegate,
                fourthRef: m.fourth_ref,
                var: m.var,
                recorder: m.recorder,
                spectators: m.spectators,
                startTime: m.start_time,
                endTime: m.end_time,
                isReady: Boolean(m.is_ready),
                isLocked: Boolean(m.is_locked),
                isForfeited: Boolean(m.is_forfeited),
                forfeitWinner: m.forfeit_winner,
                forfeitReason: m.forfeit_reason,
                delegateReview: m.delegate_review,
                delegateAlertRefMgr: Boolean(m.delegate_alert_ref_mgr),
                punishmentStatement: m.punishment_statement,
                sendStatementToDK: Boolean(m.send_statement_to_dk),
                checks,
                periodChecks,
                homeRoster,
                awayRoster,
                homeStaff,
                awayStaff,
                events
            };
        });

        const suspensions = await Promise.all(suspensionsRaw.map(async s => {
            const served = s.type === 'Match_Count'
                ? await dbGet('SELECT COUNT(*) AS count FROM suspension_served_matches WHERE suspension_id = ?', [s.id])
                : { count: 0 };
            const remainingMatches = s.type === 'Match_Count'
                ? Math.max(0, (s.matches_count || 0) - Number(served.count))
                : null;
            const isActive = s.type === 'Match_Count'
                ? remainingMatches > 0
                : Boolean(s.duration_time && new Date(s.duration_time) > new Date());
            return {
                id: s.id,
                playerId: s.player_id,
                teamId: s.team_id,
                playerName: s.player_nick,
                playerNick: s.player_nick,
                teamName: s.team_name,
                type: s.type,
                remainingMatches,
                matchesLeft: remainingMatches,
                untilDate: s.duration_time,
                reason: s.reason,
                isActive,
                dateAdded: s.created_at
            };
        }));

        const pointsDeductions = deductionsRaw.map(d => ({
            id: d.id,
            teamId: d.team_id,
            teamName: d.team_name,
            points: d.points,
            reason: d.reason,
            dateAdded: d.created_at
        }));

        const dkAuditLogs = auditLogsRaw.map(a => ({
            id: a.id,
            time: a.time,
            type: a.type,
            action: a.type,
            target: a.target,
            details: a.details,
            timestamp: a.created_at
        }));

        res.json({
            success: true,
            data: {
                teams,
                players,
                trainers,
                referees,
                matches,
                suspensions,
                pointsDeductions,
                dkAuditLogs,
                playerSyncEnabled: playerSyncStatus.enabled,
                maintenanceMode: maintenanceSetting?.value === '1',
                maintenanceNotice: maintenanceNoticeSetting?.value || '',
                systemAnnouncement: announcementSetting?.value ?? ''
            }
        });
    } catch (err) {
        console.error('Chyba při načítání stavu:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/maintenance', requireRoles('Admin'), async (req, res) => {
    try {
        if (typeof req.body.enabled !== 'boolean') {
            return res.status(400).json({ success: false, error: 'Pole enabled musí být boolean.' });
        }
        if (req.body.notice !== undefined &&
            (typeof req.body.notice !== 'string' || req.body.notice.length > 500)) {
            return res.status(400).json({ success: false, error: 'Poznámka k údržbě musí být text do 500 znaků.' });
        }
        await dbRun(
            "INSERT INTO site_settings (key, value) VALUES ('maintenance_mode', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
            [req.body.enabled ? '1' : '0']
        );
        if (req.body.notice !== undefined) {
            await dbRun(
                "INSERT INTO site_settings (key, value) VALUES ('maintenance_notice', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
                [req.body.notice.trim()]
            );
        }
        res.json({ success: true, enabled: req.body.enabled });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/trainers', requireRoles('Admin'), async (req, res) => {
    try {
        const robloxNick = typeof req.body.robloxNick === 'string' ? req.body.robloxNick.trim() : '';
        const discordNick = typeof req.body.discordNick === 'string' ? req.body.discordNick.trim() : '';
        const teamId = Number(req.body.teamId);
        const role = req.body.role || 'Coach';
        if (!robloxNick || !discordNick || !Number.isInteger(teamId) || !['Owner', 'Coach'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Vyplňte platný Roblox/Discord username, tým a roli.' });
        }
        
        const count = await dbGet('SELECT COUNT(*) AS count FROM trainers WHERE team_id = ? AND role = \'Coach\'', [teamId]);
        if (role === 'Coach' && Number(count.count) >= 3) {
            return res.status(409).json({ success: false, error: 'Tým může mít nejvýše 3 trenéry.' });
        }

        const result = await dbRun(
            `INSERT INTO trainers (team_id, roblox_nick, discord_nick, role) VALUES (?, ?, ?, ?)`,
            [teamId, robloxNick, discordNick, role]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/teams', requireRoles('Admin'), async (req, res) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const league = req.body.league;
        const logo = validateTeamLogo(req.body.logo);
        if (!name || !['1_Liga', '2_Liga'].includes(league)) {
            return res.status(400).json({ success: false, error: 'Název týmu a platná liga jsou povinné.' });
        }
        if (!logo.valid) return res.status(400).json({ success: false, error: 'Logo musí být čtvercový PNG do 1 MB.' });
        const result = await dbRun(
            'INSERT INTO teams (name, league, logo) VALUES (?, ?, ?)',
            [name, league, logo.value]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/teams/:id', requireRoles('Admin'), async (req, res) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const league = req.body.league;
        if (!name || !['1_Liga', '2_Liga'].includes(league)) {
            return res.status(400).json({ success: false, error: 'Název týmu a platná liga jsou povinné.' });
        }
        let result;
        if (req.body.logo !== undefined) {
            const logo = validateTeamLogo(req.body.logo);
            if (!logo.valid) return res.status(400).json({ success: false, error: 'Logo musí být čtvercový PNG do 1 MB.' });
            result = await dbRun(
                'UPDATE teams SET name = ?, league = ?, logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name, league, logo.value, req.params.id]
            );
        } else {
            result = await dbRun(
                'UPDATE teams SET name = ?, league = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name, league, req.params.id]
            );
        }
        if (!result.changes) return res.status(404).json({ success: false, error: 'Tým nebyl nalezen.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/teams/:id', requireRoles('Admin'), async (req, res) => {
    try {
        const teamId = req.params.id;
        const matches = await dbGet(
            'SELECT COUNT(*) AS count FROM matches WHERE home_team_id = ? OR away_team_id = ?',
            [teamId, teamId]
        );
        if (Number(matches.count) > 0) {
            return res.status(409).json({ success: false, error: 'Tým nelze smazat, dokud má naplánované nebo odehrané zápasy.' });
        }
        await dbRun('UPDATE players SET team_id = NULL WHERE team_id = ?', [teamId]);
        const result = await dbRun('DELETE FROM teams WHERE id = ?', [teamId]);
        if (!result.changes) return res.status(404).json({ success: false, error: 'Tým nebyl nalezen.' });
        await dbRun('DELETE FROM discord_user_roles WHERE role = ?', [`Team_Manager_${teamId}`]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/players', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM players ORDER BY roblox_nick ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/players', requireRoles('Admin'), async (req, res) => {
    try {
        if (playerSyncStatus.enabled) {
            return res.status(409).json({ success: false, error: 'Hráčská data spravuje Discord bot; upravte hráče přímo v botovi.' });
        }
        const { teamId, robloxNick, discordNick, isTransferBanned } = req.body;
        if (!robloxNick || !discordNick) {
            return res.status(400).json({ success: false, error: 'Roblox Nick i Discord Nick jsou povinné!' });
        }
        const result = await dbRun(
            `INSERT INTO players (team_id, roblox_nick, discord_nick, is_transfer_banned) VALUES (?, ?, ?, ?)`,
            [teamId || null, robloxNick.trim(), discordNick.trim(), isTransferBanned ? true : false]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/players/:id', requireRoles('Admin'), async (req, res) => {
    try {
        const id = req.params.id;
        const { teamId, isTransferBanned, goals, assists, cleanSheets, motm } = req.body;
        if (playerSyncStatus.enabled &&
            (teamId !== undefined || isTransferBanned !== undefined)) {
            return res.status(409).json({ success: false, error: 'Tým a Transfer Ban spravuje Discord bot.' });
        }
        const transferBanned = isTransferBanned !== undefined ? (isTransferBanned ? true : false) : null;
        await dbRun(
            `UPDATE players SET 
                team_id = COALESCE(?, team_id),
                is_transfer_banned = COALESCE(?, is_transfer_banned),
                goals = COALESCE(?, goals),
                assists = COALESCE(?, assists),
                clean_sheets = COALESCE(?, clean_sheets),
                motm = COALESCE(?, motm),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [teamId, transferBanned, goals, assists, cleanSheets, motm, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/players/:id', requireRoles('Admin'), async (req, res) => {
    try {
        if (playerSyncStatus.enabled) {
            return res.status(409).json({ success: false, error: 'Hráčský seznam spravuje Discord bot.' });
        }
        await dbRun('DELETE FROM players WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/referees', async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT id, roblox_nick AS "robloxNick", discord_nick AS "discordNick",
                    license, status, suspension_reason AS "suspensionReason", is_delegate AS "isDelegate",
                    (discord_id = ? OR EXISTS (
                        SELECT 1 FROM discord_user_roles
                        WHERE discord_user_roles.discord_id = referees.discord_id
                    )) AS "isRegistered"
             FROM referees ORDER BY roblox_nick ASC`,
            [OWNER_DISCORD_ID]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/referees', requireRoles('Admin', 'Referee_Manager'), async (req, res) => {
    try {
        const { robloxNick, discordNick, license, isDelegate, discordId } = req.body;
        if (!robloxNick || !discordNick || !/^\d{17,20}$/.test(String(discordId || ''))) {
            return res.status(400).json({ success: false, error: 'Roblox Nick, Discord Nick a platné Discord ID jsou povinné.' });
        }
        const existingRegistration = await dbGet('SELECT id FROM referees WHERE discord_id = ?', [discordId]);
        if (existingRegistration) return res.status(409).json({ success: false, error: 'Tento Discord účet už má profil rozhodčího nebo delegáta.' });
        
        const result = await withDatabaseTransaction(async () => {
            const registration = await dbGet('SELECT id FROM referees WHERE discord_id = ?', [discordId]);
            if (registration) throw Object.assign(new Error('Tento Discord účet už má profil rozhodčího nebo delegáta.'), { code: 'REFEREE_DISCORD_CONFLICT' });
            const linkedAccount = await dbGet('SELECT discord_id FROM discord_users WHERE discord_id = ?', [discordId]);
            const inserted = await dbRun(
                `INSERT INTO referees (roblox_nick, discord_nick, license, is_delegate, discord_id) VALUES (?, ?, ?, ?, ?)`,
                [robloxNick.trim(), discordNick.trim(), license || 'C', isDelegate ? true : false, discordId]
            );
            await syncRegisteredRefereeRole(discordId, true);
            await syncRegisteredDelegateRole(discordId, Boolean(isDelegate));
            return { ...inserted, isRegistered: Boolean(linkedAccount) };
        });
        res.status(201).json({ success: true, id: result.lastID, isRegistered: result.isRegistered });
    } catch (err) {
        if (err.code === 'REFEREE_DISCORD_CONFLICT') {
            return res.status(409).json({ success: false, error: err.message });
        }
        const conflict = refereeUniqueConflict(err);
        if (conflict) return res.status(409).json({ success: false, error: conflict });
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/referees/:id', requireRoles('Admin', 'Referee_Manager'), async (req, res) => {
    try {
        const id = req.params.id;
        const { license, status, suspensionReason, isDelegate } = req.body;
        const existing = await dbGet('SELECT discord_id, is_delegate FROM referees WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, error: 'Profil rozhodčího nebyl nalezen.' });
        const newDiscordId = typeof req.body.discordId === 'string' && req.body.discordId.trim()
            ? req.body.discordId.trim()
            : existing.discord_id;
        if (newDiscordId !== existing.discord_id) {
            if (!/^\d{17,20}$/.test(newDiscordId)) {
                return res.status(400).json({ success: false, error: 'Zadejte platné Discord ID.' });
            }
            const duplicate = await dbGet('SELECT id FROM referees WHERE discord_id = ? AND id != ?', [newDiscordId, id]);
            if (duplicate) return res.status(409).json({ success: false, error: 'Tento Discord účet už je propojen s jiným profilem.' });
        }
        const delegateValue = isDelegate === undefined ? Boolean(existing.is_delegate) : Boolean(isDelegate);
        
        await withDatabaseTransaction(async () => {
            await dbRun(
                `UPDATE referees SET
                    license = COALESCE(?, license),
                    status = COALESCE(?, status),
                    suspension_reason = COALESCE(?, suspension_reason),
                    is_delegate = ?,
                    discord_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [license, status, suspensionReason, delegateValue, newDiscordId, id]
            );
            if (existing.discord_id !== newDiscordId) {
                await removeRefereeRoles(existing.discord_id);
            }
            await syncRegisteredRefereeRole(newDiscordId, true);
            await syncRegisteredDelegateRole(newDiscordId, delegateValue);
        });
        res.json({ success: true });
    } catch (err) {
        const conflict = refereeUniqueConflict(err);
        if (conflict) return res.status(409).json({ success: false, error: conflict });
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/referees/:id', requireRoles('Admin', 'Referee_Manager'), async (req, res) => {
    try {
        const referee = await dbGet('SELECT discord_id FROM referees WHERE id = ?', [req.params.id]);
        if (!referee) return res.status(404).json({ success: false, error: 'Profil rozhodčího nebyl nalezen.' });
        await withDatabaseTransaction(async () => {
            await dbRun('DELETE FROM referees WHERE id = ?', [req.params.id]);
            await removeRefereeRoles(referee.discord_id);
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/matches', async (req, res) => {
    try {
        const rows = await matchesVisibleToUser(
            await dbAll('SELECT * FROM matches ORDER BY round ASC, id ASC'),
            req.auth
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/matches', requireRoles('Admin'), async (req, res) => {
    try {
        const m = req.body || {};
        const result = await dbRun(
            `INSERT INTO matches (
                round, competition, cup_stage, home_team_id, away_team_id,
                home_score, away_score, stadium, match_date, status,
                checks_json, period_checks_json, home_roster_json, away_roster_json,
                home_staff_json, away_staff_json, events_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                m.round || 1,
                m.competition || 'CVFL 1. Liga',
                m.cupStage || null,
                m.homeTeamId,
                m.awayTeamId,
                m.homeScore || 0,
                m.awayScore || 0,
                m.stadium || 'TBD',
                m.matchDate || 'TBA',
                m.status || 'Scheduled',
                JSON.stringify(m.checks || {}),
                JSON.stringify(m.periodChecks || {}),
                JSON.stringify(m.homeRoster || []),
                JSON.stringify(m.awayRoster || []),
                JSON.stringify(m.homeStaff || []),
                JSON.stringify(m.awayStaff || []),
                JSON.stringify(m.events || [])
            ]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/matches/:id', requireMatchEditor, async (req, res) => {
    try {
        const id = req.params.id;
        const m = req.body || {};
        if (req.teamManagerTeamIds) {
            const immutableFields = [
                ['homeScore', 'home_score'],
                ['awayScore', 'away_score'],
                ['stadium', 'stadium'],
                ['matchDate', 'match_date'],
                ['status', 'status'],
                ['referee', 'referee'],
                ['delegate', 'delegate'],
                ['fourthRef', 'fourth_ref'],
                ['var', 'var'],
                ['isReady', 'is_ready', Boolean],
                ['isLocked', 'is_locked', Boolean],
                ['isForfeited', 'is_forfeited', Boolean],
                ['forfeitWinner', 'forfeit_winner'],
                ['forfeitReason', 'forfeit_reason'],
                ['delegateReview', 'delegate_review'],
                ['delegateAlertRefMgr', 'delegate_alert_ref_mgr', Boolean],
                ['punishmentStatement', 'punishment_statement'],
                ['sendStatementToDK', 'send_statement_to_dk', Boolean]
            ];
            for (const [field, column, normalize] of immutableFields) {
                if (m[field] !== undefined) {
                    const storedValue = normalize ? normalize(req.matchRecord[column]) : req.matchRecord[column];
                    if (!isDeepStrictEqual(m[field], storedValue)) {
                        return res.status(403).json({ success: false, error: 'Vedoucí mužstva nemůže měnit údaje zápasu.' });
                    }
                }
            }
            for (const [field, column, teamColumn] of [
                ['homeRoster', 'home_roster_json', 'home_team_id'],
                ['awayRoster', 'away_roster_json', 'away_team_id'],
                ['homeStaff', 'home_staff_json', 'home_team_id'],
                ['awayStaff', 'away_staff_json', 'away_team_id']
            ]) {
                if (m[field] !== undefined && !req.teamManagerTeamIds.includes(req.matchRecord[teamColumn])) {
                    if (!isDeepStrictEqual(m[field], JSON.parse(req.matchRecord[column] || '[]'))) {
                        return res.status(403).json({ success: false, error: 'Vedoucí mužstva nemůže měnit sestavu soupeře.' });
                    }
                }
            }
            for (const [field, column] of [['checks', 'checks_json'], ['periodChecks', 'period_checks_json'], ['events', 'events_json']]) {
                if (m[field] !== undefined) {
                    const defaults = field === 'checks'
                        ? { fansIssue: false, systemIssue: false, playersIssue: false, homeIdentityChecked: false, awayIdentityChecked: false }
                        : field === 'periodChecks'
                            ? { h1Started: false, h1Ended: false, h2Started: false, h2Ended: false }
                            : [];
                    const storedValue = JSON.parse(req.matchRecord[column] || (field === 'events' ? '[]' : '{}'));
                    const comparableStored = Array.isArray(defaults) ? storedValue : { ...defaults, ...storedValue };
                    const comparableRequest = Array.isArray(defaults) ? m[field] : { ...defaults, ...m[field] };
                    if (!isDeepStrictEqual(comparableRequest, comparableStored)) {
                        return res.status(403).json({ success: false, error: 'Vedoucí mužstva nemůže měnit protokol zápasu.' });
                    }
                }
            }
        }
        const penaltyError = await validatePromotionPlayoffPenalties(m, id);
        if (penaltyError) return res.status(400).json({ success: false, error: penaltyError });
        if (m.status === 'Completed' && !m.isForfeited || m.periodChecks && m.periodChecks.h1Started) {
            const lineupError = await validateMatchLineups(m);
            if (lineupError) return res.status(400).json({ success: false, error: lineupError });
        } else if (m.homeRoster !== undefined || m.awayRoster !== undefined) {
            const suspensionError = await validateMatchSuspensions(m);
            if (suspensionError) return res.status(400).json({ success: false, error: suspensionError });
        }
        const previousMatch = m.status === 'Completed'
            ? await dbGet('SELECT status FROM matches WHERE id = ?', [id])
            : null;

        const updateFields = [];
        const params = [];

        if (m.homeScore !== undefined) { updateFields.push('home_score = ?'); params.push(m.homeScore); }
        if (m.awayScore !== undefined) { updateFields.push('away_score = ?'); params.push(m.awayScore); }
        if (m.homePenaltyScore !== undefined) { updateFields.push('home_penalty_score = ?'); params.push(m.homePenaltyScore); }
        if (m.awayPenaltyScore !== undefined) { updateFields.push('away_penalty_score = ?'); params.push(m.awayPenaltyScore); }
        if (m.stadium !== undefined) { updateFields.push('stadium = ?'); params.push(m.stadium); }
        if (m.matchDate !== undefined) { updateFields.push('match_date = ?'); params.push(m.matchDate); }
        if (m.status !== undefined) { updateFields.push('status = ?'); params.push(m.status); }
        if (m.referee !== undefined) { updateFields.push('referee = ?'); params.push(m.referee); }
        if (m.delegate !== undefined) { updateFields.push('delegate = ?'); params.push(m.delegate); }
        if (m.fourthRef !== undefined) { updateFields.push('fourth_ref = ?'); params.push(m.fourthRef); }
        if (m.var !== undefined) { updateFields.push('var = ?'); params.push(m.var); }
        if (m.isReady !== undefined) { updateFields.push('is_ready = ?'); params.push(Boolean(m.isReady)); }
        if (m.isLocked !== undefined) { updateFields.push('is_locked = ?'); params.push(Boolean(m.isLocked)); }
        if (m.isForfeited !== undefined) { updateFields.push('is_forfeited = ?'); params.push(Boolean(m.isForfeited)); }
        if (m.forfeitWinner !== undefined) { updateFields.push('forfeit_winner = ?'); params.push(m.forfeitWinner); }
        if (m.forfeitReason !== undefined) { updateFields.push('forfeit_reason = ?'); params.push(m.forfeitReason); }
        if (m.delegateReview !== undefined) { updateFields.push('delegate_review = ?'); params.push(m.delegateReview); }
        if (m.delegateAlertRefMgr !== undefined) { updateFields.push('delegate_alert_ref_mgr = ?'); params.push(Boolean(m.delegateAlertRefMgr)); }
        if (m.punishmentStatement !== undefined) { updateFields.push('punishment_statement = ?'); params.push(m.punishmentStatement); }
        if (m.sendStatementToDK !== undefined) { updateFields.push('send_statement_to_dk = ?'); params.push(Boolean(m.sendStatementToDK)); }

        if (m.checks !== undefined) { updateFields.push('checks_json = ?'); params.push(JSON.stringify(m.checks)); }
        if (m.periodChecks !== undefined) { updateFields.push('period_checks_json = ?'); params.push(JSON.stringify(m.periodChecks)); }
        if (m.homeRoster !== undefined) { updateFields.push('home_roster_json = ?'); params.push(JSON.stringify(m.homeRoster)); }
        if (m.awayRoster !== undefined) { updateFields.push('away_roster_json = ?'); params.push(JSON.stringify(m.awayRoster)); }
        if (m.homeStaff !== undefined) { updateFields.push('home_staff_json = ?'); params.push(JSON.stringify(m.homeStaff)); }
        if (m.awayStaff !== undefined) { updateFields.push('away_staff_json = ?'); params.push(JSON.stringify(m.awayStaff)); }
        if (m.events !== undefined) { updateFields.push('events_json = ?'); params.push(JSON.stringify(m.events)); }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        if (updateFields.length > 1) {
            const completionGuard = m.status === 'Completed' ? " AND status != 'Completed'" : '';
            const result = await dbRun(`UPDATE matches SET ${updateFields.join(', ')} WHERE id = ?${completionGuard}`, params);
            if (m.status === 'Completed' && !m.isForfeited && previousMatch && previousMatch.status !== 'Completed' && result.changes) {
                await recordSuspensionMatches(id, m.homeTeamId, m.homeRoster || []);
                await recordSuspensionMatches(id, m.awayTeamId, m.awayRoster || []);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

async function validatePromotionPlayoffPenalties(match, matchId) {
    const current = await dbGet(
        'SELECT competition, cup_stage, round, home_team_id, away_team_id, home_score, away_score, status FROM matches WHERE id = ?',
        [matchId]
    );
    if (!current) return 'Zápas nebyl nalezen.';

    const isSecondLeg = current.competition === 'Baráž o 1. Ligu' &&
        current.cup_stage === 'Semifinále' && Number(current.round) === 2;
    const periodChecks = match.periodChecks || {};
    const homePenalties = match.homePenaltyScore ?? 0;
    const awayPenalties = match.awayPenaltyScore ?? 0;
    const penaltyActivity = periodChecks.penaltiesStarted || periodChecks.penaltiesEnded ||
        homePenalties > 0 || awayPenalties > 0;
    if (!isSecondLeg) {
        if (penaltyActivity) return 'Penalty jsou dostupné pouze ve druhém semifinálovém utkání baráže.';
        return null;
    }
    if (![homePenalties, awayPenalties].every(score => Number.isInteger(score) && score >= 0 && score <= 99)) {
        return 'Výsledek penalt musí být celé číslo od 0 do 99.';
    }
    if ((homePenalties > 0 || awayPenalties > 0) && !periodChecks.penaltiesStarted) {
        return 'Výsledek penalt lze zadat až po zahájení penaltového rozstřelu.';
    }
    if (periodChecks.penaltiesEnded && !periodChecks.penaltiesStarted) {
        return 'Penaltový rozstřel nelze ukončit před jeho zahájením.';
    }
    if (!penaltyActivity) return null;

    const priorLegs = await dbAll(
        `SELECT round, home_team_id, away_team_id, home_score, away_score, status
         FROM matches
         WHERE competition = ? AND cup_stage = ? AND id != ?
           AND home_team_id IN (?, ?) AND away_team_id IN (?, ?)`,
        [
            'Baráž o 1. Ligu', 'Semifinále', matchId,
            current.home_team_id, current.away_team_id,
            current.home_team_id, current.away_team_id
        ]
    );
    const firstLeg = priorLegs.find(leg => Number(leg.round) === 1 &&
        new Set([leg.home_team_id, leg.away_team_id]).size === 2 &&
        [leg.home_team_id, leg.away_team_id].includes(current.home_team_id) &&
        [leg.home_team_id, leg.away_team_id].includes(current.away_team_id));
    if (!firstLeg || firstLeg.status !== 'Completed') {
        return 'Penalty lze zahájit až po odehrání obou zápasů semifinále.';
    }
    const currentHomeScore = match.homeScore ?? current.home_score;
    const currentAwayScore = match.awayScore ?? current.away_score;
    const homeAggregate = (firstLeg.home_team_id === current.home_team_id ? firstLeg.home_score : firstLeg.away_score) +
        currentHomeScore;
    const awayAggregate = (firstLeg.home_team_id === current.away_team_id ? firstLeg.home_score : firstLeg.away_score) +
        currentAwayScore;
    if (homeAggregate !== awayAggregate) return 'Penalty lze zahrát pouze při shodném součtu skóre obou utkání.';
    if (current.status !== 'Completed' && match.status !== 'Completed' && !periodChecks.h2Ended) {
        return 'Penaltový rozstřel lze zahájit až po skončení druhého utkání.';
    }
    if (periodChecks.penaltiesEnded && homePenalties === awayPenalties) {
        return 'Penaltový rozstřel musí mít vítěze.';
    }
    return null;
}

async function validateMatchLineups(match) {
    for (const roster of [match.homeRoster, match.awayRoster]) {
        if (!Array.isArray(roster) || roster.length > 10) {
            return 'Zápasová soupiska může obsahovat nejvýše 10 hráčů.';
        }
        const playerIds = roster.map(item => Number(item.playerId)).filter(Number.isInteger);
        if (playerIds.length !== roster.length || new Set(playerIds).size !== roster.length) {
            return 'Sestava obsahuje neplatného nebo duplicitního hráče.';
        }
        const starters = roster.filter(player => player.isStarter).length;
        if (starters < 3 || starters > 5) return 'Každý týmy musí mít 3 až 5 hráčů v základní sestavě.';
        if (roster.filter(player => player.isGK).length !== 1) return 'Každý tým musí mít určeného právě jednoho brankáře.';
    }
    return await validateMatchSuspensions(match);
}

async function validateMatchSuspensions(match) {
    for (const [teamId, roster] of [[match.homeTeamId, match.homeRoster || []], [match.awayTeamId, match.awayRoster || []]]) {
        if (!Array.isArray(roster) || roster.length > 10) {
            return 'Zápasová soupiska může obsahovat nejvýše 10 hráčů.';
        }
        const playerIds = roster.map(item => Number(item.playerId)).filter(Number.isInteger);
        if (playerIds.length !== roster.length || new Set(playerIds).size !== roster.length) {
            return 'Sestava obsahuje neplatného nebo duplicitního hráče.';
        }
        if (roster.filter(player => player.isStarter).length > 5) {
            return 'V základní sestavě může být nejvýše 5 hráčů.';
        }
        if (playerIds.length) {
            const registeredPlayers = await dbGet(
                `SELECT COUNT(*) AS count FROM players WHERE team_id = ? AND id IN (${playerIds.map(() => '?').join(', ')})`,
                [teamId, ...playerIds]
            );
            if (Number(registeredPlayers.count) !== playerIds.length) {
                return 'Sestava obsahuje hráče, který není registrován za daný tým.';
            }
        }
        if (playerIds.length && await dbGet(
            `SELECT id FROM suspensions
             WHERE is_active = TRUE AND team_id = ? AND player_id IN (${playerIds.map(() => '?').join(', ')})
             AND (
                 (type = 'Match_Count' AND matches_count > (
                     SELECT COUNT(*) FROM suspension_served_matches WHERE suspension_id = suspensions.id
                 ))
                 OR (type = 'Time_Period' AND duration_time::timestamp > CURRENT_TIMESTAMP)
             ) LIMIT 1`,
            [teamId, ...playerIds]
        )) {
            return 'Hráč s aktivní stopkou nemůže nastoupit.';
        }
    }
    return null;
}

async function recordSuspensionMatches(matchId, teamId, roster) {
    const playerIds = roster.map(player => Number(player.playerId)).filter(Number.isInteger);
    const exclusion = playerIds.length
        ? `AND player_id NOT IN (${playerIds.map(() => '?').join(', ')})`
        : '';
    await dbRun(
        `INSERT INTO suspension_served_matches (suspension_id, match_id)
         SELECT id, ? FROM suspensions
         WHERE is_active = TRUE AND team_id = ? AND type = 'Match_Count' AND matches_count > 0 ${exclusion}
         ON CONFLICT DO NOTHING`,
        [matchId, teamId, ...playerIds]
    );
}

app.delete('/api/matches/:id', requireRoles('Admin'), async (req, res) => {
    try {
        await dbRun('DELETE FROM matches WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/suspensions', requireRoles('Admin', 'DK'), async (req, res) => {
    try {
        const { playerId, teamId, playerNick, teamName, type, matchesLeft, untilDate, reason } = req.body;
        if (!playerId || !teamId || !playerNick || !reason ||
            !['Match_Count', 'Time_Period'].includes(type) ||
            (type === 'Match_Count' && (!Number.isInteger(matchesLeft) || matchesLeft < 1)) ||
            (type === 'Time_Period' && (!untilDate || Number.isNaN(Date.parse(untilDate))))) {
            return res.status(400).json({ success: false, error: 'Vyplňte platné údaje pro udělení trestu.' });
        }
        const upcomingMatches = await dbAll(
            `SELECT id, home_team_id, away_team_id, home_roster_json, away_roster_json
             FROM matches WHERE status != 'Completed' AND (home_team_id = ? OR away_team_id = ?)`,
            [teamId, teamId]
        );
        const affectedMatches = upcomingMatches.map(match => {
            const isHome = match.home_team_id === teamId;
            const rosterColumn = isHome ? 'home_roster_json' : 'away_roster_json';
            const roster = JSON.parse(match[rosterColumn] || '[]');
            return { id: match.id, rosterColumn, roster: roster.filter(item => item.playerId !== playerId) };
        }).filter((match, index) => {
            const source = upcomingMatches[index];
            return match.roster.length !== JSON.parse(source[match.rosterColumn] || '[]').length;
        });
        const result = await dbRun(
            `INSERT INTO suspensions (player_id, team_id, player_nick, team_name, type, matches_count, duration_time, reason) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [playerId || null, teamId || null, playerNick, teamName, type, matchesLeft || 0, untilDate || null, reason]
        );
        for (const match of affectedMatches) {
            await dbRun(
                `UPDATE matches SET ${match.rosterColumn} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [JSON.stringify(match.roster), match.id]
            );
        }
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/suspensions/:id', requireRoles('Admin', 'DK'), async (req, res) => {
    try {
        await dbRun('DELETE FROM suspensions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/deductions', requireRoles('Admin', 'DK'), async (req, res) => {
    try {
        const teamId = Number(req.body.teamId);
        const points = Number(req.body.points);
        const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        if (!Number.isInteger(teamId) || teamId <= 0 || !Number.isInteger(points) || points <= 0 || reason.length > 500) {
            return res.status(400).json({ success: false, error: 'Zadejte platný tým, kladný počet bodů a důvod do 500 znaků.' });
        }
        const result = await withDatabaseTransaction(async () => {
            const team = await dbGet('SELECT id FROM teams WHERE id = ?', [teamId]);
            if (!team) {
                const error = new Error('Tým nebyl nalezen.');
                error.status = 404;
                throw error;
            }
            const deduction = await dbRun(
                'INSERT INTO points_deductions (team_id, points, reason) VALUES (?, ?, ?)',
                [teamId, points, reason || 'Rozhodnutí svazu']
            );
            await dbRun(
                'UPDATE teams SET deducted_points = COALESCE(deducted_points, 0) + ?, deduction_reason = ? WHERE id = ?',
                [points, reason || 'Rozhodnutí svazu', teamId]
            );
            return deduction;
        });
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

app.delete('/api/deductions/team/:teamId', requireRoles('Admin', 'DK'), async (req, res) => {
    try {
        const teamId = Number(req.params.teamId);
        if (!Number.isInteger(teamId) || teamId <= 0) {
            return res.status(400).json({ success: false, error: 'Neplatné ID týmu.' });
        }
        await withDatabaseTransaction(async () => {
            const team = await dbGet('SELECT id FROM teams WHERE id = ?', [teamId]);
            if (!team) {
                const error = new Error('Tým nebyl nalezen.');
                error.status = 404;
                throw error;
            }
            await dbRun('DELETE FROM points_deductions WHERE team_id = ?', [teamId]);
            await dbRun("UPDATE teams SET deducted_points = 0, deduction_reason = '' WHERE id = ?", [teamId]);
        });
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

app.delete('/api/deductions/:id', requireRoles('Admin', 'DK'), async (req, res) => {
    try {
        const deduction = await dbGet('SELECT * FROM points_deductions WHERE id = ?', [req.params.id]);
        if (deduction) {
            await withDatabaseTransaction(async () => {
                await dbRun('DELETE FROM points_deductions WHERE id = ?', [req.params.id]);
                const remaining = await dbGet(
                    'SELECT COALESCE(SUM(points), 0) AS points FROM points_deductions WHERE team_id = ?',
                    [deduction.team_id]
                );
                const latest = await dbGet(
                    'SELECT reason FROM points_deductions WHERE team_id = ? ORDER BY id DESC LIMIT 1',
                    [deduction.team_id]
                );
                await dbRun(
                    'UPDATE teams SET deducted_points = ?, deduction_reason = ? WHERE id = ?',
                    [remaining.points, latest?.reason || '', deduction.team_id]
                );
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/audit-logs', requireRoles('Admin', 'DK'), async (req, res) => {
    try {
        const { action, target, details } = req.body;
        const result = await dbRun(
            `INSERT INTO dk_audit_logs (time, type, target, details) VALUES (?, ?, ?, ?)`,
            [new Date().toLocaleString('cs-CZ'), action, target, details]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/player-sync-status', requireRoles('Admin'), (req, res) => {
    res.json({
        success: true,
        data: {
            ...playerSyncStatus,
            intervalMs: PLAYER_BOT_SYNC_INTERVAL_MS
        }
    });
});

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint nebyl nalezen. Ověřte verzi backendu a případně jej restartujte.'
    });
});

if (PLAYER_BOT_API_URL && PLAYER_BOT_API_TOKEN) {
    runPlayerSync().catch(() => {});
    const syncTimer = setInterval(() => runPlayerSync().catch(() => {}), PLAYER_BOT_SYNC_INTERVAL_MS);
    syncTimer.unref();
}

app.listen(PORT, () => {
    const publicUrl = process.env.APP_ORIGIN || 'https://portal.cvfl.cz';
    console.log(`====================================================`);
    console.log(`🚀 CVFL Web Backend úspěšně běží na portu: ${PORT}`);
    console.log(`🌐 Produkční adresa: ${publicUrl}`);
    console.log(`📂 Databáze: ${isPostgres ? 'PostgreSQL (Supabase)' : DB_PATH}`);
    console.log(`====================================================`);
});