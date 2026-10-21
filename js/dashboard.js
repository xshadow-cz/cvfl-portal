/**
 * CVFL Portál - Přehled a Dashboard Statistiky
 */

import { state, playersData, refereesData, teamsData, matchesData } from './state.js';
import { getMatchStatusLabel } from './match-status.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';

const STAT_CATEGORIES = [
    { key: 'goals', label: 'Góly', icon: 'fa-futbol', color: 'text-[#aefb12]' },
    { key: 'assists', label: 'Asistence', icon: 'fa-handshake', color: 'text-[#05fda3]' },
    { key: 'cleanSheets', label: 'Čistá konta', icon: 'fa-shield-halved', color: 'text-amber-400' },
    { key: 'yellowCards', label: 'Žluté karty', icon: 'fa-square', color: 'text-yellow-300' },
    { key: 'redCards', label: 'Červené karty', icon: 'fa-square', color: 'text-red-400' }
];

// Stav okna statistik
const statsModalState = {
    selectedCompetition: 'all',
    selectedTeamId: 'all',
    sortKey: 'goals',
    sortAscending: false
};

function matchMinute(timeStr) {
    const [minutes, seconds] = String(timeStr || '0:00').split(':').map(value => Number.parseInt(value, 10) || 0);
    return minutes + seconds / 60;
}

function getMatchCleanSheetPlayerIds(match) {
    const playerIds = [];
    const events = Array.isArray(match.events) ? match.events : [];

    for (const side of ['home', 'away']) {
        const roster = side === 'home' ? match.homeRoster : match.awayRoster;
        if (!Array.isArray(roster)) continue;

        const goalkeeperIds = new Set(roster.filter(player => player.isGK).map(player => player.playerId));
        const substitutions = events
            .filter(event => event.type === 'Substitution' && event.teamSide === side)
            .sort((a, b) => matchMinute(a.timeStr) - matchMinute(b.timeStr) || (a.id || 0) - (b.id || 0));
        const intervals = [];
        let activeKeeper = roster.find(player => player.isGK && player.isStarter)?.playerId ?? null;
        let intervalStart = 0;

        substitutions.forEach(event => {
            const changeTime = matchMinute(event.timeStr);
            if (event.playerOutId === activeKeeper) {
                if (activeKeeper !== null) intervals.push({ playerId: activeKeeper, start: intervalStart, end: changeTime });
                activeKeeper = goalkeeperIds.has(event.playerInId) ? event.playerInId : null;
                intervalStart = changeTime;
            } else if (event.playerInId === activeKeeper) {
                if (activeKeeper !== null) intervals.push({ playerId: activeKeeper, start: intervalStart, end: changeTime });
                activeKeeper = null;
            } else if (activeKeeper === null && goalkeeperIds.has(event.playerInId)) {
                activeKeeper = event.playerInId;
                intervalStart = changeTime;
            }
        });
        if (activeKeeper !== null) intervals.push({ playerId: activeKeeper, start: intervalStart, end: 20 });

        intervals.forEach(interval => {
            const conceded = events.some(event => {
                if (event.type !== 'Goal') return false;
                const scoringSide = event.teamSide ||
                    (match.homeRoster?.some(player => player.playerId === event.playerId) ? 'home' : 'away');
                const minute = matchMinute(event.timeStr || `${event.minute || 0}:00`);
                return scoringSide !== side && minute >= interval.start &&
                    (minute < interval.end || (interval.end === 20 && minute === interval.end));
            });
            if (interval.end - interval.start >= 10 && !conceded) playerIds.push(interval.playerId);
        });
    }

    return playerIds;
}

