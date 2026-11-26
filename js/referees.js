/**
 * CVFL Portál - Rozhodčí, Licence a Nominace na Utkání
 */

import { state, refereesData, matchesData, refereeAssignmentsData, teamsData } from './state.js';
import { openModal, closeSpecificModal, showToast } from './ui.js';
import { getTeamProfileLinkMarkup, escapeTeamName } from './team-logo.js';
import { apiSetRefereeDelegate, apiSaveMatch, apiGetRobloxRefereeAvatar } from './api.js';

function canManageReferees() {
    return ['Admin', 'Referee_Manager'].includes(state.currentUserRole);
}

function canSeeRefereeDirectory() {
    return ['Admin', 'Referee_Manager', 'DK', 'Delegate'].includes(state.currentUserRole);
}

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
                            <div class="flex flex-wrap items-center gap-2 text-xs">
                                <span class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 font-bold text-white">
                                    <span class="min-w-0 overflow-hidden">${home ? getTeamProfileLinkMarkup(home, { truncate: true }) : ''}</span>
                                    <span class="text-gray-400 font-normal">vs</span>
                                    <span class="min-w-0 overflow-hidden text-right">${away ? getTeamProfileLinkMarkup(away, { truncate: true, className: 'justify-end' }) : ''}</span>
                                </span>
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
    const directory = document.getElementById('referees-directory-panel');
    const canSeeDirectory = canSeeRefereeDirectory();
    const canManage = canManageReferees();
    if (directory) directory.classList.toggle('hidden', !canSeeDirectory);
    if (!body) return;
    if (!canSeeDirectory) {
        body.innerHTML = '';
        return;
    }

    body.innerHTML = refereesData.map(r => `
        <tr class="hover:bg-[#13236b]/60">
            <td class="p-3 font-bold ${r.isRegistered ? 'text-[#05fda3]' : 'text-gray-400'}">
                <button type="button" onclick="openRefereeCard(${r.id})" class="inline-flex max-w-full items-center gap-1.5 text-left hover:underline">
                    <span class="truncate">${escapeTeamName(r.robloxNick)}</span>
                    ${r.isRegistered ? '' : '<i class="fa-solid fa-xmark shrink-0 text-gray-500" title="Rozhodčí není zaregistrován do systému"></i>'}
                </button>
            </td>
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
                <label class="inline-flex items-center gap-2 ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}">
                    <input type="checkbox" ${r.isDelegate ? 'checked' : ''} ${canManage ? '' : 'disabled'}
                        onchange="toggleRefereeDelegate(${r.id}, this)"
                        aria-label="Delegát utkání: ${escapeTeamName(r.robloxNick)}"
                        class="h-4 w-4 accent-[#aefb12]">
                    <span class="text-gray-300">Delegát</span>
                </label>
            </td>
        </tr>
    `).join('');
}

function getRefereeMatchHistory(referee) {
    if (Array.isArray(referee.matchHistory)) {
        return referee.matchHistory.map(item => ({
            match: item.match,
            yellowCards: item.yellowCards,
            redCards: item.redCards,
            penalties: item.penalties,
            timestamp: item.match.matchDate &&
                !['TBA', 'TBD'].includes(String(item.match.matchDate).trim().toUpperCase())
                ? Date.parse(item.match.matchDate) || 0
                : 0
        }));
    }
    return matchesData
        .filter(match =>
            ['Completed', 'In_Progress'].includes(match.status) &&
            [match.referee, match.fourthRef, match.var].includes(referee.robloxNick)
        )
        .map(match => {
            const events = Array.isArray(match.events) ? match.events : [];
            const yellowCards = events.filter(event =>
                ['Yellow_Card', 'Second_Yellow_Card'].includes(event.type)
            ).length;
            const redCards = events.filter(event =>
                ['Red_Card', 'Second_Yellow_Card'].includes(event.type)
            ).length;
            const penalties = events.filter(event =>
                event.type === 'Goal' && event.goalType === 'Penalty'
            ).length;
            const date = match.matchDate && match.matchDate !== 'TBA' ? new Date(match.matchDate) : null;
            return {
                match,
                yellowCards,
                redCards,
                penalties,
                timestamp: date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
            };
        })
        .sort((a, b) => b.timestamp - a.timestamp || b.match.id - a.match.id);
}

