/**
 * CVFL Portál - Kontumace, Odložení a Přeložení Utkání
 */

import { teamsData, matchesData } from './state.js';
import { openModal, closeSpecificModal, showToast, openConfirmModal } from './ui.js';
import { logDKAction } from './disciplinary.js';
import { renderMatches } from './matches.js';
import { renderDashboard } from './dashboard.js';
import { escapeTeamName } from './team-logo.js';

function getRoundOptions(comp) {
    if (comp === 'MOL Cup') {
        return `
            <option value="Osmifinále">Osmifinále</option>
            <option value="Čtvrtfinále">Čtvrtfinále</option>
            <option value="Semifinále">Semifinále</option>
            <option value="Finále">Finále</option>
        `;
    }
    if (comp === 'Baráž o 1. Ligu') {
        return '<option value="1">Baráž — 1. zápas</option><option value="2">Baráž — odveta</option>';
    }
    return Array.from({ length: 14 }, (_, index) => `<option value="${index + 1}">${index + 1}. Kolo</option>`).join('');
}

function matchesForRound(comp, round) {
    return matchesData.filter(match => {
        if (match.competition !== comp) return false;
        if (comp === 'MOL Cup') return match.cupStage === round;
        return Number(match.round) === Number(round);
    });
}

export function openForfeitModal() {
    onForfeitCompChange();
    openModal('modal-forfeit');
}

export function onForfeitCompChange() {
    const compEl = document.getElementById('forfeit-comp-select');
    if (!compEl) return;
    const comp = compEl.value;
    const roundSelect = document.getElementById('forfeit-round-select');

    roundSelect.innerHTML = getRoundOptions(comp);
    onForfeitRoundChange();
}

export function onForfeitRoundChange() {
    const comp = document.getElementById('forfeit-comp-select').value;
    const roundVal = document.getElementById('forfeit-round-select').value;
    const matchSelect = document.getElementById('forfeit-match-select');

    const filtered = matchesForRound(comp, roundVal).filter(match => !match.isForfeited);

    if (filtered.length === 0) {
        matchSelect.innerHTML = `<option value="">Žádné zápasy pro toto kolo</option>`;
    } else {
        matchSelect.innerHTML = filtered.map(m => {
            const home = teamsData.find(t => t.id === m.homeTeamId);
            const away = teamsData.find(t => t.id === m.awayTeamId);
            return `<option value="${m.id}">${escapeTeamName(home ? home.name : '')} vs ${escapeTeamName(away ? away.name : '')}</option>`;
        }).join('');
    }
    updateForfeitTeamsOptions();
}

export function updateForfeitTeamsOptions() {
    const selectEl = document.getElementById('forfeit-match-select');
    if (!selectEl) return;
    const matchId = parseInt(selectEl.value);
    const winnerSelect = document.getElementById('forfeit-winner-team');

    const match = matchesData.find(m => m.id === matchId);
    if (match) {
        const home = teamsData.find(t => t.id === match.homeTeamId);
        const away = teamsData.find(t => t.id === match.awayTeamId);

        winnerSelect.innerHTML = `
            <option value="home">${escapeTeamName(home ? home.name : 'Domácí')}</option>
            <option value="away">${escapeTeamName(away ? away.name : 'Hosté')}</option>
        `;
    } else {
        winnerSelect.innerHTML = `<option value="">Vyberte zápas</option>`;
    }
}

export function executeForfeit() {
    const matchId = parseInt(document.getElementById('forfeit-match-select').value);
    const winner = document.getElementById('forfeit-winner-team').value;
    const reason = document.getElementById('forfeit-reason-input').value.trim();

    if (!reason) {
        showToast("Pro kontumaci zápasu musíte zadat odůvodnění!", true);
        return;
    }

    const match = matchesData.find(m => m.id === matchId);

    if (match) {
        match.status = 'Completed';
        match.isForfeited = true;
        match.forfeitWinner = winner;
        match.forfeitReason = reason;
        match.homeScore = winner === 'home' ? 3 : 0;
        match.awayScore = winner === 'away' ? 3 : 0;
        match.isLocked = true; // Automatické uzamčení kontumovaného zápasu

        logDKAction("KONTUMACE_UTKÁNÍ", `Zápas #${matchId}`, `Kontumováno (3:0 pro ${winner === 'home' ? 'domácí' : 'hosty'}). Zápis byl automaticky uzamčen. Důvod: ${reason}`);
        showToast("Utkání úspěšně skontumováno (3:0) a zápis uzamčen.");
        closeSpecificModal('modal-forfeit');
        renderMatches();
        renderDashboard();
    }
}

