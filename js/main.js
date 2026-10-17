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
    handleGlobalSearch
} from './ui.js';

import {
    switchTab,
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
    deleteRefereeLicenseWithConfirm,
    renderRefereeAssignments,
    saveRefereeAssignmentsForMatch,
    openSlotPicker,
    selectRefereeForSlot,
    selectRefereeForSlotById,
    openAddRefereeModal,
    editRefereeModal,
    toggleRefStatusReasonInput,
    saveRefereeChanges
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
    openPlayerCard,
    openTransferBanList,
    removePlayerTransferBan
} from './teams.js';

import {
    updateCreateMatchTeams,
    submitCreateMatch,
    submitAdminAddPlayer,
    submitAdminAddTrainer,
    toggleExtraSection,
    renderAdmin,
    renderAdminMatchesDeleteList,
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
    deleteRefereeLicenseWithConfirm,
    renderRefereeAssignments,
    saveRefereeAssignmentsForMatch,
    openSlotPicker,
    selectRefereeForSlot,
    selectRefereeForSlotById,
    openAddRefereeModal,
    editRefereeModal,
    toggleRefStatusReasonInput,
    saveRefereeChanges,

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
    openTransferBanList,
    removePlayerTransferBan,

    // Admin
    updateCreateMatchTeams,
    submitCreateMatch,
    submitAdminAddPlayer,
    submitAdminAddTrainer,
    toggleExtraSection,
    renderAdmin,
    renderAdminMatchesDeleteList,
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
        window.location.reload();
    } catch (error) {
        showToast(`Odhlášení se nepodařilo: ${error.message}`, true);
    }
}

window.logoutDiscord = logoutDiscord;

// Inicializace aplikace po načtení DOM
async function initApp() {
    const authGate = document.getElementById('auth-gate-overlay');
    const authError = document.getElementById('auth-gate-error');
    const loginLink = document.getElementById('discord-login-link');
    const logoutButton = document.getElementById('discord-logout-button');
    const headerLogoutButton = document.getElementById('header-discord-logout-button');
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
    const authErrorCode = new URLSearchParams(window.location.search).get('authError');
    if (authErrorCode) {
        authError.textContent = authErrors[authErrorCode] || authErrors.discord_login;
        authError.classList.remove('hidden');
    }

    let session;
    try {
        session = await loadDiscordSession();
    } catch (error) {
        loginLink.href = `${getApiOrigin()}/api/auth/discord`;
        authError.textContent = error.message;
        authError.classList.remove('hidden');
        return;
    }
    loginLink.href = `${getApiOrigin()}/api/auth/discord`;
    if (!session.authenticated) return;

    state.currentUser = session.user;
    state.availableRoles = session.roles;
    loginLink.classList.add('hidden');
    logoutButton.classList.remove('hidden');
    headerLogoutButton.classList.remove('hidden');
    if (state.availableRoles.length === 0) {
        document.getElementById('auth-gate-title').textContent = 'Přístup čeká na schválení';
        document.getElementById('auth-gate-message').textContent =
            `Účet ${session.user.username} (${session.user.discordId}) zatím nemá přidělenou žádnou roli. Požádejte vedení ligy o přístup.`;
        return;
    }

    const connected = await loadInitialStateFromAPI();
    if (!connected) {
        document.getElementById('auth-gate-title').textContent = 'Databáze není dostupná';
        document.getElementById('auth-gate-message').textContent =
            'Přihlášení proběhlo, ale data portálu nelze načíst. Zkuste to později nebo kontaktujte správce.';
        authError.textContent = 'Databázi se nepodařilo načíst.';
        authError.classList.remove('hidden');
        return;
    }

    authGate.classList.add('hidden');
    const preferredRole = state.availableRoles.includes('Admin') ? 'Admin' : state.availableRoles[0];
    if (preferredRole.startsWith('Team_Manager_')) {
        setUserRole('Team_Manager', Number(preferredRole.slice('Team_Manager_'.length)));
    } else {
        setUserRole(preferredRole);
    }
    renderTeamManagersDropdown();
    switchTab('dashboard');
    renderDashboard();
    updateAdminStats();
    renderDKAuditLogs();
    applyMaintenanceVisibility();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
