const MATCH_STATUS_LABELS = {
    Scheduled: 'Naplánováno',
    In_Progress: 'Probíhá',
    Completed: 'Odehráno',
    Postponed: 'Odloženo'
};

export function getMatchStatusLabel(status) {
    return MATCH_STATUS_LABELS[status] || 'Neznámý stav';
}
