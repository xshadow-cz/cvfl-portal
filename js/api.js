/**
 * ====================================================================
 * CVFL Portál - API Klient a Propojení s Backend Databází
 * ====================================================================
 * 
 * Zajišťuje:
 * 1. Automatické načtení dat z Node.js + Express backendu (SQLite databáze)
 * 2. Veškerá aplikační data se načítají a ukládají pouze přes backend
 * 3. Odesílání změn na server (zápisy, hráči, rozhodčí, tresty)
 */

import {
    state,
    teamsData,
    playersData,
    trainersData,
    refereesData,
    matchesData,
    suspensionsData,
    dkAuditLogs
} from './state.js';

const configuredApiOrigin = typeof window.CVFL_API_ORIGIN === 'string'
    ? window.CVFL_API_ORIGIN.trim().replace(/\/+$/, '')
    : '';

// Výchozí adresa směřuje vždy na produkční doménu
const defaultApiOrigin = 'https://api.portal.cvfl.cz';
let API_ORIGIN = configuredApiOrigin || defaultApiOrigin;
let isBackendConnected = false;

export function getApiOrigin() {
    return API_ORIGIN;
}

function localFallbackApiOrigin() {
    return null;
}

async function fetchApi(path, options = {}) {
    const requestOptions = {
        ...options,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            ...options.headers
        }
    };
    const primaryOrigin = API_ORIGIN;
    const fallbackOrigin = localFallbackApiOrigin();
    let response;
    try {
        response = await fetch(`${primaryOrigin}/api${path}`, requestOptions);
    } catch (error) {
        if (!fallbackOrigin || fallbackOrigin === primaryOrigin) {
            throw new Error(`Nelze se připojit k API na ${primaryOrigin}: ${error.message}`);
        }
        response = await fetch(`${fallbackOrigin}/api${path}`, requestOptions);
        API_ORIGIN = fallbackOrigin;
        return response;
    }

    if (response.headers.get('content-type')?.includes('application/json') ||
        !fallbackOrigin || fallbackOrigin === primaryOrigin) {
        return response;
    }

    const fallbackResponse = await fetch(`${fallbackOrigin}/api${path}`, requestOptions);
    if (fallbackResponse.headers.get('content-type')?.includes('application/json')) {
        API_ORIGIN = fallbackOrigin;
        return fallbackResponse;
    }
    return response;
}

export function isApiOnline() {
    return isBackendConnected;
}

async function requestJSON(path, options = {}) {
    const response = await fetchApi(path, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });
    let json;
    try {
        json = await response.json();
    } catch {
        const deploymentHint = response.status === 404
            ? ' Pravděpodobně běží starší backend; restartujte jej nebo ověřte, že web a API používají stejnou verzi.'
            : '';
        throw new Error(
            `API endpoint ${path} vrátil místo JSON jiné údaje (HTTP ${response.status}). ` +
            `Zkontrolujte, zda web používá správný backend. Aktuální API: ${API_ORIGIN}.${deploymentHint}`
        );
    }
    if (!response.ok || json.success === false) {
        throw new Error(json.error || `Server vrátil stav ${response.status}.`);
    }
    return json;
}

export async function loadDiscordSession() {
    const response = await fetchApi('/auth/me', {
        headers: { Accept: 'application/json' },
    });
    let json;
    try {
        json = await response.json();
    } catch {
        const deploymentHint = response.status === 404
            ? ' Pravděpodobně běží starší backend; restartujte jej nebo ověřte, že web a API používají stejnou verzi.'
            : '';
        throw new Error(
            `API endpoint /auth/me vrátil místo JSON jiné údaje (HTTP ${response.status}). ` +
            `Zkontrolujte, zda web používá správný backend. Aktuální API: ${API_ORIGIN}.${deploymentHint}`
        );
    }
    if (response.status === 401) return { authenticated: false };
    if (!response.ok) throw new Error(json.error || `Server vrátil stav ${response.status}.`);
    return { authenticated: true, user: json.user, roles: json.roles };
}

export async function apiLogoutDiscord() {
    await requestJSON('/auth/logout', { method: 'POST' });
}

export async function apiGetSystemAnnouncement() {
    const result = await requestJSON('/announcement');
    return result.announcement;
}

export async function apiSetSystemAnnouncement(announcement) {
    const result = await requestJSON('/announcement', {
        method: 'PUT',
        body: JSON.stringify({ announcement })
    });
    return result.announcement;
}

