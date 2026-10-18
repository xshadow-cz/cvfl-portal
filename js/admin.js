/**
 * CVFL Portál - Administrace, Tvorba Zápasů, Registrace Hráčů a Statistiky
 */

import { state, teamsData, playersData, trainersData, refereesData, matchesData, suspensionsData } from './state.js';
import { showToast, openConfirmModal } from './ui.js';
import { logDKAction } from './disciplinary.js';
import { renderMatches } from './matches.js';
import { renderDashboard } from './dashboard.js';
import { renderCompetitions } from './competitions.js';
import { renderTeamManagersDropdown } from './navigation.js';
import { renderRefereeAssignments } from './referees.js';
import { renderTeams } from './teams.js';
import { getMatchStatusLabel } from './match-status.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';
import {
    apiCreateMatch, apiDeleteMatch, apiCreatePlayer, apiCreateTrainer, apiCreateTeam,
    apiUpdateTeam, apiDeleteTeam, apiGetDiscordUsers, apiSetDiscordUserRoles,
    apiCreateDiscordInvite, apiRevokeDiscordUserAccess, apiGetDiscordInvites, apiRevokeDiscordInvite,
    apiGetDiscordUser, apiGetPlayerSyncStatus
} from './api.js';

let discordUserAccounts = [];
let unusedDiscordInvites = [];
let loadedDiscordUserId = null;

export function updateCreateMatchTeams() {
    const compEl = document.getElementById('create-match-comp');
    if (!compEl) return;
    const comp = compEl.value;
    const selectRound = document.getElementById('create-match-round');
    const selectHome = document.getElementById('create-match-home');
    const selectAway = document.getElementById('create-match-away');

    if (!selectRound || !selectHome || !selectAway) return;

    if (comp === 'MOL Cup') {
        selectRound.innerHTML = `
            <option value="Osmifinále">Osmifinále</option>
            <option value="Čtvrtfinále">Čtvrtfinále</option>
            <option value="Semifinále">Semifinále</option>
            <option value="Finále">Finále</option>
        `;
    } else if (comp === 'Baráž o 1. Ligu') {
        selectRound.innerHTML = `
            <option value="1">Baráž — 1. zápas</option>
            <option value="2">Baráž — odveta</option>
        `;
    } else {
        let options = '';
        for (let r = 1; r <= 14; r++) {
            options += `<option value="${r}">${r}. Kolo</option>`;
        }
        selectRound.innerHTML = options;
    }

    let leagueKey = '1_Liga';
    if (comp === 'CVFL 2. Liga') leagueKey = '2_Liga';

    const filteredTeams = teamsData.filter(t => ['MOL Cup', 'Baráž o 1. Ligu'].includes(comp) ? true : t.league === leagueKey);

    selectHome.innerHTML = filteredTeams.map(t => `<option value="${t.id}">${escapeTeamName(t.name)}</option>`).join('');
    selectAway.innerHTML = filteredTeams.map(t => `<option value="${t.id}">${escapeTeamName(t.name)}</option>`).join('');
    
    if (selectAway.options.length > 1) {
        selectAway.selectedIndex = 1;
    }
}

export function submitCreateMatch() {
    const comp = document.getElementById('create-match-comp').value;
    const roundVal = document.getElementById('create-match-round').value;
    const dateVal = document.getElementById('create-match-date').value;
    const stadiumVal = document.getElementById('create-match-stadium').value.trim() || 'TBD';
    const homeId = parseInt(document.getElementById('create-match-home').value);
    const awayId = parseInt(document.getElementById('create-match-away').value);

    if (homeId === awayId) {
        showToast("Domácí a hostující tým nesmí být stejný!", true);
        return;
    }

    const newMatch = {
        id: Date.now(),
        round: comp === 'MOL Cup' ? 1 : parseInt(roundVal),
        competition: comp,
        cupStage: comp === 'MOL Cup' ? roundVal : comp === 'Baráž o 1. Ligu' ? 'Semifinále' : null,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: 0,
        awayScore: 0,
        homePenaltyScore: 0,
        awayPenaltyScore: 0,
        stadium: stadiumVal,
        matchDate: dateVal || new Date().toISOString(),
        status: "Scheduled",
        homeKitSelected: "Home",
        awayKitSelected: "Away",
        referee: null,
        fourthRef: null,
        var: null,
        delegate: null,
        homeRoster: [],
        awayRoster: [],
        homeStaff: [],
        awayStaff: [],
        periodChecks: { h1Started: false, h1Ended: false, h2Started: false, h2Ended: false, penaltiesStarted: false, penaltiesEnded: false },
        checks: { fansIssue: false, systemIssue: false, playersIssue: false, homeIdentityChecked: false, awayIdentityChecked: false },
        events: []
    };

    matchesData.push(newMatch);
    apiCreateMatch(newMatch);
    showToast("Nové utkání bylo úspěšně vytvořeno!");
    renderMatches();
    renderDashboard();
    renderCompetitions();
    renderRefereeAssignments();
    renderAdminMatchesDeleteList();
}