export function cancelForfeitWithConfirm(matchId) {
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;

    const home = teamsData.find(t => t.id === match.homeTeamId);
    const away = teamsData.find(t => t.id === match.awayTeamId);
    const matchName = `${home ? home.name : ''} vs ${away ? away.name : ''}`;

    openConfirmModal("Zrušit Kontumaci Utkání?", `Opravdu chcete zrušit kontumaci utkání ${matchName} a vrátit jej do plánovaného stavu?`, (reason) => {
        match.status = 'Scheduled';
        match.isForfeited = false;
        match.forfeitWinner = null;
        match.forfeitReason = null;
        match.homeScore = 0;
        match.awayScore = 0;
        match.isLocked = false;

        logDKAction("ZRUŠENÍ_KONTUMACE", matchName, `Kontumace utkání byla zrušena. Důvod: ${reason}`);
        showToast(`Kontumace utkání ${matchName} byla zrušena.`);
        renderMatches();
        renderDashboard();
    }, true);
}

export function openPostponeModal() {
    onPostponeCompChange();
    openModal('modal-postpone');
}

export function onPostponeCompChange() {
    const compEl = document.getElementById('postpone-comp-select');
    if (!compEl) return;
    const comp = compEl.value;
    const roundSelect = document.getElementById('postpone-round-select');

    roundSelect.innerHTML = getRoundOptions(comp);
    onPostponeRoundChange();
}

export function onPostponeRoundChange() {
    const comp = document.getElementById('postpone-comp-select').value;
    const roundVal = document.getElementById('postpone-round-select').value;
    const matchSelect = document.getElementById('postpone-match-select');

    const filtered = matchesForRound(comp, roundVal);

    if (filtered.length === 0) {
        matchSelect.innerHTML = `<option value="">Žádné zápasy pro toto kolo</option>`;
    } else {
        matchSelect.innerHTML = filtered.map(m => {
            const home = teamsData.find(t => t.id === m.homeTeamId);
            const away = teamsData.find(t => t.id === m.awayTeamId);
            return `<option value="${m.id}">${home ? home.name : ''} vs ${away ? away.name : ''}</option>`;
        }).join('');
    }
}

export function executePostpone() {
    const matchId = parseInt(document.getElementById('postpone-match-select').value);
    const reason = document.getElementById('postpone-reason-input').value.trim();

    if (!reason) {
        showToast("Pro odložení zápasu musíte zadat odůvodnění!", true);
        return;
    }

    const match = matchesData.find(m => m.id === matchId);

    if (match) {
        match.status = 'Postponed';
        match.matchDate = 'TBA';

        logDKAction("ODLOŽENÍ_UTKÁNÍ", `Zápas #${matchId}`, `Utkání odloženo. Důvod: ${reason}`);
        showToast("Utkání bylo úspěšně odloženo.");
        closeSpecificModal('modal-postpone');
        renderMatches();
        renderDashboard();
    }
}

export function openRescheduleModal() {
    onRescheduleCompChange();
    openModal('modal-reschedule');
}

export function onRescheduleCompChange() {
    const compEl = document.getElementById('reschedule-comp-select');
    if (!compEl) return;
    const comp = compEl.value;
    const roundSelect = document.getElementById('reschedule-round-select');

    roundSelect.innerHTML = getRoundOptions(comp);
    onRescheduleRoundChange();
}

export function onRescheduleRoundChange() {
    const comp = document.getElementById('reschedule-comp-select').value;
    const roundVal = document.getElementById('reschedule-round-select').value;
    const matchSelect = document.getElementById('reschedule-match-select');

    const filtered = matchesForRound(comp, roundVal);

    if (filtered.length === 0) {
        matchSelect.innerHTML = `<option value="">Žádné zápasy pro toto kolo</option>`;
    } else {
        matchSelect.innerHTML = filtered.map(m => {
            const home = teamsData.find(t => t.id === m.homeTeamId);
            const away = teamsData.find(t => t.id === m.awayTeamId);
            return `<option value="${m.id}">${home ? home.name : ''} vs ${away ? away.name : ''}</option>`;
        }).join('');
    }
}

export function executeReschedule() {
    const matchId = parseInt(document.getElementById('reschedule-match-select').value);
    const newDateVal = document.getElementById('reschedule-new-date-input').value;
    const reason = document.getElementById('reschedule-reason-input').value.trim();

    if (!newDateVal) {
        showToast("Musíte vybrat nové datum a čas konání utkání!", true);
        return;
    }

    if (!reason) {
        showToast("Pro přeložení zápasu musíte zadat odůvodnění!", true);
        return;
    }

    const match = matchesData.find(m => m.id === matchId);

    if (match) {
        match.status = 'Scheduled';
        match.matchDate = newDateVal;

        const formattedDate = new Date(newDateVal).toLocaleString('cs-CZ');
        logDKAction("PŘELOŽENÍ_UTKÁNÍ", `Zápas #${matchId}`, `Utkání přeloženo na ${formattedDate}. Důvod: ${reason}`);
        showToast(`Utkání bylo úspěšně přeloženo na ${formattedDate}.`);
        closeSpecificModal('modal-reschedule');
        renderMatches();
        renderDashboard();
    }
}