export async function apiGetDiscordUsers() {
    const result = await requestJSON('/admin/discord-users');
    return result.data;
}

export async function apiGetDiscordUser(discordId) {
    const result = await requestJSON(`/admin/discord-users/${encodeURIComponent(discordId)}`);
    return result.data;
}

export async function apiSetDiscordUserRoles(discordId, roles) {
    return requestJSON(`/admin/discord-users/${encodeURIComponent(discordId)}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roles })
    });
}

export async function apiCreateDiscordInvite(roles) {
    return requestJSON('/admin/discord-invites', {
        method: 'POST',
        body: JSON.stringify({ roles })
    });
}

export async function apiGetDiscordInvites() {
    const result = await requestJSON('/admin/discord-invites');
    return result.data;
}

export async function apiRevokeDiscordInvite(inviteId) {
    await requestJSON(`/admin/discord-invites/${inviteId}`, { method: 'DELETE' });
}

export async function apiRevokeDiscordUserAccess(discordId) {
    await requestJSON(`/admin/discord-users/${encodeURIComponent(discordId)}`, { method: 'DELETE' });
}

export async function apiGetPlayerSyncStatus() {
    const result = await requestJSON('/admin/player-sync-status');
    return result.data;
}

/**
 * Načte kompletní stav z backendu při startu aplikace
 */
export async function loadInitialStateFromAPI() {
    try {
        const response = await fetchApi('/state', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(3000) // Pokud databáze není dostupná, inicializaci ukončíme.
        });

        if (!response.ok) {
            throw new Error(`Server vrátil stav ${response.status}`);
        }

        const json = await response.json();
        if (json && json.success && json.data) {
            const data = json.data;

            if (Array.isArray(data.teams)) {
                teamsData.length = 0;
                teamsData.push(...data.teams);
            }

            // Naplnění hráčů
            if (Array.isArray(data.players)) {
                playersData.length = 0;
                playersData.push(...data.players);
            }

            // Naplnění rozhodčích
            if (Array.isArray(data.referees)) {
                refereesData.length = 0;
                refereesData.push(...data.referees);
            }

            if (Array.isArray(data.trainers)) {
                trainersData.length = 0;
                trainersData.push(...data.trainers);
            }

            state.maintenanceMode = Boolean(data.maintenanceMode);
            state.isMaintenanceMode = state.maintenanceMode;
            state.maintenanceNotice = data.maintenanceNotice || '';
            state.playerSyncEnabled = Boolean(data.playerSyncEnabled);
            if (typeof data.systemAnnouncement === 'string') {
                state.systemAnnouncement = data.systemAnnouncement;
            }

            // Naplnění zápasů
            if (Array.isArray(data.matches)) {
                matchesData.length = 0;
                matchesData.push(...data.matches);
            }

            // Naplnění disciplinárních trestů
            if (Array.isArray(data.suspensions)) {
                suspensionsData.length = 0;
                suspensionsData.push(...data.suspensions);
            }

            // Naplnění audit logů
            if (Array.isArray(data.dkAuditLogs)) {
                dkAuditLogs.length = 0;
                dkAuditLogs.push(...data.dkAuditLogs);
            }

            isBackendConnected = true;
            console.log(`%c[CVFL API] ✅ Úspěšně připojeno k SQLite databázi na ${API_ORIGIN}/api.`, 'color: #aefb12; font-weight: bold;');
            return true;
        }
    } catch (err) {
        isBackendConnected = false;
        console.error('[CVFL API] Nelze načíst stav z databáze:', err);
        return false;
    }
}

export async function apiCreateTeam(team) {
    const result = await requestJSON('/teams', {
        method: 'POST',
        body: JSON.stringify(team)
    });
    return result.id;
}

export async function apiUpdateTeam(team) {
    await requestJSON(`/teams/${team.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: team.name, league: team.league, ...(team.logo !== undefined ? { logo: team.logo } : {}) })
    });
}

export async function apiDeleteTeam(teamId) {
    await requestJSON(`/teams/${teamId}`, { method: 'DELETE' });
}

export async function apiCreateTrainer(trainer) {
    const result = await requestJSON('/trainers', {
        method: 'POST',
        body: JSON.stringify(trainer)
    });
    return result.id;
}

