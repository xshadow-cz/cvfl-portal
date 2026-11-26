/**
 * CVFL Portál - Hlavní Vstupní Bod Aplikace (ES Module Entrypoint)
 */

import {
    state,
    teamsData,
    playersData,
    trainersData,
    refereesData,
    suspensionsData,
    matchesData,
    dkAuditLogs
} from './state.js';

import {
    openModal,
    closeSpecificModal,
    handleModalPopState,
    showToast,
    getFriendlyErrorMessage,
    openConfirmModal,
    closeConfirmModal,
    toggleMaintenance,
    saveMaintenanceNotice,
    applyMaintenanceVisibility,
    applySystemAnnouncement,
    saveSystemAnnouncement,
    toggleRoleSelector,
    applyRBACPermissions,
    handleGlobalSearch
} from './ui.js';

import {
    switchTab,
    getTabFromPath,
    setUserRole,
    renderTeamManagersDropdown
} from './navigation.js';

import {
    renderDashboard
} from './dashboard.js';

import {
    switchCompTab,
    compareTeams1Liga,
    renderCompetitions
} from './competitions.js';

import {
    onCompetitionFilterChange,
    renderMatches,
    openMatchProtocol,
    openDelegateComingSoon,
    closeDelegateComingSoon,
    getMatchIdFromPath,
    getFISTabFromPath,
    toggleSendToDK,
    toggleMatchReady,
    lockMatchRecord,
    unlockMatchRecord,
    updateMatchDetails,
    renderRosterList,
    updatePlayerJerseyInRoster,
    togglePlayerGKInRoster,
    togglePlayerStarterInRoster,
    updatePeriodChecks,
    updatePenaltyScores,
    renderStaffList,
    openAddPlayerToRosterModal,
    addPlayerToRoster,
    removePlayerFromRosterWithConfirm,
    openAddStaffModal,
    submitStaffMember,
    removeStaffMemberWithConfirm,
    deleteMatchEvent,
    updateMatchChecks,
    switchFISTab,
    openGoalForm,
    closeGoalForm,
    onGoalTypeChange,
    renderGoalForm,
    onGoalTimeChange,
    submitGoal,
    renderSubstitutionPlayerOptions,
    submitSubstitution,
    renderPenaltyKickOptions,
    submitPenaltyKick,
    openCardForm,
    closeCardForm,
    onCardTeamChange,
    onCardTimeChange,
    renderCardForm,
    submitCard,
    closeMatchProtocolWithCheck,
    closeMatchProtocolWithoutSave,
    markUnsavedChanges,
    saveDelegateReview,
    calculateMatchStats,
    saveMatchProtocol
} from './matches.js';

import {
    openForfeitModal,
    onForfeitCompChange,
    onForfeitRoundChange,
    updateForfeitTeamsOptions,
    executeForfeit,
    cancelForfeitWithConfirm,
    openPostponeModal,
    onPostponeCompChange,
    onPostponeRoundChange,
    executePostpone,
    openRescheduleModal,
    onRescheduleCompChange,
    onRescheduleRoundChange,
    executeReschedule
} from './match-operations.js';

import {
    renderRefereesTab,
    renderDelegateAlerts,
    dismissDelegateAlert,
    renderRefereesMainTable,
    openRefereeCard,
    toggleRefereeDelegate,
    renderRefereeAssignments,
    saveRefereeAssignmentsForMatch,
    openSlotPicker,
    selectRefereeForSlot,
    selectRefereeForSlotById,
} from './referees.js';

import {
    logDKAction,
    renderDKAuditLogs,
    renderDisciplinary,
    renderFanIssueReports,
    resolveFanIssueReport,
    cancelSuspensionWithConfirm,
    openDeductPointsModal,
    submitPointsDeduction,
    cancelPointsDeductionWithConfirm,
    toggleSuspensionInputs,
    openAddSuspensionModal,
    updateSuspensionPlayers,
    submitNewSuspension
} from './disciplinary.js';

import {
    renderTeams,
    selectTeam,
    renderSelectedTeamView,
    openPlayerCard
} from './teams.js';