function collectLeaderboardStats() {
    const completedMatches = matchesData.filter(match => match.status === 'Completed');

    const DISPLAY_GROUPS = [
        { label: 'CVFL 1. Liga', competitions: ['CVFL 1. Liga', 'Nadstavba'] },
        { label: 'CVFL 2. Liga', competitions: ['CVFL 2. Liga'] },
        { label: 'MOL Cup', competitions: ['MOL Cup'] },
    ];

    const statsByGroup = new Map();
    const overallStats = new Map();

    const addStat = (target, playerId, key) => {
        const player = playersData.find(item => item.id === playerId);
        if (!player) return;
        if (!target.has(playerId)) {
            target.set(playerId, {
                player,
                goals: 0,
                assists: 0,
                cleanSheets: 0,
                yellowCards: 0,
                redCards: 0
            });
        }
        target.get(playerId)[key] += 1;
    };

    DISPLAY_GROUPS.forEach(g => statsByGroup.set(g.label, new Map()));

    completedMatches.forEach(match => {
        const group = DISPLAY_GROUPS.find(g => g.competitions.includes(match.competition));
        const groupStats = group ? statsByGroup.get(group.label) : null;

        const events = Array.isArray(match.events) ? match.events : [];

        events.forEach(event => {
            if (event.type === 'Goal' && event.goalType !== 'Own') {
                if (groupStats) addStat(groupStats, event.playerId, 'goals');
                addStat(overallStats, event.playerId, 'goals');
            }
            if (event.type === 'Goal' && event.goalType === 'Regular' && event.secondaryPlayerId) {
                if (groupStats) addStat(groupStats, event.secondaryPlayerId, 'assists');
                addStat(overallStats, event.secondaryPlayerId, 'assists');
            }
            if (event.targetType === 'player' && event.playerId) {
                if (event.type === 'Yellow_Card' || event.type === 'Second_Yellow_Card') {
                    if (groupStats) addStat(groupStats, event.playerId, 'yellowCards');
                    addStat(overallStats, event.playerId, 'yellowCards');
                }
                if (event.type === 'Red_Card' || event.type === 'Second_Yellow_Card') {
                    if (groupStats) addStat(groupStats, event.playerId, 'redCards');
                    addStat(overallStats, event.playerId, 'redCards');
                }
            }
        });

        getMatchCleanSheetPlayerIds(match).forEach(playerId => {
            if (groupStats) addStat(groupStats, playerId, 'cleanSheets');
            addStat(overallStats, playerId, 'cleanSheets');
        });
    });

    return { displayGroups: DISPLAY_GROUPS, statsByGroup, overallStats };
}

function renderDashboardLeaderboards() {
    const container = document.getElementById('dashboard-stat-leaders');
    if (!container) return;

    const { displayGroups, statsByGroup, overallStats } = collectLeaderboardStats();
    const groups = [
        ...displayGroups.map(g => [g.label, statsByGroup.get(g.label)]),
        ['Celá liga · všechny soutěže', overallStats]
    ];

    container.innerHTML = STAT_CATEGORIES.map(category => `
        <section class="rounded-xl border border-[#1e307d] bg-[#13236b]/40 p-4 space-y-3">
            <h3 class="font-black text-sm ${category.color} cursor-pointer hover:underline flex items-center justify-between group" 
                onclick="openStatsModal('${category.key}')" 
                title="Klikněte pro otevření kompletní tabulky statistik">
                <span><i class="fa-solid ${category.icon} mr-2"></i>${category.label}</span>
                <i class="fa-solid fa-up-right-from-square text-xs opacity-50 group-hover:opacity-100 transition"></i>
            </h3>
            <div class="space-y-3">
                ${groups.map(([groupName, stats]) => {
                    const leaders = [...(stats?.values() || [])]
                        .filter(item => item[category.key] > 0)
                        .sort((a, b) => b[category.key] - a[category.key] ||
                            a.player.robloxNick.localeCompare(b.player.robloxNick, 'cs'))
                        .slice(0, 5);
                    return `
                        <div class="border-t border-[#1e307d] pt-2">
                            <h4 class="text-[11px] font-bold uppercase text-gray-400">${escapeTeamName(groupName)}</h4>${leaders.length ? `
                                <ol class="mt-1 space-y-1">
                                    ${leaders.map((item, index) => {
                                        const team = teamsData.find(candidate => candidate.id === item.player.teamId);
                                        return `<li class="flex items-center justify-between gap-3 text-xs">
                                            <span class="min-w-0 truncate text-gray-200">
                                                <span class="mr-1 font-mono text-gray-500">${index + 1}.</span>
                                                ${escapeTeamName(item.player.robloxNick)}${team ? `<span class="text-gray-500">· ${escapeTeamName(team.name)}</span>` : ''}
                                            </span>
                                            <strong class="shrink-0 ${category.color}">${item[category.key]}</strong>
                                        </li>`;
                                    }).join('')}
                                </ol>
                            ` : '<p class="mt-1 text-xs text-gray-500">Zatím bez statistik.</p>'}
                        </div>`;
                }).join('')}
            </div>
        </section>
    `).join('');
}

/* ==========================================================================
   MODÁLNÍ OKNO PRO STATISTIKY HRÁČŮ
   ========================================================================== */