export async function submitAdminAddPlayer() {
    if (state.playerSyncEnabled) {
        showToast('Hráče a Transfer Bany spravuje připojený Discord bot.', true);
        return;
    }
    const roblox = document.getElementById('admin-add-player-roblox').value.trim();
    const discord = document.getElementById('admin-add-player-discord').value.trim();
    const teamVal = document.getElementById('admin-add-player-team').value;

    if (!roblox || !discord) {
        showToast("Vyplňte prosím Roblox i Discord Nick!", true);
        return;
    }

    const isFree = (teamVal === 'free');
    const teamId = isFree ? null : parseInt(teamVal);

    const newPlayer = {
        id: Date.now(),
        teamId: teamId,
        robloxNick: roblox,
        discordNick: discord,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        motm: 0,
        isTransferBanned: document.getElementById('admin-add-player-transfer-ban').checked
    };

    try {
        newPlayer.id = await apiCreatePlayer(newPlayer);
    } catch (error) {
        showToast(`Hráče se nepodařilo uložit: ${error.message}`, true);
        return;
    }
    playersData.push(newPlayer);
    showToast(`Hráč ${roblox} byl úspěšně zaregistrován!`);

    document.getElementById('admin-add-player-roblox').value = '';
    document.getElementById('admin-add-player-discord').value = '';
    document.getElementById('admin-add-player-transfer-ban').checked = false;

    updateAdminStats();
    renderDashboard();
    if (state.activeTab === 'teams') renderTeams();
}

export function toggleExtraSection(secId, isShown) {
    const btn = document.getElementById(`comp-btn-${secId}`);
    if (btn) {
        btn.classList.toggle('hidden', !isShown);
    }
    showToast(`Sekce ${secId.toUpperCase()} byla ${isShown ? 'ZOBRAZENA' : 'SCHOVÁNA'}.`);
}

export function renderAdmin() {
    updateAdminStats();
    updateCreateMatchTeams();

    const syncPanel = document.getElementById('admin-player-sync-panel');
    const playerFields = document.getElementById('admin-add-player-fields');
    if (syncPanel) syncPanel.classList.toggle('hidden', !state.playerSyncEnabled);
    if (playerFields) playerFields.classList.toggle('hidden', state.playerSyncEnabled);
    if (state.playerSyncEnabled) {
        apiGetPlayerSyncStatus().then(status => {
            const statusEl = document.getElementById('admin-player-sync-status');
            if (!statusEl) return;
            if (status.lastError) {
                statusEl.textContent = `Chyba synchronizace: ${status.lastError}`;
            } else if (status.lastSuccessAt) {
                statusEl.textContent = `Poslední úspěch: ${new Date(status.lastSuccessAt).toLocaleString('cs-CZ')}. Aktivních hráčů: ${status.syncedPlayers}; archivováno: ${status.archivedPlayers}.`;
            } else {
                statusEl.textContent = 'Synchronizace čeká na první úspěšné načtení od bota.';
            }
        }).catch(error => {
            const statusEl = document.getElementById('admin-player-sync-status');
            if (statusEl) statusEl.textContent = `Stav synchronizace se nepodařilo načíst: ${error.message}`;
        });
    }

    const announcementInput = document.getElementById('admin-system-announcement');
    if (announcementInput && document.activeElement !== announcementInput) {
        announcementInput.value = state.systemAnnouncement;
    }
    const selectPlayerTeam = document.getElementById('admin-add-player-team');
    if (selectPlayerTeam) {
        selectPlayerTeam.innerHTML = `<option value="free">Bez klubu</option>` + 
            teamsData.map(t => `<option value="${t.id}">${escapeTeamName(t.name)}</option>`).join('');
    }
    const selectTrainerTeam = document.getElementById('admin-add-trainer-team');
    if (selectTrainerTeam) {
        selectTrainerTeam.innerHTML = teamsData.map(t => `<option value="${t.id}">${escapeTeamName(t.name)}</option>`).join('');
        selectTrainerTeam.disabled = teamsData.length === 0;
    }
    const maintenanceToggle = document.getElementById('admin-maintenance-toggle');
    if (maintenanceToggle) maintenanceToggle.checked = state.isMaintenanceMode;
    renderAdminTeamsList();
    renderDiscordRoleManagement();
    renderAdminMatchesDeleteList();
}

