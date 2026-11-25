/**
 * CVFL Portál - UI Utility, Modální Okna, Oznámení a Vyhledávání
 */

import { state, teamsData, playersData } from './state.js';
import { apiSetMaintenance, apiSetSystemAnnouncement } from './api.js';
import { getTeamNameMarkup, escapeTeamName } from './team-logo.js';

export function openConfirmModal(title, message, onConfirmCallback, requireReason = true) {
    document.getElementById('confirm-dialog-title').textContent = title || "Potvrzení Akce";
    document.getElementById('confirm-dialog-message').textContent = message || "Opravdu chcete tuto akce provést?";
    document.getElementById('confirm-reason-input').value = '';
    
    const reasonBox = document.getElementById('confirm-reason-box');
    if (requireReason) {
        reasonBox.classList.remove('hidden');
    } else {
        reasonBox.classList.add('hidden');
    }

    state.pendingConfirmCallback = (reason) => onConfirmCallback(reason, requireReason);
    document.getElementById('confirm-overlay').classList.remove('hidden');
}

export function closeConfirmModal(confirmed) {
    if (confirmed) {
        const reasonBox = document.getElementById('confirm-reason-box');
        const isReasonRequired = !reasonBox.classList.contains('hidden');
        const reason = document.getElementById('confirm-reason-input').value.trim();
        
        if (isReasonRequired && !reason) {
            showToast("Pro tuto operaci je povinné vyplnit důvod!", true);
            return;
        }
        if (typeof state.pendingConfirmCallback === 'function') {
            state.pendingConfirmCallback(reason);
        }
    }
    document.getElementById('confirm-overlay').classList.add('hidden');
    state.pendingConfirmCallback = null;
}

