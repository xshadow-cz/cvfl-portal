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
    const competitionNames = [...new Set([
        'CVFL 1. Liga',
        'CVFL 2. Liga',
        'MOL Cup',
        'Baráž o 1. Ligu',
        ...matchesData.map(match => match.competition).filter(Boolean)
    ])];
    const statsByCompetition = new Map();
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

    completedMatches.forEach(match => {
        if (!statsByCompetition.has(match.competition)) statsByCompetition.set(match.competition, new Map());
        const competitionStats = statsByCompetition.get(match.competition);
        const events = Array.isArray(match.events) ? match.events : [];

        events.forEach(event => {
            if (event.type === 'Goal' && event.goalType !== 'Own') {
                addStat(competitionStats, event.playerId, 'goals');
                addStat(overallStats, event.playerId, 'goals');
            }
            if (event.type === 'Goal' && event.goalType === 'Regular' && event.secondaryPlayerId) {
                addStat(competitionStats, event.secondaryPlayerId, 'assists');
                addStat(overallStats, event.secondaryPlayerId, 'assists');
            }
            if (event.targetType === 'player' && event.playerId) {
                if (event.type === 'Yellow_Card' || event.type === 'Second_Yellow_Card') {
                    addStat(competitionStats, event.playerId, 'yellowCards');
                    addStat(overallStats, event.playerId, 'yellowCards');
                }
                if (event.type === 'Red_Card' || event.type === 'Second_Yellow_Card') {
                    addStat(competitionStats, event.playerId, 'redCards');
                    addStat(overallStats, event.playerId, 'redCards');
                }
            }
        });

        getMatchCleanSheetPlayerIds(match).forEach(playerId => {
            addStat(competitionStats, playerId, 'cleanSheets');
            addStat(overallStats, playerId, 'cleanSheets');
        });
    });

    return { competitionNames, statsByCompetition, overallStats };
}

function renderDashboardLeaderboards() {
    const container = document.getElementById('dashboard-stat-leaders');
    if (!container) return;

    const { competitionNames, statsByCompetition, overallStats } = collectLeaderboardStats();
    const groups = [
        ...competitionNames.map(name => [name, statsByCompetition.get(name)]),
        ['Celá liga · všechny soutěže', overallStats]
    ];

    container.innerHTML = STAT_CATEGORIES.map(category => `
        <section class="rounded-xl border border-[#1e307d] bg-[#13236b]/40 p-4 space-y-3">
            <h3 class="font-black text-sm ${category.color}">
                <i class="fa-solid ${category.icon} mr-2"></i>${category.label}
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
                            <h4 class="text-[11px] font-bold uppercase text-gray-400">${escapeTeamName(groupName)}</h4>
                            ${leaders.length ? `
                                <ol class="mt-1 space-y-1">
                                    ${leaders.map((item, index) => {
                                        const team = teamsData.find(candidate => candidate.id === item.player.teamId);
                                        return `<li class="flex items-center justify-between gap-3 text-xs">
                                            <span class="min-w-0 truncate text-gray-200">
                                                <span class="mr-1 font-mono text-gray-500">${index + 1}.</span>
                                                ${escapeTeamName(item.player.robloxNick)}
                                                ${team ? `<span class="text-gray-500">· ${escapeTeamName(team.name)}</span>` : ''}
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
                        ${m.status === 'Completed' || m.status === 'In_Progress' ? `${m.homeScore} : ${m.awayScore}` : (m.status === 'Postponed' ? 'Odloženo' : 'VS')}
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