export async function renderDiscordRoleManagement() {
    const options = document.getElementById('admin-discord-role-options');
    const inviteOptions = document.getElementById('admin-discord-invite-role-options');
    const list = document.getElementById('admin-discord-user-list');
    const inviteList = document.getElementById('admin-discord-invite-list');
    if (!options || !inviteOptions || !list || !inviteList) return;

    const roles = [
        ['Admin', 'Vedení Ligy'],
        ['Referee_Manager', 'Vedení Rozhodčích'],
        ['DK', 'Disciplinární Komise'],
        ['Delegate', 'Delegát Utkání'],
        ['Referee', 'Rozhodčí'],
        ...teamsData.map(team => [`Team_Manager_${team.id}`, `Vedoucí Mužstva — ${escapeTeamName(team.name)}`])
    ];
    const renderOptions = (field) => roles
        .filter(([role]) => field !== 'invite' || !['Delegate', 'Referee'].includes(role))
        .map(([role, label]) => `
        <label class="flex items-center gap-2 p-2 bg-[#13236b] border border-[#1e307d] rounded text-xs">
            <input type="checkbox" data-discord-role="${role}" data-role-field="${field}" class="accent-[#5865f2] w-4 h-4">
            <span>${escapeHtml(label)}</span>
        </label>
    `).join('');
    options.innerHTML = renderOptions('edit');
    inviteOptions.innerHTML = renderOptions('invite');

    const results = await Promise.allSettled([apiGetDiscordUsers(), apiGetDiscordInvites()]);
    if (results[0].status === 'fulfilled') {
        discordUserAccounts = results[0].value;
        renderDiscordUsers();
    } else {
        list.innerHTML = `<p class="p-3 text-xs text-red-400">Seznam účtů se nepodařilo načíst: ${escapeHtml(results[0].reason.message)}</p>`;
        showToast(`Discord účty se nepodařilo načíst: ${results[0].reason.message}`, true);
    }
    if (results[1].status === 'fulfilled') {
        unusedDiscordInvites = results[1].value;
        renderDiscordInvites();
    } else {
        inviteList.innerHTML = `<p class="p-3 text-xs text-red-400">Seznam pozvánek se nepodařilo načíst: ${escapeHtml(results[1].reason.message)}</p>`;
        showToast(`Pozvánky se nepodařilo načíst: ${results[1].reason.message}`, true);
    }
}

function renderDiscordUsers() {
    const list = document.getElementById('admin-discord-user-list');
    if (!list) return;
    const search = document.getElementById('admin-discord-user-search')?.value.trim().toLocaleLowerCase('cs') || '';
    const usersWithAccess = discordUserAccounts.filter(user => user.roles.length > 0);
    const filteredUsers = usersWithAccess.filter(user =>
        `${user.username} ${user.discordId} ${user.roles.join(' ')}`.toLocaleLowerCase('cs').includes(search)
    );
    if (filteredUsers.length === 0) {
        list.innerHTML = usersWithAccess.length
            ? '<p class="p-3 text-xs text-gray-400">Žádné účty s právy neodpovídají hledání.</p>'
            : '<p class="p-3 text-xs text-gray-400">Zatím nejsou nastaveny žádné Discord účty s přístupem.</p>';
        return;
    }
    list.innerHTML = filteredUsers.map(user => `
        <div class="flex flex-col sm:flex-row justify-between gap-2 items-start sm:items-center p-3 bg-[#13236b] border border-[#1e307d] rounded-lg text-xs">
            <div>
                <strong class="text-white">${escapeHtml(user.username)}</strong>
                <span class="block font-mono text-gray-400">${escapeHtml(user.discordId)}</span>
                <span class="block text-gray-300">${user.roles.map(escapeHtml).join(', ')}</span>
            </div>
            ${user.isOwner
                ? '<span class="text-amber-300 font-bold">Vlastník — všechny role</span>'
                : `<div class="flex gap-2">
                    <button type="button" onclick="editDiscordUserRoles('${escapeHtml(user.discordId)}')" class="px-3 py-1.5 bg-[#5865f2] text-white font-bold rounded">Změnit role</button>
                    <button type="button" onclick="revokeDiscordUserAccess('${escapeHtml(user.discordId)}')" class="px-3 py-1.5 bg-[#f33332] text-white font-bold rounded">Odebrat přístup</button>
                </div>`}
        </div>
    `).join('');
}

