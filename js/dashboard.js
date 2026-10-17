/**
 * CVFL Portál - Přehled a Dashboard Statistiky
 */

import { state, playersData, refereesData, teamsData, matchesData } from './state.js';
import { getMatchStatusLabel } from './match-status.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';

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