function collectFilteredPlayerStats(competitionFilter) {
    const completedMatches = matchesData.filter(match => match.status === 'Completed');
    const playerStatsMap = new Map();

    const addStat = (playerId, key) => {
        const player = playersData.find(item => item.id === playerId);
        if (!player) return;
        if (!playerStatsMap.has(playerId)) {
            playerStatsMap.set(playerId, {
                player,
                goals: 0,
                assists: 0,
                cleanSheets: 0,
                yellowCards: 0,
                redCards: 0
            });
        }
        playerStatsMap.get(playerId)[key] += 1;
    };

    completedMatches.forEach(match => {
        if (competitionFilter !== 'all') {
            if (competitionFilter === 'CVFL 1. Liga') {
                if (!['CVFL 1. Liga', 'Nadstavba'].includes(match.competition)) return;
            } else if (match.competition !== competitionFilter) {
                return;
            }
        }

        const events = Array.isArray(match.events) ? match.events : [];

        events.forEach(event => {
            if (event.type === 'Goal' && event.goalType !== 'Own') {
                addStat(event.playerId, 'goals');
            }
            if (event.type === 'Goal' && event.goalType === 'Regular' && event.secondaryPlayerId) {
                addStat(event.secondaryPlayerId, 'assists');
            }
            if (event.targetType === 'player' && event.playerId) {
                if (event.type === 'Yellow_Card' || event.type === 'Second_Yellow_Card') {
                    addStat(event.playerId, 'yellowCards');
                }
                if (event.type === 'Red_Card' || event.type === 'Second_Yellow_Card') {
                    addStat(event.playerId, 'redCards');
                }
            }
        });

        getMatchCleanSheetPlayerIds(match).forEach(playerId => {
            addStat(playerId, 'cleanSheets');
        });
    });

    return Array.from(playerStatsMap.values());
}

window.openStatsModal = function(statKey = 'goals') {
    statsModalState.sortKey = statKey;
    statsModalState.sortAscending = false;
    renderStatsModal();
};

window.closeStatsModal = function() {
    const modal = document.getElementById('stats-modal-overlay');
    if (modal) modal.remove();
};

window.toggleStatsModalSort = function(statKey) {
    if (statsModalState.sortKey === statKey) {
        statsModalState.sortAscending = !statsModalState.sortAscending;
    } else {
        statsModalState.sortKey = statKey;
        statsModalState.sortAscending = false;
    }
    renderStatsModal();
};

window.handleStatsModalFilterChange = function() {
    const compSelect = document.getElementById('stats-modal-comp-filter');
    const teamSelect = document.getElementById('stats-modal-team-filter');
    if (compSelect) statsModalState.selectedCompetition = compSelect.value;
    if (teamSelect) statsModalState.selectedTeamId = teamSelect.value;
    renderStatsModal();
};