export function filterDiscordUsers() {
    renderDiscordUsers();
}

export async function refreshDiscordInvites() {
    const list = document.getElementById('admin-discord-invite-list');
    if (list) list.innerHTML = '<p class="text-xs text-gray-400">Načítám pozvánky…</p>';
    try {
        unusedDiscordInvites = await apiGetDiscordInvites();
        renderDiscordInvites();
    } catch (error) {
        if (list) list.innerHTML = `<p class="text-xs text-red-400">Pozvánky se nepodařilo načíst: ${escapeHtml(error.message)}</p>`;
        showToast(`Pozvánky se nepodařilo načíst: ${error.message}`, true);
    }
}

function renderDiscordInvites() {
    const list = document.getElementById('admin-discord-invite-list');
    if (!list) return;
    if (!unusedDiscordInvites.length) {
        list.innerHTML = '<p class="p-3 text-xs text-gray-400">Žádné nepoužité pozvánky.</p>';
        return;
    }
    list.innerHTML = unusedDiscordInvites.map(invite => {
        let expiryText = 'Neznámo';
        if (invite.expiresAt) {
            const cleanDateStr = invite.expiresAt.includes('T') ? invite.expiresAt : invite.expiresAt.replace(' ', 'T');
            const expiry = new Date(cleanDateStr.endsWith('Z') ? cleanDateStr : cleanDateStr + 'Z');
            if (!isNaN(expiry.getTime())) {
                expiryText = expiry.toLocaleString('cs-CZ');
            }
        }
        return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-[#1e307d] bg-[#0e1a4f] p-3 text-xs">
                <div class="min-w-0">
                    <div class="font-bold text-white">${invite.roles.map(escapeHtml).join(', ')}</div>
                    <div class="${invite.expired ? 'text-amber-300' : 'text-gray-400'}">${invite.expired ? 'Platnost vypršela' : 'Platí do'}: ${expiryText}</div>
                </div>
                <button type="button" onclick="revokeDiscordInvite('${invite.id}')" class="shrink-0 rounded bg-[#f33332] px-3 py-1.5 font-bold text-white">Zrušit pozvánku</button>
            </div>`;
    }).join('');
}

export async function revokeDiscordInvite(inviteId) {
    try {
        await apiRevokeDiscordInvite(inviteId);
        unusedDiscordInvites = unusedDiscordInvites.filter(invite => invite.id !== inviteId);
        renderDiscordInvites();
        showToast('Pozvánka byla zrušena.');
    } catch (error) {
        showToast(`Pozvánku se nepodařilo zrušit: ${error.message}`, true);
    }
}

function displayDiscordUserRoles(user) {
    loadedDiscordUserId = user.discordId;
    document.getElementById('admin-discord-user-id').value = user.discordId;
    const roles = new Set(user.roles);
    document.querySelectorAll('[data-role-field="edit"]').forEach(input => {
        const registrationRole = ['Delegate', 'Referee'].includes(input.dataset.discordRole);
        input.checked = roles.has(input.dataset.discordRole);
        input.disabled = registrationRole;
        if (registrationRole) {
            input.title = 'Role rozhodčího a delegáta se řídí registrací rozhodčího.';
        } else {
            input.removeAttribute('title');
        }
    });
    const status = document.getElementById('admin-discord-user-lookup-status');
    const roleLabels = Array.from(document.querySelectorAll('[data-role-field="edit"]:checked'))
        .map(input => input.closest('label')?.querySelector('span')?.textContent.trim() || input.dataset.discordRole);
    if (status) {
        status.textContent = `Načten účet ${user.username} (${user.discordId}). Přidělené role: ${roleLabels.join(', ') || 'žádné'}. Role rozhodčího a delegáta se řídí registrací.`;
    }
    document.getElementById('admin-discord-user-delete')?.classList.toggle('hidden', user.isOwner);
}

function clearDiscordUserRoles() {
    document.querySelectorAll('[data-role-field="edit"]').forEach(input => {
        input.checked = false;
        input.disabled = false;
        input.removeAttribute('title');
    });
}

export async function lookupDiscordUserRoles() {
    const discordId = document.getElementById('admin-discord-user-id').value.trim();
    if (!/^\d{17,20}$/.test(discordId)) {
        showToast('Zadejte platné Discord ID (17–20 číslic).', true);
        return;
    }
    const status = document.getElementById('admin-discord-user-lookup-status');
    if (status) status.textContent = 'Načítám účet a role…';
    loadedDiscordUserId = null;
    clearDiscordUserRoles();
    document.getElementById('admin-discord-user-delete')?.classList.add('hidden');
    try {
        const user = await apiGetDiscordUser(discordId);
        if (!user || user.discordId !== discordId || !Array.isArray(user.roles)) {
            throw new Error('Server vrátil neúplné údaje účtu nebo jeho rolí.');
        }
        if (document.getElementById('admin-discord-user-id').value.trim() !== discordId) return;
        displayDiscordUserRoles(user);
        const cached = discordUserAccounts.find(account => account.discordId === user.discordId);
        if (cached) Object.assign(cached, user);
        else discordUserAccounts.push(user);
        renderDiscordUsers();
    } catch (error) {
        if (document.getElementById('admin-discord-user-id').value.trim() !== discordId) return;
        loadedDiscordUserId = null;
        clearDiscordUserRoles();
        document.getElementById('admin-discord-user-delete')?.classList.add('hidden');
        if (status) status.textContent = error.message;
        showToast(`Účet se nepodařilo načíst: ${error.message}`, true);
    }
}

export function handleDiscordUserIdKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    lookupDiscordUserRoles();
}

export function invalidateDiscordUserLookup() {
    const discordId = document.getElementById('admin-discord-user-id').value.trim();
    if (!loadedDiscordUserId || loadedDiscordUserId === discordId) return;
    loadedDiscordUserId = null;
    clearDiscordUserRoles();
    document.getElementById('admin-discord-user-delete')?.classList.add('hidden');
    document.getElementById('admin-discord-user-lookup-status').textContent = 'Změnilo se Discord ID. Načtěte účet znovu před úpravou.';
}

export async function editDiscordUserRoles(discordId) {
    const form = document.getElementById('admin-discord-user-form');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('admin-discord-user-id').value = discordId;
    await lookupDiscordUserRoles();
}

export async function saveDiscordUserRoles(event) {
    event.preventDefault();
    const discordId = document.getElementById('admin-discord-user-id').value.trim();
    if (!loadedDiscordUserId || loadedDiscordUserId !== discordId) {
        await lookupDiscordUserRoles();
        return;
    }
    const roles = Array.from(document.querySelectorAll('[data-role-field="edit"]:checked')).map(input => input.dataset.discordRole);
    try {
        const result = await apiSetDiscordUserRoles(discordId, roles);
        if (result.deleted) {
            discordUserAccounts = discordUserAccounts.filter(user => user.discordId !== discordId);
            loadedDiscordUserId = null;
            document.getElementById('admin-discord-user-id').value = '';
            document.querySelectorAll('[data-role-field="edit"]').forEach(input => { input.checked = false; });
            document.getElementById('admin-discord-user-delete')?.classList.add('hidden');
            showToast(`Všechna oprávnění byla odebrána a účet ${discordId} byl smazán z databáze. Pro nový přístup je nutná nová pozvánka.`);
        } else {
            showToast(`Role účtu ${discordId} byly uloženy.`);
        }
        await renderDiscordRoleManagement();
        if (!result.deleted) await lookupDiscordUserRoles();
    } catch (error) {
        showToast(`Role Discord účtu se nepodařilo uložit: ${error.message}`, true);
    }
}

export async function deleteDiscordUserFromDatabase() {
    if (!loadedDiscordUserId) return;
    if (document.getElementById('admin-discord-user-id').value.trim() !== loadedDiscordUserId) {
        showToast('Načtěte znovu účet odpovídající zadanému Discord ID.', true);
        return;
    }
    const user = discordUserAccounts.find(account => account.discordId === loadedDiscordUserId);
    if (!user || user.isOwner) return;
    openConfirmModal('Smazat Discord účet z databáze?', `Opravdu chcete trvale smazat účet ${user.username} (${user.discordId})? Jeho přihlášené relace budou ukončeny a účet bude možné znovu pozvat.`, async () => {
        try {
            await apiRevokeDiscordUserAccess(user.discordId);
            discordUserAccounts = discordUserAccounts.filter(account => account.discordId !== user.discordId);
            loadedDiscordUserId = null;
            document.getElementById('admin-discord-user-id').value = '';
            document.querySelectorAll('[data-role-field="edit"]').forEach(input => { input.checked = false; });
            document.getElementById('admin-discord-user-delete')?.classList.add('hidden');
            renderDiscordUsers();
            showToast(`Účet ${user.discordId} byl smazán z databáze.`);
        } catch (error) {
            showToast(`Účet se nepodařilo smazat: ${error.message}`, true);
        }
    }, false);
}

export async function createDiscordInvite(event) {
    event.preventDefault();
    const roles = Array.from(document.querySelectorAll('[data-role-field="invite"]:checked')).map(input => input.dataset.discordRole);
    if (!roles.length || roles.some(role => ['Delegate', 'Referee'].includes(role))) {
        showToast('Pro vytvoření pozvánky vyberte alespoň jednu roli.', true);
        return;
    }
    try {
        const result = await apiCreateDiscordInvite(roles);
        const link = document.getElementById('admin-discord-invite-link');
        link.value = result.inviteUrl;
        link.classList.remove('hidden');
        document.getElementById('admin-discord-invite-copy').classList.remove('hidden');
        document.querySelectorAll('[data-role-field="invite"]').forEach(input => { input.checked = false; });
        await refreshDiscordInvites();
        showToast('Jednorázový odkaz byl vytvořen. Platí 7 dní.');
    } catch (error) {
        showToast(`Pozvánku se nepodařilo vytvořit: ${error.message}`, true);
    }
}

export async function copyDiscordInviteLink() {
    const link = document.getElementById('admin-discord-invite-link');
    try {
        await navigator.clipboard.writeText(link.value);
        showToast('Odkaz na pozvánku byl zkopírován.');
    } catch (error) {
        link.select();
        showToast('Odkaz označen — zkopírujte jej ručně.', true);
    }
}

export function revokeDiscordUserAccess(discordId) {
    const user = discordUserAccounts.find(account => account.discordId === discordId);
    if (!user || user.isOwner) return;
    openConfirmModal('Odebrat přístup?', `Opravdu chcete účtu ${user.username} odebrat všechny role a ukončit jeho přihlášení?`, async () => {
        try {
            await apiRevokeDiscordUserAccess(discordId);
            showToast(`Přístup účtu ${discordId} byl odebrán.`);
            await renderDiscordRoleManagement();
        } catch (error) {
            showToast(`Přístup se nepodařilo odebrat: ${error.message}`, true);
        }
    }, false);
}

export async function submitAdminAddTrainer() {
    const robloxInput = document.getElementById('admin-add-trainer-roblox');
    const discordInput = document.getElementById('admin-add-trainer-discord');
    const teamId = Number(document.getElementById('admin-add-trainer-team').value);
    const role = document.getElementById('admin-add-trainer-role').value;
    const robloxNick = robloxInput.value.trim();
    const discordNick = discordInput.value.trim();
    if (!robloxNick || !discordNick || !teamsData.some(team => team.id === teamId)) {
        showToast('Vyplňte Roblox username, Discord username a tým.', true);
        return;
    }

    try {
        const id = await apiCreateTrainer({ teamId, robloxNick, discordNick, role });
        trainersData.push({ id, teamId, robloxNick, discordNick, role });
        robloxInput.value = '';
        discordInput.value = '';
        renderTeams();
        showToast(`${role === 'Owner' ? 'Majitel' : 'Trenér'} ${robloxNick} byl přidán do realizačního týmu.`);
    } catch (error) {
        showToast(`Trenéra se nepodařilo zaregistrovat: ${error.message}`, true);
    }
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

async function readSquareTeamLogo(input) {
    const file = input?.files?.[0];
    if (!file) return undefined;
    if (file.type !== 'image/png' || file.size > 1_000_000) {
        throw new Error('Logo musí být soubor PNG do 1 MB.');
    }
    const image = await createImageBitmap(file);
    const isSquare = image.width === image.height && image.width <= 1024;
    image.close();
    if (!isSquare) throw new Error('Logo musí mít čtvercový poměr stran a rozměry nejvýše 1024 × 1024 px.');
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Logo se nepodařilo načíst.'));
        reader.onerror = () => reject(new Error('Logo se nepodařilo načíst.'));
        reader.readAsDataURL(file);
    });
}

export function renderAdminTeamsList() {
    const list = document.getElementById('admin-teams-list');
    if (!list) return;
    if (teamsData.length === 0) {
        list.innerHTML = '<p class="p-3 text-center text-xs text-gray-400">V databázi zatím nejsou žádné týmy.</p>';
        return;
    }

    list.innerHTML = teamsData.map(team => `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[auto_1fr_12rem_1fr_auto_auto] gap-2 items-center p-2 bg-[#13236b] rounded-lg border border-[#1e307d]">
            ${getTeamLogoMarkup(team, 'h-9 w-9')}
            <input id="admin-team-name-${team.id}" value="${escapeHtml(team.name)}" maxlength="100" aria-label="Název týmu" class="min-w-0 bg-[#0e1a4f] border border-[#1e307d] rounded p-2 text-white">
            <select id="admin-team-league-${team.id}" aria-label="Liga týmu" class="bg-[#0e1a4f] border border-[#1e307d] rounded p-2 text-white">
                <option value="1_Liga" ${team.league === '1_Liga' ? 'selected' : ''}>CVFL 1. Liga</option>
                <option value="2_Liga" ${team.league === '2_Liga' ? 'selected' : ''}>CVFL 2. Liga</option>
            </select>
            <input id="admin-team-logo-${team.id}" type="file" accept="image/png,.png" aria-label="Nahrát čtvercové PNG logo týmu" class="min-w-0 bg-[#0e1a4f] border border-[#1e307d] rounded p-1.5 text-xs text-white">
            <button onclick="saveAdminTeam(${team.id})" class="px-3 py-2 bg-[#05fda3] text-[#13236b] font-bold rounded"><i class="fa-solid fa-floppy-disk mr-1"></i> Uložit</button>
            <button onclick="deleteAdminTeam(${team.id})" class="px-3 py-2 bg-[#f33332] text-white font-bold rounded"><i class="fa-solid fa-trash-can mr-1"></i> Smazat</button>
        </div>
    `).join('');
}

function refreshTeamDataViews() {
    renderAdmin();
    renderTeamManagersDropdown();
    renderTeams();
    renderDashboard();
    renderCompetitions();
    updateCreateMatchTeams();
}

export async function submitAdminAddTeam(event) {
    event.preventDefault();
    const nameInput = document.getElementById('admin-add-team-name');
    const league = document.getElementById('admin-add-team-league').value;
    const name = nameInput.value.trim();
    if (!name) {
        showToast('Zadejte název týmu.', true);
        return;
    }

    try {
        const logo = await readSquareTeamLogo(document.getElementById('admin-add-team-logo'));
        const id = await apiCreateTeam({ name, league, logo });
        teamsData.push({ id, name, league, logo: logo || null, basePoints: 0, deducted: 0, deductionReason: '', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 });
        nameInput.value = '';
        document.getElementById('admin-add-team-logo').value = '';
        refreshTeamDataViews();
        showToast(`Tým ${name} byl přidán.`);
    } catch (error) {
        showToast(`Tým se nepodařilo přidat: ${error.message}`, true);
    }
}

export async function saveAdminTeam(teamId) {
    const team = teamsData.find(item => item.id === teamId);
    const nameInput = document.getElementById(`admin-team-name-${teamId}`);
    const leagueInput = document.getElementById(`admin-team-league-${teamId}`);
    const name = nameInput.value.trim();
    const league = leagueInput.value;
    if (!team || !name) {
        showToast('Zadejte platný název týmu.', true);
        return;
    }

    try {
        const logo = await readSquareTeamLogo(document.getElementById(`admin-team-logo-${teamId}`));
        await apiUpdateTeam({ id: teamId, name, league, ...(logo !== undefined ? { logo } : {}) });
        team.name = name;
        team.league = league;
        if (logo !== undefined) team.logo = logo;
        refreshTeamDataViews();
        showToast(`Tým ${name} byl aktualizován.`);
    } catch (error) {
        showToast(`Tým se nepodařilo uložit: ${error.message}`, true);
    }
}

export function deleteAdminTeam(teamId) {
    const team = teamsData.find(item => item.id === teamId);
    if (!team) return;

    openConfirmModal('Smazat tým?', `Opravdu chcete smazat tým ${team.name}? Jeho hráči zůstanou v databázi jako nepřiřazení. Týmy se zápasy smazat nelze.`, async () => {
        try {
            await apiDeleteTeam(teamId);
            const index = teamsData.findIndex(item => item.id === teamId);
            if (index !== -1) teamsData.splice(index, 1);
            playersData.forEach(player => {
                if (player.teamId === teamId) {
                    player.teamId = null;
                }
            });
            for (let index = suspensionsData.length - 1; index >= 0; index--) {
                if (suspensionsData[index].teamName === team.name) suspensionsData.splice(index, 1);
            }
            if (state.activeTeamId === teamId) state.activeTeamId = teamsData[0]?.id ?? null;
            refreshTeamDataViews();
            showToast(`Tým ${team.name} byl smazán.`);
        } catch (error) {
            showToast(`Tým se nepodařilo smazat: ${error.message}`, true);
        }
    }, false);
}

export function renderAdminMatchesDeleteList() {
    const list = document.getElementById('admin-matches-delete-list');
    if (!list) return;

    if (matchesData.length === 0) {
        list.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs">Žádné zápasy ke správě.</div>`;
        return;
    }

    list.innerHTML = matchesData.map(m => {
        const home = teamsData.find(t => t.id === m.homeTeamId);
        const away = teamsData.find(t => t.id === m.awayTeamId);
        const roundText = m.competition === 'MOL Cup' ? m.cupStage :
            m.competition === 'Baráž o 1. Ligu' ? `Baráž — ${Number(m.round) === 2 ? 'Odveta' : '1. zápas'}` :
                `${m.round}. Kolo`;

        return `
            <div class="p-3 bg-[#13236b] rounded-lg border border-[#1e307d] flex justify-between items-center text-xs">
                <div>
                    <span class="font-bold text-[#aefb12]">${m.competition} (${roundText})</span>
                    <span class="inline-flex items-center gap-2 text-white font-bold ml-2">${home ? `${getTeamLogoMarkup(home)}${escapeTeamName(home.name)}` : ''} vs ${away ? `${getTeamLogoMarkup(away)}${escapeTeamName(away.name)}` : ''}</span>
                    <span class="ml-2 text-gray-400">${getMatchStatusLabel(m.status)}</span>
                </div>
                <button onclick="deleteMatchFromAdmin(${m.id})" class="px-3 py-1 bg-[#f33332] hover:bg-red-600 text-white font-bold rounded shadow transition">
                    <i class="fa-solid fa-trash-can mr-1"></i> Smazat Zápas
                </button>
            </div>
        `;
    }).join('');
}

export function deleteMatchFromAdmin(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const home = teamsData.find(t => t.id === match.homeTeamId);
    const away = teamsData.find(t => t.id === match.awayTeamId);
    const matchName = `${home ? home.name : ''} vs ${away ? away.name : ''}`;

    openConfirmModal("Smazat Utkání?", `Opravdu chcete trvale smazat zápas ${matchName}?`, (reason) => {
        const idx = matchesData.findIndex(m => m.id === matchId);
        if (idx !== -1) {
            matchesData.splice(idx, 1);
            apiDeleteMatch(matchId);
            logDKAction("SMAZÁNÍ_ZÁPASU", matchName, `Zápas smazán v administraci. Důvod: ${reason}`);
            showToast(`Zápas ${matchName} byl smazán.`);
            renderAdminMatchesDeleteList();
            renderMatches();
            renderDashboard();
            renderCompetitions();
            renderRefereeAssignments();
        }
    }, true);
}

export function updateAdminStats() {
    const elPlayers = document.getElementById('dash-stat-players');
    const elReferees = document.getElementById('dash-stat-referees');

    if (elPlayers) elPlayers.textContent = `${playersData.filter(player => !player.isArchived).length} Hráčů`;
    if (elReferees) elReferees.textContent = `${refereesData.length} Rozhodčích`;
}