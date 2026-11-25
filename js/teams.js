/**
 * CVFL Portál - Týmy, Soupiska Hráčů a Hráčské Karty
 */

import { state, teamsData, playersData, trainersData, matchesData } from './state.js';
import { openModal, closeSpecificModal } from './ui.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';
import { apiGetRobloxPlayerAvatar } from './api.js';

/**
 * Spočítá statistiky karet hráče ze všech odehraných zápasů
 */
function getPlayerCardStats(playerId) {
    let yellowCards = 0;
    let redCards = 0;
    const completedMatches = matchesData.filter(m => m.status === 'Completed' && Array.isArray(m.events));
    completedMatches.forEach(m => {
        m.events.forEach(event => {
            if (event.targetType === 'player' && event.playerId === playerId) {
                if (event.type === 'Yellow_Card' || event.type === 'Second_Yellow_Card') yellowCards++;
                if (event.type === 'Red_Card' || event.type === 'Second_Yellow_Card') redCards++;
            }
        });
    });
    return { yellowCards, redCards };
}

function getPlayerMatchHistory(playerId) {
    return matchesData
        .filter(match => {
            if (!['Completed', 'In_Progress'].includes(match.status)) return false;
            const started = [...(match.homeRoster || []), ...(match.awayRoster || [])]
                .some(entry => entry.playerId === playerId && entry.isStarter);
            const inEvents = (match.events || []).some(event =>
                event.playerId === playerId || event.secondaryPlayerId === playerId ||
                event.playerInId === playerId || event.playerOutId === playerId
            );
            return started || inEvents;
        })
        .map(match => {
            const isHome = match.homeRoster?.some(entry => entry.playerId === playerId) ||
                match.events?.some(event =>
                    (event.playerId === playerId || event.secondaryPlayerId === playerId ||
                        event.playerInId === playerId || event.playerOutId === playerId) &&
                    event.teamSide === 'home'
                );
            const events = (match.events || []).filter(event => event.targetType !== 'staff');
            const goals = events.filter(event =>
                event.type === 'Goal' && event.goalType !== 'Own' && event.playerId === playerId
            ).length;
            const assists = events.filter(event =>
                event.type === 'Goal' && event.goalType === 'Regular' && event.secondaryPlayerId === playerId
            ).length;
            const yellowCards = events.filter(event =>
                event.playerId === playerId && ['Yellow_Card', 'Second_Yellow_Card'].includes(event.type)
            ).length;
            const redCards = events.filter(event =>
                event.playerId === playerId && ['Red_Card', 'Second_Yellow_Card'].includes(event.type)
            ).length;
            const date = match.matchDate && match.matchDate !== 'TBA' ? new Date(match.matchDate) : null;

            return {
                match,
                isHome,
                goals,
                assists,
                yellowCards,
                redCards,
                timestamp: date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
            };
        })
        .sort((a, b) => b.timestamp - a.timestamp || b.match.id - a.match.id);
}

export function renderTeams() {
    const selector = document.getElementById('teams-selector');
    if (!selector) return;

    if (!teamsData.some(team => team.id === state.activeTeamId)) {
        state.activeTeamId = teamsData[0]?.id ?? null;
    }

    selector.innerHTML = teamsData.map(t => `
        <button onclick="selectTeam(${t.id})" class="inline-flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${t.id === state.activeTeamId ? 'bg-[#aefb12] text-[#13236b] font-black shadow' : 'bg-[#13236b] text-gray-300 hover:bg-[#1e307d]'}">
            ${getTeamLogoMarkup(t)}${escapeTeamName(t.name)}
        </button>
    `).join('');

    renderSelectedTeamView();
}

export function selectTeam(teamId) {
    state.activeTeamId = teamId;
    renderTeams();
}