function renderStatsModal() {
    let modal = document.getElementById('stats-modal-overlay');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stats-modal-overlay';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm';
        document.body.appendChild(modal);
    }

    const allStats = collectFilteredPlayerStats(statsModalState.selectedCompetition);

    // Zobrazit pouze hráče, kteří nemají u všech statistik číslo 0
    let filtered = allStats.filter(item => {
        const total = item.goals + item.assists + item.cleanSheets + item.yellowCards + item.redCards;
        if (total === 0) return false;

        if (statsModalState.selectedTeamId !== 'all') {
            if (String(item.player.teamId) !== String(statsModalState.selectedTeamId)) return false;
        }

        return true;
    });

    // Řazení
    const { sortKey, sortAscending } = statsModalState;
    filtered.sort((a, b) => {
        const valA = a[sortKey] || 0;
        const valB = b[sortKey] || 0;
        if (valA !== valB) {
            return sortAscending ? valA - valB : valB - valA;
        }
        return a.player.robloxNick.localeCompare(b.player.robloxNick, 'cs');
    });

    const competitions = ['CVFL 1. Liga', 'CVFL 2. Liga', 'MOL Cup', 'Nadstavba', 'Baráž'];
    const activeTeams = teamsData.filter(t => !t.isArchived);

    modal.innerHTML = `
        <div class="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-[#1e307d] bg-[#0e1a4f] p-6 shadow-2xl text-white overflow-hidden">
            <!-- Záhlaví -->
            <div class="flex items-center justify-between pb-4 border-b border-[#1e307d]">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 bg-[#13236b] rounded-xl text-[#aefb12] border border-[#1e307d]">
                        <i class="fa-solid fa-chart-column text-xl"></i>
                    </div>
                    <div>
                        <h2 class="text-lg font-black tracking-wide text-white">Přehled Hráčských Statistik</h2>
                        <p class="text-xs text-gray-400">Zobrazeni jsou pouze hráči s alespoň 1 zápisem ve statistikách</p>
                    </div>
                </div>
                <button onclick="closeStatsModal()" class="p-2 text-gray-400 hover:text-white hover:bg-[#13236b] rounded-lg transition">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>

            <!-- Filtry -->
            <div class="flex flex-wrap items-center gap-4 py-3 border-b border-[#1e307d]/50 bg-[#13236b]/30 -mx-6 px-6">
                <div class="flex items-center gap-2 text-xs">
                    <label class="font-bold text-gray-300"><i class="fa-solid fa-trophy mr-1 text-[#aefb12]"></i> Soutěž:</label>
                    <select id="stats-modal-comp-filter" onchange="handleStatsModalFilterChange()" class="bg-[#0e1a4f] border border-[#1e307d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#aefb12]">
                        <option value="all" ${statsModalState.selectedCompetition === 'all' ? 'selected' : ''}>Všechny soutěže</option>
                        ${competitions.map(comp => `<option value="${comp}" ${statsModalState.selectedCompetition === comp ? 'selected' : ''}>${comp}</option>`).join('')}
                    </select>
                </div>

                <div class="flex items-center gap-2 text-xs">
                    <label class="font-bold text-gray-300"><i class="fa-solid fa-shield-halved mr-1 text-[#05fda3]"></i> Tým:</label>
                    <select id="stats-modal-team-filter" onchange="handleStatsModalFilterChange()" class="bg-[#0e1a4f] border border-[#1e307d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#aefb12]">
                        <option value="all" ${statsModalState.selectedTeamId === 'all' ? 'selected' : ''}>Všechny týmy</option>
                        ${activeTeams.map(t => `<option value="${t.id}" ${String(statsModalState.selectedTeamId) === String(t.id) ? 'selected' : ''}>${escapeTeamName(t.name)}</option>`).join('')}
                    </select>
                </div>

                <div class="ml-auto text-xs text-gray-400 font-mono">
                    Nalezeno hráčů: <span class="font-bold text-[#aefb12]">${filtered.length}</span>
                </div>
            </div>

            <!-- Tabulka statistik -->
            <div class="overflow-y-auto flex-1 my-2 pr-1">
                <table class="w-full text-left text-xs border-collapse">
                    <thead class="sticky top-0 bg-[#0e1a4f] z-10 border-b border-[#1e307d] text-gray-400 font-bold uppercase text-[11px]">
                        <tr>
                            <th class="py-3 px-2">Hráč</th>
                            <th class="py-3 px-2">Tým</th>
                            ${STAT_CATEGORIES.map(cat => {
                                const isActive = sortKey === cat.key;
                                const arrow = isActive ? (sortAscending ? ' <i class="fa-solid fa-arrow-up text-[#aefb12] ml-1"></i>' : ' <i class="fa-solid fa-arrow-down text-[#aefb12] ml-1"></i>') : '';
                                return `
                                    <th class="py-3 px-2 text-center cursor-pointer hover:text-white transition select-none ${isActive ? 'text-[#aefb12] bg-[#13236b]/40 rounded-t-lg' : ''}" onclick="toggleStatsModalSort('${cat.key}')">
                                        <i class="fa-solid ${cat.icon} mr-1${cat.color}"></i>${cat.label}${arrow}
                                    </th>
                                `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[#1e307d]/40">
                        ${filtered.length > 0 ? filtered.map((item, idx) => {
                            const team = teamsData.find(t => t.id === item.player.teamId);
                            return `
                                <tr class="hover:bg-[#13236b]/40 transition">
                                    <td class="py-2.5 px-2 font-bold text-white flex items-center gap-2">
                                        <span class="text-gray-500 font-mono w-5 text-right text-[10px]">${idx + 1}.</span>${escapeTeamName(item.player.robloxNick)}
                                    </td>
                                    <td class="py-2.5 px-2 text-gray-300">
                                        ${team ? `<div class="flex items-center gap-1.5">${getTeamLogoMarkup(team)}<span>${escapeTeamName(team.name)}</span></div>` : '<span class="text-gray-500">Bez týmu</span>'}
                                    </td>
                                    ${STAT_CATEGORIES.map(cat => `
                                        <td class="py-2.5 px-2 text-center font-bold ${sortKey === cat.key ? 'text-[#aefb12] bg-[#aefb12]/5' : (item[cat.key] > 0 ? 'text-gray-200' : 'text-gray-600')}">
                                            ${item[cat.key]}
                                        </td>
                                    `).join('')}
                                </tr>
                            `;
                        }).join('') : `
                            <tr>
                                <td colspan="7" class="py-10 text-center text-gray-500">
                                    Žádní hráči neodpovídají zvolenému filtru nebo nemají v této soutěži žádný zápis.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