import {
    updateCreateMatchTeams,
    submitCreateMatch,
    submitAdminAddPlayer,
    submitAdminAddTrainer,
    toggleExtraSection,
    renderAdmin,
    loadAdminAuditLogs,
    renderAdminAuditLogs,
    renderAdminMatchesDeleteList,
    onAdminMatchFilterChange,
    deleteMatchFromAdmin,
    submitAdminAddTeam,
    renderAdminTeamsList,
    saveAdminTeam,
    deleteAdminTeam,
    renderDiscordRoleManagement,
    editDiscordUserRoles,
    lookupDiscordUserRoles,
    handleDiscordUserIdKeydown,
    invalidateDiscordUserLookup,
    deleteDiscordUserFromDatabase,
    saveDiscordUserRoles,
    createDiscordInvite,
    copyDiscordInviteLink,
    revokeDiscordInvite,
    filterDiscordUsers,
    refreshDiscordInvites,
    revokeDiscordUserAccess,
    updateAdminStats
} from './admin.js';

import {
    loadInitialStateFromAPI,
    isApiOnline,
    loadDiscordSession,
    apiGetSystemAnnouncement,
    apiLogoutDiscord,
    getApiOrigin
} from './api.js';

// Globální vystavení dat a stavu
window.cvflState = state;
window.teamsData = teamsData;
window.playersData = playersData;
window.trainersData = trainersData;
window.refereesData = refereesData;
window.suspensionsData = suspensionsData;
window.matchesData = matchesData;
window.dkAuditLogs = dkAuditLogs;

window.addEventListener('beforeunload', event => {
    if (!state.unsavedChangesGuard) return;
    event.preventDefault();
    event.returnValue = '';
});

document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    window.__cvflActionButton = button;
    window.setTimeout(() => {
        if (window.__cvflActionButton === button) window.__cvflActionButton = null;
        if (button.dataset.cvflPendingRequests !== undefined) return;
        button.disabled = true;
        window.setTimeout(() => {
            if (button.dataset.cvflActionLocked === 'true') return;
            button.disabled = false;
        }, 350);
    }, 0);
}, true);

window.addEventListener('error', event => {
    if (event.target !== window) return;
    console.error('Chyba aplikace:', event.error || event.message);
    showToast('Na stránce došlo k chybě. Zkuste akci znovu nebo obnovte stránku.', true);
});

window.addEventListener('unhandledrejection', event => {
    console.error('Nezpracovaná chyba aplikace:', event.reason);
    showToast('Operaci se nepodařilo dokončit. Zkuste to znovu.', true);
});

window.addEventListener('popstate', () => {
    if (handleModalPopState()) return;
    if (window.location.pathname === '/statistiky-hracu') {
        window.openStatsModal('goals', { updateHistory: false });
        return;
    }
    window.closeStatsPageFromHistory?.();
    const delegateReview = /\/hodnoceni-delegata\/?$/.test(window.location.pathname);
    const matchId = getMatchIdFromPath(window.location.pathname);
    if (matchId !== null) {
        const matchPath = window.location.pathname;
        if (state.activeTab !== 'matches' && !switchTab('matches', { updateHistory: false })) return;
        if (window.location.pathname !== matchPath) {
            window.history.replaceState(window.history.state, '', matchPath);
        }
        openMatchProtocol(matchId, { updateHistory: false });
        if (delegateReview) {
            openDelegateComingSoon(matchId);
        } else {
            document.getElementById('delegate-coming-soon-page')?.remove();
            const fisTab = getFISTabFromPath(window.location.pathname);
            if (fisTab) switchFISTab(fisTab, { updateHistory: false });
        }
        return;
    }
    document.getElementById('delegate-coming-soon-page')?.remove();
    switchTab(getTabFromPath(window.location.pathname), { updateHistory: false });
});

