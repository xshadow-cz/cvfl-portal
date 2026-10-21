/**
 * CVFL Portál - Navigace a Správa Uživatelských Rolí
 */

import { state, teamsData, matchesData } from './state.js';
import { applyRBACPermissions, applyMaintenanceVisibility, closeSpecificModal, showToast } from './ui.js';
import { renderDashboard } from './dashboard.js';
import { renderCompetitions } from './competitions.js';
import { renderMatches, onCompetitionFilterChange } from './matches.js';
import { renderTeams } from './teams.js';
import { renderRefereesTab } from './referees.js';
import { renderDisciplinary } from './disciplinary.js';
import { renderAdmin } from './admin.js';
import { getTeamLogoMarkup, escapeTeamName } from './team-logo.js';

export function switchTab(tabId) {
    if (tabId === 'admin' && !state.availableRoles.includes('Admin')) {
        showToast('Tato sekce je dostupná pouze účtům s rolí Vedení Ligy.', true);
        return;
    }
    const protocolModal = document.getElementById('modal-match-protocol');
    if (protocolModal && !protocolModal.classList.contains('hidden')) {
        const match = matchesData.find(item => item.id === state.matchProtocolSnapshotId);
        if (match && state.matchProtocolSnapshot) Object.assign(match, state.matchProtocolSnapshot);
        state.unsavedChangesGuard = false;
        state.matchProtocolSnapshot = null;
        state.matchProtocolSnapshotId = null;
        closeSpecificModal('modal-match-protocol');
    }
    state.activeTab = tabId;
    ['dashboard', 'competitions', 'matches', 'teams', 'referees', 'disciplinary', 'admin'].forEach(tab => {
        const el = document.getElementById(`tab-${tab}`);
        const nav = document.getElementById(`nav-${tab}`);
        if (el) el.classList.add('hidden');
        if (nav) {
            nav.classList.remove('text-[#aefb12]', 'bg-[#aefb12]/10');
            nav.classList.add('text-gray-300');
        }
    });

    const activeEl = document.getElementById(`tab-${tabId}`);
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeEl) activeEl.classList.remove('hidden');
    if (activeNav) {
        activeNav.classList.add('text-[#aefb12]', 'bg-[#aefb12]/10');
        activeNav.classList.remove('text-gray-300');
    }

    if (tabId === 'dashboard') renderDashboard();
    if (tabId === 'competitions') renderCompetitions();
    if (tabId === 'matches') { onCompetitionFilterChange(); renderMatches(); }
    if (tabId === 'teams') renderTeams();
    if (tabId === 'referees') renderRefereesTab();
    if (tabId === 'disciplinary') renderDisciplinary();
    if (tabId === 'admin') renderAdmin();
}

export function renderTeamManagersDropdown() {
    const container = document.getElementById('team-managers-dropdown-list');
    if (!container) return;

    const section = document.getElementById('team-managers-role-section');
    const hasTeamManagerRoles = state.availableRoles.some(role => role.startsWith('Team_Manager_'));
    const canManageTeams = state.availableRoles.includes('Admin');
    if (section) section.classList.toggle('hidden', !hasTeamManagerRoles && !canManageTeams);
    container.innerHTML = teamsData.filter(t => state.availableRoles.includes(`Team_Manager_${t.id}`)).map(t => `
        <button onclick="setUserRole('Team_Manager', ${t.id})" class="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-200 transition hover:bg-[#11806a]/20 hover:text-[#11806a]">
            <span class="min-w-0 truncate">${escapeTeamName(t.name)}</span>
            <span class="text-[10px] text-gray-400 font-mono ml-1">${t.league === '1_Liga' ? '1.L' : '2.L'}</span>
        </button>
    `).join('');
}

export function setUserRole(role, teamId = null, { silent = false, skipTabSwitch = false } = {}) {
    const badge = document.getElementById('active-role-badge');
    const selectedRole = role === 'Team_Manager' ? `Team_Manager_${teamId}` : role;
    if (!state.availableRoles.includes(selectedRole)) {
        if (!silent) showToast('Tato role není vašemu Discord účtu přidělena.', true);
        return;
    }
    
    // Barvy dle zadání:
    // Vedení Ligy = e91e63
    // Vedení Rozhodčích = 7f7f7f
    // Disciplinární Komise = ffffff
    // Delegát Utkání = 71368a
    // Rozhodčí = 607d8b
    // Vedoucí Mužstva = 11806a

    const baseConfig = {
        'Admin': { label: 'Vedení Ligy', bg: 'bg-[#e91e63]', text: 'text-white' },
        'Referee_Manager': { label: 'Vedení Rozhodčích', bg: 'bg-[#7f7f7f]', text: 'text-white' },
        'DK': { label: 'Disciplinární komise', bg: 'bg-[#ffffff]', text: 'text-[#13236b]' },
        'Delegate': { label: 'Delegát Utkání', bg: 'bg-[#71368a]', text: 'text-white' },
        'Referee': { label: 'Rozhodčí', bg: 'bg-[#607d8b]', text: 'text-white' },
        'Team_Manager': { label: 'Vedoucí Mužstva', bg: 'bg-[#11806a]', text: 'text-white' }
    };

    let cfg;
    if (role === 'Team_Manager') {
        const targetTeamId = teamId || state.activeTeamManagerTeamId || 1;
        state.activeTeamManagerTeamId = targetTeamId;
        state.currentUserRole = `Team_Manager_${targetTeamId}`;
        const team = teamsData.find(t => t.id === targetTeamId);
        const teamName = team ? team.name : `Klub #${targetTeamId}`;
        cfg = {
            label: `Vedoucí: ${teamName}`,
            bg: 'bg-[#11806a]',
            text: 'text-white'
        };
    } else {
        state.currentUserRole = role;
        cfg = baseConfig[role] || { label: role, bg: 'bg-[#e91e63]', text: 'text-white' };
    }

    if (badge) {
        badge.textContent = cfg.label;
        badge.className = `px-2 py-0.5 rounded text-[10px] ${cfg.bg} ${cfg.text} uppercase font-black`;
    }

    document.querySelectorAll('[data-role-option]').forEach(option => {
        option.classList.toggle('hidden', !state.availableRoles.includes(option.dataset.roleOption));
    });
    
    applyRBACPermissions();
    applyMaintenanceVisibility();
    if (!silent) showToast(`Uživatelská role přepnuta na: ${cfg.label}`);
    
    const dropdown = document.getElementById('role-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    if (!skipTabSwitch) {
        if (state.currentUserRole !== 'Admin' && state.activeTab === 'admin') {
            switchTab('dashboard');
        } else {
            switchTab(state.activeTab);
        }
    }
}