export function renderDashboard() {
    const welcome = document.getElementById('dashboard-welcome');
    if (welcome) {
        const username = state.currentUser?.username;
        welcome.textContent = username ? `Vítej, ${username}!` : 'Vítej!';
    }
    const list = document.getElementById('dashboard-matches-list');
    
    const pStat = document.getElementById('dash-stat-players');
    const rStat = document.getElementById('dash-stat-referees');
    const tStat = document.getElementById('dash-stat-teams');

    if (pStat) pStat.textContent = `${playersData.filter(player => !player.isArchived).length} Hráčů`;
    if (rStat) rStat.textContent = `${refereesData.length} Rozhodčích`;
    if (tStat) tStat.textContent = `${teamsData.length} Klubů`;

    if (!list) return;
    renderDashboardLeaderboards();

    if (matchesData.length === 0) {
        list.innerHTML = `<div class="p-6 bg-[#0e1a4f] rounded-xl border border-[#1e307d] text-center text-gray-400 text-xs">V systému zatím nejsou žádná zápasy. Nová utkání vytvoříte v sekci Administrace.</div>`;
        return;
    }

    list.innerHTML = matchesData.map(m => {
        const home = teamsData.find(t => t.id === m.homeTeamId);
        const away = teamsData.find(t => t.id === m.awayTeamId);

        const d = (m.matchDate && m.matchDate !== 'TBA') ? new Date(m.matchDate) : null;
        const dateFormatted = m.matchDate === 'TBA' ? 'TBA' : (d ? `${d.getDate()}.${d.getMonth() + 1}.` : 'TBD');
        const timeFormatted = m.matchDate === 'TBA' ? 'TBA' : (d ? d.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'}) : 'TBD');
        const stadiumFormatted = m.stadium || 'Stadion neuveden';

        return `
            <div class="bg-[#0e1a4f] p-4 rounded-xl border border-[#1e307d] flex flex-col sm:flex-row justify-between items-center gap-4 shadow-md hover:border-[#aefb12]/50 transition">
                <div class="flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-start">
                    <div class="flex items-center justify-end gap-2 w-32 font-bold text-sm truncate text-white">${home ? `${getTeamLogoMarkup(home)}<span class="truncate">${escapeTeamName(home.name)}</span>` : ''}</div>
                    <div class="px-3 py-1 bg-[#13236b] rounded-lg text-[#aefb12] font-mono font-black text-sm border border-[#1e307d]">
                        ${m.status === 'Completed' || m.status === 'In_Progress' ? `${m.homeScore} :${m.awayScore}` : (m.status === 'Postponed' ? 'Odloženo' : 'VS')}
                    </div>
                    <div class="flex items-center gap-2 w-32 font-bold text-sm truncate text-white">${away ? `${getTeamLogoMarkup(away)}<span class="truncate">${escapeTeamName(away.name)}</span>` : ''}</div>
                </div>
                <div class="flex flex-col sm:flex-row items-end sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 text-xs text-right sm:text-left">
                    <div class="text-gray-300 font-medium">
                        <div><i class="fa-regular fa-calendar mr-1 text-[#aefb12]"></i> ${dateFormatted} ${timeFormatted}</div>
                        <div class="text-[11px] text-gray-400"><i class="fa-solid fa-location-dot mr-1 text-[#05fda3]"></i> ${stadiumFormatted}</div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${m.status === 'Completed' ? 'bg-gray-800 text-gray-300' : (m.status === 'Postponed' ? 'bg-amber-500/20 text-amber-300' : 'bg-[#aefb12]/20 text-[#aefb12]')}">
                            ${getMatchStatusLabel(m.status)}
                        </span>
                        <button onclick="openMatchProtocol(${m.id})" class="px-3 py-1 bg-[#aefb12] hover:bg-opacity-90 text-[#13236b] font-black rounded-lg transition">
                            Zápis Utkání
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}