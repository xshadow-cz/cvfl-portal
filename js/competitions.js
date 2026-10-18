/**
 * CVFL Portál - Soutěže, Tabulky a Pravidla Pořadí
 */

import { state, teamsData, matchesData } from './state.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';

export function switchCompTab(comp) {
    state.activeCompTab = comp;
    ['liga1', 'liga2', 'nadstavba', 'baraz', 'molcup'].forEach(c => {
        const btn = document.getElementById(`comp-btn-${c}`);
        if (btn) {
            if (c === comp) {
                if (c === 'liga1') btn.className = "px-4 py-2 font-black text-sm rounded-lg bg-[#aefb12] text-[#13236b] shadow";
                if (c === 'liga2') btn.className = "px-4 py-2 font-black text-sm rounded-lg bg-[#05fda3] text-[#13236b] shadow";
                if (c === 'nadstavba') btn.className = "px-4 py-2 font-black text-sm rounded-lg bg-[#1e307d] text-white shadow";
                if (c === 'baraz') btn.className = "px-4 py-2 font-black text-sm rounded-lg bg-[#1e307d] text-white shadow";
                if (c === 'molcup') btn.className = "px-4 py-2 font-black text-sm rounded-lg bg-[#f33332] text-white shadow";
            } else {
                const isHidden = btn.classList.contains('hidden');
                btn.className = `px-4 py-2 font-bold text-sm rounded-lg ${c === 'molcup' ? 'text-[#f33332] hover:bg-[#f33332]/15' : 'text-gray-300 hover:bg-[#1e307d]'} ${isHidden ? 'hidden' : ''}`;
            }
        }
    });
    renderCompetitions();
}

export function compareTeams1Liga(a, b) {
    if (b.finalPoints !== a.finalPoints) return b.finalPoints - a.finalPoints;

    // Vyšší počet bodů získaný v základní části
    if (b.basePoints !== a.basePoints) return b.basePoints - a.basePoints;

    // Vzájemná utkání v základní části
    let aHeadPoints = 0, bHeadPoints = 0;
    let aHeadGf = 0, bHeadGf = 0;
    let aHeadGa = 0, bHeadGa = 0;

    matchesData.filter(m => m.status === 'Completed' && m.competition === 'CVFL 1. Liga').forEach(m => {
        if ((m.homeTeamId === a.id && m.awayTeamId === b.id) || (m.homeTeamId === b.id && m.awayTeamId === a.id)) {
            let aScore = m.homeTeamId === a.id ? m.homeScore : m.awayScore;
            let bScore = m.homeTeamId === b.id ? m.homeScore : m.awayScore;

            aHeadGf += aScore; aHeadGa += bScore;
            bHeadGf += bScore; bHeadGa += aScore;

            if (aScore > bScore) aHeadPoints += 3;
            else if (bScore > aScore) bHeadPoints += 3;
            else { aHeadPoints += 1; bHeadPoints += 1; }
        }
    });

    // Vyšší počet bodů ze vzájemných utkání
    if (bHeadPoints !== aHeadPoints) return bHeadPoints - aHeadPoints;

    // Brankový rozdíl ze vzájemných utkání
    let aHeadDiff = aHeadGf - aHeadGa;
    let bHeadDiff = bHeadGf - bHeadGa;
    if (bHeadDiff !== aHeadDiff) return bHeadDiff - aHeadDiff;

    // Vyšší počet vstřelených branek ve vzájemných utkáních
    if (bHeadGf !== aHeadGf) return bHeadGf - aHeadGf;

    // Vyšší brankový rozdíl ze všech utkání v celé soutěži
    let aDiff = a.gf - a.ga;
    let bDiff = b.gf - b.ga;
    if (bDiff !== aDiff) return bDiff - aDiff;

    // Vyšší počet vstřelených branek v celé soutěži
    if (b.gf !== a.gf) return b.gf - a.gf;

    // Los z důvodu statistik proveden pouze v případě, že všechny týmy v soutěži mají odehraných 14 utkání
    const leagueTeams = teamsData.filter(t => t.league === a.league);
    const allHave14Matches = leagueTeams.every(t => t.played >= 14);

    if (allHave14Matches) {
        if (!a._randomOrder) a._randomOrder = Math.random();
        if (!b._randomOrder) b._randomOrder = Math.random();
        return a._randomOrder - b._randomOrder;
    }

    return 0;
}

