/**
 * CVFL Portál - Disciplinární Komise (DK), Tresty, Odpočty Bodů a Audit Logy
 */

import { state, dkAuditLogs, suspensionsData, teamsData, playersData, matchesData } from './state.js';
import { openModal, closeSpecificModal, showToast, openConfirmModal, applyRBACPermissions } from './ui.js';
import { renderCompetitions } from './competitions.js';
import {
    apiCreateSuspension, apiDeleteSuspension, apiSaveMatch, apiLogDKAction,
    apiCreatePointsDeduction, apiDeletePointsDeductionsForTeam
} from './api.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';

export function logDKAction(type, target, details) {
    const now = new Date();
    const timeStr = `${now.getDate()}.${now.getMonth() + 1}. ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    dkAuditLogs.unshift({ id: Date.now(), time: timeStr, type, target, details });
    renderDKAuditLogs();
}

async function logPersistedDKAction(type, target, details) {
    try {
        const auditEntry = await apiLogDKAction(type, target, details);
        dkAuditLogs.unshift({
            id: auditEntry.id,
            time: new Date().toLocaleString('cs-CZ'),
            type,
            target,
            details
        });
        renderDKAuditLogs();
    } catch (error) {
        showToast(`Akce byla uložena, ale auditní záznam se nepodařilo uložit: ${error.message}`, true);
    }
}

export function renderDKAuditLogs() {
    const body = document.getElementById('dk-audit-log-body');
    if (!body) return;

    body.innerHTML = dkAuditLogs.map(l => `
        <tr class="hover:bg-[#13236b]/60">
            <td class="p-2 text-gray-400">${escapeTeamName(l.time)}</td>
            <td class="p-2 font-bold text-purple-400">${escapeTeamName(l.type)}</td>
            <td class="p-2 font-bold text-white">${escapeTeamName(l.target)}</td>
            <td class="p-2 text-gray-300">${escapeTeamName(l.details)}</td>
        </tr>
    `).join('');
}

async function saveDeductionAudit(type, target, details) {
    await logPersistedDKAction(type, target, details);
}

export function renderDisciplinary() {
    renderDKAuditLogs();
    renderFanIssueReports();
    const body = document.getElementById('suspensions-table-body');
    const canManageDK = ['Admin', 'DK'].includes(state.currentUserRole);

    if (body) {
        const activeSuspensions = suspensionsData.filter(s => {
            if (s.type === 'Match_Count') return (s.remainingMatches ?? s.matchesLeft ?? 0) > 0;
            return s.type === 'Time_Period' && s.untilDate && new Date(s.untilDate) > new Date();
        });
        if (activeSuspensions.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400">Žádné aktivní disciplinární tresty.</td></tr>`;
        } else {
            body.innerHTML = activeSuspensions.map(s => {
                const uDate = s.untilDate ? new Date(s.untilDate) : null;
                const formattedUntil = uDate ? `${uDate.getDate()}.${uDate.getMonth() + 1}. ${uDate.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'})}` : '';
                return `
                <tr class="hover:bg-[#13236b]/60">
                    <td class="p-3 font-bold text-white">${escapeTeamName(s.playerName)}</td>
                    <td class="p-3 text-gray-300">${escapeTeamName(s.teamName)}</td>
                    <td class="p-3">
                        ${s.type === 'Match_Count' ? '<span class="px-2 py-0.5 rounded bg-[#f33332]/20 text-[#f33332] font-bold text-[10px]">Stopka Zápasy</span>' : '<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px]">Časová Stopka</span>'}
                    </td>
                    <td class="p-3 font-bold text-[#f33332]">
                        ${s.type === 'Match_Count' ? `${s.remainingMatches} Zápasy` : `Do: ${formattedUntil}`}
                    </td>
                    <td class="p-3 text-gray-300">${escapeTeamName(s.reason)}</td>
                    <td class="p-3 text-right role-perm-admin role-perm-dk">
                        ${canManageDK ? `<button onclick="cancelSuspensionWithConfirm(${s.id})" class="px-2.5 py-1 bg-[#13236b] hover:bg-[#1e307d] text-[#f33332] border border-[#f33332]/30 rounded font-bold transition">Zrušit Trest</button>` : ''}
                    </td>
                </tr>
            `;}).join('');
        }
    }

    // Vykreslení aktivních odečtů bodů
    const deductBody = document.getElementById('deductions-table-body');
    if (deductBody) {
        const deductedTeams = teamsData.filter(t => t.deducted > 0);
        if (deductedTeams.length === 0) {
            deductBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-400">Žádné aktivní odečty bodů.</td></tr>`;
        } else {
            deductBody.innerHTML = deductedTeams.map(t => `
                <tr class="hover:bg-[#13236b]/60">
                    <td class="p-3 font-bold text-white"><span class="inline-flex items-center gap-2">${getTeamLogoMarkup(t)}${escapeTeamName(t.name)}</span></td>
                    <td class="p-3 text-gray-300">${t.league === '1_Liga' ? 'CVFL 1. Liga' : 'CVFL 2. Liga'}</td>
                    <td class="p-3 font-bold text-[#f33332]">-${t.deducted} bodů</td>
                    <td class="p-3 text-gray-300">${escapeTeamName(t.deductionReason || 'Rozhodnutí svazu')}</td>
                    <td class="p-3 text-right role-perm-admin role-perm-dk">
                        ${canManageDK ? `<button onclick="cancelPointsDeductionWithConfirm(${t.id})" class="px-2.5 py-1 bg-[#13236b] hover:bg-[#1e307d] text-[#f33332] border border-[#f33332]/30 rounded font-bold transition">Zrušit Odečet</button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
    }

    applyRBACPermissions();
}

export function renderFanIssueReports() {
    const container = document.getElementById('dk-fan-issue-alerts');
    if (!container) return;
    const reports = matchesData.filter(match => match.checks?.fansIssue && !match.checks?.dkIssueResolved);
    if (!reports.length) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = reports.map(match => {
        const home = teamsData.find(team => team.id === match.homeTeamId);
        const away = teamsData.find(team => team.id === match.awayTeamId);
        const title = `${home?.name || 'Domácí'} – ${away?.name || 'Hosté'}`;
        return `<article class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                    <h3 class="font-black text-amber-300">Problém s fanoušky · ${escapeTeamName(title)}</h3>
                    <p class="mt-1 text-xs text-gray-300">${match.matchDate ? escapeTeamName(match.matchDate) : ''} · Zápas #${match.id}</p>
                    <p class="mt-3 text-sm font-bold text-white">Vyjádření rozhodčího k trestům</p>
                    <p class="mt-1 whitespace-pre-wrap text-sm text-gray-200">${escapeTeamName(match.punishmentStatement || 'Rozhodčí zatím neuvedl vyjádření.')}</p>
                </div>
                <button type="button" onclick="resolveFanIssueReport(${match.id})" class="shrink-0 rounded bg-[#aefb12] px-3 py-2 text-xs font-black text-[#13236b]">Vyřešeno</button>
            </div>
        </article>`;
    }).join('');
}

export async function resolveFanIssueReport(matchId) {
    if (!['Admin', 'DK'].includes(state.currentUserRole)) {
        showToast('Tento záznam může uzavřít pouze DK.', true);
        return;
    }
    const match = matchesData.find(item => item.id === matchId);
    if (!match?.checks?.fansIssue || match.checks.dkIssueResolved) return;
    const previousChecks = { ...match.checks };
    match.checks = { ...match.checks, dkIssueResolved: true };
    const saved = await apiSaveMatch(match);
    if (!saved) {
        match.checks = previousChecks;
        showToast('Záznam se nepodařilo uložit do databáze.', true);
        return;
    }
    try {
        const action = 'VYŘEŠEN PROBLÉM S FANOUŠKY';
        const target = `Zápas #${match.id}`;
        const details = `${teamsData.find(team => team.id === match.homeTeamId)?.name || 'Domácí'} – ${teamsData.find(team => team.id === match.awayTeamId)?.name || 'Hosté'}. Vyjádření rozhodčího: ${match.punishmentStatement || 'neuvedeno'}`;
        const auditEntry = await apiLogDKAction(action, target, details);
        const now = new Date();
        dkAuditLogs.unshift({
            id: auditEntry.id,
            time: now.toLocaleString('cs-CZ'),
            type: action,
            target,
            details
        });
    } catch (error) {
        match.checks = previousChecks;
        const rollbackSaved = await apiSaveMatch(match);
        showToast(rollbackSaved
            ? `Auditní záznam se nepodařilo uložit: ${error.message}`
            : `Auditní záznam a vrácení změny selhalo: ${error.message}`, true);
        return;
    }
    showToast('Problém byl vyřešen a zaznamenán do auditního logu.');
    renderDisciplinary();
}

export function cancelSuspensionWithConfirm(id) {
    const suspension = suspensionsData.find(s => s.id === id);
    if (!suspension) return;

    openConfirmModal("Zrušit Trest?", `Opravdu chcete zrušit trest pro hráče ${suspension.playerName}?`, (reason) => {
        const idx = suspensionsData.findIndex(s => s.id === id);
        if (idx !== -1) {
            apiDeleteSuspension(id).then(() => {
                suspensionsData.splice(idx, 1);
                logDKAction("ZRUŠENÍ_TRESTU", suspension.playerName, `Trest zrušen. Důvod: ${reason}`);
                showToast(`Trest pro ${suspension.playerName} byl zrušen.`);
                renderDisciplinary();
            }).catch(error => showToast(`Trest se nepodařilo zrušit: ${error.message}`, true));
        }
    }, true);
}

export function cancelPointsDeductionWithConfirm(teamId) {
    const team = teamsData.find(t => t.id === teamId);
    if (!team) return;

    openConfirmModal("Zrušit Odečet Bodů?", `Opravdu chcete zrušit odečet ${team.deducted} bodů týmu ${team.name}?`, async (reason) => {
        const prevDeducted = team.deducted;
        try {
            await apiDeletePointsDeductionsForTeam(team.id);
            team.deducted = 0;
            team.deductionReason = "";
            await saveDeductionAudit("ZRUŠENÍ_ODEČTU_BODŮ", team.name, `Odečet ${prevDeducted} bodů byl zrušen. Důvod: ${reason}`);
            showToast(`Odečet bodů týmu ${team.name} byl zrušen.`);
            renderCompetitions();
            renderDisciplinary();
        } catch (error) {
            showToast(`Odečet bodů se nepodařilo zrušit: ${error.message}`, true);
        }
    }, true);
}

export function openDeductPointsModal() {
    const selectTeam = document.getElementById('deduct-team-select');
    if (selectTeam) {
        selectTeam.innerHTML = teamsData.map(t => `<option value="${t.id}">${escapeTeamName(t.name)} (${t.league === '1_Liga' ? '1. Liga' : '2. Liga'})</option>`).join('');
    }
    openModal('modal-deduct-points');
}

export async function submitPointsDeduction() {
    const teamId = parseInt(document.getElementById('deduct-team-select').value);
    const pts = Number(document.getElementById('deduct-points-count').value);
    const reason = document.getElementById('deduct-points-reason').value.trim() || 'Rozhodnutí svazu';

    const team = teamsData.find(t => t.id === teamId);
    if (!team || !Number.isInteger(pts) || pts <= 0 || reason.length > 500) {
        showToast('Vyberte tým, zadejte kladný celý počet bodů a důvod do 500 znaků.', true);
        return;
    }
    try {
        await apiCreatePointsDeduction(teamId, pts, reason);
        team.deducted += pts;
        team.deductionReason = reason;
        await saveDeductionAudit("ODEČET_BODŮ", team.name, `Odečteno ${pts} bodů. Důvod: ${reason}`);
        showToast(`Týmu ${team.name} bylo odečteno ${pts} bodů.`);
        closeSpecificModal('modal-deduct-points');
        renderCompetitions();
        renderDisciplinary();
    } catch (error) {
        showToast(`Odečet bodů se nepodařilo uložit: ${error.message}`, true);
    }
}

export function toggleSuspensionInputs() {
    const type = document.getElementById('suspension-type-select').value;
    const inputMatches = document.getElementById('suspension-input-matches');
    const inputTime = document.getElementById('suspension-input-time');

    if (type === 'Match_Count') {
        inputMatches.classList.remove('hidden');
        inputTime.classList.add('hidden');
    } else {
        inputMatches.classList.add('hidden');
        inputTime.classList.remove('hidden');
    }
}

export function openAddSuspensionModal() {
    const selectTeam = document.getElementById('suspension-team-select');
    if (selectTeam) {
        selectTeam.innerHTML = teamsData.map(t => `<option value="${t.id}">${escapeTeamName(t.name)}</option>`).join('');
    }
    updateSuspensionPlayers();
    toggleSuspensionInputs();
    openModal('modal-add-suspension');
}

export function updateSuspensionPlayers() {
    const teamSelect = document.getElementById('suspension-team-select');
    if (!teamSelect) return;
    const teamId = parseInt(teamSelect.value);
    const selectPlayer = document.getElementById('suspension-player-select');
    const teamPlayers = playersData.filter(p => !p.isArchived && p.teamId === teamId);

    if (selectPlayer) {
        if (teamPlayers.length === 0) {
            selectPlayer.innerHTML = `<option value="">Žádní hráči v kádru</option>`;
        } else {
            selectPlayer.innerHTML = teamPlayers.map(p => `<option value="${p.id}">${escapeTeamName(p.robloxNick)}</option>`).join('');
        }
    }
}

export async function submitNewSuspension() {
    const playerId = parseInt(document.getElementById('suspension-player-select').value);
    const type = document.getElementById('suspension-type-select').value;
    const count = parseInt(document.getElementById('suspension-matches-count').value);
    const untilDate = document.getElementById('suspension-until-date').value;
    const reason = document.getElementById('suspension-reason-text').value.trim();

    if (!reason) {
        showToast("Pro udělení trestu musíte zadat odůvodnění suspendace!", true);
        return;
    }
    if (type === 'Match_Count' && (!Number.isInteger(count) || count < 1)) {
        showToast("Počet zápasů musí být alespoň 1.", true);
        return;
    }
    if (type === 'Time_Period' && (!untilDate || new Date(untilDate) <= new Date())) {
        showToast("Vyberte datum ukončení stopky v budoucnosti.", true);
        return;
    }

    const player = playersData.find(p => p.id === playerId);
    const team = teamsData.find(t => t.id === player?.teamId);

    if (player && team) {
        const suspension = {
            playerId: player.id,
            teamId: team.id,
            playerName: player.robloxNick,
            playerNick: player.robloxNick,
            teamName: team ? team.name : 'Bez klubu',
            type: type,
            remainingMatches: type === 'Match_Count' ? count : null,
            untilDate: type === 'Time_Period' ? new Date(untilDate).toISOString() : null,
            isActive: true,
            reason: reason
        };
        try {
            suspension.id = await apiCreateSuspension({
                ...suspension,
                matchesLeft: suspension.remainingMatches
            });
            suspensionsData.push(suspension);

            matchesData.forEach(match => {
                if (match.status === 'Completed') return;
                const teamSide = match.homeTeamId === team.id ? 'home' : match.awayTeamId === team.id ? 'away' : null;
                if (!teamSide) return;
                const roster = teamSide === 'home' ? match.homeRoster : match.awayRoster;
                const index = roster.findIndex(item => item.playerId === player.id);
                if (index !== -1) {
                    roster.splice(index, 1);
                }
            });

            logDKAction("UDĚLENÍ_TRESTU", player.robloxNick, `Trest (${type === 'Match_Count' ? count + ' zápasů' : untilDate}). Důvod suspendace: ${reason}`);
            showToast(`Trest pro ${player.robloxNick} udělen a odebrán z připravovaných sestav!`);
            closeSpecificModal('modal-add-suspension');
            renderDisciplinary();
        } catch (error) {
            showToast(`Stopku se nepodařilo uložit: ${error.message}`, true);
        }
    }
}
