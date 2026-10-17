/**
 * CVFL Portál - Rozhodčí, Licence a Nominace na Utkání
 */

import { state, refereesData, matchesData, teamsData } from './state.js';
import { openModal, closeSpecificModal, showToast, openConfirmModal } from './ui.js';
import { logDKAction } from './disciplinary.js';
import { updateAdminStats } from './admin.js';
import { renderDashboard } from './dashboard.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';
import { apiCreateReferee, apiUpdateReferee, apiDeleteReferee, apiSaveMatch } from './api.js';

export function renderRefereesTab() {
    renderDelegateAlerts();
    renderRefereesMainTable();
    renderRefereeAssignments();
}

export function renderDelegateAlerts() {
    const container = document.getElementById('referee-delegate-alerts');
    if (!container) return;

    const canSeeAlerts = ['Referee_Manager', 'Admin'].includes(state.currentUserRole);
    if (!canSeeAlerts) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    const matchesWithAlerts = matchesData.filter(m => m.delegateAlertRefMgr && m.delegateReview);
    if (matchesWithAlerts.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="bg-purple-950/40 border border-purple-500/50 rounded-xl p-4 space-y-3 shadow-lg">
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-purple-300 flex items-center gap-2">
                    <i class="fa-solid fa-bell text-amber-400"></i> Důvěrná Upozornění od Delegátů Utkání (${matchesWithAlerts.length})
                </h3>
                <span class="text-[10px] text-gray-400">Viditelné pouze pro Vedení Rozhodčích a Vedení Ligy</span>
            </div>
            <div class="space-y-2">
                ${matchesWithAlerts.map(m => {
                    const home = teamsData.find(t => t.id === m.homeTeamId);
                    const away = teamsData.find(t => t.id === m.awayTeamId);
                    return `
                    <div class="p-3 bg-[#13236b] rounded-lg border border-[#1e307d] flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div class="space-y-1">
                            <div class="flex items-center gap-2 text-xs">
                                <span class="inline-flex items-center gap-2 font-bold text-white">${home ? `${getTeamLogoMarkup(home)}${escapeTeamName(home.name)}` : ''} vs ${away ? `${getTeamLogoMarkup(away)}${escapeTeamName(away.name)}` : ''}</span>
                                <span class="text-gray-400">| HR: <strong class="text-[#05fda3]">${escapeTeamName(m.referee || 'Nenominován')}</strong></span>
                                <span class="text-gray-400">| Delegát: <strong class="text-purple-300">${escapeTeamName(m.delegate || 'Nenominován')}</strong></span>
                            </div>
                            <p class="text-xs text-gray-300 italic line-clamp-2 bg-[#0e1a4f] p-2 rounded border border-[#1e307d]">
                                "${escapeTeamName(m.delegateReview)}"
                            </p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <button onclick="window.openMatchProtocol(${m.id}); setTimeout(() => window.switchFISTab('delegat'), 50);" class="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow transition">
                                <i class="fa-solid fa-eye mr-1"></i> Zobrazit Hodnocení
                            </button>
                            <button onclick="dismissDelegateAlert(${m.id})" class="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white font-bold text-xs rounded-lg transition" title="Označit za vyřízené">
                                <i class="fa-solid fa-check"></i>
                            </button>
                        </div>
                    </div>
                `;}).join('')}
            </div>
        </div>
    `;
}

export function dismissDelegateAlert(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        match.delegateAlertRefMgr = false;
        showToast("Upozornění delegáta bylo označeno za vyřízené.");
        renderDelegateAlerts();
    }
}

export function renderRefereesMainTable() {
    const body = document.getElementById('referees-main-table');
    if (!body) return;

    body.innerHTML = refereesData.map(r => `
        <tr class="hover:bg-[#13236b]/60">
            <td class="p-3 font-bold text-[#05fda3]">${escapeTeamName(r.robloxNick)}</td>
            <td class="p-3 font-mono text-gray-300">${escapeTeamName(r.discordNick)}</td>
            <td class="p-3">${r.isRegistered
                ? '<span class="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Přihlášen</span>'
                : '<span class="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-bold text-gray-400">Nepřihlášen</span>'}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-[#aefb12] text-[#13236b] font-black uppercase text-[10px]">Licence ${r.license}</span></td>
            <td class="p-3">
                ${r.status === 'Suspended' ? 
                    '<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-black uppercase text-[10px] border border-red-500/40"><i class="fa-solid fa-ban mr-1"></i> Suspendován</span>' : 
                    '<span class="px-2 py-0.5 rounded bg-[#aefb12] text-[#13236b] font-black uppercase text-[10px]">Platná</span>'}
            </td>
            <td class="p-3">
                ${r.isDelegate ? '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]"><i class="fa-solid fa-check mr-1"></i> ANO</span>' : '<span class="px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-bold text-[10px]">NE</span>'}
            </td>
            <td class="p-3 text-right space-x-1">
                <button onclick="editRefereeModal(${r.id})" class="px-2 py-1 bg-[#13236b] hover:bg-[#1e307d] text-[#aefb12] rounded font-bold">Upravit</button>
                <button onclick="deleteRefereeLicenseWithConfirm(${r.id})" class="px-2 py-1 bg-[#f33332]/20 hover:bg-[#f33332] text-[#f33332] hover:text-white rounded font-bold transition" title="Odebrat licencí / Smazat">
                    <i class="fa-solid fa-user-slash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

export function deleteRefereeLicenseWithConfirm(refId) {
    const ref = refereesData.find(r => r.id === refId);
    if (!ref) return;

    openConfirmModal("Odebrat Licenci Rozhodčího?", `Opravdu chcete odebrat licenci a smazat profil rozhodčího ${ref.robloxNick}? Role Rozhodčího a Delegáta budou odebrány. Pokud nemá žádné další role, bude smazán i jeho Discord účet a relace.`, async (reason) => {
        try {
            await apiDeleteReferee(refId);
        } catch (error) {
            showToast(`Profil rozhodčího se nepodařilo smazat: ${error.message}`, true);
            return;
        }
        const idx = refereesData.findIndex(r => r.id === refId);
        if (idx !== -1) {
            refereesData.splice(idx, 1);
            logDKAction("ODEBRÁNÍ_LICENCE", ref.robloxNick, `Licence rozhodčího odebrána. Důvod: ${reason}`);
            showToast(`Licence rozhodčího ${ref.robloxNick} odebrána.`);
            renderRefereesTab();
            updateAdminStats();
            if (ref.isCurrentUser) window.location.reload();
        }
    }, true);
}

export function renderRefereeAssignments() {
    const container = document.getElementById('referee-assignments-list');
    if (!container) return;

    const unfinishedMatches = matchesData.filter(m => m.status !== 'Completed');

    if (unfinishedMatches.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs">Všechny vytvořené zápasy mají kompletní nominaci nebo zápis.</div>`;
        return;
    }

    container.innerHTML = unfinishedMatches.map(m => {
        const home = teamsData.find(t => t.id === m.homeTeamId);
        const away = teamsData.find(t => t.id === m.awayTeamId);

        const roundLabel = m.competition === 'MOL Cup' ? m.cupStage :
            m.competition === 'Baráž o 1. Ligu' ? `${Number(m.round) === 2 ? 'Odveta' : '1. zápas'} baráže` :
                `${m.round}. Kolo`;
        const d = (m.matchDate && m.matchDate !== 'TBA') ? new Date(m.matchDate) : null;
        const matchDateFormatted = m.matchDate === 'TBA' ? 'TBA' : (d ? `${d.getDate()}.${d.getMonth() + 1}. ${d.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'})}` : 'Termín TBD');

        return `
            <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-[#aefb12]">${escapeTeamName(m.competition)} — ${escapeTeamName(roundLabel)}</span>
                    <span class="text-gray-400">${matchDateFormatted}</span>
                </div>
                <div class="font-bold text-white text-sm">
                    ${home ? `${getTeamLogoMarkup(home)}${escapeTeamName(home.name)}` : ''} <span class="text-gray-400 font-normal">vs</span> ${away ? `${getTeamLogoMarkup(away)}${escapeTeamName(away.name)}` : ''}
                </div>
                
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Hlavní Rozhodčí (HR):</span>
                        <button onclick="openSlotPicker(${m.id}, 'referee')" class="w-full text-left p-2 rounded border transition flex justify-between items-center ${m.referee ? 'bg-[#0e1a4f] border-[#aefb12] text-[#aefb12] font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-[#aefb12]'}">
                            <span class="truncate">${escapeTeamName(m.referee || '+ Vybrat HR')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>
                    </div>

                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Delegát Utkání:</span>
                        <button onclick="openSlotPicker(${m.id}, 'delegate')" class="w-full text-left p-2 rounded border transition flex justify-between items-center ${m.delegate ? 'bg-[#0e1a4f] border-amber-400 text-amber-400 font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-amber-400'}">
                            <span class="truncate">${escapeTeamName(m.delegate || '+ Vybrat Delegáta')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>
                    </div>

                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Čtvrtý Rozhodčí (4R):</span>
                        <button ${!m.referee ? 'disabled title="Nejprve přiřaďte hlavního rozhodčího."' : ''} onclick="openSlotPicker(${m.id}, 'fourthRef')" class="w-full text-left p-2 rounded border transition flex justify-between items-center disabled:cursor-not-allowed disabled:opacity-40 ${m.fourthRef ? 'bg-[#0e1a4f] border-[#05fda3] text-[#05fda3] font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-[#05fda3]'}">
                            <span class="truncate">${escapeTeamName(m.fourthRef || '+ Vybrat 4R')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>
                    </div>

                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Videorozhodčí (VAR):</span>
                        <button ${!m.referee ? 'disabled title="Nejprve přiřaďte hlavního rozhodčího."' : ''} onclick="openSlotPicker(${m.id}, 'var')" class="w-full text-left p-2 rounded border transition flex justify-between items-center disabled:cursor-not-allowed disabled:opacity-40 ${m.var ? 'bg-[#0e1a4f] border-purple-400 text-purple-300 font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-purple-400'}">
                            <span class="truncate">${escapeTeamName(m.var || '+ Vybrat VAR')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>
                    </div>
                </div>

                <div class="flex justify-end pt-2 border-t border-[#1e307d]">
                    <button onclick="saveRefereeAssignmentsForMatch(${m.id})" class="px-4 py-1.5 bg-[#05fda3] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg text-xs shadow">
                        <i class="fa-solid fa-floppy-disk mr-1"></i> Uložit Nominaci
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export async function saveRefereeAssignmentsForMatch(matchId) {
    const match = matchesData.find(item => item.id === matchId);
    if (!match) return;
    if (!await apiSaveMatch(match)) {
        showToast('Nominaci se nepodařilo uložit do databáze.', true);
        return;
    }
    showToast("Nominace rozhodčích pro utkání byla úspěšně uložena!");
    renderRefereeAssignments();
}

export function openSlotPicker(matchId, role) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;
    if (!['Admin', 'Referee_Manager'].includes(state.currentUserRole)) {
        showToast('Nominace může upravovat pouze vedení rozhodčích.', true);
        return;
    }
    if (role !== 'referee' && role !== 'delegate' && !match.referee) {
        showToast('Nejprve přiřaďte hlavního rozhodčího.', true);
        return;
    }

    state.activeSlotMatchId = matchId;
    state.activeSlotRole = role;

    const titleEl = document.getElementById('picker-title');
    const listEl = document.getElementById('picker-list');

    const roleNames = { 'referee': 'Hlavního Rozhodčího', 'fourthRef': 'Čtvrtého Rozhodčího', 'var': 'VAR Rozhodčího', 'delegate': 'Delegáta Utkání' };
    const slotLabels = {
        'referee': 'Hlavní Rozhodčí',
        'delegate': 'Delegát Utkání',
        'fourthRef': 'Čtvrtý Rozhodčí',
        'var': 'VAR Rozhodčí'
    };
    titleEl.textContent = `Vybrat ${roleNames[role] || 'Rozhodčího'}`;

    let allowedLicenses = ['A', 'B', 'C'];
    let reqDelegate = (role === 'delegate');

    let eligible = refereesData.filter(r => r.isRegistered && r.status !== 'Suspended' && allowedLicenses.includes(r.license));
    if (reqDelegate) eligible = eligible.filter(r => r.isDelegate);

    // Zjištění, kteří rozhodčí jsou již v tomto zápase přiřazeni do jiné pozice
    const assignedRolesMap = {};
    ['referee', 'delegate', 'fourthRef', 'var'].forEach(rKey => {
        if (rKey !== role && match[rKey]) {
            assignedRolesMap[match[rKey]] = slotLabels[rKey];
        }
    });

    listEl.innerHTML = `
        <div onclick="selectRefereeForSlot(null)" class="p-3 bg-[#13236b] hover:bg-slate-700 rounded-xl cursor-pointer border border-[#1e307d] text-rose-400 font-bold flex justify-between items-center transition">
            <span>Odebrat přiřazení z této pozice</span>
            <i class="fa-solid fa-trash"></i>
        </div>
        ${eligible.length === 0 ? '<div class="p-3 text-center text-gray-400">Žádní dostupní rozhodčí splňující kritéria.</div>' : ''}
        ${eligible.map(r => {
            const alreadyAssignedRole = assignedRolesMap[r.robloxNick];
            if (alreadyAssignedRole) {
                return `
                    <div class="p-3 bg-[#0e1a4f]/70 rounded-xl border border-rose-500/30 flex justify-between items-center opacity-60 cursor-not-allowed">
                        <div>
                            <div class="font-bold text-gray-300 text-sm">${escapeTeamName(r.robloxNick)}</div>
                            <div class="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                                <i class="fa-solid fa-ban"></i> Již nominován: ${alreadyAssignedRole}
                            </div>
                        </div>
                        <span class="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] font-bold">Obsazen</span>
                    </div>
                `;
            }

            return `
                <div onclick="selectRefereeForSlotById(${r.id})" class="p-3 bg-[#13236b] hover:bg-[#1e307d] rounded-xl cursor-pointer border border-[#1e307d] flex justify-between items-center transition">
                    <div>
                        <div class="font-bold text-white text-sm">${escapeTeamName(r.robloxNick)}</div>
                        <div class="text-[10px] text-gray-400 font-mono">${escapeTeamName(r.discordNick)}</div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-0.5 bg-[#aefb12]/20 text-[#aefb12] rounded font-bold text-[10px]">Licence ${r.license}</span>
                    </div>
                </div>
            `;
        }).join('')}
    `;

    openModal('modal-referee-picker');
}

export function selectRefereeForSlot(refName) {
    const match = matchesData.find(m => m.id === state.activeSlotMatchId);
    if (!match || !state.activeSlotRole) return;

    if (refName) {
        const slotLabels = {
            'referee': 'Hlavní Rozhodčí',
            'delegate': 'Delegát Utkání',
            'fourthRef': 'Čtvrtý Rozhodčí',
            'var': 'VAR Rozhodčí'
        };
        const duplicateRoleKey = ['referee', 'delegate', 'fourthRef', 'var'].find(rKey => rKey !== state.activeSlotRole && match[rKey] === refName);
        if (duplicateRoleKey) {
            showToast(`Rozhodčí ${refName} je v tomto utkání již nominován jako ${slotLabels[duplicateRoleKey]}! V jedné nominaci může být rozhodčí pouze jednou.`, true);
            return;
        }

    }

    match[state.activeSlotRole] = refName;
    showToast(`Nominace aktualizována: ${refName || 'odebráno'}.`);
    closeSpecificModal('modal-referee-picker');
    renderRefereeAssignments();
}

export function selectRefereeForSlotById(refereeId) {
    const referee = refereesData.find(item => item.id === Number(refereeId));
    if (referee) selectRefereeForSlot(referee.robloxNick);
}

export function openAddRefereeModal() {
    state.activeEditRefId = null;
    document.getElementById('referee-modal-title').innerHTML = `<i class="fa-solid fa-user-plus"></i> Přidat Rozhodčího`;
    document.getElementById('edit-ref-roblox').value = '';
    document.getElementById('edit-ref-discord').value = '';
    const discordId = document.getElementById('edit-ref-discord-id');
    discordId.value = '';
    discordId.disabled = false;
    discordId.required = true;
    document.getElementById('edit-ref-license').value = 'A';
    document.getElementById('edit-ref-status').value = 'Active';
    document.getElementById('edit-ref-is-delegate').checked = false;

    toggleRefStatusReasonInput();
    openModal('modal-edit-referee');
}

export function editRefereeModal(refId) {
    const ref = refereesData.find(r => r.id === refId);
    if (!ref) return;

    state.activeEditRefId = refId;
    document.getElementById('referee-modal-title').innerHTML = `<i class="fa-solid fa-user-ninja"></i> Upravit Rozhodčího`;
    document.getElementById('edit-ref-roblox').value = ref.robloxNick;
    document.getElementById('edit-ref-discord').value = ref.discordNick;
    const discordId = document.getElementById('edit-ref-discord-id');
    discordId.value = '';
    discordId.disabled = false;
    discordId.required = false;
    discordId.placeholder = 'Volitelné: nové Discord ID (pro opětovné propojení)';
    document.getElementById('edit-ref-license').value = ref.license;
    document.getElementById('edit-ref-status').value = ref.status || 'Active';
    document.getElementById('edit-ref-is-delegate').checked = ref.isDelegate;
    document.getElementById('edit-ref-reason').value = '';

    toggleRefStatusReasonInput();
    openModal('modal-edit-referee');
}

export function toggleRefStatusReasonInput() {
    const status = document.getElementById('edit-ref-status').value;
    const box = document.getElementById('ref-status-reason-box');
    if (status === 'Suspended') {
        box.classList.remove('hidden');
    } else {
        box.classList.add('hidden');
    }
}

export async function saveRefereeChanges() {
    const roblox = document.getElementById('edit-ref-roblox').value.trim();
    const discord = document.getElementById('edit-ref-discord').value.trim();
    const discordId = document.getElementById('edit-ref-discord-id').value.trim();
    const license = document.getElementById('edit-ref-license').value;
    const status = document.getElementById('edit-ref-status').value;
    const isDelegate = document.getElementById('edit-ref-is-delegate').checked;
    const reason = document.getElementById('edit-ref-reason').value.trim();

    if (!roblox || !discord || (!state.activeEditRefId && !/^\d{17,20}$/.test(discordId)) ||
        (state.activeEditRefId && discordId && !/^\d{17,20}$/.test(discordId))) {
        showToast("Vyplňte Roblox Nick, Discord Nick a platné Discord ID.", true);
        return;
    }

    if (status === 'Suspended' && !reason) {
        showToast("Pro suspendování rozhodčího musíte vyplnit důvod!", true);
        return;
    }

    if (state.activeEditRefId) {
        const ref = refereesData.find(r => r.id === state.activeEditRefId);
        if (ref) {
            const wasActive = ref.status !== 'Suspended';
            const wasDelegate = ref.isDelegate;
            const updates = { ...ref, robloxNick: roblox, discordNick: discord, license, status, isDelegate };
            if (discordId) updates.discordId = discordId;
            try {
                await apiUpdateReferee(updates);
            } catch (error) {
                showToast(`Rozhodčího se nepodařilo uložit: ${error.message}`, true);
                return;
            }
            const publicUpdates = { ...updates };
            delete publicUpdates.discordId;
            Object.assign(ref, publicUpdates);

            if (status === 'Suspended' && wasActive) {
                let removedCount = 0;
                matchesData.forEach(m => {
                    if (m.referee === roblox) { m.referee = null; removedCount++; }
                    if (m.fourthRef === roblox) { m.fourthRef = null; removedCount++; }
                    if (m.var === roblox) { m.var = null; removedCount++; }
                    if (m.delegate === roblox) { m.delegate = null; removedCount++; }
                });

                logDKAction("SUSPENZACE_ROZHODČÍHO", roblox, `Rozhodčí byl suspendován. Důvod: ${reason}. Odebrán z ${removedCount} nominací.`);
                showToast(`Rozhodčí ${roblox} suspendován a odebrán z ${removedCount} zápasů!`);
            } else {
                showToast(`Rozhodčí ${roblox} upraven!`);
            }
            if (ref.isCurrentUser && (wasDelegate !== isDelegate || Boolean(discordId))) {
                window.location.reload();
                return;
            }
        }
    } else {
        const newReferee = {
            robloxNick: roblox,
            discordNick: discord,
            license: license,
            status: status,
            isDelegate: isDelegate,
        };
        let createdReferee;
        try {
            createdReferee = await apiCreateReferee({ ...newReferee, discordId });
            newReferee.id = createdReferee.id;
        } catch (error) {
            showToast(`Rozhodčího se nepodařilo zaregistrovat: ${error.message}`, true);
            return;
        }
        refereesData.push({ ...newReferee, isRegistered: createdReferee.isRegistered });
        if (isDelegate && state.currentUser?.discordId === discordId) {
            window.location.reload();
            return;
        }
        
        if (status === 'Suspended') {
            logDKAction("SUSPENZACE_ROZHODČÍHO", roblox, `Vytvořen nový suspendovaný rozhodčí. Důvod: ${reason}`);
        }
        showToast(`Novému rozhodčímu ${roblox} vytvořen profil!`);
    }

    closeSpecificModal('modal-edit-referee');
    renderRefereesTab();
    updateAdminStats();
    renderDashboard();
}
