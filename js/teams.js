/**
 * CVFL Portál - Týmy, Soupiska Hráčů a Hráčské Karty
 */

import { state, teamsData, playersData, trainersData, matchesData } from './state.js';
import { openModal, closeSpecificModal } from './ui.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';

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

    const content = document.getElementById('player-card-content');
    content.innerHTML = `
        <div class="bg-gradient-to-r from-[#13236b] to-[#0e1a4f] p-6 border-b border-[#aefb12]/30 flex justify-between items-start">
            <div>
                <span class="text-xs text-[#aefb12] font-bold uppercase">${escapeTeamName(team ? team.name : 'Bez klubu')}</span>
                <h2 class="text-2xl font-black text-white mt-1">${escapeTeamName(player.robloxNick)}</h2>
                ${player.isArchived ? '<span class="mt-2 inline-flex rounded border border-gray-500/40 bg-gray-500/10 px-2 py-1 text-[10px] font-bold uppercase text-gray-300">Archivovaný hráč</span>' : ''}
            </div>
            <button onclick="closeSpecificModal('modal-player-card')" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div class="p-6 space-y-4 text-xs">
            <div>Discord Username: <strong>${escapeTeamName(player.discordNick)}</strong></div>

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
        </div>
    `;

    openModal('modal-player-card');
}