// Globální vystavení funkcí pro kompatibilitu s HTML inline handlery (onclick, onchange atd.)
Object.assign(window, {
    // UI & Modals & Search
    openModal,
    closeSpecificModal,
    showToast,
    openConfirmModal,
    closeConfirmModal,
    toggleMaintenance,
    saveMaintenanceNotice,
    applyMaintenanceVisibility,
    applySystemAnnouncement,
    saveSystemAnnouncement,
    toggleRoleSelector,
    applyRBACPermissions,
    handleGlobalSearch,

    // Navigation & Roles
    switchTab,
    setUserRole,
    renderTeamManagersDropdown,

    // Dashboard
    renderDashboard,

    // Competitions
    switchCompTab,
    compareTeams1Liga,
    renderCompetitions,

    // Matches & FIS ZOU Protocol
    onCompetitionFilterChange,
    renderMatches,
    openMatchProtocol,
    openDelegateComingSoon,
    closeDelegateComingSoon,
    toggleSendToDK,
    toggleMatchReady,
    lockMatchRecord,
    unlockMatchRecord,
    updateMatchDetails,
    renderRosterList,
    updatePlayerJerseyInRoster,
    togglePlayerGKInRoster,
    togglePlayerStarterInRoster,
    updatePeriodChecks,
    updatePenaltyScores,
    renderStaffList,
    openAddPlayerToRosterModal,
    addPlayerToRoster,
    removePlayerFromRosterWithConfirm,
    openAddStaffModal,
    submitStaffMember,
    removeStaffMemberWithConfirm,
    deleteMatchEvent,
    updateMatchChecks,
    switchFISTab,
    openGoalForm,
    closeGoalForm,
    onGoalTypeChange,
    renderGoalForm,
    onGoalTimeChange,
    submitGoal,
    renderSubstitutionPlayerOptions,
    submitSubstitution,
    renderPenaltyKickOptions,
    submitPenaltyKick,
    openCardForm,
    closeCardForm,
    onCardTeamChange,
    onCardTimeChange,
    renderCardForm,
    submitCard,
    closeMatchProtocolWithCheck,
    closeMatchProtocolWithoutSave,
    markUnsavedChanges,
    saveDelegateReview,
    calculateMatchStats,
    saveMatchProtocol,

    // Match Operations
    openForfeitModal,
    onForfeitCompChange,
    onForfeitRoundChange,
    updateForfeitTeamsOptions,
    executeForfeit,
    cancelForfeitWithConfirm,
    openPostponeModal,
    onPostponeCompChange,
    onPostponeRoundChange,
    executePostpone,
    openRescheduleModal,
    onRescheduleCompChange,
    onRescheduleRoundChange,
    executeReschedule,

    // Referees
    renderRefereesTab,
    renderDelegateAlerts,
    dismissDelegateAlert,
    renderRefereesMainTable,
    openRefereeCard,
    toggleRefereeDelegate,
    renderRefereeAssignments,
    saveRefereeAssignmentsForMatch,
    openSlotPicker,
    selectRefereeForSlot,
    selectRefereeForSlotById,

    // Disciplinary (DK)
    logDKAction,
    renderDKAuditLogs,
    renderDisciplinary,
    renderFanIssueReports,
    resolveFanIssueReport,
    cancelSuspensionWithConfirm,
    openDeductPointsModal,
    submitPointsDeduction,
    cancelPointsDeductionWithConfirm,
    toggleSuspensionInputs,
    openAddSuspensionModal,
    updateSuspensionPlayers,
    submitNewSuspension,

    // Teams & Players
    renderTeams,
    selectTeam,
    renderSelectedTeamView,
    openPlayerCard,

    // Admin
    updateCreateMatchTeams,
    submitCreateMatch,
    submitAdminAddPlayer,
    submitAdminAddTrainer,
    toggleExtraSection,
    renderAdmin,
    loadAdminAuditLogs,
    renderAdminAuditLogs,
    renderAdminMatchesDeleteList,
    onAdminMatchFilterChange,
    deleteMatchFromAdmin,
    submitAdminAddTeam,
    renderAdminTeamsList,
    saveAdminTeam,
    deleteAdminTeam,
    renderDiscordRoleManagement,
    editDiscordUserRoles,
    lookupDiscordUserRoles,
    handleDiscordUserIdKeydown,
    invalidateDiscordUserLookup,
    deleteDiscordUserFromDatabase,
    saveDiscordUserRoles,
    createDiscordInvite,
    copyDiscordInviteLink,
    revokeDiscordInvite,
    filterDiscordUsers,
    refreshDiscordInvites,
    revokeDiscordUserAccess,
    updateAdminStats
});