export function openRefereeCard(refereeId) {
    const referee = refereesData.find(item => Number(item.id) === Number(refereeId));
    if (!referee) return;

    const history = getRefereeMatchHistory(referee);
    const appearances = Number(referee.matchStats?.appearances ?? history.length);
    const totals = {
        yellowCards: Number(referee.matchStats?.yellowCards ?? history.reduce((sum, item) => sum + item.yellowCards, 0)),
        redCards: Number(referee.matchStats?.redCards ?? history.reduce((sum, item) => sum + item.redCards, 0)),
        penalties: Number(referee.matchStats?.penalties ?? history.reduce((sum, item) => sum + item.penalties, 0))
    };
    const average = value => appearances ? (value / appearances).toFixed(2).replace('.', ',') : '0,00';
    const content = document.getElementById('player-card-content');
    if (!content) return;

    content.innerHTML = `
        <div class="flex items-start justify-between gap-4 border-b border-[#aefb12]/30 bg-gradient-to-r from-[#13236b] to-[#0e1a4f] p-5 sm:p-6">
            <div class="flex min-w-0 items-center gap-4">
                <div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#aefb12]/40 bg-[#0e1a4f] shadow-lg sm:h-24 sm:w-24">
                    <img id="referee-card-avatar-${referee.id}" alt="${escapeTeamName(referee.robloxNick)} Roblox avatar" class="hidden h-full w-full object-cover">
                    <div class="flex h-full w-full items-center justify-center text-3xl text-gray-500"><i class="fa-solid fa-user-ninja"></i></div>
                </div>
                <div class="min-w-0">
                    <span class="inline-flex rounded bg-[#aefb12] px-2 py-1 text-[10px] font-black uppercase text-[#13236b]">Licence ${escapeTeamName(referee.license || '—')}</span>
                    <h2 class="mt-2 flex min-w-0 items-center gap-2 break-words text-xl font-black sm:text-2xl ${referee.isRegistered ? 'text-white' : 'text-gray-400'}">
                        <span>${escapeTeamName(referee.robloxNick)}</span>
                        ${referee.isRegistered ? '' : '<i class="fa-solid fa-xmark shrink-0 text-gray-500" title="Rozhodčí není zaregistrován do systému"></i>'}
                    </h2>
                    <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-gray-300"><i class="fa-brands fa-discord text-gray-300"></i><span>${escapeTeamName(referee.discordNick || 'Discord účet není propojen')}</span></p>
                </div>
            </div>
            <button onclick="closeSpecificModal('modal-player-card')" aria-label="Zavřít profil rozhodčího" class="shrink-0 text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div class="max-h-[70vh] space-y-4 overflow-y-auto p-4 text-xs sm:p-6">
            <section class="grid grid-cols-2 gap-2 rounded-xl border border-[#1e307d] bg-[#13236b] p-3 text-center">
                <div>
                    <span class="block text-gray-400">Stav licence</span>
                    <span class="mt-1 inline-flex rounded px-2 py-1 font-black ${referee.status === 'Suspended' ? 'bg-red-500/20 text-red-300' : 'bg-[#aefb12]/15 text-[#aefb12]'}">${referee.status === 'Suspended' ? 'Suspendován' : 'Aktivní'}</span>
                </div>
                <div>
                    <span class="block text-gray-400">Odpískaná utkání</span>
                    <span class="text-xl font-black text-[#aefb12]">${appearances}</span>
                </div>
            </section>

            ${referee.status === 'Suspended' ? `
                <section class="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                    <h3 class="font-black uppercase tracking-wide text-red-200"><i class="fa-solid fa-ban mr-1"></i> Suspendovaný rozhodčí</h3>
                    ${referee.suspensionReason ? `<p class="mt-1 text-gray-300">${escapeTeamName(referee.suspensionReason)}</p>` : ''}
                </section>
            ` : ''}

            <section class="space-y-2">
                <h3 class="border-b border-[#1e307d] pb-2 font-black uppercase tracking-wide text-white">Průměr na utkání</h3>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div class="rounded-xl border border-[#1e307d] bg-[#13236b] p-3 text-center">
                        <span class="block text-gray-400">Hodnocení</span><strong class="text-lg text-amber-300">—</strong>
                    </div>
                    <div class="rounded-xl border border-[#1e307d] bg-[#13236b] p-3 text-center">
                        <span class="block text-gray-400">Penalty</span><strong class="text-lg text-[#aefb12]">${average(totals.penalties)}</strong>
                    </div>
                    <div class="rounded-xl border border-[#1e307d] bg-[#13236b] p-3 text-center">
                        <span class="block text-gray-400">Žluté karty</span><strong class="text-lg text-yellow-300">${average(totals.yellowCards)}</strong>
                    </div>
                    <div class="rounded-xl border border-[#1e307d] bg-[#13236b] p-3 text-center">
                        <span class="block text-gray-400">Červené karty</span><strong class="text-lg text-red-400">${average(totals.redCards)}</strong>
                    </div>
                </div>
            </section>

            <section class="space-y-3">
                <div class="flex items-center justify-between gap-2 border-b border-[#1e307d] pb-2">
                    <h3 class="font-black uppercase tracking-wide text-white">Poslední utkání</h3>
                    <span class="rounded-full bg-[#13236b] px-2.5 py-1 font-bold text-[#aefb12]">${appearances}</span>
                </div>
                ${history.length ? history.slice(0, 10).map(({ match, yellowCards, redCards, penalties, timestamp }) => {
                    const home = teamsData.find(team => Number(team.id) === Number(match.homeTeamId));
                    const away = teamsData.find(team => Number(team.id) === Number(match.awayTeamId));
                    const dateText = timestamp ? new Date(timestamp).toLocaleDateString('cs-CZ', {
                        day: 'numeric', month: 'short', year: 'numeric'
                    }) : 'Datum neuvedeno';
                    return `
                        <article class="rounded-xl border border-[#1e307d] bg-[#13236b]/70 p-3">
                            <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
                                <span>${escapeTeamName(dateText)} · ${escapeTeamName(match.competition || 'Soutěž neuvedena')}</span>
                                <span class="font-bold ${match.status === 'In_Progress' ? 'text-emerald-300' : 'text-gray-400'}">${match.status === 'In_Progress' ? 'Probíhá' : 'Odehráno'}</span>
                            </div>
                            <div class="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                <span class="min-w-0 overflow-hidden">${home ? getTeamProfileLinkMarkup(home, { logoClassName: 'h-5 w-5', truncate: true }) : escapeTeamName('Domácí tým')}</span>
                                <strong class="rounded-lg border border-[#1e307d] bg-[#0e1a4f] px-2 py-1 font-mono text-base text-[#aefb12]">${Number(match.homeScore) || 0}:${Number(match.awayScore) || 0}</strong>
                                <span class="min-w-0 overflow-hidden text-right">${away ? getTeamProfileLinkMarkup(away, { logoClassName: 'h-5 w-5', className: 'justify-end', truncate: true }) : escapeTeamName('Hostující tým')}</span>
                            </div>
                            <div class="mt-2 flex flex-wrap items-center gap-3 border-t border-[#1e307d]/70 pt-2 font-bold">
                                <span class="text-yellow-300">🟨 ${yellowCards}</span>
                                <span class="text-red-400">🟥 ${redCards}</span>
                                <span class="text-[#aefb12]"><i class="fa-solid fa-futbol mr-1"></i>${penalties} pen.</span>
                                <span class="ml-auto text-gray-400">Hodnocení: <strong class="text-amber-300">—</strong></span>
                            </div>
                        </article>
                    `;
                }).join('') : '<p class="rounded-xl border border-[#1e307d] bg-[#13236b]/50 p-4 text-center text-gray-400">Rozhodčí zatím nemá evidované utkání.</p>'}
            </section>
        </div>
    `;
    openModal('modal-player-card');
    const avatar = document.getElementById(`referee-card-avatar-${referee.id}`);
    apiGetRobloxRefereeAvatar(referee.id).then(avatarUrl => {
        if (!avatar || !avatarUrl || !avatar.isConnected) return;
        avatar.onload = () => {
            avatar.classList.remove('hidden');
            avatar.nextElementSibling?.classList.add('hidden');
        };
        avatar.onerror = () => {
            avatar.classList.add('hidden');
            avatar.nextElementSibling?.classList.remove('hidden');
        };
        avatar.src = avatarUrl;
    }).catch(error => {
        console.warn(`Roblox avatar rozhodčího ${referee.id} není dostupný:`, error.message);
    });
}