export function renderSelectedTeamView() {
    const container = document.getElementById('team-detail-view');
    const team = teamsData.find(t => t.id === state.activeTeamId);
    if (!container) return;
    if (!team) {
        container.innerHTML = '<p class="text-center text-sm text-gray-400">V databázi zatím nejsou žádné týmy.</p>';
        return;
    }

    const roster = playersData.filter(p => !p.isArchived && p.teamId === team.id);
    const trainers = trainersData.filter(trainer => trainer.teamId === team.id);

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#1e307d] pb-4">
            <div>
                <span class="text-xs text-[#aefb12] font-bold uppercase">${team.league === '1_Liga' ? 'CVFL 1. Liga' : 'CVFL 2. Liga'}</span>
                <h2 class="flex items-center gap-3 text-2xl font-black text-white">${getTeamLogoMarkup(team, 'h-10 w-10')}${escapeTeamName(team.name)}</h2>
            </div>
        </div>

        <div>
            <h3 class="font-bold text-sm mb-3 text-white">Trenéři (${trainers.length})</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-[#13236b] text-gray-400 uppercase">
                        <tr><th class="p-2">Roblox Username</th><th class="p-2">Discord Username</th></tr>
                    </thead>
                    <tbody class="divide-y divide-[#1e307d]">
                        ${trainers.map(trainer => `
                            <tr class="hover:bg-[#13236b]/60">
                                        <td class="p-2 font-bold text-amber-300">${trainer.role === 'Owner' ? 'Majitel' : 'Trenér'} — ${escapeTeamName(trainer.robloxNick)}</td>
                                <td class="p-2 font-mono text-gray-400">${escapeTeamName(trainer.discordNick)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${trainers.length === 0 ? '<p class="p-2 text-xs text-gray-400">Tým zatím nemá členy realizačního týmu.</p>' : ''}
            </div>
        </div>

        <div>
            <h3 class="font-bold text-sm mb-3 text-white">Hráčský Kádr (${roster.length} Hráčů)</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-[#13236b] text-gray-400 uppercase">
                        <tr>
                            <th class="p-2">Roblox Username</th>
                            <th class="p-2">Discord Username</th>
                            <th class="p-2">Góly</th>
                            <th class="p-2">Asistence</th>
                            <th class="p-2">Čistá konta</th>
                            <th class="p-2 text-center">🟨</th>
                            <th class="p-2 text-center">🟥</th>
                            <th class="p-2 text-right">Akce</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[#1e307d]">
                        ${roster.map(p => {
                            const cards = getPlayerCardStats(p.id);
                            return `
                            <tr class="hover:bg-[#13236b]/60">
                                <td class="p-2 font-bold text-[#05fda3] cursor-pointer hover:underline" onclick="openPlayerCard(${p.id})">${escapeTeamName(p.robloxNick)}</td>
                                <td class="p-2 font-mono text-gray-400">${escapeTeamName(p.discordNick)}</td>
                                <td class="p-2 font-bold text-[#aefb12]">${p.goals || 0}</td>
                                <td class="p-2 font-bold text-[#05fda3]">${p.assists || 0}</td>
                                <td class="p-2 font-bold text-amber-400">${p.cleanSheets || 0}</td>
                                <td class="p-2 text-center font-bold text-yellow-300">${cards.yellowCards || 0}</td>
                                <td class="p-2 text-center font-bold text-red-400">${cards.redCards || 0}</td>
                                <td class="p-2 text-right">
                                    <button onclick="openPlayerCard(${p.id})" class="px-2 py-1 bg-[#13236b] hover:bg-[#1e307d] text-gray-200 rounded">Profil</button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

export function openPlayerCard(playerId) {
    const player = playersData.find(p => p.id === playerId);
    if (!player) return;

    const team = teamsData.find(t => t.id === player.teamId);
    const cards = getPlayerCardStats(player.id);
    const matchHistory = getPlayerMatchHistory(player.id);

    const content = document.getElementById('player-card-content');
    content.innerHTML = `
        <div class="bg-gradient-to-r from-[#13236b] to-[#0e1a4f] p-5 sm:p-6 border-b border-[#aefb12]/30 flex justify-between items-start gap-4">
            <div class="flex min-w-0 items-center gap-4">
                <div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#aefb12]/40 bg-[#0e1a4f] shadow-lg sm:h-24 sm:w-24">
                    <img id="player-card-avatar-${player.id}" alt="${escapeTeamName(player.robloxNick)} Roblox avatar" class="hidden h-full w-full object-cover">
                    <div class="flex h-full w-full items-center justify-center text-3xl text-gray-500"><i class="fa-solid fa-user"></i></div>
                </div>
                <div class="min-w-0">
                <span class="text-xs text-[#aefb12] font-bold uppercase">${escapeTeamName(team ? team.name : 'Bez klubu')}</span>
                <h2 class="mt-1 break-words text-xl font-black text-white sm:text-2xl">${escapeTeamName(player.robloxNick)}</h2>
                <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-gray-300"><i class="fa-brands fa-discord text-[#5865f2]"></i><span>${escapeTeamName(player.discordNick)}</span></p>
                ${player.isArchived ? '<span class="mt-2 inline-flex rounded border border-gray-500/40 bg-gray-500/10 px-2 py-1 text-[10px] font-bold uppercase text-gray-300">Archivovaný hráč</span>' : ''}
                </div>
            </div>
            <button onclick="closeSpecificModal('modal-player-card')" aria-label="Zavřít profil hráče" class="shrink-0 text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div class="max-h-[70vh] space-y-4 overflow-y-auto p-4 text-xs sm:p-6">

            <!-- Útočné statistiky -->
            <div class="grid grid-cols-3 gap-2 p-3 bg-[#13236b] rounded-xl border border-[#1e307d] text-center">
                <div>
                    <span class="block text-gray-400">Góly</span>
                    <span class="text-lg font-black text-[#aefb12]">${player.goals || 0}</span>
                </div>
                <div>
                    <span class="block text-gray-400">Asistence</span>
                    <span class="text-lg font-black text-[#05fda3]">${player.assists || 0}</span>
                </div>
                <div>
                    <span class="block text-gray-400">Čistá konta</span>
                    <span class="text-lg font-black text-amber-400">${player.cleanSheets || 0}</span>
                </div>
            </div>

            <!-- Karty (počítáno ze zápasových událostí) -->
            <div class="grid grid-cols-2 gap-2 p-3 bg-[#13236b] rounded-xl border border-[#1e307d] text-center">
                <div class="flex flex-col items-center gap-1">
                    <span class="inline-flex items-center justify-center w-6 h-8 rounded bg-yellow-400 shadow font-black text-[#13236b] text-base">&nbsp;</span>
                    <span class="block text-gray-400 text-[10px] uppercase mt-1">Žluté karty</span>
                    <span class="text-xl font-black text-yellow-300">${cards.yellowCards}</span>
                </div>
                <div class="flex flex-col items-center gap-1">
                    <span class="inline-flex items-center justify-center w-6 h-8 rounded bg-red-500 shadow font-black text-white text-base">&nbsp;</span>
                    <span class="block text-gray-400 text-[10px] uppercase mt-1">Červené karty</span>
                    <span class="text-xl font-black text-red-400">${cards.redCards}</span>
                </div>
            </div>

            <section class="space-y-3">
                <div class="flex items-center justify-between gap-2 border-b border-[#1e307d] pb-2">
                    <h3 class="font-black uppercase tracking-wide text-white">Odehraná utkání</h3>
                    <span class="rounded-full bg-[#13236b] px-2.5 py-1 font-bold text-[#aefb12]">${matchHistory.length}</span>
                </div>
                ${matchHistory.length ? `
                    <div class="space-y-2">
                        ${matchHistory.map(({ match, isHome, goals, assists, yellowCards, redCards }) => {
                            const ownTeam = teamsData.find(item => item.id === (isHome ? match.homeTeamId : match.awayTeamId));
                            const opponent = teamsData.find(item => item.id === (isHome ? match.awayTeamId : match.homeTeamId));
                            const date = match.matchDate && match.matchDate !== 'TBA' ? new Date(match.matchDate) : null;
                            const dateText = date && !Number.isNaN(date.getTime())
                                ? date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
                                : 'Datum neuvedeno';
                            const stage = match.competition === 'MOL Cup'
                                ? match.cupStage || 'MOL Cup'
                                : match.cupStage?.startsWith('Skupina o ')
                                    ? match.cupStage
                                    : `${match.round}. kolo`;
                            const score = match.isForfeited
                                ? `Kontumace ${match.homeScore}:${match.awayScore}`
                                : `${match.homeScore}:${match.awayScore}`;
                            const stats = [
                                goals ? `<span class="text-[#aefb12]"><i class="fa-solid fa-futbol mr-1"></i>${goals} G</span>` : '',
                                assists ? `<span class="text-[#05fda3]"><i class="fa-solid fa-handshake mr-1"></i>${assists} A</span>` : '',
                                yellowCards ? `<span class="text-yellow-300"><i class="fa-solid fa-square mr-1"></i>${yellowCards}</span>` : '',
                                redCards ? `<span class="text-red-400"><i class="fa-solid fa-square mr-1"></i>${redCards}</span>` : ''
                            ].filter(Boolean).join('');
                            return `
                                <article class="rounded-xl border border-[#1e307d] bg-[#13236b]/70 p-3">
                                    <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
                                        <span>${dateText} · ${escapeTeamName(match.competition)} · ${escapeTeamName(stage)}</span>
                                        <span class="font-bold ${match.status === 'In_Progress' ? 'text-emerald-300' : 'text-gray-400'}">${match.status === 'In_Progress' ? 'Probíhá' : 'Odehráno'}</span>
                                    </div>
                                    <div class="mt-2 flex items-center justify-between gap-3">
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-1.5 truncate font-bold text-white">${ownTeam ? getTeamLogoMarkup(ownTeam, 'h-5 w-5') : ''}<span>${escapeTeamName(ownTeam?.name || 'Tým')}</span></div>
                                            <div class="mt-1 truncate text-[10px] text-gray-400">vs ${escapeTeamName(opponent?.name || 'Soupeř')}</div>
                                        </div>
                                        <strong class="shrink-0 rounded-lg border border-[#1e307d] bg-[#0e1a4f] px-3 py-1.5 font-mono text-lg text-[#aefb12]">${score}</strong>
                                    </div>
                                    ${stats ? `<div class="mt-2 flex flex-wrap gap-3 border-t border-[#1e307d]/70 pt-2 font-bold">${stats}</div>` : ''}
                                </article>
                            `;
                        }).join('')}
                    </div>
                ` : '<p class="rounded-xl border border-[#1e307d] bg-[#13236b]/50 p-4 text-center text-gray-400">Hráč zatím nezasáhl do žádného evidovaného utkání.</p>'}
            </section>
        </div>
    `;

    openModal('modal-player-card');
    const avatar = document.getElementById(`player-card-avatar-${player.id}`);
    apiGetRobloxPlayerAvatar(player.id).then(avatarUrl => {
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
        console.warn(`Roblox avatar pro hráče ${player.id} není dostupný:`, error.message);
    });
}