export function renderCompetitions() {
    const container = document.getElementById('comp-view-container');
    if (!container) return;

    if (state.activeCompTab === 'liga1' || state.activeCompTab === 'liga2') {
        const targetLeague = state.activeCompTab === 'liga1' ? '1_Liga' : '2_Liga';
        const accentColor = state.activeCompTab === 'liga1' ? '#aefb12' : '#05fda3';
        
        let teams = teamsData.filter(t => t.league === targetLeague).map(t => ({
            ...t,
            finalPoints: t.basePoints - t.deducted
        }));

        if (state.activeCompTab === 'liga1') {
            teams.sort(compareTeams1Liga);
        } else {
            teams.sort((a, b) => b.finalPoints - a.finalPoints);
        }

        const tableRows = Array.from({ length: 8 }, (_, index) => teams[index] || null);
        const deductedTeams = teams.filter(t => t.deducted > 0);

        container.innerHTML = `
            <div class="flex justify-between items-center mb-4 border-b border-[#1e307d] pb-3">
                <h3 class="font-black text-lg" style="color: ${accentColor}">Tabulka ${state.activeCompTab === 'liga1' ? 'CVFL 1. Liga' : 'CVFL 2. Liga'}</h3>
                <span class="text-xs text-gray-400">Základní část (14 kol)</span>
            </div>
            <table class="w-full text-xs text-left">
                <thead class="bg-[#13236b] text-gray-300 uppercase">
                    <tr>
                        <th class="p-2.5 text-center">#</th>
                        <th class="p-2.5">Tým</th>
                        <th class="p-2.5 text-center">Z</th>
                        <th class="p-2.5 text-center">V</th>
                        <th class="p-2.5 text-center">R</th>
                        <th class="p-2.5 text-center">P</th>
                        <th class="p-2.5 text-center">Skóre</th>
                        <th class="p-2.5 text-right font-black" style="color: ${accentColor}">Body</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-[#1e307d]">
                    ${tableRows.map((t, idx) => {
                        let badgeStyle = '';
                        if (t && state.activeCompTab === 'liga1' && idx < 4) {
                            badgeStyle = 'background-color: #aefb12; color: #13236b;';
                        } else if (t && state.activeCompTab === 'liga1' && idx >= 4) {
                            badgeStyle = 'background-color: #f33332; color: #ffffff;';
                        } else if (t && state.activeCompTab === 'liga2' && idx === 0) {
                            badgeStyle = 'background-color: #aefb12; color: #13236b;';
                        } else if (t && state.activeCompTab === 'liga2' && idx < 3) {
                            badgeStyle = 'background-color: #05fda3; color: #13236b;';
                        }
                        return `
                        <tr class="hover:bg-[#13236b]/60 ${t ? '' : 'h-11'}">
                            <td class="p-2.5 text-center font-bold">
                                <span class="inline-flex min-w-6 h-6 items-center justify-center gap-0.5 rounded-full bg-[#13236b] px-1 text-center text-gray-300" style="${badgeStyle}">
                                    ${idx + 1}
                                </span>
                            </td>
                            <td class="p-2.5 font-bold text-white ${t ? 'cursor-pointer hover:underline' : ''}" ${t ? `onclick="switchTab('teams'); selectTeam(${t.id});"` : ''}>
                                ${t ? `<span class="inline-flex items-center gap-2">${getTeamLogoMarkup(t)}${escapeTeamName(t.name)}</span>` : '<span class="text-gray-700">—</span>'}
                            </td>
                            <td class="p-2.5 text-center text-gray-400">${t?.played ?? ''}</td>
                            <td class="p-2.5 text-center font-bold" style="color: ${accentColor}">${t?.won ?? ''}</td>
                            <td class="p-2.5 text-center text-gray-400">${t?.drawn ?? ''}</td>
                            <td class="p-2.5 text-center text-[#f33332]">${t?.lost ?? ''}</td>
                            <td class="p-2.5 text-center font-mono text-gray-300">${t ? `${t.gf}:${t.ga}` : ''}</td>
                            <td class="p-2.5 text-right font-black text-sm" style="color: ${accentColor}">${t?.finalPoints ?? ''}</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            ${state.activeCompTab === 'liga1' ? `
                <div class="mt-4 pt-3 border-t border-[#1e307d] space-y-1 text-xs">
                    <div class="flex items-center space-x-2 text-gray-300">
                        <span class="w-3 h-3 rounded-full bg-[#aefb12] inline-block"></span>
                        <span>Skupina o titul</span>
                    </div>
                    <div class="flex items-center space-x-2 text-gray-300">
                        <span class="w-3 h-3 rounded-full bg-[#f33332] inline-block"></span>
                        <span>Skupina o udržení</span>
                    </div>
                </div>
            ` : ''}

            ${state.activeCompTab === 'liga2' ? `
                <div class="mt-4 pt-3 border-t border-[#1e307d] space-y-1 text-xs">
                    <div class="flex items-center space-x-2 text-gray-300">
                        <span class="w-3 h-3 rounded-full bg-[#aefb12] inline-block"></span>
                        <span>Postup</span>
                    </div>
                    <div class="flex items-center space-x-2 text-gray-300">
                        <span class="w-3 h-3 rounded-full bg-[#05fda3] inline-block"></span>
                        <span>Baráž o postup</span>
                    </div>
                </div>
            ` : ''}

            ${deductedTeams.length > 0 ? `
                <div class="mt-4 pt-3 border-t border-[#1e307d] space-y-1.5 text-xs">
                    ${deductedTeams.map(dt => `
                        <div class="flex items-center justify-between text-gray-300">
                            <div class="flex items-center space-x-2">
                                <i class="fa-regular fa-circle-question text-gray-400"></i>
                                <span class="font-bold text-white">${escapeTeamName(dt.name)}: <span class="text-[#f33332]">-${dt.deducted} bodů</span> <span class="text-gray-400 font-normal">(${escapeTeamName(dt.deductionReason || 'Rozhodnutí svazu')})</span></span>
                            </div>
                            ${['Admin', 'DK'].includes(state.currentUserRole) ? `
                            <button onclick="cancelPointsDeductionWithConfirm(${dt.id})" class="px-2 py-0.5 bg-[#f33332]/20 hover:bg-[#f33332] text-[#f33332] hover:text-white rounded text-[10px] font-bold border border-[#f33332]/30 transition">Zrušit odečet</button>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    } else if (state.activeCompTab === 'nadstavba') {
        const renderGroup = (title, { dangerType = '', highlightWinner = false } = {}) => `
            <section class="overflow-hidden rounded-xl border border-[#1e307d] bg-[#13236b]/60">
                <div class="flex items-center justify-between border-b border-[#1e307d] px-4 py-3">
                    <h3 class="font-black text-sm text-white">${title}</h3>
                    <span class="text-[10px] text-gray-400">4 týmy</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full min-w-[36rem] text-xs text-left">
                        <thead class="bg-[#13236b] text-gray-300 uppercase"><tr>
                            <th class="p-2.5 text-center">#</th><th class="p-2.5">Tým</th>
                            <th class="p-2.5 text-center">Z</th><th class="p-2.5 text-center">V</th>
                            <th class="p-2.5 text-center">R</th><th class="p-2.5 text-center">P</th>
                            <th class="p-2.5 text-center">Skóre</th><th class="p-2.5 text-right">Body</th>
                        </tr></thead>
                        <tbody class="divide-y divide-[#1e307d]">
                            ${Array.from({ length: 4 }, (_, index) => `
                                <tr>
                                    <td class="p-2.5 text-center"><span class="inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1 ${dangerType === 'relegation' && index === 3 ? 'bg-red-600/30 text-red-300' : dangerType === 'relegation' && index > 0 ? 'bg-red-500/20 text-red-300' : highlightWinner && index === 0 ? 'bg-[#0e1a4f] text-amber-300' : 'bg-[#0e1a4f] text-gray-400'}">${index + 1}${highlightWinner && index === 0 ? ' <i class="fa-solid fa-trophy text-amber-300"></i>' : ''}</span></td>
                                    <td class="h-10 p-2.5 text-gray-700">—</td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </section>`;
        container.innerHTML = `
            <div class="space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e307d] pb-3">
                    <h3 class="font-black text-xl text-white">Nadstavba</h3>
                </div>
                ${renderGroup('Skupina o titul', { highlightWinner: true })}
                ${renderGroup('Skupina o udržení', { dangerType: 'relegation' })}
                <div class="flex flex-wrap gap-4 border-t border-[#1e307d] pt-3 text-xs text-gray-300">
                    <span class="inline-flex items-center gap-2"><i class="fa-solid fa-square text-red-500"></i> Místa 2–3: baráž</span>
                    <span class="inline-flex items-center gap-2"><i class="fa-solid fa-square text-red-700"></i> Místo 4: sestup</span>
                </div>
            </div>`;
    } else if (state.activeCompTab === 'baraz') {
        const playoffMatches = matchesData.filter(match =>
            match.competition === 'Baráž o 1. Ligu' && match.cupStage === 'Semifinále'
        );
        const ties = new Map();
        playoffMatches.forEach(match => {
            const key = [match.homeTeamId, match.awayTeamId].sort((a, b) => a - b).join(':');
            if (!ties.has(key)) ties.set(key, []);
            ties.get(key).push(match);
        });
        const fixtures = [...ties.values()].slice(0, 2);
        while (fixtures.length < 2) fixtures.push([]);
        const renderLeg = (leg, legNumber) => {
            if (!leg) return `<div class="text-gray-600">${legNumber}. zápas —</div>`;
            const home = teamsData.find(team => team.id === leg.homeTeamId);
            const away = teamsData.find(team => team.id === leg.awayTeamId);
            const played = ['Completed', 'In_Progress'].includes(leg.status);
            return `<div class="flex items-center justify-between gap-2 text-[11px] ${played ? 'text-gray-200' : 'text-gray-500'}">
                <span class="truncate">${legNumber}. ${escapeTeamName(home?.name || 'Čeká se na tým')} – ${escapeTeamName(away?.name || 'Čeká se na tým')}</span>
                <strong class="shrink-0">${played ? `${leg.homeScore}:${leg.awayScore}` : '—'}</strong>
            </div>`;
        };
        container.innerHTML = `
            <div class="space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#f33332]/40 pb-3">
                    <h3 class="font-black text-xl text-[#f33332]">BARÁŽ O 1. LIGU</h3>
                    <span class="text-xs text-gray-400">${playoffMatches.length} utkání · dvojzápasový systém</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${fixtures.map((tie, index) => {
                        const firstLeg = tie.find(match => Number(match.round) === 1);
                        const secondLeg = tie.find(match => Number(match.round) === 2);
                        const ids = tie[0] ? [tie[0].homeTeamId, tie[0].awayTeamId] : [];
                        const homeId = firstLeg?.homeTeamId ?? ids[0];
                        const awayId = firstLeg?.awayTeamId ?? ids[1];
                        const home = teamsData.find(team => team.id === homeId);
                        const away = teamsData.find(team => team.id === awayId);
                        const firstCompleted = firstLeg?.status === 'Completed';
                        const secondCompleted = secondLeg?.status === 'Completed';
                        const aggregateHome = firstLeg && secondLeg
                            ? (firstLeg.homeTeamId === homeId ? firstLeg.homeScore : firstLeg.awayScore) +
                                (secondLeg.homeTeamId === homeId ? secondLeg.homeScore : secondLeg.awayScore)
                            : '';
                        const aggregateAway = firstLeg && secondLeg
                            ? (firstLeg.homeTeamId === awayId ? firstLeg.homeScore : firstLeg.awayScore) +
                                (secondLeg.homeTeamId === awayId ? secondLeg.homeScore : secondLeg.awayScore)
                            : '';
                        const penaltiesDecide = secondCompleted && aggregateHome === aggregateAway &&
                            Number.isInteger(secondLeg?.homePenaltyScore) && Number.isInteger(secondLeg?.awayPenaltyScore) &&
                            secondLeg.homePenaltyScore !== secondLeg.awayPenaltyScore;
                        return `<section class="rounded-xl border border-[#f33332]/30 bg-[#13236b]/60 p-4 space-y-3">
                            <h4 class="text-center text-xs font-black uppercase tracking-wide text-[#f33332]">Baráž ${index + 1}</h4>
                            <div class="flex items-center justify-between gap-2 rounded-lg bg-[#0e1a4f] p-3 text-sm font-bold text-white">
                                <span class="inline-flex min-w-0 items-center gap-2">${getTeamLogoMarkup(home)}<span class="truncate">${escapeTeamName(home?.name || 'Čeká se na tým')}</span></span>
                                <span class="text-gray-500">vs</span>
                                <span class="inline-flex min-w-0 items-center gap-2"><span class="truncate">${escapeTeamName(away?.name || 'Čeká se na tým')}</span>${getTeamLogoMarkup(away)}</span>
                            </div>
                            <div class="space-y-2">${renderLeg(firstLeg, 1)}${renderLeg(secondLeg, 2)}</div>
                            <div class="flex justify-between border-t border-[#1e307d] pt-2 text-xs">
                                <span class="text-gray-400">Součet skóre</span>
                                <strong class="text-white">${firstCompleted || secondCompleted ? `${aggregateHome || 0} : ${aggregateAway || 0}` : '— : —'}</strong>
                            </div>
                            ${penaltiesDecide ? `<div class="text-center text-xs font-bold text-amber-300"><i class="fa-solid fa-bullseye mr-1"></i> Rozhodly penalty ${secondLeg.homePenaltyScore}:${secondLeg.awayPenaltyScore}</div>` : ''}
                            ${secondCompleted && aggregateHome === aggregateAway && !penaltiesDecide ? '<div class="text-center text-[10px] text-amber-300">Součet je nerozhodný — čeká se na penalty v odvetě.</div>' : ''}
                        </section>`;
                    }).join('')}
                </div>
            </div>`;
    } else if (state.activeCompTab === 'molcup') {
        const stages = [
            { name: 'Osmifinále', size: 8 },
            { name: 'Čtvrtfinále', size: 4 },
            { name: 'Semifinále', size: 2 },
            { name: 'Finále', size: 1 }
        ];
        const cupMatches = matchesData
            .filter(match => match.competition === 'MOL Cup')
            .sort((a, b) => a.id - b.id);
        const stageMatches = new Map(stages.map(stage => [
            stage.name,
            cupMatches.filter(match => match.cupStage === stage.name)
        ]));

        container.innerHTML = `
            <div class="space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#f33332]/40 pb-3">
                    <h3 class="font-black text-xl text-[#f33332]">MOL CUP</h3>
                    <span class="text-xs text-gray-400">${cupMatches.length ? `${cupMatches.length} ${cupMatches.length === 1 ? 'utkání' : 'utkání'}` : 'Zatím nebyla zadána žádná utkání'}</span>
                </div>
                <div class="overflow-x-auto">
                <div class="grid min-w-[64rem] grid-cols-4 gap-4 items-stretch">
                    ${stages.map(stage => {
                        const matches = stageMatches.get(stage.name);
                        const rowsPerMatch = 8 / stage.size;
                        return `
                            <section class="min-w-0 flex flex-col rounded-xl border border-[#f33332]/30 bg-[#13236b]/60 p-3">
                                <h4 class="mb-3 text-center text-xs font-black uppercase tracking-wide text-[#f33332]">${stage.name}</h4>
                                <div class="grid h-[38rem] flex-1 grid-cols-1 gap-y-2" style="grid-template-rows: repeat(8, minmax(0, 1fr));">
                                    ${Array.from({ length: stage.size }, (_, index) => {
                                        const match = matches[index];
                                        const home = match && teamsData.find(team => team.id === match.homeTeamId);
                                        const away = match && teamsData.find(team => team.id === match.awayTeamId);
                                        const score = match && ['Completed', 'In_Progress'].includes(match.status);
                                        return `
                                            <div class="self-center rounded-lg border border-[#1e307d] bg-[#0e1a4f] p-2 text-xs" style="grid-row: ${index * rowsPerMatch + 1} / span ${rowsPerMatch};">
                                                <div class="mb-1 text-[9px] uppercase text-gray-500">${match ? `Utkání #${match.id}` : `Utkání ${index + 1}`}</div>
                                                <div class="flex justify-between gap-2 ${match ? 'text-white' : 'text-gray-600'}">
                                                    <span class="inline-flex min-w-0 items-center gap-2"><span>${getTeamLogoMarkup(home)}</span><span class="truncate">${escapeTeamName(home?.name || 'Čeká se na tým')}</span></span>
                                                    <strong>${score ? match.homeScore : '—'}</strong>
                                                </div>
                                                <div class="my-1 border-t border-[#1e307d]"></div>
                                                <div class="flex justify-between gap-2 ${match ? 'text-white' : 'text-gray-600'}">
                                                    <span class="inline-flex min-w-0 items-center gap-2"><span>${getTeamLogoMarkup(away)}</span><span class="truncate">${escapeTeamName(away?.name || 'Čeká se na tým')}</span></span>
                                                    <strong>${score ? match.awayScore : '—'}</strong>
                                                </div>
                                                ${match ? `<div class="mt-2 text-[10px] text-gray-400">${match.status === 'Completed' ? 'Odehráno' : match.status === 'In_Progress' ? 'Probíhá' : match.status === 'Postponed' ? 'Odloženo' : 'Naplánováno'}</div>` : ''}
                                            </div>`;
                                    }).join('')}
                                </div>
                            </section>`;
                    }).join('')}
                </div>
                </div>
            </div>`;
    }
}