export function applyRBACPermissions() {
    const permissions = {
        'Admin': ['role-perm-admin', 'role-perm-dk', 'role-perm-ref-mgr', 'role-perm-team-mgr', 'role-perm-referee', 'role-perm-delegate'],
        'DK': ['role-perm-dk'],
        'Referee_Manager': ['role-perm-ref-mgr', 'role-perm-referee'],
        'Team_Manager': ['role-perm-team-mgr'],
        'Referee': ['role-perm-referee'],
        'Delegate': ['role-perm-delegate']
    };

    const roleKey = (state.currentUserRole || '').startsWith('Team_Manager') ? 'Team_Manager' : state.currentUserRole;
    const allowedClasses = permissions[roleKey] || [];

    const allPermElements = document.querySelectorAll('[class*="role-perm-"]');
    allPermElements.forEach(el => {
        const classList = Array.from(el.classList);
        const permClasses = classList.filter(c => c.startsWith('role-perm-'));
        
        const hasAccess = permClasses.some(pc => allowedClasses.includes(pc));
        if (hasAccess) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
    applyMaintenanceVisibility();
}

export function applyMaintenanceVisibility() {
    const hasAdminAccess = state.availableRoles.includes('Admin');
    const accessOverlay = document.getElementById('maintenance-access-overlay');
    const banner = document.getElementById('maintenance-banner');
    const toggle = document.getElementById('admin-maintenance-toggle');
    const notice = document.getElementById('maintenance-access-notice');
    const noticeInput = document.getElementById('admin-maintenance-note');
    if (accessOverlay) accessOverlay.classList.toggle('hidden', !state.isMaintenanceMode || hasAdminAccess);
    if (banner) banner.classList.toggle('hidden', !state.isMaintenanceMode || !hasAdminAccess);
    if (toggle) toggle.checked = state.isMaintenanceMode;
    if (notice) notice.textContent = state.maintenanceNotice || 'Probíhá údržba portálu. Zkuste to prosím později.';
    if (noticeInput && document.activeElement !== noticeInput) noticeInput.value = state.maintenanceNotice;
}

export function applySystemAnnouncement(announcement = state.systemAnnouncement) {
    const banner = document.getElementById('system-banner');
    const text = document.getElementById('system-banner-text');
    if (typeof announcement !== 'string') return;
    state.systemAnnouncement = announcement;
    if (text) text.textContent = announcement;
    if (banner) banner.classList.toggle('hidden', !announcement.trim());
    const input = document.getElementById('admin-system-announcement');
    if (input && document.activeElement !== input) input.value = announcement;
}

export async function saveSystemAnnouncement() {
    const input = document.getElementById('admin-system-announcement');
    if (state.currentUserRole !== 'Admin' || !input) {
        showToast('Oznámení může měnit pouze vedení ligy.', true);
        return;
    }
    try {
        state.systemAnnouncement = await apiSetSystemAnnouncement(input.value);
        applySystemAnnouncement();
        showToast(state.systemAnnouncement ? 'Oznámení bylo uloženo.' : 'Oznámení bylo odebráno.');
    } catch (error) {
        showToast(`Oznámení se nepodařilo uložit: ${error.message}`, true);
    }
}

export async function toggleMaintenance(stateVal) {
    if (state.currentUserRole !== 'Admin') {
        showToast('Režim údržby může měnit pouze vedení ligy.', true);
        return;
    }
    const enabled = stateVal !== undefined ? stateVal : !state.isMaintenanceMode;
    try {
        await apiSetMaintenance(enabled, state.maintenanceNotice);
        state.isMaintenanceMode = enabled;
        state.maintenanceMode = enabled;
        applyMaintenanceVisibility();
        showToast(`Režim údržby ${enabled ? 'AKTIVOVÁN' : 'DEAKTIVOVÁN'}.`);
    } catch (error) {
        const toggle = document.getElementById('admin-maintenance-toggle');
        if (toggle) toggle.checked = state.isMaintenanceMode;
        showToast(`Režim údržby se nepodařilo změnit: ${error.message}`, true);
    }
}

export async function saveMaintenanceNotice() {
    const input = document.getElementById('admin-maintenance-note');
    if (state.currentUserRole !== 'Admin' || !input) {
        showToast('Poznámku k údržbě může měnit pouze vedení ligy.', true);
        return;
    }
    const notice = input.value.trim();
    try {
        await apiSetMaintenance(state.isMaintenanceMode, notice);
        state.maintenanceNotice = notice;
        applyMaintenanceVisibility();
        showToast('Poznámka k údržbě byla uložena.');
    } catch (error) {
        showToast(`Poznámku k údržbě se nepodařilo uložit: ${error.message}`, true);
    }
}

export function toggleRoleSelector() {
    document.getElementById('role-dropdown').classList.toggle('hidden');
}

const nestedModalOrigins = new WeakMap();

export function openModal(id, { updateHistory = true } = {}) {
    const backdrop = document.getElementById('modal-backdrop');
    const target = document.getElementById(id);
    if (!backdrop || !target) return;

    if (id === 'modal-match-protocol') closeAllNestedModals();
    backdrop.classList.remove('hidden');

    const protocol = document.getElementById('modal-match-protocol');
    const protocolIsOpen = protocol && !protocol.classList.contains('hidden');
    if (protocolIsOpen && id !== 'modal-match-protocol') {
        let overlay = target.closest('.nested-modal-overlay');
        if (!overlay) {
            const parent = target.parentElement;
            nestedModalOrigins.set(target, {
                parent,
                nextSibling: target.nextSibling
            });
            overlay = document.createElement('div');
            overlay.className = 'nested-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4';
            overlay.dataset.modalId = id;
            backdrop.appendChild(overlay);
            overlay.appendChild(target);
        }
        overlay.classList.remove('hidden');
        if (updateHistory && window.history.state?.cvflNestedModal !== id) {
            window.history.pushState(
                { ...(window.history.state || {}), cvflNestedModal: id },
                '',
                `${window.location.pathname}${window.location.search}${window.location.hash}`
            );
        }
    } else if (id !== 'modal-match-protocol' && target.closest('.nested-modal-overlay')) {
        target.closest('.nested-modal-overlay')?.classList.remove('hidden');
    }

    target.classList.remove('hidden');
    if (id === 'modal-match-protocol') {
        backdrop.classList.add('match-protocol-backdrop');
        target.classList.add('match-protocol-fullscreen');
    }
}

export function closeSpecificModal(id) {
    const backdrop = document.getElementById('modal-backdrop');
    const target = document.getElementById(id);
    if (id === 'modal-match-protocol') closeAllNestedModals();
    if (target) {
        target.classList.add('hidden');
        if (id === 'modal-match-protocol') {
            target.classList.remove('match-protocol-fullscreen');
            backdrop.classList.remove('match-protocol-backdrop');
        }
        restoreNestedModal(target);
    }
    if (window.history.state?.cvflNestedModal === id) {
        const { cvflNestedModal, ...historyState } = window.history.state;
        const overlays = document.querySelectorAll('#modal-backdrop > .nested-modal-overlay');
        const remainingId = overlays[overlays.length - 1]?.dataset.modalId;
        if (remainingId) historyState.cvflNestedModal = remainingId;
        window.history.replaceState(historyState, '', window.location.href);
    }

    const anyVisible = document.querySelectorAll('#modal-backdrop > div:not(.hidden)').length > 0;
    if (!anyVisible) {
        backdrop.classList.add('hidden');
    }
}

function restoreNestedModal(target) {
    const overlay = target.closest('.nested-modal-overlay');
    if (!overlay) return;
    const origin = nestedModalOrigins.get(target);
    if (origin?.parent) {
        origin.parent.insertBefore(target, origin.nextSibling?.parentNode === origin.parent ? origin.nextSibling : null);
    }
    nestedModalOrigins.delete(target);
    overlay.remove();
}

function closeNestedModal() {
    const overlays = document.querySelectorAll('#modal-backdrop > .nested-modal-overlay');
    const overlay = overlays[overlays.length - 1];
    const target = overlay?.firstElementChild;
    if (target) closeSpecificModal(target.id);
}

function closeAllNestedModals() {
    while (document.querySelector('#modal-backdrop > .nested-modal-overlay')) {
        closeNestedModal();
    }
}

export function handleModalPopState() {
    const overlays = document.querySelectorAll('#modal-backdrop > .nested-modal-overlay');
    const expectedId = window.history.state?.cvflNestedModal;
    const hasExpectedOverlay = Array.from(overlays).some(overlay => overlay.dataset.modalId === expectedId);
    if (expectedId && !hasExpectedOverlay) {
        openModal(expectedId, { updateHistory: false });
        return true;
    }
    const overlay = overlays[overlays.length - 1];
    if (overlay) {
        closeNestedModal();
        return true;
    }
    return false;
}

export function getFriendlyErrorMessage(error) {
    const message = String(error?.message || error || '').trim();
    if (!message) return 'Operaci se nepodařilo dokončit. Zkuste to znovu.';
    if (/failed to fetch|networkerror|nelze se připojit|fetch failed|timeout/i.test(message)) {
        return 'Server právě neodpovídá. Zkuste to za chvíli znovu.';
    }
    if (/SQLITE|SQLSTATE|constraint|TypeError|ReferenceError|SyntaxError|internal server error|stack| at .+:\d+/i.test(message)) {
        return 'Operaci se nepodařilo dokončit. Zkuste to znovu.';
    }
    const userMessages = {
        discord_state: 'Ověření přihlášení se nezdařilo. Zkuste to znovu.',
        invite_expired: 'Pozvánka už není platná. Požádejte o novou.',
        invite_invalid: 'Odkaz na pozvánku není platný.',
        invite_required: 'Pro registraci potřebujete platnou pozvánku.',
        access_revoked: 'Tomuto účtu byl odebrán přístup.'
    };
    if (userMessages[message]) return userMessages[message];
    if (/^[a-z][a-z0-9_]{2,}$/.test(message) || message.length > 180) {
        return 'Operaci se nepodařilo dokončit. Zkuste to znovu.';
    }
    return message;
}

export function showToast(message, isError = false, isWarning = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-3.5 rounded-xl shadow-2xl flex items-center space-x-2 text-xs font-bold text-white border pointer-events-auto transition duration-300 transform translate-y-0 ${
        isWarning ? 'bg-[#0e1a4f] border-orange-400 text-orange-300' :
            isError ? 'bg-[#0e1a4f] border-[#f33332] text-[#f33332]' : 'bg-[#0e1a4f] border-[#aefb12] text-[#aefb12]'
    }`;
    const icon = document.createElement('i');
    icon.className = `fa-solid ${isWarning || isError ? 'fa-circle-exclamation' : 'fa-circle-check'} ${
        isWarning ? 'text-orange-300' : isError ? 'text-[#f33332]' : 'text-[#aefb12]'
    }`;
    const text = document.createElement('span');
    text.className = 'text-gray-200';
    text.textContent = isError ? getFriendlyErrorMessage(message) : String(message);
    toast.append(icon, text);

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

export function handleGlobalSearch(query) {
    const results = document.getElementById('search-results');
    if (!query || query.length < 2) {
        results.classList.add('hidden');
        return;
    }

    const q = query.toLowerCase();
    const matchedPlayers = playersData.filter(p => !p.isArchived &&
        (p.robloxNick.toLowerCase().includes(q) || p.discordNick.toLowerCase().includes(q)));
    const matchedTeams = teamsData.filter(t => t.name.toLowerCase().includes(q));

    if (matchedPlayers.length === 0 && matchedTeams.length === 0) {
        results.innerHTML = `<div class="p-2 text-gray-400">Žádné výsledky</div>`;
    } else {
        results.innerHTML = `
            ${matchedTeams.map(t => `<div onclick="switchTab('teams'); selectTeam(${t.id}); document.getElementById('search-results').classList.add('hidden');" class="max-w-full overflow-x-auto p-2 hover:bg-[#13236b] cursor-pointer font-bold text-[#aefb12]">${getTeamNameMarkup(t)}</div>`).join('')}
            ${matchedPlayers.map(p => `<div onclick="openPlayerCard(${p.id}); document.getElementById('search-results').classList.add('hidden');" class="p-2 hover:bg-[#13236b] cursor-pointer text-gray-200"><i class="fa-solid fa-user mr-1"></i> ${escapeTeamName(p.robloxNick)} (${escapeTeamName(p.discordNick)})</div>`).join('')}
        `;
    }
    results.classList.remove('hidden');
}