export async function apiSetMaintenance(enabled, notice = state.maintenanceNotice) {
    await requestJSON('/maintenance', {
        method: 'PUT',
        body: JSON.stringify({ enabled, notice })
    });
}

/**
 * Uloží nebo aktualizuje zápas v databázi
 */
export async function apiSaveMatch(match) {
    if (!isBackendConnected || !match) return false;
    try {
        await requestJSON(`/matches/${match.id}`, {
            method: 'PUT',
            body: JSON.stringify(match)
        });
        return true;
    } catch (err) {
        console.warn('[CVFL API] Chyba při synchronizaci zápasu:', err.message);
        return false;
    }
}

/**
 * Vytvoří nový zápas v databázi
 */
export async function apiCreateMatch(match) {
    if (!isBackendConnected || !match) return;
    try {
        const res = await fetchApi('/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(match)
        });
        const json = await res.json();
        if (json && json.id) {
            match.id = json.id;
        }
    } catch (err) {
        console.warn('[CVFL API] Chyba při ukládání nového zápasu:', err.message);
    }
}

/**
 * Smaže zápas v databázi
 */
export async function apiDeleteMatch(matchId) {
    if (!isBackendConnected) return;
    try {
        await fetchApi(`/matches/${matchId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
    } catch (err) {
        console.warn('[CVFL API] Chyba při mazání zápasu:', err.message);
    }
}

/**
 * Uloží nového hráče do databáze
 */
export async function apiCreatePlayer(player) {
    if (!player) throw new Error('Chybí údaje o hráči.');
    const result = await requestJSON('/players', {
        method: 'POST',
        body: JSON.stringify(player)
    });
    return result.id;
}

/**
 * Smaže hráče v databázi
 */
export async function apiDeletePlayer(playerId) {
    if (!isBackendConnected) return;
    try {
        await fetchApi(`/players/${playerId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
    } catch (err) {
        console.warn('[CVFL API] Chyba při mazání hráče:', err.message);
    }
}

export async function apiUpdatePlayer(player) {
    if (!player) throw new Error('Chybí údaje o hráči.');
    await requestJSON(`/players/${player.id}`, {
        method: 'PUT',
        body: JSON.stringify({
            ...(player.teamId !== undefined ? { teamId: player.teamId } : {}),
            ...(player.isTransferBanned !== undefined ? { isTransferBanned: player.isTransferBanned } : {})
        })
    });
}

/**
 * Uloží nového rozhodčího do databáze
 */
export async function apiCreateReferee(referee) {
    if (!referee) throw new Error('Chybí údaje o rozhodčím.');
    const result = await requestJSON('/referees', {
        method: 'POST',
        body: JSON.stringify(referee)
    });
    return { id: result.id, isRegistered: result.isRegistered };
}

/**
 * Aktualizuje rozhodčího v databázi
 */
export async function apiUpdateReferee(referee) {
    if (!referee) throw new Error('Chybí údaje o rozhodčím.');
    await requestJSON(`/referees/${referee.id}`, {
        method: 'PUT',
        body: JSON.stringify(referee)
    });
}

/**
 * Smaže rozhodčího v databázi
 */
export async function apiDeleteReferee(refId) {
    await requestJSON(`/referees/${refId}`, { method: 'DELETE' });
}

/**
 * Přidá disciplinární trest do databáze
 */
export async function apiCreateSuspension(susp) {
    if (!susp) throw new Error('Chybí údaje o trestu.');
    const result = await requestJSON('/suspensions', {
        method: 'POST',
        body: JSON.stringify(susp)
    });
    return result.id;
}

/**
 * Zruší disciplinární trest v databázi
 */
export async function apiDeleteSuspension(suspId) {
    await requestJSON(`/suspensions/${suspId}`, { method: 'DELETE' });
}

export async function apiCreatePointsDeduction(teamId, points, reason) {
    return requestJSON('/deductions', {
        method: 'POST',
        body: JSON.stringify({ teamId, points, reason })
    });
}

export async function apiDeletePointsDeductionsForTeam(teamId) {
    await requestJSON(`/deductions/team/${teamId}`, { method: 'DELETE' });
}

/**
 * Zaznamená DK Audit Log do databáze
 */
export async function apiLogDKAction(action, target, details) {
    return requestJSON('/audit-logs', {
        method: 'POST',
        body: JSON.stringify({ action, target, details })
    });
}
