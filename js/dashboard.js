/**
 * CVFL Portál - Přehled a Dashboard Statistiky
 */

import { state, playersData, refereesData, teamsData, matchesData } from './state.js';
import { getMatchStatusLabel } from './match-status.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';
import { compareTeams1Liga } from './competitions.js';

const STAT_CATEGORIES = [
    { key: 'goals', label: 'Góly', icon: 'fa-futbol', color: 'text-[#aefb12]' },
    { key: 'assists', label: 'Asistence', icon: 'fa-handshake', color: 'text-[#05fda3]' },
    { key: 'cleanSheets', label: 'Čistá konta', icon: 'fa-shield-halved', color: 'text-amber-400' },
    { key: 'yellowCards', label: 'Žluté karty', icon: 'fa-square', color: 'text-yellow-300', cell: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/40' },
    { key: 'redCards', label: 'Červené karty', icon: 'fa-square', color: 'text-red-400', cell: 'bg-red-500/20 text-red-200 border-red-400/40' }
];
STAT_CATEGORIES[0].cell = 'bg-lime-500/15 text-lime-200 border-lime-400/30';
STAT_CATEGORIES[1].cell = 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
STAT_CATEGORIES[2].cell = 'bg-amber-500/15 text-amber-200 border-amber-400/30';

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

    const getOrCreatePlayerStats = playerId => {
        const player = playersData.find(item => Number(item.id) === Number(playerId));
        if (!player) return null;
        if (!playerStatsMap.has(player.id)) {
            playerStatsMap.set(player.id, {
                player,
                matchesPlayed: 0,
                goals: 0,
                assists: 0,
                cleanSheets: 0,
                yellowCards: 0,
                redCards: 0
            });
        }
        return playerStatsMap.get(player.id);
    };

    const addStat = (playerId, key) => {
        const stats = getOrCreatePlayerStats(playerId);
        if (stats) stats[key] += 1;
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
        const appearances = new Set();
        [...(match.homeRoster || []), ...(match.awayRoster || [])]
            .filter(player => player.isStarter)
            .forEach(player => appearances.add(Number(player.playerId)));
        events.forEach(event => {
            if (event.type === 'Substitution') {
                if (event.playerInId != null) appearances.add(Number(event.playerInId));
                if (event.playerOutId != null) appearances.add(Number(event.playerOutId));
            }
            if (event.targetType !== 'staff' && event.playerId != null) appearances.add(Number(event.playerId));
            if (event.type === 'Goal' && event.goalType === 'Regular' && event.secondaryPlayerId != null) {
                appearances.add(Number(event.secondaryPlayerId));
            }
        });
        appearances.forEach(playerId => {
            if (!Number.isFinite(playerId)) return;
            const stats = getOrCreatePlayerStats(playerId);
            if (stats) stats.matchesPlayed++;
        });

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

window.openStatsModal = function(statKey = 'goals', { updateHistory = true } = {}) {
    if (window.location.pathname !== '/statistiky-hracu') {
        if (updateHistory) {
            window.history.pushState({ cvflPlayerStats: true }, '', '/statistiky-hracu');
        } else {
            window.history.replaceState({ cvflPlayerStats: true }, '', '/statistiky-hracu');
        }
    }
    statsModalState.sortKey = statKey;
    statsModalState.sortAscending = false;
    renderStatsModal();
};

window.closeStatsModal = function() {
    if (window.location.pathname === '/statistiky-hracu') {
        if (window.history.state?.cvflDirectStatsEntry) {
            window.history.replaceState(null, '', '/statistiky');
            hideStatsPage();
            window.switchTab('dashboard', { updateHistory: false });
            return;
        }
        window.history.back();
        return;
    }
    hideStatsPage();
};

function hideStatsPage() {
    const modal = document.getElementById('stats-modal-overlay');
    if (modal) modal.remove();
}

window.closeStatsPageFromHistory = hideStatsPage;

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
        modal.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-[#0e1a4f]';
        document.body.appendChild(modal);
    }

    const allStats = collectFilteredPlayerStats(statsModalState.selectedCompetition);

    // Include every player who appeared, even without an individual scoring event.
    let filtered = allStats.filter(item => {
        if (item.matchesPlayed < 1) return false;

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
        <div class="relative flex h-full w-full flex-col overflow-hidden bg-[#0e1a4f] p-3 text-white sm:p-6 lg:p-8">
            <!-- Záhlaví -->
            <div class="flex items-center justify-between pb-4 border-b border-[#1e307d]">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 bg-[#13236b] rounded-xl text-[#aefb12] border border-[#1e307d]">
                        <i class="fa-solid fa-chart-column text-xl"></i>
                    </div>
                    <div>
                        <h2 class="text-lg font-black tracking-wide text-white">Přehled Hráčských Statistik</h2>
                        <p class="text-xs text-gray-400">Zobrazeni jsou hráči s alespoň jedním odehraným zápasem</p>
                    </div>
                </div>
                <button onclick="closeStatsModal()" class="flex shrink-0 items-center gap-2 rounded-lg border border-[#1e307d] px-3 py-2 text-sm font-bold text-gray-200 transition hover:bg-[#13236b] hover:text-white">
                    <i class="fa-solid fa-arrow-left"></i><span>Zpět</span>
                </button>
            </div>

            <!-- Filtry -->
            <div class="flex flex-wrap items-center gap-3 border-b border-[#1e307d]/50 bg-[#13236b]/30 py-3 sm:gap-4 sm:px-2">
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
            <div class="overflow-auto flex-1 my-2 pr-1">
                <table class="w-full min-w-[46rem] text-left text-xs border-collapse">
                    <thead class="sticky top-0 bg-[#0e1a4f] z-10 border-b border-[#1e307d] text-gray-400 font-bold uppercase text-[11px]">
                        <tr>
                            <th class="py-3 px-2">Hráč</th>
                            <th class="py-3 px-2">Tým</th>
                            <th class="py-3 px-2 text-center">Z</th>
                            ${STAT_CATEGORIES.map(cat => {
                                const isActive = sortKey === cat.key;
                                const arrow = isActive ? (sortAscending ? ' <i class="fa-solid fa-arrow-up text-[#aefb12] ml-1"></i>' : ' <i class="fa-solid fa-arrow-down text-[#aefb12] ml-1"></i>') : '';
                                return `
                                    <th scope="col" class="py-3 px-2 text-center cursor-pointer hover:text-white transition select-none ${cat.color} ${isActive ? 'bg-[#13236b]/70 rounded-t-lg' : 'bg-[#13236b]/35'}" onclick="toggleStatsModalSort('${cat.key}')">
                                        <i class="fa-solid ${cat.icon} ${cat.color} mr-2"></i> ${cat.label}${arrow}
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
                                    <td class="py-2.5 px-2 text-center font-mono text-gray-300">${item.matchesPlayed}</td>
                                    ${STAT_CATEGORIES.map(cat => `
                                        <td class="border-x border-[#0e1a4f] py-2.5 px-2 text-center font-bold ${cat.cell}">
                                            ${item[cat.key]}
                                        </td>
                                    `).join('')}
                                </tr>
                            `;
                        }).join('') : `
                            <tr>
                                <td colspan="8" class="py-10 text-center text-gray-500">
                                    Žádní hráči s odehraným zápasem neodpovídají zvolenému filtru.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderDashboardLeagueTables() {
    const leagues = [
        { id: 'dashboard-league-1-table', key: '1_Liga', tab: 'liga1', title: 'CVFL 1. Liga', accent: '#aefb12' },
        { id: 'dashboard-league-2-table', key: '2_Liga', tab: 'liga2', title: 'CVFL 2. Liga', accent: '#05fda3' }
    ];
    leagues.forEach(league => {
        const container = document.getElementById(league.id);
        if (!container) return;
        const teams = teamsData.filter(team => team.league === league.key).map(team => ({
            ...team,
            finalPoints: team.basePoints - team.deducted
        }));
        teams.sort(league.key === '1_Liga'
            ? compareTeams1Liga
            : (a, b) => b.finalPoints - a.finalPoints);
        container.innerHTML = `
            <section class="h-full rounded-xl border border-[#1e307d] bg-[#0e1a4f] p-4 shadow-md">
                <div class="mb-3 flex items-center justify-between gap-3 border-b border-[#1e307d] pb-2">
                    <h2 class="font-bold text-lg" style="color:${league.accent}">${league.title} · Top 4</h2>
                    <button type="button" aria-label="Otevřít hlavní tabulku" title="Otevřít hlavní tabulku" onclick="switchTab('competitions'); switchCompTab('${league.tab}')" class="shrink-0 rounded-lg p-2 text-[#aefb12] transition hover:bg-[#aefb12]/10" ><i class="fa-solid fa-up-right-from-square"></i></button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead class="text-[10px] uppercase text-gray-400">
                            <tr><th class="p-2 text-center">#</th><th class="p-2">Tým</th><th class="p-2 text-center">Z</th><th class="p-2 text-center">Skóre</th><th class="p-2 text-right">Body</th></tr>
                        </thead>
                        <tbody class="divide-y divide-[#1e307d]">
                            ${teams.slice(0, 4).map((team, index) => `
                                <tr class="hover:bg-[#13236b]/60">
                                    <td class="p-2 text-center font-mono text-gray-400">${index + 1}.</td>
                                    <td class="p-2 font-bold text-white">${getTeamLogoMarkup(team)}${escapeTeamName(team.name)}</td>
                                    <td class="p-2 text-center text-gray-300">${team.played}</td>
                                    <td class="p-2 text-center font-mono text-gray-300">${team.gf}:${team.ga}</td>
                                    <td class="p-2 text-right font-black" style="color:${league.accent}">${team.finalPoints}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" class="p-3 text-center text-gray-500">Tabulka zatím není k dispozici.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>`;
    });
}

function renderDashboardMatchCards(matchList) {
    return matchList.map(m => {
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

    renderDashboardLeaderboards();
    renderDashboardLeagueTables();
    if (matchesData.length === 0) {
        if (list) list.innerHTML = `<div class="p-6 bg-[#0e1a4f] rounded-xl border border-[#1e307d] text-center text-gray-400 text-xs">V systému zatím nejsou žádná zápasy. Nová utkání vytvoříte v sekci Administrace.</div>`;
        return;
    }

    const upcomingMatches = matchesData
        .filter(match => match.status === 'Scheduled')
        .sort((a, b) => {
            const dateA = a.matchDate && a.matchDate !== 'TBA' ? Date.parse(a.matchDate) : Number.POSITIVE_INFINITY;
            const dateB = b.matchDate && b.matchDate !== 'TBA' ? Date.parse(b.matchDate) : Number.POSITIVE_INFINITY;
            return dateA - dateB || Number(a.id) - Number(b.id);
        })
        .slice(0, 3);
    if (list) {
        list.innerHTML = upcomingMatches.length
            ? renderDashboardMatchCards(upcomingMatches)
            : '<div class="rounded-xl border border-[#1e307d] bg-[#0e1a4f] p-6 text-center text-sm text-gray-400">Žádná další utkání zatím nejsou naplánována.</div>';
    }
}