export function renderRefereeAssignments() {
    const container = document.getElementById('referee-assignments-list');
    if (!container) return;
    const canManage = canManageReferees();

    const assignmentSource = canManage ? matchesData : refereeAssignmentsData;
    const unfinishedMatches = assignmentSource.filter(m =>
        m.status !== 'Completed' &&
        m.matchDate &&
        !['TBA', 'TBD'].includes(String(m.matchDate).trim().toUpperCase()) &&
        !Number.isNaN(Date.parse(m.matchDate))
    );

    if (unfinishedMatches.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs">Nejsou žádná utkání s určeným termínem, která by čekala na nominaci.</div>`;
        return;
    }

    container.innerHTML = unfinishedMatches.map(m => {
        const home = teamsData.find(t => t.id === m.homeTeamId);
        const away = teamsData.find(t => t.id === m.awayTeamId);

        const roundLabel = m.competition === 'MOL Cup' ? m.cupStage :
            m.competition === 'Baráž o 1. Ligu' ? `${Number(m.round) === 2 ? 'Odveta' : '1. zápas'} baráže` :
                `${m.round}. Kolo`;
        const d = (m.matchDate && m.matchDate !== 'TBA') ? new Date(m.matchDate) : null;
        const validDate = d && !Number.isNaN(d.getTime());
        const matchDateFormatted = m.matchDate === 'TBA' ? 'TBA' : validDate
            ? `${d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`
            : 'Termín TBD';

        return `
            <div class="bg-[#13236b] p-4 rounded-xl border border-[#1e307d] space-y-3">
                <div class="flex flex-wrap justify-between items-center gap-2 text-xs">
                    <span class="font-bold text-[#aefb12]">${escapeTeamName(m.competition)} — ${escapeTeamName(roundLabel)}</span>
                    <span class="inline-flex items-center gap-1.5 text-gray-300"><i class="fa-regular fa-calendar text-[#aefb12]"></i>${escapeTeamName(matchDateFormatted)}</span>
                </div>
                <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 font-bold text-white text-sm">
                    <span class="min-w-0 overflow-hidden">${home ? getTeamProfileLinkMarkup(home, { truncate: true }) : ''}</span>
                    <span class="text-gray-400 font-normal">vs</span>
                    <span class="min-w-0 overflow-hidden text-right">${away ? getTeamProfileLinkMarkup(away, { truncate: true, className: 'justify-end' }) : ''}</span>
                </div>
                <div class="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
                    <i class="fa-solid fa-location-dot shrink-0 text-[#aefb12]"></i>
                    <span class="min-w-0 truncate" title="${escapeTeamName(m.stadium && m.stadium !== 'TBD' ? m.stadium : 'Stadion zatím není určen')}">${escapeTeamName(m.stadium && m.stadium !== 'TBD' ? m.stadium : 'Stadion zatím není určen')}</span>
                </div>
                
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Hlavní Rozhodčí (HR):</span>
                        ${canManage ? `<button onclick="openSlotPicker(${m.id}, 'referee')" class="w-full text-left p-2 rounded border transition flex justify-between items-center ${m.referee ? 'bg-[#0e1a4f] border-[#aefb12] text-[#aefb12] font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-[#aefb12]'}">
                            <span class="truncate">${escapeTeamName(m.referee || '+ Vybrat HR')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>` : `<div class="w-full p-2 rounded border ${m.referee ? 'bg-[#0e1a4f] border-[#aefb12] text-[#aefb12] font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400'}">${escapeTeamName(m.referee || 'Nenominován')}</div>`}
                    </div>

                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Delegát Utkání:</span>
                        ${canManage ? `<button onclick="openSlotPicker(${m.id}, 'delegate')" class="w-full text-left p-2 rounded border transition flex justify-between items-center ${m.delegate ? 'bg-[#0e1a4f] border-amber-400 text-amber-400 font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-amber-400'}">
                            <span class="truncate">${escapeTeamName(m.delegate || '+ Vybrat Delegáta')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>` : `<div class="w-full p-2 rounded border ${m.delegate ? 'bg-[#0e1a4f] border-amber-400 text-amber-400 font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400'}">${escapeTeamName(m.delegate || 'Nenominován')}</div>`}
                    </div>

                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Čtvrtý Rozhodčí (4R):</span>
                        ${canManage ? `<button ${!m.referee ? 'disabled title="Nejprve přiřaďte hlavního rozhodčího."' : ''} onclick="openSlotPicker(${m.id}, 'fourthRef')" class="w-full text-left p-2 rounded border transition flex justify-between items-center disabled:cursor-not-allowed disabled:opacity-40 ${m.fourthRef ? 'bg-[#0e1a4f] border-[#05fda3] text-[#05fda3] font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-[#05fda3]'}">
                            <span class="truncate">${escapeTeamName(m.fourthRef || '+ Vybrat 4R')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>` : `<div class="w-full p-2 rounded border ${m.fourthRef ? 'bg-[#0e1a4f] border-[#05fda3] text-[#05fda3] font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400'}">${escapeTeamName(m.fourthRef || 'Nenominován')}</div>`}
                    </div>

                    <div>
                        <span class="text-[10px] text-gray-400 block mb-1">Videorozhodčí (VAR):</span>
                        ${canManage ? `<button ${!m.referee ? 'disabled title="Nejprve přiřaďte hlavního rozhodčího."' : ''} onclick="openSlotPicker(${m.id}, 'var')" class="w-full text-left p-2 rounded border transition flex justify-between items-center disabled:cursor-not-allowed disabled:opacity-40 ${m.var ? 'bg-[#0e1a4f] border-purple-400 text-purple-300 font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400 hover:border-purple-400'}">
                            <span class="truncate">${escapeTeamName(m.var || '+ Vybrat VAR')}</span>
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>` : `<div class="w-full p-2 rounded border ${m.var ? 'bg-[#0e1a4f] border-purple-400 text-purple-300 font-bold' : 'bg-[#0e1a4f]/50 border-[#1e307d] text-gray-400'}">${escapeTeamName(m.var || 'Nenominován')}</div>`}
                    </div>
                </div>

                ${canManage ? `<div class="flex justify-end pt-2 border-t border-[#1e307d]">
                    <button onclick="saveRefereeAssignmentsForMatch(${m.id})" class="px-4 py-1.5 bg-[#05fda3] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg text-xs shadow">
                        <i class="fa-solid fa-floppy-disk mr-1"></i> Uložit Nominaci
                    </button>
                </div>` : ''}
            </div>
        `;
    }).join('');
}

export async function saveRefereeAssignmentsForMatch(matchId) {
    if (!canManageReferees()) {
        showToast('Nominace může upravovat pouze vedení ligy nebo vedení rozhodčích.', true);
        return;
    }
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
    if (!canManageReferees()) {
        showToast('Nominace může upravovat pouze vedení ligy nebo vedení rozhodčích.', true);
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
    if (!canManageReferees()) {
        showToast('Nominace může upravovat pouze vedení ligy nebo vedení rozhodčích.', true);
        return;
    }
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

export async function toggleRefereeDelegate(refereeId, checkbox) {
    const referee = refereesData.find(item => Number(item.id) === Number(refereeId));
    if (!canManageReferees()) {
        checkbox.checked = Boolean(referee?.isDelegate);
        showToast('Oprávnění delegáta může měnit pouze vedení ligy nebo vedení rozhodčích.', true);
        return;
    }
    if (!referee) {
        checkbox.checked = false;
        showToast('Rozhodčí nebyl nalezen. Obnovte seznam a zkuste akci znovu.', true);
        return;
    }

    const previousValue = Boolean(referee.isDelegate);
    const nextValue = checkbox.checked;
    checkbox.disabled = true;
    try {
        await apiSetRefereeDelegate(referee.id, nextValue);
        referee.isDelegate = nextValue;
        showToast(`Oprávnění delegáta pro ${referee.robloxNick} bylo ${nextValue ? 'zapnuto' : 'vypnuto'}.`);
        if (referee.isCurrentUser) window.location.reload();
    } catch (error) {
        checkbox.checked = previousValue;
        showToast(`Oprávnění delegáta se nepodařilo uložit: ${error.message}`, true);
    } finally {
        if (checkbox.isConnected) checkbox.disabled = false;
    }
}