async function logoutDiscord() {
    try {
        await apiLogoutDiscord();
        sessionStorage.removeItem('cvfl_invite_code');
        window.location.reload();
    } catch (error) {
        showToast(`Odhlášení se nepodařilo: ${error.message}`, true);
    }
}

window.logoutDiscord = logoutDiscord;

let appInitializationPromise = null;

function retryPortalConnection() {
    return initApp();
}

window.retryPortalConnection = retryPortalConnection;

function setupResponsiveNavigation() {
    const header = document.getElementById('app-header');
    const headerContent = document.getElementById('header-content');
    const brand = document.getElementById('header-brand');
    const brandTitle = brand?.querySelector(':scope > div');
    const nav = document.getElementById('nav-links');
    const headerRow = nav?.parentElement;
    const tools = document.getElementById('header-tools');
    const search = document.getElementById('header-search');
    const roleControl = document.getElementById('role-dropdown')?.parentElement;
    const toggle = document.getElementById('mobile-nav-toggle');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    if (!header || !headerContent || !brand || !brandTitle || !nav || !headerRow || !tools || !search || !roleControl || !toggle || !backdrop) return;

    let updateScheduled = false;
    let compactLayout = false;
    const updateLayout = () => {
        updateScheduled = false;
        const wasOpen = nav.classList.contains('mobile-nav-open');
        if (compactLayout) {
            tools.insertBefore(search, roleControl);
            headerRow.insertBefore(nav, tools);
            nav.classList.remove('mobile-nav-panel');
            nav.classList.remove('mobile-nav-open');
            header.classList.remove('nav-compact');
            compactLayout = false;
        }
        brand.classList.remove('brand-title-hidden');
        const availableWidth = headerContent.clientWidth;
        const navWidth = Array.from(nav.children).reduce((total, link) => {
            if (!(link instanceof HTMLElement) || link.getClientRects().length === 0) return total;
            return total + link.getBoundingClientRect().width;
        }, 0) + Math.max(0, nav.children.length - 1) * 8;
        const requiredWidth = brand.getBoundingClientRect().width +
            navWidth + tools.getBoundingClientRect().width + toggle.getBoundingClientRect().width + 40;
        const shouldUseMenu = window.innerWidth < 768 || requiredWidth > availableWidth;
        header.classList.toggle('nav-compact', shouldUseMenu);
        if (shouldUseMenu) {
            compactLayout = true;
            document.body.append(nav);
            nav.classList.add('mobile-nav-panel');
            nav.prepend(search);
            const compactHeaderWidth = toggle.getBoundingClientRect().width +
                brand.getBoundingClientRect().width + tools.getBoundingClientRect().width + 32;
            brand.classList.toggle('brand-title-hidden', compactHeaderWidth > availableWidth);
            if (wasOpen) {
                nav.inert = false;
                nav.setAttribute('aria-hidden', 'false');
                nav.classList.add('mobile-nav-open');
            } else {
                closeMenu();
            }
        } else {
            closeMenu();
        }
    };
    const scheduleUpdate = () => {
        if (updateScheduled) return;
        updateScheduled = true;
        window.requestAnimationFrame(updateLayout);
    };
    const closeMenu = () => {
        nav.classList.remove('mobile-nav-open');
        backdrop.classList.remove('mobile-nav-backdrop-open');
        nav.inert = header.classList.contains('nav-compact');
        nav.setAttribute('aria-hidden', String(nav.inert));
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Otevřít navigaci');
        toggle.innerHTML = '<i class="fa-solid fa-bars text-lg"></i>';
        document.body.classList.remove('mobile-nav-visible');
    };
    const openMenu = () => {
        nav.inert = false;
        nav.setAttribute('aria-hidden', 'false');
        nav.classList.add('mobile-nav-open');
        backdrop.classList.add('mobile-nav-backdrop-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Zavřít navigaci');
        toggle.innerHTML = '<i class="fa-solid fa-xmark text-lg"></i>';
        document.body.classList.add('mobile-nav-visible');
    };

    toggle.addEventListener('click', () => {
        if (toggle.getAttribute('aria-expanded') === 'true') closeMenu();
        else openMenu();
    });
    backdrop.addEventListener('click', closeMenu);
    const searchResults = document.getElementById('search-results');
    document.addEventListener('pointerdown', event => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (toggle.getAttribute('aria-expanded') === 'true' &&
            !nav.contains(target) && !toggle.contains(target)) closeMenu();
        if (!search.contains(target) && !searchResults?.contains(target)) {
            searchResults?.classList.add('hidden');
        }
    }, true);
    nav.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('a')) closeMenu();
    });
    searchResults?.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('[onclick]')) closeMenu();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            closeMenu();
            toggle.focus();
        }
    });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    if ('ResizeObserver' in window) {
        const resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(headerContent);
        resizeObserver.observe(brand);
        resizeObserver.observe(tools);
    }
    const navObserver = new MutationObserver(records => {
        if (records.some(record => record.target !== nav &&
            record.target instanceof Element && record.target.closest('a'))) {
            scheduleUpdate();
        }
    });
    navObserver.observe(nav, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    document.fonts?.ready.then(scheduleUpdate);
    scheduleUpdate();
}

