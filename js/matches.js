/**
 * CVFL Portál - Zápasy a Oficiální Elektronický Zápis O Utkání (FIS ZOU)
 */

import { state, teamsData, playersData, matchesData, suspensionsData } from './state.js';
import { openModal, closeSpecificModal, showToast, openConfirmModal } from './ui.js';
import { logDKAction } from './disciplinary.js';
import { renderDashboard } from './dashboard.js';
import { cancelForfeitWithConfirm } from './match-operations.js';
import { renderRefereesTab } from './referees.js';
import { apiSaveMatch } from './api.js';
import { getMatchStatusLabel } from './match-status.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';
import { isPromotionPlayoffSecondLeg, getPromotionPlayoffAggregate } from './playoff-utils.js';

export function onCompetitionFilterChange() {
    const compEl = document.getElementById('match-filter-competition');
    if (!compEl) return;
    const comp = compEl.value;
    const roundSelect = document.getElementById('match-filter-round');

    if (comp === 'MOL Cup') {
        roundSelect.innerHTML = `
            <option value="ALL">Všechny Fáze MOL Cupu</option>
            <option value="Osmifinále">Osmifinále</option>
            <option value="Čtvrtfinále">Čtvrtfinále</option>
            <option value="Semifinále">Semifinále</option>
            <option value="Finále">Finále</option>
        `;
    } else if (comp === 'Baráž o 1. Ligu') {
        roundSelect.innerHTML = `
            <option value="ALL">Všechny zápasy baráže</option>
            <option value="1">Baráž — 1. zápasy</option>
            <option value="2">Baráž — odvety</option>
        `;
    } else if (comp === 'ALL') {
        roundSelect.innerHTML = '<option value="ALL">Všechna Kola / Fáze</option>';
    } else {
        let options = `<option value="ALL">Všechna Kola (1-14)</option>`;
        for (let r = 1; r <= 14; r++) {
            options += `<option value="${r}">${r}. Kolo</option>`;
        }
        roundSelect.innerHTML = options;
    }
    renderMatches();
}

