/**
 * CVFL Portál - Aplikační Stav a Data
 */

export const state = {
    currentUserRole: null,
    availableRoles: [],
    currentUser: null,
    activeTeamManagerTeamId: 1, // ID spravovaného týmu pro roli Vedoucí Mužstva
    activeTab: 'dashboard',
    activeCompTab: 'liga1',
    activeTeamId: 1,
    isMaintenanceMode: false,
    maintenanceMode: false,
    maintenanceNotice: '',
    systemAnnouncement: 'Vítejte v oficiálním CVFL Portálu!',
    playerSyncEnabled: false,
    unsavedChangesGuard: false,
    activeEditRefId: null,
    activeSlotMatchId: null,
    activeSlotRole: null,
    activeStaffTeamSide: 'home',
    activeRosterMatchId: null,
    activeRosterSide: 'home',
    activeFISTab: 'sestavy',
    pendingConfirmCallback: null
};

export const teamsData = [];

export const playersData = [];

export const trainersData = [];

export const refereesData = [];

export const suspensionsData = [];

export const matchesData = [];

export const dkAuditLogs = [];