// Inicializace aplikace po načtení DOM
async function initApp() {
    if (appInitializationPromise) return appInitializationPromise;
    appInitializationPromise = initializeApp().finally(() => {
        appInitializationPromise = null;
    });
    return appInitializationPromise;
}

async function initializeApp() {
    const authGate = document.getElementById('auth-gate-overlay');
    const authError = document.getElementById('auth-gate-error');
    const loginLink = document.getElementById('discord-login-link');
    const retryButton = document.getElementById('auth-retry-button');
    const logoutButton = document.getElementById('discord-logout-button');
    const headerLogoutButton = document.getElementById('header-discord-logout-button');
    const authTitle = document.getElementById('auth-gate-title');
    const authMessage = document.getElementById('auth-gate-message');
    document.body.classList.add('auth-gated');
    authGate.classList.remove('hidden');
    authError.classList.add('hidden');
    loginLink.classList.add('hidden');
    retryButton.classList.add('hidden');
    logoutButton.classList.add('hidden');
    authTitle.textContent = 'Ověřuji přihlášení';
    authMessage.textContent = 'Kontroluji bezpečné připojení k portálu.';
    loginLink.href = `${getApiOrigin()}/api/auth/discord`;
    const authErrors = {
        invite_invalid: 'Odkaz na pozvánku není platný.',
        invite_expired: 'Tato pozvánka již není platná nebo už byla použita.',
        discord_already_registered: 'Tento Discord účet už je v portálu zaregistrován.',
        invite_required: 'Nový účet lze zaregistrovat pouze přes jednorázový odkaz od vedení ligy.',
        invite_roles_invalid: 'Pozvánka obsahuje neplatné role. Požádejte o nový odkaz.',
        access_revoked: 'Tomuto Discord účtu byl odebrán přístup.',
        discord_state: 'Ověření přihlášení se nezdařilo. Zkuste odkaz otevřít znovu.',
        discord_login: 'Přihlášení přes Discord se nezdařilo. Zkuste to znovu.'
    };
    try {
        applySystemAnnouncement(await apiGetSystemAnnouncement());
    } catch (error) {
        console.error(`Oznámení se nepodařilo načíst: ${error.message}`);
    }
    const urlParams = new URLSearchParams(window.location.search);
    const authErrorCode = urlParams.get('authError');
    if (authErrorCode) {
        authError.textContent = authErrors[authErrorCode] || authErrors.discord_login;
        authError.classList.remove('hidden');
        if (['invite_invalid', 'invite_expired', 'discord_already_registered', 'invite_roles_invalid'].includes(authErrorCode)) {
            sessionStorage.removeItem('cvfl_invite_code');
        }
    }

    // --- OPRAVA PRO POZVÁNKY ---
    // Zjištění, zda je v URL kód pozvánky (např. ?invite=... nebo ?state=...) a uložení do sessionStorage
    let inviteCode = urlParams.get('invite') || urlParams.get('state');
    if (inviteCode) {
        sessionStorage.setItem('cvfl_invite_code', inviteCode);
    } else {
        inviteCode = sessionStorage.getItem('cvfl_invite_code');
    }

    // Sestavení správného přihlašovacího odkazu včetně pozvánky, pokud existuje
    let loginUrl = `${getApiOrigin()}/api/auth/discord`;
    if (inviteCode) {
        loginUrl += `?invite=${encodeURIComponent(inviteCode)}`;
    }
    loginLink.href = loginUrl;
    // ---------------------------

    let session;
    try {
        session = await loadDiscordSession();
    } catch (error) {
        authTitle.textContent = 'Portál je dočasně nedostupný';
        authMessage.textContent = 'Přihlášení zůstává zachováno. Zkuste se znovu připojit; není potřeba znovu ověřovat Discord.';
        authError.textContent = getFriendlyErrorMessage(error);
        authError.classList.remove('hidden');
        retryButton.classList.remove('hidden');
        return;
    }
    if (!session.authenticated) {
        authTitle.textContent = 'Přihlášení do CVFL portálu';
        authMessage.textContent = 'Pro pokračování se přihlaste svým Discord účtem.';
        loginLink.classList.remove('hidden');
        return;
    }

    state.currentUser = session.user;
    state.availableRoles = session.roles;
    sessionStorage.removeItem('cvfl_invite_code');
    urlParams.delete('authError');
    urlParams.delete('invite');
    urlParams.delete('state');
    const remainingQuery = urlParams.toString();
    window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`
    );
    logoutButton.classList.remove('hidden');
    headerLogoutButton.classList.remove('hidden');
    if (state.availableRoles.length === 0) {
        authTitle.textContent = 'Přístup čeká na schválení';
        authMessage.textContent =
            `Účet ${session.user.username} (${session.user.discordId}) zatím nemá přidělenou žádnou roli. Požádejte vedení ligy o přístup.`;
        return;
    }

    const connected = await loadInitialStateFromAPI();
    if (!connected) {
        authTitle.textContent = 'Portál je dočasně nedostupný';
        authMessage.textContent = 'Přihlášení zůstává zachováno, ale data portálu se nepodařilo načíst. Zkuste připojení znovu.';
        authError.textContent = 'Databázi se nepodařilo načíst.';
        authError.classList.remove('hidden');
        retryButton.classList.remove('hidden');
        return;
    }

    authGate.classList.add('hidden');
    document.body.classList.remove('auth-gated');
    const preferredRole = state.availableRoles.includes('Admin') ? 'Admin' : state.availableRoles[0];
    if (preferredRole.startsWith('Team_Manager_')) {
        setUserRole('Team_Manager', Number(preferredRole.slice('Team_Manager_'.length)), { silent: true, skipTabSwitch: true });
    } else {
        setUserRole(preferredRole, null, { silent: true, skipTabSwitch: true });
    }
    renderTeamManagersDropdown();
    applyRBACPermissions();
    applyMaintenanceVisibility();
    const delegateReview = /\/hodnoceni-delegata\/?$/.test(window.location.pathname);
    const playerStatsPage = window.location.pathname === '/statistiky-hracu';
    const matchId = getMatchIdFromPath(window.location.pathname);
    if (matchId !== null) {
        const matchPath = window.location.pathname;
        switchTab('matches', { updateHistory: false });
        if (window.location.pathname !== matchPath) {
            window.history.replaceState(window.history.state, '', matchPath);
        }
        openMatchProtocol(matchId, { updateHistory: false });
        if (delegateReview) {
            openDelegateComingSoon(matchId, { updateHistory: false });
        } else {
            const fisTab = getFISTabFromPath(window.location.pathname);
            if (fisTab) switchFISTab(fisTab, { updateHistory: false });
        }
    } else {
        switchTab(getTabFromPath(window.location.pathname), { updateHistory: false });
        if (playerStatsPage) {
            window.history.replaceState({ cvflPlayerStats: true, cvflDirectStatsEntry: true }, '', '/statistiky-hracu');
            window.openStatsModal('goals', { updateHistory: false });
        }
    }
    renderDashboard();
    updateAdminStats();
    renderDKAuditLogs();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        setupResponsiveNavigation();
        initApp();
    });
} else {
    setupResponsiveNavigation();
    initApp();
}