export function renderMatches() {
    const container = document.getElementById('matches-full-list');
    if (!container) return;

    const compEl = document.getElementById('match-filter-competition');
    const roundEl = document.getElementById('match-filter-round');
    const statusEl = document.getElementById('match-filter-status');

    const selectedComp = compEl ? compEl.value : 'ALL';
    const selectedRound = roundEl ? roundEl.value : 'ALL';
    const selectedStatus = statusEl ? statusEl.value : 'ALL';

    let filtered = matchesData;

    if (selectedComp !== 'ALL') {
        filtered = filtered.filter(m => m.competition === selectedComp);
    }

    if (selectedRound !== 'ALL') {
        if (selectedComp === 'MOL Cup') {
            filtered = filtered.filter(m => m.cupStage === selectedRound);
        } else {
            filtered = filtered.filter(m => m.round === parseInt(selectedRound));
        }
    }

    if (selectedStatus !== 'ALL') {
        filtered = filtered.filter(m => m.status === selectedStatus);
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-2 p-8 bg-[#0e1a4f] rounded-xl border border-[#1e307d] text-center text-gray-400 text-xs">Žádné zápasy neodpovídají zvoleným filtrům.</div>`;
        return;
    }

    container.innerHTML = filtered.map(m => {
        const home = teamsData.find(t => t.id === m.homeTeamId);
        const away = teamsData.find(t => t.id === m.awayTeamId);

        const roundText = m.competition === 'MOL Cup' ? m.cupStage :
            m.competition === 'Baráž o 1. Ligu' ? `Baráž — ${Number(m.round) === 2 ? 'Odveta' : '1. zápas'}` :
                `${m.round}. Kolo`;
        const d = (m.matchDate && m.matchDate !== 'TBA') ? new Date(m.matchDate) : null;
        const matchDateFormatted = m.matchDate === 'TBA' ? 'TBA' : (d ? `${d.getDate()}.${d.getMonth() + 1}. ${d.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'})}` : 'Termín TBD');

        return `
            <div class="bg-[#0e1a4f] p-5 rounded-xl border border-[#1e307d] shadow-md flex flex-col justify-between space-y-4">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-[#aefb12]">${escapeTeamName(m.competition)} — ${escapeTeamName(roundText)}</span>
                    <span class="text-gray-400">${m.stadium ? `<i class="fa-solid fa-location-dot mr-1"></i>${escapeTeamName(m.stadium)} | ` : ''}${matchDateFormatted}</span>
                </div>
                <div class="flex justify-between items-center">
                    <div class="flex items-center justify-center gap-2 text-center w-5/12 font-bold text-sm text-white">${home ? `${getTeamLogoMarkup(home)}<span class="truncate">${escapeTeamName(home.name)}</span>` : ''}</div>
                    <div class="text-center font-black text-xl text-[#aefb12] px-3 py-1 bg-[#13236b] border border-[#1e307d] rounded flex flex-col items-center">
                        <span>${m.status === 'Completed' || m.status === 'In_Progress' ? `${m.homeScore} : ${m.awayScore}` : (m.status === 'Postponed' ? 'Odloženo' : 'VS')}</span>
                        ${m.isForfeited ? '<span class="text-[9px] text-amber-400 uppercase font-black tracking-tight">Kontumováno</span>' : ''}
                    </div>
                    <div class="flex items-center justify-center gap-2 text-center w-5/12 font-bold text-sm text-white">${away ? `${getTeamLogoMarkup(away)}<span class="truncate">${escapeTeamName(away.name)}</span>` : ''}</div>
                </div>
                <div class="flex justify-between items-center border-t border-[#1e307d] pt-3 text-xs">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-400"><i class="fa-solid fa-user-ninja mr-1"></i> ${escapeTeamName(m.referee || 'Nenominován')}</span>
                        ${m.isForfeited && ['Admin', 'DK'].includes(state.currentUserRole) ? `
                        <button onclick="cancelForfeitWithConfirm(${m.id})" class="px-2 py-0.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-black border border-amber-500/30 rounded text-[10px] font-bold transition">
                            Zrušit Kontumaci
                        </button>` : ''}
                    </div>
                    <button onclick="openMatchProtocol(${m.id})" class="px-4 py-1.5 bg-[#aefb12] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg shadow">
                        Zápis Utkání
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function openMatchProtocol(matchId) {
    const match = matchesData.find(m => String(m.id) === String(matchId));
    if (!match) {
        showToast('Zápas se nepodařilo najít. Obnovte stránku a zkuste to znovu.', true);
        return;
    }

    if (!Array.isArray(match.events)) match.events = [];
    if (!Array.isArray(match.homeRoster)) match.homeRoster = [];
    if (!Array.isArray(match.awayRoster)) match.awayRoster = [];
    if (!Array.isArray(match.homeStaff)) match.homeStaff = [];
    if (!Array.isArray(match.awayStaff)) match.awayStaff = [];

    const protocolModal = document.getElementById('modal-match-protocol');
    if (!protocolModal || protocolModal.classList.contains('hidden') || state.matchProtocolSnapshotId !== matchId) {
        state.matchProtocolSnapshotId = matchId;
        state.matchProtocolSnapshot = JSON.parse(JSON.stringify(match));
    }

    const home = teamsData.find(t => t.id === match.homeTeamId);
    const away = teamsData.find(t => t.id === match.awayTeamId);

    if (!match.checks) match.checks = { fansIssue: false, systemIssue: false, playersIssue: false, homeIdentityChecked: false, awayIdentityChecked: false };
    if (!match.periodChecks) match.periodChecks = { h1Started: false, h1Ended: false, h2Started: false, h2Ended: false };
    if (!Number.isInteger(match.homePenaltyScore)) match.homePenaltyScore = 0;
    if (!Number.isInteger(match.awayPenaltyScore)) match.awayPenaltyScore = 0;
    const isPlayoffSecondLeg = isPromotionPlayoffSecondLeg(match);
    const playoffAggregate = getPromotionPlayoffAggregate(match, matchesData);
    const penaltiesCanBeRecorded = isPlayoffSecondLeg && playoffAggregate?.tied &&
        playoffAggregate.firstLegCompleted &&
        (match.status === 'Completed' || match.periodChecks.h2Ended);

    const isAdminOrDK = ['Admin', 'DK'].includes(state.currentUserRole);
    const isRefereeOrMgr = ['Referee', 'Referee_Manager'].includes(state.currentUserRole);
    const isDelegate = state.currentUserRole === 'Delegate';
    const canEditEverything = isAdminOrDK || isRefereeOrMgr;

    const isTeamMgr = (state.currentUserRole || '').startsWith('Team_Manager');
    const myTeamId = isTeamMgr ? state.activeTeamManagerTeamId : null;

    const canEditHome = canEditEverything || (isTeamMgr && myTeamId === match.homeTeamId);
    const canEditAway = canEditEverything || (isTeamMgr && myTeamId === match.awayTeamId);

    const canViewDelegateTab = isDelegate || ['Referee_Manager', 'Admin'].includes(state.currentUserRole);
    const canEditDelegate = isDelegate || state.currentUserRole === 'Admin';

    const dateObj = (match.matchDate && match.matchDate !== 'TBA') ? new Date(match.matchDate) : null;
    const dateOnlyFormatted = match.matchDate === 'TBA' ? 'TBA' : (dateObj ? `${dateObj.getDate()}.${dateObj.getMonth() + 1}.` : '16.10.');
    const timeOnlyFormatted = match.matchDate === 'TBA' ? 'TBA' : (dateObj ? dateObj.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'}) : '18:00');

    let teamMgrNotice = '';
    if (isTeamMgr) {
        if (myTeamId === match.homeTeamId) {
            teamMgrNotice = `<div class="mt-2 p-2.5 bg-[#11806a]/20 border border-[#11806a]/50 text-[#05fda3] rounded-lg text-xs flex items-center gap-2"><i class="fa-solid fa-user-shield"></i> Přihlášen jako Vedoucí Mužstva: <strong>${home ? home.name : ''}</strong> (Upravovat můžete pouze domácí sestavu a realizační tým)</div>`;
        } else if (myTeamId === match.awayTeamId) {
            teamMgrNotice = `<div class="mt-2 p-2.5 bg-[#11806a]/20 border border-[#11806a]/50 text-[#05fda3] rounded-lg text-xs flex items-center gap-2"><i class="fa-solid fa-user-shield"></i> Přihlášen jako Vedoucí Mužstva: <strong>${away ? away.name : ''}</strong> (Upravovat můžete pouze hostující sestavu a realizační tým)</div>`;
        } else {
            teamMgrNotice = `<div class="mt-2 p-2.5 bg-gray-700/40 border border-gray-600 text-gray-300 rounded-lg text-xs flex items-center gap-2"><i class="fa-solid fa-eye"></i> Režim prohlížení: Váš tým v tomto utkání nehraje. Zápis je pouze pro čtení.</div>`;
        }
    }

    const modalContent = document.getElementById('match-protocol-content');
    modalContent.innerHTML = `
        <div class="border-b border-[#1e307d] pb-4 mb-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <span class="text-xs font-mono text-[#aefb12] uppercase tracking-wider">Oficiální Elektronický Zápis O Utkání (FIS ZOU)</span>
                    <h2 class="text-2xl font-black text-white">${home ? home.name : ''} vs. ${away ? away.name : ''}</h2>
                </div>
                <div class="flex items-center gap-3">
                    <span class="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-lg">
                        Stav: ${match.isLocked ? 'Uzamčeno' : getMatchStatusLabel(match.status)}
                    </span>
                    <button onclick="closeMatchProtocolWithCheck(${match.id})" class="text-gray-400 hover:text-white ml-2 p-1"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
            </div>
            ${teamMgrNotice}

            <!-- HORNÍ PANEL DETAILŮ UTKÁNÍ -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 bg-[#13236b]/80 p-4 rounded-xl text-xs border border-[#1e307d]">
                <div>
                    <label class="text-gray-400 block mb-1">Stadion</label>
                    <input type="text" id="zou-stadium-input" value="${escapeTeamName(match.stadium || 'TBD')}" ${state.currentUserRole !== 'Admin' ? 'disabled' : ''} onchange="updateMatchDetails(${match.id})" class="w-full bg-[#0e1a4f] border border-[#1e307d] p-1.5 rounded text-white font-semibold disabled:opacity-60">
                </div>
                <div>
                    <label class="text-gray-400 block mb-1">Datum a Čas</label>
                    <div class="flex space-x-1">
                        <input type="text" id="zou-date-input" value="${dateOnlyFormatted}" disabled class="w-1/2 bg-[#0e1a4f] border border-[#1e307d] p-1.5 rounded text-white font-mono opacity-60">
                        <input type="text" id="zou-time-input" value="${timeOnlyFormatted}" disabled class="w-1/2 bg-[#0e1a4f] border border-[#1e307d] p-1.5 rounded text-white font-mono opacity-60">
                    </div>
                </div>
                <div>
                    <label class="text-gray-400 block mb-1">Hlavní Rozhodčí</label>
                    <input type="text" id="zou-referee-input" value="${escapeTeamName(match.referee || 'Nenominován')}" disabled class="w-full bg-[#0e1a4f] border border-[#1e307d] p-1.5 rounded text-white font-semibold opacity-60">
                </div>
                <div>
                    <label class="text-gray-400 block mb-1">Hlavní Pořadatel</label>
                    <input type="text" id="zou-recorder-input" value="${escapeTeamName(match.recorder || 'Vedení Ligy')}" ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchDetails(${match.id})" class="w-full bg-[#0e1a4f] border border-[#1e307d] p-1.5 rounded text-white font-semibold disabled:opacity-60">
                </div>
                <div>
                    <label class="text-gray-400 block mb-1">Diváci / Počet Zápasů</label>
                    <input type="number" id="zou-spectators-input" value="${match.spectators || 120}" ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchDetails(${match.id})" class="w-full bg-[#0e1a4f] border border-[#1e307d] p-1.5 rounded text-white font-mono disabled:opacity-60">
                </div>
            </div>
        </div>

        <div class="flex flex-wrap gap-1 border-b border-[#1e307d] mb-4 font-semibold text-xs text-gray-300">
            <button onclick="switchFISTab('sestavy')" id="fistab-sestavy" class="fis-tab-btn active px-3 py-2">Sestavy týmů</button>
            <button onclick="switchFISTab('realizacni')" id="fistab-realizacni" class="fis-tab-btn px-3 py-2">Realizační tým</button>
            <button onclick="switchFISTab('hraci-casti')" id="fistab-hraci-casti" class="fis-tab-btn px-3 py-2">Hrací části</button>
            ${isPlayoffSecondLeg ? `<button onclick="switchFISTab('penalty')" id="fistab-penalty" class="fis-tab-btn px-3 py-2 text-amber-300">Penalty</button>` : ''}
            <button onclick="switchFISTab('stridani')" id="fistab-stridani" class="fis-tab-btn px-3 py-2">Střídání</button>
            <button onclick="switchFISTab('branky')" id="fistab-branky" class="fis-tab-btn px-3 py-2">Branky a Asistence</button>
            <button onclick="switchFISTab('vylouceni')" id="fistab-vylouceni" class="fis-tab-btn px-3 py-2">Karty</button>
            <button onclick="switchFISTab('online')" id="fistab-online" class="fis-tab-btn px-3 py-2">Komentář k utkání</button>
            <button onclick="switchFISTab('rozhodci')" id="fistab-rozhodci" class="fis-tab-btn px-3 py-2">Rozhodčí</button>
            <button onclick="switchFISTab('kontrola')" id="fistab-kontrola" class="fis-tab-btn px-3 py-2">Kontrola ZOU</button>
            ${canViewDelegateTab ? `<button onclick="switchFISTab('delegat')" id="fistab-delegat" class="fis-tab-btn px-3 py-2 text-purple-400 font-bold"><i class="fa-solid fa-user-tie mr-1"></i> Hodnocení delegáta</button>` : ''}
        </div>

        <!-- TAB 1: SESTAVY -->
        <div id="fis-sec-sestavy" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                    <div class="flex justify-between items-center border-b border-[#1e307d] pb-2">
                        <div>
                            <h3 class="inline-flex items-center gap-2 font-bold text-[#aefb12] text-sm">${home ? `${getTeamLogoMarkup(home)}${escapeTeamName(home.name)}` : ''}</h3>
                            <span class="text-[10px] text-gray-400">3–5 v základu, max. 10 na soupisce, 1 brankář</span>
                        </div>
                        ${canEditHome && !match.isLocked ? `
                        <button onclick="openAddPlayerToRosterModal(${match.id}, 'home')" class="px-2.5 py-1 bg-[#aefb12] text-[#13236b] font-black rounded text-[11px] shadow hover:bg-opacity-90">
                            + Přidat Hráče
                        </button>` : ''}
                    </div>
                    <div id="home-roster-container" class="space-y-2 text-xs">
                        ${renderRosterList(match, 'home', canEditHome)}
                    </div>
                </div>

                <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                    <div class="flex justify-between items-center border-b border-[#1e307d] pb-2">
                        <div>
                            <h3 class="inline-flex items-center gap-2 font-bold text-[#05fda3] text-sm">${away ? `${getTeamLogoMarkup(away)}${escapeTeamName(away.name)}` : ''}</h3>
                            <span class="text-[10px] text-gray-400">3–5 v základu, max. 10 na soupisce, 1 brankář</span>
                        </div>
                        ${canEditAway && !match.isLocked ? `
                        <button onclick="openAddPlayerToRosterModal(${match.id}, 'away')" class="px-2.5 py-1 bg-[#05fda3] text-[#13236b] font-black rounded text-[11px] shadow hover:bg-opacity-90">
                            + Přidat Hráče
                        </button>` : ''}
                    </div>
                    <div id="away-roster-container" class="space-y-2 text-xs">
                        ${renderRosterList(match, 'away', canEditAway)}
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 2: REALIZAČNÍ TÝM -->
        <div id="fis-sec-realizacni" class="hidden space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                    <div class="flex justify-between items-center border-b border-[#1e307d] pb-2">
                        <h4 class="inline-flex items-center gap-2 font-bold text-[#aefb12]">Realizační Tým — ${home ? `${getTeamLogoMarkup(home)}${escapeTeamName(home.name)}` : ''} (${match.homeStaff.length}/5)</h4>
                        ${canEditHome && !match.isLocked ? `<button onclick="openAddStaffModal(${match.id}, 'home')" class="px-2 py-1 bg-[#aefb12] text-[#13236b] font-bold text-[10px] rounded">+ Přidat Člena</button>` : ''}
                    </div>
                    <div class="space-y-2">
                        ${renderStaffList(match, 'home', canEditHome)}
                    </div>
                </div>

                <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                    <div class="flex justify-between items-center border-b border-[#1e307d] pb-2">
                        <h4 class="inline-flex items-center gap-2 font-bold text-[#05fda3]">Realizační Tým — ${away ? `${getTeamLogoMarkup(away)}${escapeTeamName(away.name)}` : ''} (${match.awayStaff.length}/5)</h4>
                        ${canEditAway && !match.isLocked ? `<button onclick="openAddStaffModal(${match.id}, 'away')" class="px-2 py-1 bg-[#05fda3] text-[#13236b] font-bold text-[10px] rounded">+ Přidat Člena</button>` : ''}
                    </div>
                    <div class="space-y-2">
                        ${renderStaffList(match, 'away', canEditAway)}
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 3: HRACÍ ČÁSTI -->
        <div id="fis-sec-hraci-casti" class="hidden space-y-4 text-xs">
            <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-4">
                <h4 class="font-bold text-white text-sm">Stav Hracích Částí</h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#0e1a4f] p-4 rounded-xl border border-[#1e307d]">
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-h1-started" ${match.periodChecks.h1Started ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updatePeriodChecks(${match.id})" class="accent-[#aefb12] w-4 h-4">
                        <span>1. poločas začal</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-h1-ended" ${match.periodChecks.h1Ended ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updatePeriodChecks(${match.id})" class="accent-[#aefb12] w-4 h-4">
                        <span>1. poločas skončil</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-h2-started" ${match.periodChecks.h2Started ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updatePeriodChecks(${match.id})" class="accent-[#aefb12] w-4 h-4">
                        <span>2. poločas začal</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-h2-ended" ${match.periodChecks.h2Ended ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updatePeriodChecks(${match.id})" class="accent-[#aefb12] w-4 h-4">
                        <span>2. poločas skončil</span>
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-4 bg-[#0e1a4f] p-4 rounded-xl border border-[#1e307d]">
                    <div>
                        <label class="block text-gray-400 mb-1">Čas začátku utkání:</label>
                        <input type="time" id="match-start-time" value="${match.startTime || ''}" ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchDetails(${match.id})" class="w-full bg-[#13236b] border border-[#1e307d] p-2 rounded text-white font-mono">
                    </div>
                    <div>
                        <label class="block text-gray-400 mb-1">Čas konce utkání:</label>
                        <input type="time" id="match-end-time" value="${match.endTime || ''}" ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchDetails(${match.id})" class="w-full bg-[#13236b] border border-[#1e307d] p-2 rounded text-white font-mono">
                    </div>
                </div>
                ${isPlayoffSecondLeg ? `
                    <div class="grid grid-cols-2 gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
                        <label class="flex items-center gap-2 text-xs font-bold text-amber-200">
                            <input type="checkbox" id="check-penalties-started" ${match.periodChecks.penaltiesStarted ? 'checked' : ''} ${!canEditEverything || match.isLocked || !penaltiesCanBeRecorded ? 'disabled' : ''} onchange="updatePeriodChecks(${match.id})" class="accent-amber-400">
                            Penaltový rozstřel začal
                        </label>
                        <label class="flex items-center gap-2 text-xs font-bold text-amber-200">
                            <input type="checkbox" id="check-penalties-ended" ${match.periodChecks.penaltiesEnded ? 'checked' : ''} ${!canEditEverything || match.isLocked || !penaltiesCanBeRecorded || !match.periodChecks.penaltiesStarted ? 'disabled' : ''} onchange="updatePeriodChecks(${match.id})" class="accent-amber-400">
                            Penaltový rozstřel skončil
                        </label>
                        <p class="col-span-2 text-[10px] text-gray-400">${playoffAggregate ? `Součet obou utkání: ${playoffAggregate.homeScore}:${playoffAggregate.awayScore}.` : 'Čeká se na první zápas baráže.'} Penalty jsou možné pouze po odehrání obou zápasů při shodném součtu.</p>
                    </div>` : ''}
            </div>
        </div>

        ${isPlayoffSecondLeg ? `
        <div id="fis-sec-penalty" class="hidden space-y-4 text-xs">
            <div class="rounded-xl border border-amber-400/30 bg-[#13236b] p-4 space-y-4">
                <div>
                    <h3 class="font-bold text-amber-300 text-sm">Penaltový rozstřel — odveta baráže</h3>
                    <p class="mt-1 text-gray-400">${playoffAggregate ? `Součet skóre po dvou zápasech: ${playoffAggregate.homeScore}:${playoffAggregate.awayScore}.` : 'Čeká se na výsledek prvního zápasu.'} Záznam penalt je aktivní pouze při shodném součtu po skončení odvety.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label class="block text-[#aefb12] font-bold">${home ? escapeTeamName(home.name) : 'Domácí'}
                        <input type="number" min="0" max="99" value="${match.homePenaltyScore}" ${!canEditEverything || match.isLocked || !penaltiesCanBeRecorded || !match.periodChecks.penaltiesStarted ? 'disabled' : ''} onchange="updatePenaltyScores(${match.id})" id="home-penalty-score" class="mt-1 w-full bg-[#0e1a4f] border border-amber-400/30 rounded p-2 text-white disabled:opacity-50">
                    </label>
                    <label class="block text-[#05fda3] font-bold">${away ? escapeTeamName(away.name) : 'Hosté'}
                        <input type="number" min="0" max="99" value="${match.awayPenaltyScore}" ${!canEditEverything || match.isLocked || !penaltiesCanBeRecorded || !match.periodChecks.penaltiesStarted ? 'disabled' : ''} onchange="updatePenaltyScores(${match.id})" id="away-penalty-score" class="mt-1 w-full bg-[#0e1a4f] border border-amber-400/30 rounded p-2 text-white disabled:opacity-50">
                    </label>
                </div>
                ${!penaltiesCanBeRecorded ? '<p class="text-amber-300">Penaltový rozstřel zatím nelze zaznamenat.</p>' : ''}
                ${match.periodChecks.penaltiesEnded && match.homePenaltyScore !== match.awayPenaltyScore ? '<p class="font-black text-amber-300">Vítěz penaltového rozstřelu: ' + escapeTeamName(match.homePenaltyScore > match.awayPenaltyScore ? home?.name || 'Domácí tým' : away?.name || 'Hostující tým') + '</p>' : ''}
            </div>
        </div>` : ''}

        <!-- TAB: STŘÍDÁNÍ -->
        <div id="fis-sec-stridani" class="hidden space-y-4 text-xs">
            ${canEditEverything && !match.isLocked ? `
            <div class="rounded-xl border border-[#1e307d] bg-[#13236b] p-4 space-y-3">
                <h3 class="font-bold text-white text-sm">Zaznamenat střídání</h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label class="text-gray-300">Tým
                        <select id="sub-team-select" onchange="renderSubstitutionPlayerOptions(${match.id})" class="mt-1 w-full rounded border border-[#1e307d] bg-[#0e1a4f] p-2 text-white">
                            <option value="home">Domácí (${home ? escapeTeamName(home.name) : 'Domácí'})</option>
                            <option value="away">Hosté (${away ? escapeTeamName(away.name) : 'Hosté'})</option>
                        </select>
                    </label>
                    <label class="text-gray-300">Hráč odchází ze hřiště
                        <select id="sub-out-select" class="mt-1 w-full rounded border border-[#1e307d] bg-[#0e1a4f] p-2 text-white"></select>
                    </label>
                    <label class="text-gray-300">Hráč nastupuje
                        <select id="sub-in-select" class="mt-1 w-full rounded border border-[#1e307d] bg-[#0e1a4f] p-2 text-white"></select>
                    </label>
                    <label class="text-gray-300">Čas
                        <input id="sub-time-input" type="text" placeholder="Např. 12:30" class="mt-1 w-full rounded border border-[#1e307d] bg-[#0e1a4f] p-2 text-white">
                    </label>
                </div>
                <button type="button" onclick="submitSubstitution(${match.id})" class="rounded bg-[#aefb12] px-4 py-2 font-black text-[#13236b]">Zapsat střídání</button>
            </div>
            ` : ''}
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead class="bg-[#13236b] text-gray-400 uppercase"><tr><th class="p-2">Tým</th><th class="p-2">Čas</th><th class="p-2">Odchází</th><th class="p-2">Nastupuje</th><th class="p-2 text-right">Akce</th></tr></thead>
                    <tbody class="divide-y divide-[#1e307d]">
                        ${match.events.filter(e => e.type === 'Substitution').map(e => {
                            const team = e.teamSide === 'home' ? home : away;
                            const outgoing = playersData.find(player => player.id === e.playerOutId);
                            const incoming = playersData.find(player => player.id === e.playerInId);
                            return `<tr><td class="p-2 font-bold ${e.teamSide === 'home' ? 'text-[#aefb12]' : 'text-[#05fda3]'}">${team ? escapeTeamName(team.name) : 'Tým'}</td><td class="p-2 font-mono text-gray-300">${escapeTeamName(e.timeStr || '')}</td><td class="p-2 text-white">${escapeTeamName(outgoing?.robloxNick || 'Hráč')}</td><td class="p-2 text-white">${escapeTeamName(incoming?.robloxNick || 'Hráč')}</td><td class="p-2 text-right">${canEditEverything && !match.isLocked ? `<button onclick="deleteMatchEvent(${match.id}, ${e.id})" class="rounded bg-[#f33332]/20 px-2 py-1 font-bold text-[#f33332]">Smazat</button>` : ''}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- TAB 4: BRANKY -->
        <div id="fis-sec-branky" class="hidden space-y-4 text-xs">
            <div class="flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-white text-sm">Záznam Vstřelených Branek a Asistencí</h3>
                    <span class="text-xs text-gray-400">Průběžný stav: <strong class="text-[#aefb12] text-sm">${match.homeScore} : ${match.awayScore}</strong></span>
                </div>
                ${canEditEverything && !match.isLocked ? `
                <div class="flex flex-wrap gap-2">
                    <button onclick="openGoalForm(${match.id}, 'home')" class="px-3.5 py-1.5 bg-[#aefb12] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg shadow flex items-center gap-1.5 transition">
                        <i class="fa-solid fa-futbol"></i> Gól Domácí (${home ? home.name : 'Domácí'})
                    </button>
                    <button onclick="openGoalForm(${match.id}, 'away')" class="px-3.5 py-1.5 bg-[#05fda3] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg shadow flex items-center gap-1.5 transition">
                        <i class="fa-solid fa-futbol"></i> Gól Hosté (${away ? away.name : 'Hosté'})
                    </button>
                </div>` : ''}
            </div>

            <!-- FORMULÁŘ PRO PŘIDÁNÍ GÓLU -->
            <div id="goal-form-wrapper" class="hidden"></div>

            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead class="bg-[#13236b] text-gray-400 uppercase">
                        <tr>
                            <th class="p-2">Tým</th>
                            <th class="p-2">Čas</th>
                            <th class="p-2">Typ</th>
                            <th class="p-2">Střelec</th>
                            <th class="p-2">Asistent</th>
                            <th class="p-2 text-right">Akce</th>
                        </tr>
                    </thead>
                    <tbody id="goalsTableBody" class="divide-y divide-[#1e307d]">
                        ${match.events.filter(e => e.type === 'Goal').map(e => {
                            const scorer = playersData.find(p => p.id === e.playerId);
                            const assist = playersData.find(p => p.id === e.secondaryPlayerId);
                            const isHome = e.teamSide === 'home' || (!e.teamSide && e.playerId && match.homeRoster.some(r => r.playerId === e.playerId));
                            const goalTeamName = isHome ? (home ? home.name : 'Domácí') : (away ? away.name : 'Hosté');
                            const timeDisplay = e.timeStr || (e.minute !== undefined ? (String(e.minute).padStart(2, '0') + ':00') : '00:00');
                            const typeLabel = e.goalType === 'Penalty' ? 'Penalta' : (e.goalType === 'Own' ? 'Vlastní' : 'Běžný');
                            const typeBadge = e.goalType === 'Penalty' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : (e.goalType === 'Own' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-[#aefb12]/20 text-[#aefb12] border border-[#aefb12]/30');

                            return `
                            <tr>
                                <td class="p-2 font-bold ${isHome ? 'text-[#aefb12]' : 'text-[#05fda3]'}">${goalTeamName}</td>
                                <td class="p-2 font-mono text-gray-300">${timeDisplay}</td>
                                <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${typeBadge}">${typeLabel}</span></td>
                                <td class="p-2 text-white font-bold">${scorer ? scorer.robloxNick : 'Hráč'} ${e.goalType === 'Own' ? '<span class="text-purple-400 text-[10px] font-normal">(vlastní gól)</span>' : ''}</td>
                                <td class="p-2 text-gray-300">${assist ? assist.robloxNick : (e.goalType === 'Regular' ? 'Bez asistence' : '—')}</td>
                                <td class="p-2 text-right">
                                    ${canEditEverything && !match.isLocked ? `
                                    <button onclick="deleteMatchEvent(${match.id}, ${e.id})" class="px-2 py-1 bg-[#f33332]/20 hover:bg-[#f33332] text-[#f33332] hover:text-white rounded font-bold transition">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>` : ''}
                                </td>
                            </tr>
                        `;}).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- TAB 5: KARTY -->
        <div id="fis-sec-vylouceni" class="hidden space-y-4 text-xs">
            <div class="flex justify-between items-center">
                <h3 class="font-bold text-white text-sm">Záznam Karet</h3>
                ${canEditEverything && !match.isLocked ? `
                <button onclick="openCardForm(${match.id})" class="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg shadow flex items-center gap-1.5 transition">
                    <i class="fa-solid fa-square"></i> + Přidat Kartu
                </button>` : ''}
            </div>

            <!-- FORMULÁŘ PRO PŘIDÁNÍ KARTY -->
            <div id="card-form-wrapper" class="hidden"></div>

            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead class="bg-[#13236b] text-gray-400 uppercase">
                        <tr>
                            <th class="p-2">Tým</th>
                            <th class="p-2">Čas</th>
                            <th class="p-2">Osoba</th>
                            <th class="p-2">Druh karty</th>
                            <th class="p-2">Důvod</th>
                            <th class="p-2 text-right">Akce</th>
                        </tr>
                    </thead>
                    <tbody id="cardsTableBody" class="divide-y divide-[#1e307d]">
                        ${match.events.filter(e => e.type.includes('Card') || e.type === 'Yellow' || e.type === 'Red' || e.type === 'Second_Yellow').map(e => {
                            const isHome = e.teamSide === 'home' || (!e.teamSide && e.playerId && match.homeRoster.some(r => r.playerId === e.playerId));
                            const cardTeamName = isHome ? (home ? home.name : 'Domácí') : (away ? away.name : 'Hosté');
                            const timeDisplay = e.timeStr || (e.minute !== undefined ? (String(e.minute).padStart(2, '0') + ':00') : '00:00');

                            let personHtml = 'Hráč';
                            if (e.targetType === 'staff') {
                                personHtml = `<span class="text-amber-300 font-bold">${escapeTeamName(e.staffName || 'Člen realizačního týmu')} (RT)</span>`;
                            } else {
                                const p = playersData.find(pl => pl.id === e.playerId);
                                const playerOnField = getPlayersOnFieldAtTime(match, isHome ? 'home' : 'away', timeDisplay).has(e.playerId);
                                personHtml = `<span class="text-white font-bold">${escapeTeamName(p ? p.robloxNick : (e.playerName || 'Hráč'))}${playerOnField ? '' : ' (mimo hřiště)'}</span>`;
                            }

                            let cardBadge = '';
                            if (e.type === 'Yellow_Card' || e.cardKind === 'Yellow') {
                                cardBadge = '<span class="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 font-bold rounded border border-yellow-500/30">Žlutá</span>';
                            } else if (e.type === 'Second_Yellow_Card' || e.cardKind === 'Second_Yellow') {
                                cardBadge = '<span class="px-2 py-0.5 bg-amber-500/20 text-amber-400 font-bold rounded border border-amber-500/30">2. Žlutá</span>';
                            } else {
                                cardBadge = '<span class="px-2 py-0.5 bg-[#f33332]/20 text-[#f33332] font-bold rounded border border-[#f33332]/30">Červená</span>';
                            }

                            return `
                            <tr>
                                <td class="p-2 font-bold ${isHome ? 'text-[#aefb12]' : 'text-[#05fda3]'}">${cardTeamName}</td>
                                <td class="p-2 font-mono text-gray-300">${timeDisplay}</td>
                                <td class="p-2">${personHtml}</td>
                                <td class="p-2">${cardBadge}</td>
                                <td class="p-2 text-gray-300">${escapeTeamName(e.reason || 'Bez odůvodnění')}</td>
                                <td class="p-2 text-right">
                                    ${canEditEverything && !match.isLocked ? `
                                    <button onclick="deleteMatchEvent(${match.id}, ${e.id})" class="px-2 py-1 bg-[#f33332]/20 hover:bg-[#f33332] text-[#f33332] hover:text-white rounded font-bold transition">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>` : ''}
                                </td>
                            </tr>
                        `;}).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- TAB 6: KOMENTÁŘ K UTKÁNÍ -->
        <div id="fis-sec-online" class="hidden space-y-4 text-xs">
            <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-2">
                <h4 class="font-bold text-[#aefb12]">Komentář k utkání</h4>
                <textarea placeholder="Napište komentář k utkání..." ${!canEditEverything || match.isLocked ? 'disabled' : ''} oninput="markUnsavedChanges()" class="w-full h-24 bg-[#0e1a4f] border border-[#1e307d] p-2 rounded text-white disabled:opacity-60 font-sans"></textarea>
            </div>
        </div>

        <!-- TAB 7: ROZHODČÍ -->
        <div id="fis-sec-rozhodci" class="hidden space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                    <h4 class="font-bold text-[#aefb12] text-sm">Kontrola Totožnosti</h4>
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-home-identity" ${match.checks.homeIdentityChecked ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchChecks(${match.id})" class="accent-[#aefb12] w-4 h-4">
                        <span>Kontrola totožnosti u domácích</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-away-identity" ${match.checks.awayIdentityChecked ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchChecks(${match.id})" class="accent-[#aefb12] w-4 h-4">
                        <span>Kontrola totožnosti u hostujících</span>
                    </label>

                    <div class="pt-3 border-t border-[#1e307d] space-y-2">
                        <h4 class="font-bold text-amber-400 text-sm">Problémy v Utkání</h4>
                        <label class="flex items-center gap-2 cursor-pointer text-amber-400 font-semibold">
                            <input type="checkbox" id="check-fans" ${match.checks.fansIssue ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchChecks(${match.id})" class="accent-amber-400"> Problém s fanoušky
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer text-amber-400 font-semibold">
                            <input type="checkbox" id="check-system" ${match.checks.systemIssue ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchChecks(${match.id})" class="accent-amber-400"> Problém se systémy
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer text-amber-400 font-semibold">
                            <input type="checkbox" id="check-players" ${match.checks.playersIssue ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="updateMatchChecks(${match.id})" class="accent-amber-400"> Problém s hráči
                        </label>
                    </div>
                </div>

                <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                    <h4 class="font-bold text-[#05fda3] text-sm">Vyjádření k trestům</h4>
                    <textarea id="referee-punishment-statement" placeholder="Napište podrobné vyjádření k trestům / událostem..." ${!canEditEverything || match.isLocked ? 'disabled' : ''} oninput="markUnsavedChanges()" class="w-full h-20 bg-[#0e1a4f] border border-[#1e307d] p-2 rounded text-white disabled:opacity-60 font-sans">${escapeTeamName(match.punishmentStatement || '')}</textarea>
                    
                    <div class="p-3 bg-[#0e1a4f] border border-[#1e307d] rounded-lg">
                        <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                            <input type="checkbox" id="check-send-dk" ${match.sendStatementToDK ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="toggleSendToDK(${match.id}, this.checked)" class="accent-[#f33332] w-4 h-4">
                            <span>Odeslat zprávu k DK</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 8: KONTROLA ZOU -->
        <div id="fis-sec-kontrola" class="hidden space-y-4 text-xs">
            <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                <h4 class="font-bold text-[#aefb12] text-sm">Uzamčení a Dokončení ZOU</h4>

                <div class="space-y-3">
                    <label class="flex items-center space-x-2 cursor-pointer text-white font-bold">
                        <input type="checkbox" id="check-is-ready" ${match.isReady ? 'checked' : ''} ${!canEditEverything || match.isLocked ? 'disabled' : ''} onchange="toggleMatchReady(${match.id}, this.checked)" class="accent-[#aefb12] w-4 h-4">
                        <span>Zápis je hotový</span>
                    </label>

                    <div class="flex items-center space-x-2">
                        <button id="btn-lock-match" onclick="lockMatchRecord(${match.id})" ${!match.isReady || match.isLocked || !['Admin', 'Referee_Manager', 'Referee'].includes(state.currentUserRole) ? 'disabled' : ''} class="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-black rounded-lg shadow">
                            <i class="fa-solid fa-lock mr-1"></i> Uzamknout Zápis
                        </button>
                        ${match.isLocked && ['Admin', 'Referee_Manager', 'DK'].includes(state.currentUserRole) ? `
                        <button onclick="unlockMatchRecord(${match.id})" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-black rounded-lg shadow">
                            <i class="fa-solid fa-lock-open mr-1"></i> Odemknout Zápis
                        </button>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 9: HODNOCENÍ DELEGÁTA (DŮVĚRNÉ) -->
        ${canViewDelegateTab ? `
        <div id="fis-sec-delegat" class="hidden space-y-4 text-xs">
            <div class="bg-[#13236b] p-4 rounded-xl border border-purple-500/40 space-y-3 shadow-lg">
                <div class="flex flex-wrap justify-between items-center border-b border-[#1e307d] pb-2 gap-2">
                    <div>
                        <h4 class="font-bold text-purple-400 text-sm flex items-center gap-2">
                            <i class="fa-solid fa-user-tie"></i> Hodnocení Rozhodčího Delegátem Utkání
                        </h4>
                        <span class="text-[10px] text-gray-400">Přísně důvěrné: Přístupné pouze delegátovi, vedení rozhodčích a vedení ligy.</span>
                    </div>
                    <span class="px-2.5 py-1 rounded bg-purple-900/60 text-purple-300 font-mono text-[11px] border border-purple-500/30">
                        Delegát: ${escapeTeamName(match.delegate || 'Nenominován')}
                    </span>
                </div>

                <div class="space-y-2">
                    <label class="block text-gray-300 font-semibold">
                        Slovní hodnocení výkonu rozhodčího (<strong class="text-[#05fda3]">${escapeTeamName(match.referee || 'Nenominován')}</strong>):
                    </label>
                    <textarea id="delegate-review-text" placeholder="Zadejte podrobné slovní hodnocení výkonu rozhodčího, řešení sporných situací, komunikace a řízení utkání..." ${!canEditDelegate || match.isLocked ? 'disabled' : ''} oninput="markUnsavedChanges()" class="w-full h-32 bg-[#0e1a4f] border border-[#1e307d] p-3 rounded-lg text-white disabled:opacity-60 font-sans">${escapeTeamName(match.delegateReview || '')}</textarea>
                </div>

                <div class="p-3 bg-[#0e1a4f] border border-amber-500/30 rounded-lg">
                    <label class="flex items-center space-x-2.5 cursor-pointer text-amber-400 font-bold">
                        <input type="checkbox" id="check-alert-ref-mgr" ${match.delegateAlertRefMgr ? 'checked' : ''} ${!canEditDelegate || match.isLocked ? 'disabled' : ''} onchange="markUnsavedChanges()" class="accent-amber-400 w-4 h-4">
                        <span>Upozornit vedení rozhodčích v sekci rozhodčí</span>
                    </label>
                    <p class="text-[10px] text-gray-400 ml-6 mt-0.5">Při uložení se v záložce Rozhodčí zobrazí vedení rozhodčích prioritní notifikace.</p>
                </div>

                ${canEditDelegate && !match.isLocked ? `
                <div class="flex justify-end pt-2">
                    <button onclick="saveDelegateReview(${match.id})" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-lg shadow flex items-center gap-2 transition">
                        <i class="fa-solid fa-floppy-disk"></i> Uložit Hodnocení Delegáta
                    </button>
                </div>` : ''}
            </div>
        </div>` : ''}

        <!-- TLAČÍTKO OPUSŤENÍ VÝHRADNĚ DOLE -->
        <div class="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-[#1e307d]">
            <button onclick="closeMatchProtocolWithCheck(${match.id})" class="px-4 py-2 bg-[#f33332]/20 hover:bg-[#f33332] text-[#f33332] hover:text-white font-bold text-xs rounded-xl border border-[#f33332]/40 transition">
                <i class="fa-solid fa-xmark mr-1"></i> Opuštění Bez Uložení
            </button>
            ${((canEditEverything || (isTeamMgr && (myTeamId === match.homeTeamId || myTeamId === match.awayTeamId)))) && !match.isLocked ? `
            <button onclick="saveMatchProtocol(${match.id})" class="px-6 py-2.5 bg-[#aefb12] hover:bg-opacity-90 text-[#13236b] font-black text-xs rounded-xl shadow-lg transition">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Uložit Zápas
            </button>` : ''}
        </div>
    `;

    openModal('modal-match-protocol');
    renderSubstitutionPlayerOptions(matchId);
}

function matchMinute(timeStr) {
    const [minutes, seconds = '0'] = String(timeStr || '0').split(':');
    const parsedMinutes = Number.parseInt(minutes, 10);
    const parsedSeconds = Number.parseInt(seconds, 10);
    return (Number.isFinite(parsedMinutes) ? parsedMinutes : 0) +
        (Number.isFinite(parsedSeconds) ? parsedSeconds / 60 : 0);
}

function getPlayersOnFieldAtTime(match, side, timeStr) {
    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    const onField = new Set(roster.filter(item => item.isStarter).map(item => item.playerId));
    const time = matchMinute(timeStr);
    const substitutions = match.events
        .filter(event => event.type === 'Substitution' && event.teamSide === side && matchMinute(event.timeStr) <= time)
        .sort((a, b) => matchMinute(a.timeStr) - matchMinute(b.timeStr) || a.id - b.id);
    substitutions.forEach(event => {
        onField.delete(event.playerOutId);
        onField.add(event.playerInId);
    });
    return onField;
}

export function renderSubstitutionPlayerOptions(matchId) {
    const teamSelect = document.getElementById('sub-team-select');
    const outSelect = document.getElementById('sub-out-select');
    const inSelect = document.getElementById('sub-in-select');
    if (!teamSelect || !outSelect || !inSelect) return;
    const match = matchesData.find(item => item.id === matchId);
    if (!match) return;
    const side = teamSelect.value;
    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    const options = roster.map(item => {
        const player = playersData.find(person => person.id === item.playerId);
        return `<option value="${item.playerId}">${escapeTeamName(player?.robloxNick || 'Hráč')}</option>`;
    }).join('');
    outSelect.innerHTML = options;
    inSelect.innerHTML = options;
}

export function submitSubstitution(matchId) {
    const match = matchesData.find(item => item.id === matchId);
    const side = document.getElementById('sub-team-select')?.value;
    const playerOutId = Number.parseInt(document.getElementById('sub-out-select')?.value || '', 10);
    const playerInId = Number.parseInt(document.getElementById('sub-in-select')?.value || '', 10);
    const timeStr = document.getElementById('sub-time-input')?.value.trim();
    if (!match || (side !== 'home' && side !== 'away') || !Number.isInteger(playerOutId) ||
        !Number.isInteger(playerInId) || playerOutId === playerInId) {
        showToast('Vyberte různé hráče, kteří se střídají.', true);
        return;
    }
    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    if (!roster.some(item => item.playerId === playerOutId) || !roster.some(item => item.playerId === playerInId)) {
        showToast('Oba hráči musí být na soupisce vybraného týmu.', true);
        return;
    }
    match.events.push({
        id: Date.now(),
        type: 'Substitution',
        teamSide: side,
        playerOutId,
        playerInId,
        timeStr: timeStr || ''
    });
    state.unsavedChangesGuard = true;
    showToast('Střídání bylo zaznamenáno.');
    openMatchProtocol(matchId);
    switchFISTab('stridani');
}

export function onGoalTimeChange(matchId, side) {
    const match = matchesData.find(item => item.id === matchId);
    const timeStr = document.getElementById('goal-time-input')?.value || '00:00';
    const type = document.getElementById('goal-type-select')?.value || state.activeGoalType || 'Regular';
    const scorerSide = type === 'Own' ? (side === 'home' ? 'away' : 'home') : side;
    const scorerSelect = document.getElementById('goal-scorer-select');
    const assistSelect = document.getElementById('goal-assist-select');
    if (!match || !scorerSelect) return;
    const scorerId = Number.parseInt(scorerSelect.value, 10);
    const roster = scorerSide === 'home' ? match.homeRoster : match.awayRoster;
    const onField = getPlayersOnFieldAtTime(match, scorerSide, timeStr);
    scorerSelect.innerHTML = roster.filter(item => onField.has(item.playerId)).map(item => {
        const player = playersData.find(person => person.id === item.playerId);
        return `<option value="${item.playerId}">#${item.jersey} ${escapeTeamName(player?.robloxNick || 'Hráč')}</option>`;
    }).join('') || '<option value="">(Na hřišti není žádný hráč)</option>';
    if (Array.from(scorerSelect.options).some(option => Number(option.value) === scorerId)) scorerSelect.value = String(scorerId);
    if (assistSelect && type === 'Regular') {
        const assistRoster = side === 'home' ? match.homeRoster : match.awayRoster;
        const previousAssistId = Number.parseInt(assistSelect.value, 10);
        assistSelect.innerHTML = '<option value="">Bez asistence</option>' + assistRoster.filter(item => getPlayersOnFieldAtTime(match, side, timeStr).has(item.playerId)).map(item => {
            const player = playersData.find(person => person.id === item.playerId);
            return `<option value="${item.playerId}">#${item.jersey} ${escapeTeamName(player?.robloxNick || 'Hráč')}</option>`;
        }).join('');
        if (Array.from(assistSelect.options).some(option => Number(option.value) === previousAssistId)) assistSelect.value = String(previousAssistId);
    }
}

export function toggleSendToDK(matchId, checked) {
    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        match.sendStatementToDK = checked;
        state.unsavedChangesGuard = true;
        if (checked) {
            showToast("Zpráva bude při uložení odeslána k DK.");
        }
    }
}

export function toggleMatchReady(matchId, checked) {
    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        match.isReady = checked;
        state.unsavedChangesGuard = true;
        const lockBtn = document.getElementById('btn-lock-match');
        if (lockBtn) {
            lockBtn.disabled = !checked || match.isLocked || !['Admin', 'Referee_Manager', 'Referee'].includes(state.currentUserRole);
        }
    }
}

export function lockMatchRecord(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        match.isLocked = true;
        state.unsavedChangesGuard = true;
        showToast("Zápis byl označen jako uzamčený (uložte zápas).");
        openMatchProtocol(matchId);
    }
}

export function unlockMatchRecord(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        match.isLocked = false;
        state.unsavedChangesGuard = true;
        showToast("Zápis byl označen jako odemčený (uložte zápas).");
        openMatchProtocol(matchId);
    }
}

export function updateMatchDetails(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    if (state.currentUserRole === 'Admin') {
        const stadiumEl = document.getElementById('zou-stadium-input');
        if (stadiumEl) match.stadium = stadiumEl.value;
    }
    const recorderEl = document.getElementById('zou-recorder-input');
    if (recorderEl) match.recorder = recorderEl.value;
    
    const specEl = document.getElementById('zou-spectators-input');
    if (specEl) match.spectators = parseInt(specEl.value) || 0;
    
    const startTimeEl = document.getElementById('match-start-time');
    const endTimeEl = document.getElementById('match-end-time');
    if (startTimeEl) match.startTime = startTimeEl.value;
    if (endTimeEl) match.endTime = endTimeEl.value;

    const statementEl = document.getElementById('referee-punishment-statement');
    if (statementEl) match.punishmentStatement = statementEl.value;

    state.unsavedChangesGuard = true;
}

export function renderRosterList(match, side, canEdit = true) {
    const roster = side === 'home' ? match.homeRoster : match.awayRoster;

    if (!roster || roster.length === 0) {
        return `<div class="text-gray-400 italic text-center p-2">Sestava je prázdná. Přidejte hráče.</div>`;
    }

    return roster.map(item => {
        const player = playersData.find(p => p.id === item.playerId);
        if (!player) return '';

        return `
            <div class="grid grid-cols-12 gap-1 items-center bg-[#0e1a4f] p-2 rounded border border-[#1e307d] text-xs">
                <div class="col-span-2">
                    <input type="number" min="1" max="99" value="${item.jersey}" ${!canEdit || match.isLocked ? 'disabled' : ''} onchange="updatePlayerJerseyInRoster(${match.id}, '${side}', ${player.id}, this.value)" class="w-12 bg-[#13236b] border border-[#1e307d] text-center font-bold text-white rounded p-1 disabled:opacity-60">
                </div>
                <div class="col-span-5 font-semibold text-white truncate px-1">
                    <button type="button" onclick="openPlayerCard(${player.id})" class="hover:underline text-left">${escapeTeamName(player.robloxNick)}</button>
                </div>
                <div class="col-span-2 text-center">
                    <label class="flex items-center justify-center space-x-1 cursor-pointer text-[10px] ${item.isGK ? 'text-[#05fda3] font-black' : 'text-gray-400'}">
                        <input type="checkbox" ${item.isGK ? 'checked' : ''} ${!canEdit || match.isLocked ? 'disabled' : ''} onchange="togglePlayerGKInRoster(${match.id}, '${side}', ${player.id}, this.checked)" class="accent-[#05fda3]">
                        <span>GK</span>
                    </label>
                </div>
                <div class="col-span-2 text-center">
                    <label class="flex items-center justify-center space-x-1 cursor-pointer text-[10px] ${item.isStarter ? 'text-[#aefb12] font-black' : 'text-gray-400'}">
                        <input type="checkbox" ${item.isStarter ? 'checked' : ''} ${!canEdit || match.isLocked ? 'disabled' : ''} onchange="togglePlayerStarterInRoster(${match.id}, '${side}', ${player.id}, this.checked)" class="accent-[#aefb12]">
                        <span>ZÁKLAD</span>
                    </label>
                </div>
                <div class="col-span-1 text-right">
                    ${canEdit && !match.isLocked ? `
                    <button onclick="removePlayerFromRosterWithConfirm(${match.id}, '${side}', ${player.id})" class="text-[#f33332] hover:text-red-400 p-1">
                        <i class="fa-solid fa-trash"></i>
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

export function updatePlayerJerseyInRoster(matchId, side, playerId, newJerseyVal) {
    const num = parseInt(newJerseyVal);
    if (isNaN(num) || num < 1 || num > 99) {
        showToast("Číslo dresu musí být v rozmezí 1 až 99!", true);
        openMatchProtocol(matchId);
        return;
    }

    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    const target = roster.find(r => r.playerId === playerId);

    if (target) {
        if (num === 1 && !target.isGK) {
            showToast("Číslo 1 je vyhrazeno pouze pro brankáře!", true);
            openMatchProtocol(matchId);
            return;
        }
        target.jersey = num;
        state.unsavedChangesGuard = true;
    }
}

export function togglePlayerGKInRoster(matchId, side, playerId, checked) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const roster = side === 'home' ? match.homeRoster : match.awayRoster;

    if (checked) {
        roster.forEach(r => r.isGK = false);
        const target = roster.find(r => r.playerId === playerId);
        if (target) target.isGK = true;
    } else {
        const target = roster.find(r => r.playerId === playerId);
        if (target) target.isGK = false;
    }
    state.unsavedChangesGuard = true;
    openMatchProtocol(matchId);
}

export function togglePlayerStarterInRoster(matchId, side, playerId, checked) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    const target = roster.find(r => r.playerId === playerId);
    if (target) {
        if (checked && roster.filter(player => player.isStarter).length >= 5) {
            showToast("V základní sestavě může být nejvýše 5 hráčů.", true);
            openMatchProtocol(matchId);
            return;
        }
        target.isStarter = checked;
        state.unsavedChangesGuard = true;
    }
    openMatchProtocol(matchId);
}

export function updatePeriodChecks(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const h1s = document.getElementById('check-h1-started');
    const h1e = document.getElementById('check-h1-ended');
    const h2s = document.getElementById('check-h2-started');
    const h2e = document.getElementById('check-h2-ended');
    const penaltiesStarted = document.getElementById('check-penalties-started');
    const penaltiesEnded = document.getElementById('check-penalties-ended');

    const startsMatch = h1s?.checked && !match.periodChecks.h1Started;
    const homeStarters = match.homeRoster.filter(player => player.isStarter).length;
    const awayStarters = match.awayRoster.filter(player => player.isStarter).length;
    if (startsMatch && (match.homeRoster.length > 10 || match.awayRoster.length > 10 ||
        homeStarters < 3 || homeStarters > 5 || awayStarters < 3 || awayStarters > 5)) {
        h1s.checked = false;
        showToast("Každý tým musí mít na soupisce nejvýše 10 hráčů a 3 až 5 hráčů v základu.", true);
        return;
    }
    if (startsMatch && (match.homeRoster.filter(player => player.isGK).length !== 1 ||
        match.awayRoster.filter(player => player.isGK).length !== 1)) {
        h1s.checked = false;
        showToast("Před zahájením musí mít každý tým určeného právě jednoho brankáře.", true);
        return;
    }
    if (startsMatch && [...match.homeRoster, ...match.awayRoster].some(item => isPlayerSuspended(item.playerId))) {
        h1s.checked = false;
        showToast("Hráč s aktivní stopkou nemůže nastoupit do utkání.", true);
        return;
    }
    if ((penaltiesStarted?.checked || penaltiesEnded?.checked)) {
        const aggregate = getPromotionPlayoffAggregate(match, matchesData);
        if (!isPromotionPlayoffSecondLeg(match) || !aggregate?.tied || !aggregate.firstLegCompleted ||
            (match.status !== 'Completed' && !h2e?.checked)) {
            if (penaltiesStarted) penaltiesStarted.checked = false;
            if (penaltiesEnded) penaltiesEnded.checked = false;
            showToast('Penalty lze zahájit až po skončení obou zápasů při shodném součtu skóre.', true);
            return;
        }
        if (penaltiesEnded?.checked && (!penaltiesStarted?.checked || match.homePenaltyScore === match.awayPenaltyScore)) {
            penaltiesEnded.checked = false;
            showToast('Penaltový rozstřel lze ukončit pouze se zaznamenaným vítězem.', true);
            return;
        }
    }

    match.periodChecks = {
        ...match.periodChecks,
        h1Started: h1s ? h1s.checked : false,
        h1Ended: h1e ? h1e.checked : false,
        h2Started: h2s ? h2s.checked : false,
        h2Ended: h2e ? h2e.checked : false,
        ...(penaltiesStarted ? { penaltiesStarted: penaltiesStarted.checked } : {}),
        ...(penaltiesEnded ? { penaltiesEnded: penaltiesEnded.checked } : {})
    };
    const aggregate = getPromotionPlayoffAggregate(match, matchesData);
    const canEditPenaltyProtocol = ['Admin', 'DK', 'Referee', 'Referee_Manager'].includes(state.currentUserRole) &&
        !match.isLocked;
    const canRecordPenalties = canEditPenaltyProtocol && isPromotionPlayoffSecondLeg(match) &&
        aggregate?.tied && aggregate.firstLegCompleted &&
        (match.status === 'Completed' || match.periodChecks.h2Ended);
    if (penaltiesStarted) penaltiesStarted.disabled = !canRecordPenalties;
    const penaltyInputsDisabled = !canRecordPenalties || !match.periodChecks.penaltiesStarted;
    ['home-penalty-score', 'away-penalty-score'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = penaltyInputsDisabled;
    });
    if (penaltiesEnded) penaltiesEnded.disabled = !canRecordPenalties || !match.periodChecks.penaltiesStarted;
    state.unsavedChangesGuard = true;
}

export function updatePenaltyScores(matchId) {
    const match = matchesData.find(item => item.id === matchId);
    const homeInput = document.getElementById('home-penalty-score');
    const awayInput = document.getElementById('away-penalty-score');
    if (!match || !homeInput || !awayInput) return;
    const homeScore = Number(homeInput.value);
    const awayScore = Number(awayInput.value);
    if (![homeScore, awayScore].every(score => Number.isInteger(score) && score >= 0 && score <= 99)) {
        showToast('Výsledek penalt musí být celé číslo od 0 do 99.', true);
        openMatchProtocol(matchId);
        switchFISTab('penalty');
        return;
    }
    const aggregate = getPromotionPlayoffAggregate(match, matchesData);
    if (!isPromotionPlayoffSecondLeg(match) || !aggregate?.tied || !aggregate.firstLegCompleted ||
        !match.periodChecks.penaltiesStarted ||
        (match.status !== 'Completed' && !match.periodChecks.h2Ended)) {
        showToast('Penalty lze zaznamenat pouze po skončení obou utkání při shodném součtu.', true);
        openMatchProtocol(matchId);
        switchFISTab('penalty');
        return;
    }
    if (match.periodChecks.penaltiesEnded && homeScore === awayScore) {
        showToast('Ukončený penaltový rozstřel musí mít vítěze.', true);
        return;
    }
    match.homePenaltyScore = homeScore;
    match.awayPenaltyScore = awayScore;
    state.unsavedChangesGuard = true;
    openMatchProtocol(matchId);
    switchFISTab('penalty');
}

export function renderStaffList(match, side, canEdit = true) {
    const staffList = side === 'home' ? match.homeStaff : match.awayStaff;

    if (!staffList || staffList.length === 0) {
        return `<div class="text-gray-400 italic text-center p-2">Žádní členové realizačního týmu.</div>`;
    }

    return staffList.map(s => `
        <div class="p-2 bg-[#0e1a4f] border border-[#1e307d] rounded flex justify-between items-center">
            <div>
                <span class="font-bold text-white block">${escapeTeamName(s.robloxNick)} <span class="text-gray-400 font-normal">(${escapeTeamName(s.discordNick)})</span></span>
                <span class="text-[10px] bg-[#aefb12]/20 text-[#aefb12] font-bold px-1.5 py-0.5 rounded">${s.role}</span>
            </div>
            ${canEdit && !match.isLocked ? `
            <button onclick="removeStaffMemberWithConfirm(${match.id}, '${side}',${s.id})" class="text-[#f33332] hover:text-red-400 p-1">
                <i class="fa-solid fa-trash"></i>
            </button>` : ''}
        </div>
    `).join('');
}

export function openAddPlayerToRosterModal(matchId, side) {
    state.activeRosterMatchId = matchId;
    state.activeRosterSide = side;

    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const isTeamMgr = state.currentUserRole.startsWith('Team_Manager');
    if (isTeamMgr) {
        const myTeamId = state.activeTeamManagerTeamId;
        const targetTeamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
        if (myTeamId !== targetTeamId) {
            showToast("Nemáte oprávnění upravovat soupisku soupeře!", true);
            return;
        }
    }

    const roster = side === 'home' ? match.homeRoster : match.awayRoster;

    if (roster.length >= 10) {
        showToast("Na zápasové soupisce může být maximálně 10 hráčů!", true);
        return;
    }

    const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
    const team = teamsData.find(t => t.id === teamId);
    const teamPlayers = playersData.filter(p => !p.isArchived && p.teamId === teamId);

    const activeIds = roster.map(r => r.playerId);
    const available = teamPlayers.filter(p => !activeIds.includes(p.id) && !isPlayerSuspended(p.id));

    const titleEl = document.getElementById('roster-picker-title');
    const listEl = document.getElementById('roster-picker-list');

    titleEl.textContent = `Přidat Hráče — ${team ? team.name : ''}`;

    if (available.length === 0) {
        listEl.innerHTML = `<div class="p-3 text-center text-gray-400">Všichni dostupní hráči jsou již v sestavě nebo mají aktivní stopku.</div>`;
    } else {
        listEl.innerHTML = available.map(p => `
            <div class="p-2.5 bg-[#13236b] hover:bg-[#1e307d] rounded-xl border border-[#1e307d] flex justify-between items-center transition">
                <div>
                    <button type="button" onclick="openPlayerCard(${p.id})" class="font-bold text-white hover:underline">${escapeTeamName(p.robloxNick)}</button>
                    <span class="text-[10px] text-gray-400 block">${escapeTeamName(p.discordNick)}</span>
                </div>
                <button type="button" onclick="addPlayerToRoster(${p.id})" class="px-2 py-0.5 bg-[#aefb12]/20 text-[#aefb12] rounded font-bold text-[10px]">+ Přidat</button>
            </div>
        `).join('');
    }

    openModal('modal-add-roster-player');
}

function isPlayerSuspended(playerId) {
    return suspensionsData.some(suspension => {
        if (suspension.playerId !== playerId) return false;
        if (suspension.type === 'Match_Count') return (suspension.remainingMatches ?? suspension.matchesLeft ?? 0) > 0;
        return suspension.type === 'Time_Period' && suspension.untilDate && new Date(suspension.untilDate) > new Date();
    });
}

export function addPlayerToRoster(playerId) {
    const match = matchesData.find(m => m.id === state.activeRosterMatchId);
    if (!match) return;

    const roster = state.activeRosterSide === 'home' ? match.homeRoster : match.awayRoster;
    
    if (roster.length >= 10) {
        showToast("Na zápasové soupisce může být maximálně 10 hráčů!", true);
        return;
    }

    if (isPlayerSuspended(playerId)) {
        showToast("Hráč má aktivní stopku a nemůže být přidán do sestavy.", true);
        return;
    }

    const isFirst = roster.length === 0;
    const isGK = isFirst;
    const isStarter = roster.length < 5;

    roster.push({
        playerId: playerId,
        jersey: isGK ? 1 : (roster.length + 2),
        isStarter: isStarter,
        isGK: isGK
    });

    state.unsavedChangesGuard = true;
    showToast("Hráč přidán do zápasové sestavy.");
    closeSpecificModal('modal-add-roster-player');
    openMatchProtocol(state.activeRosterMatchId);
}

export function removePlayerFromRosterWithConfirm(matchId, side, playerId) {
    const player = playersData.find(p => p.id === playerId);
    const pName = player ? player.robloxNick : 'Hráče';

    openConfirmModal("Odebrat Hráče Ze Sestavy?", `Opravdu chcete odebrat hráče ${pName} ze zápasové sestavy?`, () => {
        const match = matchesData.find(m => m.id === matchId);
        if (!match) return;

        const roster = side === 'home' ? match.homeRoster : match.awayRoster;
        const idx = roster.findIndex(r => r.playerId === playerId);
        if (idx !== -1) {
            roster.splice(idx, 1);
            state.unsavedChangesGuard = true;
            logDKAction("ODEBRÁNÍ_HRÁČE", pName, `Odebrán ze sestavy.`);
            showToast(`Hráč ${pName} odebrán ze sestavy.`);
        }
        openMatchProtocol(matchId);
    }, false);
}

export function openAddStaffModal(matchId, side) {
    state.activeRosterMatchId = matchId;
    state.activeStaffTeamSide = side;

    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        const isTeamMgr = state.currentUserRole.startsWith('Team_Manager');
        if (isTeamMgr) {
            const myTeamId = state.activeTeamManagerTeamId;
            const targetTeamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
            if (myTeamId !== targetTeamId) {
                showToast("Nemáte oprávnění upravovat realizační tým soupeře!", true);
                return;
            }
        }
    }

    document.getElementById('staff-roblox-input').value = '';
    document.getElementById('staff-discord-input').value = '';
    openModal('modal-add-staff-member');
}

export function submitStaffMember() {
    const roblox = document.getElementById('staff-roblox-input').value.trim();
    const discord = document.getElementById('staff-discord-input').value.trim();
    const role = document.getElementById('staff-role-select').value;

    if (!roblox || !discord) {
        showToast("Vyplňte prosím Roblox i Discord Username!", true);
        return;
    }

    const match = matchesData.find(m => m.id === state.activeRosterMatchId);
    if (!match) return;

    const staffList = state.activeStaffTeamSide === 'home' ? match.homeStaff : match.awayStaff;

    if (staffList.length >= 5) {
        showToast("Realizační tým může mít maximálně 5 členů!", true);
        return;
    }

    const mainCoachCount = staffList.filter(s => s.role === 'Hlavní trenér').length;
    if (role === 'Hlavní trenér' && mainCoachCount >= 1) {
        showToast("V realizačním týmu může být maximálně 1 Hlavní trenér!", true);
        return;
    }

    staffList.push({
        id: Date.now(),
        robloxNick: roblox,
        discordNick: discord,
        role: role
    });

    state.unsavedChangesGuard = true;
    showToast(`Člen realizačního týmu (${role}) přidán!`);
    closeSpecificModal('modal-add-staff-member');
    openMatchProtocol(state.activeRosterMatchId);
}

export function removeStaffMemberWithConfirm(matchId, side, staffId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const staffList = side === 'home' ? match.homeStaff : match.awayStaff;
    const member = staffList.find(s => s.id === staffId);
    const memberName = member ? member.robloxNick : 'Člena';

    openConfirmModal("Odebrat Člena Realizačního Týmu?", `Opravdu chcete odebrat člena realizačního týmu ${memberName}?`, () => {
        const idx = staffList.findIndex(s => s.id === staffId);
        if (idx !== -1) {
            staffList.splice(idx, 1);
            state.unsavedChangesGuard = true;
            logDKAction("ODEBRÁNÍ_STAFFU", memberName, `Člen týmu odebrán.`);
            showToast("Člen realizačního týmu odebrán.");
        }
        openMatchProtocol(matchId);
    }, false);
}

export function deleteMatchEvent(matchId, eventId) {
    openConfirmModal("Smazat Událost Utkání?", "Opravdu chcete tuto událost smazat z protokolu?", () => {
        const match = matchesData.find(m => m.id === matchId);
        if (!match) return;

        const idx = match.events.findIndex(e => e.id === eventId);
        if (idx !== -1) {
            const deletedEvent = match.events[idx];
            if (deletedEvent.type === 'Goal') {
                if (deletedEvent.teamSide === 'away') {
                    match.awayScore = Math.max(0, match.awayScore - 1);
                } else {
                    match.homeScore = Math.max(0, match.homeScore - 1);
                }
            }
            match.events.splice(idx, 1);
            state.unsavedChangesGuard = true;
            logDKAction("SMAZÁNÍ_UDÁLOSTI", `Zápas #${matchId}`, `Událost smazána z protokolu.`);
            showToast("Událost smazána z protokolu.");
            openMatchProtocol(matchId);
        }
    }, false);
}

export function updateMatchChecks(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    match.checks = {
        fansIssue: document.getElementById('check-[#fans]') ? document.getElementById('check-[#fans]').checked : (document.getElementById('check-fans') ? document.getElementById('check-fans').checked : match.checks.fansIssue),
        systemIssue: document.getElementById('check-system') ? document.getElementById('check-system').checked : match.checks.systemIssue,
        playersIssue: document.getElementById('check-players') ? document.getElementById('check-players').checked : match.checks.playersIssue,
        homeIdentityChecked: document.getElementById('check-home-identity') ? document.getElementById('check-home-identity').checked : match.checks.homeIdentityChecked,
        awayIdentityChecked: document.getElementById('check-away-identity') ? document.getElementById('check-away-identity').checked : match.checks.awayIdentityChecked
    };
    state.unsavedChangesGuard = true;
}

export function switchFISTab(fisTabId) {
    state.activeFISTab = fisTabId;
    ['sestavy', 'realizacni', 'hraci-casti', 'penalty', 'stridani', 'branky', 'vylouceni', 'online', 'rozhodci', 'kontrola', 'delegat'].forEach(t => {
        const sec = document.getElementById(`fis-sec-${t}`);
        const btn = document.getElementById(`fistab-${t}`);
        if (sec) sec.classList.add('hidden');
        if (btn) btn.classList.remove('active');
    });

    const targetSec = document.getElementById(`fis-sec-${fisTabId}`);
    const targetBtn = document.getElementById(`fistab-${fisTabId}`);
    if (targetSec) targetSec.classList.remove('hidden');
    if (targetBtn) targetBtn.classList.add('active');
}

// ==================== INTERAKTIVNÍ BRANKY (DOMÁCÍ / HOSTÉ) ====================

export function openGoalForm(matchId, side) {
    state.activeGoalMatchId = matchId;
    state.activeGoalSide = side;
    state.activeGoalType = 'Regular';
    renderGoalForm(matchId, side, 'Regular');
}

export function closeGoalForm() {
    const wrapper = document.getElementById('goal-form-wrapper');
    if (wrapper) {
        wrapper.innerHTML = '';
        wrapper.classList.add('hidden');
    }
}

export function onGoalTypeChange(matchId, side, goalType) {
    state.activeGoalType = goalType;
    renderGoalForm(matchId, side, goalType);
}

export function renderGoalForm(matchId, side, goalType = 'Regular') {
    const wrapper = document.getElementById('goal-form-wrapper');
    if (!wrapper) return;

    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const home = teamsData.find(t => t.id === match.homeTeamId);
    const away = teamsData.find(t => t.id === match.awayTeamId);
    const scoringTeamName = side === 'home' ? (home ? home.name : 'Domácí') : (away ? away.name : 'Hosté');
    const opposingSide = side === 'home' ? 'away' : 'home';
    const opposingTeamName = opposingSide === 'home' ? (home ? home.name : 'Domácí') : (away ? away.name : 'Hosté');

    const scorerTeamSide = goalType === 'Own' ? opposingSide : side;
    const scorerRoster = scorerTeamSide === 'home' ? match.homeRoster : match.awayRoster;
    const activeScorers = getPlayersOnFieldAtTime(match, scorerTeamSide, '00:00');
    const scorerOptions = scorerRoster.filter(r => activeScorers.has(r.playerId)).map(r => {
        const p = playersData.find(pl => pl.id === r.playerId);
        return `<option value="${r.playerId}">#${r.jersey} ${escapeTeamName(p ? p.robloxNick : 'Hráč')} ${r.isStarter ? '(Základ)' : ''}</option>`;
    }).join('') || '<option value="">(Na hřišti není žádný hráč)</option>';

    const assistRoster = side === 'home' ? match.homeRoster : match.awayRoster;
    const activeAssists = getPlayersOnFieldAtTime(match, side, '00:00');
    const assistOptions = `<option value="">Bez asistence</option>` + assistRoster.filter(r => activeAssists.has(r.playerId)).map(r => {
        const p = playersData.find(pl => pl.id === r.playerId);
        return `<option value="${r.playerId}">#${r.jersey} ${escapeTeamName(p ? p.robloxNick : 'Hráč')}</option>`;
    }).join('');

    wrapper.classList.remove('hidden');
    wrapper.innerHTML = `
        <div class="p-4 bg-[#0e1a4f] rounded-xl border border-[#aefb12]/40 shadow-xl space-y-3 my-2 text-xs">
            <div class="flex justify-between items-center border-b border-[#1e307d] pb-2">
                <span class="font-bold text-white flex items-center gap-2">
                    <i class="fa-solid fa-futbol text-[#aefb12]"></i> Záznam Gólu — <span class="${side === 'home' ? 'text-[#aefb12]' : 'text-[#05fda3]'} font-black">${escapeTeamName(scoringTeamName)}</span>
                </span>
                <button type="button" onclick="closeGoalForm()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                <!-- ČAS -->
                <div>
                    <label class="block text-gray-400 mb-1">Čas (00:00):</label>
                    <input type="text" id="goal-time-input" placeholder="00:00" value="00:00" maxlength="5" oninput="onGoalTimeChange(${matchId}, '${side}')" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-mono font-bold text-center">
                </div>

                <!-- TYP GÓLU -->
                <div>
                    <label class="block text-gray-400 mb-1">Typ gólu:</label>
                    <select id="goal-type-select" onchange="onGoalTypeChange(${matchId}, '${side}', this.value)" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-bold">
                        <option value="Regular" ${goalType === 'Regular' ? 'selected' : ''}>Běžný gól</option>
                        <option value="Own" ${goalType === 'Own' ? 'selected' : ''}>Vlastní gól</option>
                        <option value="Penalty" ${goalType === 'Penalty' ? 'selected' : ''}>Penalta</option>
                    </select>
                </div>

                <!-- STŘELEC -->
                <div>
                    <label class="block text-gray-400 mb-1">
                        Střelec ${goalType === 'Own' ? `<span class="text-purple-400 font-bold">(${escapeTeamName(opposingTeamName)})</span>` : `(${escapeTeamName(scoringTeamName)})`}:
                    </label>
                    <select id="goal-scorer-select" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-bold">
                        ${scorerOptions}
                    </select>
                </div>

                <!-- ASISTENCE (POUZE PRO BĚŽNÝ GÓL) -->
                <div id="goal-assist-container" class="${goalType === 'Regular' ? '' : 'hidden'}">
                    <label class="block text-gray-400 mb-1">Asistence (${escapeTeamName(scoringTeamName)}):</label>
                    <select id="goal-assist-select" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-bold">
                        ${assistOptions}
                    </select>
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t border-[#1e307d]">
                <button type="button" onclick="closeGoalForm()" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-lg transition">Zrušit</button>
                <button type="button" onclick="submitGoal(${matchId}, '${side}')" class="px-4 py-1.5 bg-[#aefb12] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg shadow transition">
                    <i class="fa-solid fa-check mr-1"></i> Přidat Gól
                </button>
            </div>
        </div>
    `;
}

export function submitGoal(matchId, side) {
    const timeEl = document.getElementById('goal-time-input');
    const typeEl = document.getElementById('goal-type-select');
    const scorerEl = document.getElementById('goal-scorer-select');
    const assistEl = document.getElementById('goal-assist-select');

    if (!timeEl || !typeEl || !scorerEl) return;

    let timeStr = timeEl.value.trim();
    if (!timeStr) timeStr = "00:00";
    if (!/^\d{1,2}:\d{2}$/.test(timeStr)) {
        showToast("Čas musí být ve formátu 00:00 (např. 12:30 nebo 05:00)!", true);
        return;
    }

    const scorerId = parseInt(scorerEl.value);
    if (isNaN(scorerId)) {
        showToast("Vyberte prosím střelce branky!", true);
        return;
    }

    const goalType = typeEl.value; // 'Regular', 'Own', 'Penalty'
    let assistId = null;
    if (goalType === 'Regular' && assistEl && assistEl.value) {
        assistId = parseInt(assistEl.value) || null;
        if (assistId === scorerId) {
            showToast("Střelec branky nemůže zároveň sám sobě asistovat!", true);
            return;
        }
    }

    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const scorerSide = goalType === 'Own' ? (side === 'home' ? 'away' : 'home') : side;
    if (!getPlayersOnFieldAtTime(match, scorerSide, timeStr).has(scorerId)) {
        showToast('Střelcem může být pouze hráč, který byl v daném čase na hřišti.', true);
        return;
    }

    if (side === 'home') {
        match.homeScore += 1;
    } else {
        match.awayScore += 1;
    }

    const [min, sec] = timeStr.split(':').map(n => parseInt(n) || 0);

    match.events.push({
        id: Date.now(),
        type: 'Goal',
        goalType: goalType,
        teamSide: side,
        timeStr: timeStr,
        minute: min,
        second: sec,
        playerId: scorerId,
        secondaryPlayerId: assistId
    });

    state.unsavedChangesGuard = true;
    showToast(`Gól pro ${side === 'home' ? 'domácí' : 'hosty'} byl úspěšně zaznamenán!`);
    openMatchProtocol(matchId);
    switchFISTab('branky');
}

// ==================== INTERAKTIVNÍ KARTY ====================

export function openCardForm(matchId) {
    state.activeCardMatchId = matchId;
    renderCardForm(matchId, 'home');
}

export function closeCardForm() {
    const wrapper = document.getElementById('card-form-wrapper');
    if (wrapper) {
        wrapper.innerHTML = '';
        wrapper.classList.add('hidden');
    }
}

export function onCardTeamChange(matchId, side) {
    renderCardForm(matchId, side);
}

export function onCardTimeChange(matchId) {
    const match = matchesData.find(item => item.id === matchId);
    const side = document.getElementById('card-team-select')?.value || 'home';
    const timeStr = document.getElementById('card-time-input')?.value || '00:00';
    const personSelect = document.getElementById('card-person-select');
    if (!match || !personSelect) return;
    const activePlayers = getPlayersOnFieldAtTime(match, side, timeStr);
    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    Array.from(personSelect.options).forEach(option => {
        if (!option.value.startsWith('player_')) return;
        const playerId = Number.parseInt(option.value.slice('player_'.length), 10);
        const rosterItem = roster.find(item => item.playerId === playerId);
        const player = playersData.find(item => item.id === playerId);
        option.textContent = `#${rosterItem?.jersey ?? ''} ${player?.robloxNick || 'Hráč'}${activePlayers.has(playerId) ? '' : ' (mimo hřiště)'}`;
    });
}

export function renderCardForm(matchId, side = 'home', timeStr = '00:00') {
    const wrapper = document.getElementById('card-form-wrapper');
    if (!wrapper) return;

    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const home = teamsData.find(t => t.id === match.homeTeamId);
    const away = teamsData.find(t => t.id === match.awayTeamId);

    const roster = side === 'home' ? match.homeRoster : match.awayRoster;
    const staff = side === 'home' ? match.homeStaff : match.awayStaff;

    const activePlayers = getPlayersOnFieldAtTime(match, side, timeStr);
    const playerOptions = roster.map(r => {
        const p = playersData.find(pl => pl.id === r.playerId);
        return `<option value="player_${r.playerId}">#${r.jersey} ${p ? p.robloxNick : 'Hráč'}${activePlayers.has(r.playerId) ? '' : ' (mimo hřiště)'}</option>`;
    }).join('');

    const staffOptions = staff.map(s => {
        return `<option value="staff_${s.id}">${escapeTeamName(s.robloxNick)} (RT)</option>`;
    }).join('');

    wrapper.classList.remove('hidden');
    wrapper.innerHTML = `
        <div class="p-4 bg-[#0e1a4f] rounded-xl border border-amber-500/40 shadow-xl space-y-3 my-2 text-xs">
            <div class="flex justify-between items-center border-b border-[#1e307d] pb-2">
                <span class="font-bold text-white flex items-center gap-2">
                    <i class="fa-solid fa-square text-amber-400"></i> Udělit Kartu (Hráč nebo Realizační Tým)
                </span>
                <button type="button" onclick="closeCardForm()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                <!-- 1. TÝM -->
                <div>
                    <label class="block text-gray-400 mb-1">1. Tým:</label>
                    <select id="card-team-select" onchange="onCardTeamChange(${matchId}, this.value)" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-bold">
                        <option value="home" ${side === 'home' ? 'selected' : ''}>Domácí (${home ? home.name : ''})</option>
                        <option value="away" ${side === 'away' ? 'selected' : ''}>Hosté (${away ? away.name : ''})</option>
                    </select>
                </div>

                <!-- 2. OSOBA (HRÁČ NEBO REALIZAČNÍ TÝM) -->
                <div>
                    <label class="block text-gray-400 mb-1">2. Osoba:</label>
                    <select id="card-person-select" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-bold">
                        ${playerOptions ? `<optgroup label="Hráči na soupisce">${playerOptions}</optgroup>` : ''}
                        ${staffOptions ? `<optgroup label="Realizační tým">${staffOptions}</optgroup>` : ''}
                        ${!playerOptions && !staffOptions ? '<option value="">(Žádné osoby v sestavě/staffu)</option>' : ''}
                    </select>
                </div>

                <!-- 3. DRUH KARTY -->
                <div>
                    <label class="block text-gray-400 mb-1">3. Druh karty:</label>
                    <select id="card-kind-select" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-bold">
                        <option value="Yellow">Žlutá karta</option>
                        <option value="Second_Yellow">Druhá žlutá karta</option>
                        <option value="Red">Červená karta</option>
                    </select>
                </div>

                <!-- 4. DŮVOD -->
                <div>
                    <label class="block text-gray-400 mb-1">4. Důvod:</label>
                    <input type="text" id="card-reason-input" placeholder="např. Surová hra, Protesty" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white">
                </div>

                <!-- 5. ČAS -->
                <div>
                    <label class="block text-gray-400 mb-1">5. Čas (00:00):</label>
                    <input type="text" id="card-time-input" placeholder="00:00" value="${escapeTeamName(timeStr)}" maxlength="5" onchange="onCardTimeChange(${matchId})" class="w-full bg-[#13236b] border border-[#1e307d] rounded p-2 text-white font-mono font-bold text-center">
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t border-[#1e307d]">
                <button type="button" onclick="closeCardForm()" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-lg transition">Zrušit</button>
                <button type="button" onclick="submitCard(${matchId})" class="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-lg shadow transition">
                    <i class="fa-solid fa-check mr-1"></i> Udělit Kartu
                </button>
            </div>
        </div>
    `;
}

export function submitCard(matchId) {
    const teamEl = document.getElementById('card-team-select');
    const personEl = document.getElementById('card-person-select');
    const kindEl = document.getElementById('card-kind-select');
    const reasonEl = document.getElementById('card-reason-input');
    const timeEl = document.getElementById('card-time-input');

    if (!teamEl || !personEl || !kindEl || !reasonEl || !timeEl) return;

    const personVal = personEl.value;
    if (!personVal) {
        showToast("Vyberte potrestanou osobu (hráče nebo člena realizačního týmu)!", true);
        return;
    }

    const reason = reasonEl.value.trim();
    if (!reason) {
        showToast("Zadejte prosím důvod udělení karty!", true);
        return;
    }

    let timeStr = timeEl.value.trim();
    if (!timeStr) timeStr = "00:00";
    if (!/^\d{1,2}:\d{2}$/.test(timeStr)) {
        showToast("Čas musí být ve formátu 00:00 (např. 14:20 nebo 08:00)!", true);
        return;
    }

    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const teamSide = teamEl.value;
    const cardKind = kindEl.value; // 'Yellow', 'Second_Yellow', 'Red'

    let targetType = 'player';
    let playerId = null;
    let staffId = null;
    let staffName = null;

    if (personVal.startsWith('staff_')) {
        targetType = 'staff';
        staffId = parseInt(personVal.replace('staff_', ''));
        const staffList = teamSide === 'home' ? match.homeStaff : match.awayStaff;
        const staffMember = staffList.find(s => s.id === staffId);
        staffName = staffMember ? `${staffMember.robloxNick} (${staffMember.role})` : 'Člen realizačního týmu';
    } else {
        playerId = parseInt(personVal.replace('player_', ''));
    }

    const cardTypeString = cardKind === 'Yellow' ? 'Yellow_Card' : (cardKind === 'Red' ? 'Red_Card' : 'Second_Yellow_Card');

    match.events.push({
        id: Date.now(),
        type: cardTypeString,
        cardKind: cardKind,
        targetType: targetType,
        teamSide: teamSide,
        playerId: playerId,
        staffId: staffId,
        staffName: staffName,
        reason: reason,
        timeStr: timeStr,
        minute: parseInt(timeStr.split(':')[0]) || 0
    });

    state.unsavedChangesGuard = true;
    showToast("Karta byla úspěšně zaznamenána!");
    openMatchProtocol(matchId);
    switchFISTab('vylouceni');
}

// ==================== ZAVŘENÍ PROTOKOLU S KONTROLOU NEULOŽENÝCH ZMĚN ====================

export function closeMatchProtocolWithCheck(matchId) {
    if (state.unsavedChangesGuard) {
        openConfirmModal("Opustit Zápis O Utkání?", "Máte rozdělaný zápis s neuloženými změnami! Opravdu chcete zápis zavřít bez uložení?", () => {
            const matchIndex = matchesData.findIndex(item => item.id === matchId);
            if (matchIndex !== -1 && state.matchProtocolSnapshotId === matchId && state.matchProtocolSnapshot) {
                matchesData[matchIndex] = JSON.parse(JSON.stringify(state.matchProtocolSnapshot));
            }
            state.unsavedChangesGuard = false;
            state.matchProtocolSnapshot = null;
            state.matchProtocolSnapshotId = null;
            closeSpecificModal('modal-match-protocol');
            showToast("Zápis byl opuštěn a neuložené změny byly zrušeny.");
            renderMatches();
        }, false);
    } else {
        state.matchProtocolSnapshot = null;
        state.matchProtocolSnapshotId = null;
        closeSpecificModal('modal-match-protocol');
    }
}

export function closeMatchProtocolWithoutSave(matchId) {
    closeMatchProtocolWithCheck(matchId);
}

export function markUnsavedChanges() {
    state.unsavedChangesGuard = true;
}

// ==================== DŮVĚRNÉ HODNOCENÍ DELEGÁTA ====================

export function saveDelegateReview(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const reviewEl = document.getElementById('delegate-review-text');
    const alertEl = document.getElementById('check-alert-ref-mgr');

    if (reviewEl) match.delegateReview = reviewEl.value;
    if (alertEl) match.delegateAlertRefMgr = alertEl.checked;

    state.unsavedChangesGuard = true;
    showToast("Hodnocení delegáta bylo zapsáno do rozpracovaného protokolu (uložte zápas).");
}

export function calculateMatchStats(match) {
    match.events.forEach(e => {
        if (e.type === 'Goal') {
            if (e.playerId) {
                const scorer = playersData.find(p => p.id === e.playerId);
                if (scorer) scorer.goals = (scorer.goals || 0) + 1;
            }
            if (e.secondaryPlayerId) {
                const assist = playersData.find(p => p.id === e.secondaryPlayerId);
                if (assist) assist.assists = (assist.assists || 0) + 1;
            }
        }
    });

    const matchDurationMinutes = 20;
    for (const side of ['home', 'away']) {
        const roster = side === 'home' ? match.homeRoster : match.awayRoster;
        const goalkeeperIds = new Set(roster.filter(item => item.isGK).map(item => item.playerId));
        const substitutions = match.events
            .filter(event => event.type === 'Substitution' && event.teamSide === side)
            .sort((a, b) => matchMinute(a.timeStr) - matchMinute(b.timeStr) || a.id - b.id);
        const keeperIntervals = [];
        let activeKeeper = roster.find(item => item.isGK && item.isStarter)?.playerId ?? null;
        let intervalStart = 0;
        substitutions.forEach(event => {
            const changeTime = matchMinute(event.timeStr);
            if (event.playerOutId === activeKeeper) {
                keeperIntervals.push({ playerId: activeKeeper, start: intervalStart, end: changeTime });
                activeKeeper = goalkeeperIds.has(event.playerInId) ? event.playerInId : null;
                intervalStart = changeTime;
            } else if (event.playerInId === activeKeeper) {
                keeperIntervals.push({ playerId: activeKeeper, start: intervalStart, end: changeTime });
                activeKeeper = null;
            } else if (activeKeeper === null && goalkeeperIds.has(event.playerInId)) {
                activeKeeper = event.playerInId;
                intervalStart = changeTime;
            }
        });
        if (activeKeeper !== null) keeperIntervals.push({ playerId: activeKeeper, start: intervalStart, end: matchDurationMinutes });
        keeperIntervals.forEach(interval => {
            const conceded = match.events.some(event =>
                event.type === 'Goal' &&
                (event.teamSide || (match.homeRoster.some(item => item.playerId === event.playerId) ? 'home' : 'away')) !== side &&
                matchMinute(event.timeStr || `${event.minute || 0}:00`) >= interval.start &&
                (matchMinute(event.timeStr || `${event.minute || 0}:00`) < interval.end ||
                    (interval.end === matchDurationMinutes && matchMinute(event.timeStr || `${event.minute || 0}:00`) === interval.end))
            );
            const player = playersData.find(item => item.id === interval.playerId);
            if (player && interval.end - interval.start >= 10 && !conceded) {
                player.cleanSheets = (player.cleanSheets || 0) + 1;
            }
        });
    }
}

export async function saveMatchProtocol(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const homeCoach = match.homeStaff.filter(s => s.role === 'Hlavní trenér').length;
    const awayCoach = match.awayStaff.filter(s => s.role === 'Hlavní trenér').length;

    if (homeCoach === 0 || awayCoach === 0) {
        showToast("Obě mužstva musí mít v realizačním týmu právě jednoho Hlavního trenéra!", true);
        return;
    }

    const homeGKs = match.homeRoster.filter(r => r.isGK).length;
    const awayGKs = match.awayRoster.filter(r => r.isGK).length;

    if (homeGKs !== 1 || awayGKs !== 1) {
        showToast("V sestavě každého týmu musí být určen právě 1 brankář!", true);
        return;
    }

    const homeStarters = match.homeRoster.filter(player => player.isStarter).length;
    const awayStarters = match.awayRoster.filter(player => player.isStarter).length;
    if (match.homeRoster.length > 10 || match.awayRoster.length > 10 ||
        homeStarters < 3 || homeStarters > 5 || awayStarters < 3 || awayStarters > 5) {
        showToast("Každý tým může mít na soupisce nejvýše 10 hráčů a musí mít 3 až 5 hráčů v základu.", true);
        return;
    }

    for (const roster of [match.homeRoster, match.awayRoster]) {
        const suspendedPlayer = roster.find(item => isPlayerSuspended(item.playerId));
        if (suspendedPlayer) {
            const player = playersData.find(item => item.id === suspendedPlayer.playerId);
            showToast(`Hráč ${player?.robloxNick || ''} má aktivní stopku a musí být odebrán ze sestavy.`, true);
            return;
        }
    }

    const reviewEl = document.getElementById('delegate-review-text');
    const alertEl = document.getElementById('check-alert-ref-mgr');
    if (reviewEl) match.delegateReview = reviewEl.value;
    if (alertEl) match.delegateAlertRefMgr = alertEl.checked;

    const wasCompleted = match.status === 'Completed';
    if (!wasCompleted) {
        calculateMatchStats(match);
    }

    if (match.sendStatementToDK && match.punishmentStatement) {
        logDKAction("ODESLANÉ_VYJÁDŘENÍ", `Zápas #${matchId}`, `Zpráva k DK: ${match.punishmentStatement}`);
        showToast("Vyjádření k trestům bylo úspěšně odesláno k DK.");
    }

    match.status = 'Completed';
    state.unsavedChangesGuard = false;
    const saved = await apiSaveMatch(match);
    if (!saved) {
        match.status = wasCompleted ? 'Completed' : 'Scheduled';
        state.unsavedChangesGuard = true;
        showToast("Zápis se nepodařilo uložit do databáze. Stopky nebyly započítány.", true);
        return;
    }
    if (!wasCompleted) {
        for (const [teamId, roster] of [[match.homeTeamId, match.homeRoster], [match.awayTeamId, match.awayRoster]]) {
            const activePlayerIds = new Set(roster.map(item => item.playerId));
            suspensionsData.forEach(suspension => {
                if (suspension.teamId !== teamId || suspension.type !== 'Match_Count' ||
                    activePlayerIds.has(suspension.playerId) || !suspension.isActive) return;
                suspension.remainingMatches = Math.max(0, suspension.remainingMatches - 1);
                suspension.matchesLeft = suspension.remainingMatches;
                if (suspension.remainingMatches === 0) suspension.isActive = false;
            });
        }
    }
    showToast("Zápas byl úspěšně zkontrolován a uložen.");
    state.matchProtocolSnapshot = null;
    state.matchProtocolSnapshotId = null;
    closeSpecificModal('modal-match-protocol');
    renderMatches();
    renderDashboard();
    if (match.delegateAlertRefMgr) {
        renderRefereesTab();
    }
}

// ==================== GLOBÁLNÍ REGISTRACE PRO HTML EVENTS ====================
Object.assign(window, {
    onCompetitionFilterChange,
    renderMatches,
    openMatchProtocol,
    closeMatchProtocolWithCheck,
    closeMatchProtocolWithoutSave,
    switchFISTab,
    updateMatchDetails,
    updatePeriodChecks,
    updatePenaltyScores,
    updateMatchChecks,
    toggleSendToDK,
    toggleMatchReady,
    lockMatchRecord,
    unlockMatchRecord,
    renderRosterList,
    updatePlayerJerseyInRoster,
    togglePlayerGKInRoster,
    togglePlayerStarterInRoster,
    openAddPlayerToRosterModal,
    addPlayerToRoster,
    removePlayerFromRosterWithConfirm,
    renderStaffList,
    openAddStaffModal,
    submitStaffMember,
    removeStaffMemberWithConfirm,
    renderSubstitutionPlayerOptions,
    submitSubstitution,
    openGoalForm,
    closeGoalForm,
    onGoalTypeChange,
    onGoalTimeChange,
    submitGoal,
    openCardForm,
    closeCardForm,
    onCardTeamChange,
    onCardTimeChange,
    submitCard,
    deleteMatchEvent,
    saveDelegateReview,
    saveMatchProtocol,
    markUnsavedChanges,
    cancelForfeitWithConfirm
});