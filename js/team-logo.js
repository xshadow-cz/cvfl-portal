export function getTeamLogoMarkup(team, className = 'h-6 w-6') {
    if (!team?.logo) return '';
    return `<img src="${team.logo}" alt="" class="${className} shrink-0 rounded-md object-contain bg-[#0e1a4f]">`;
}

export function escapeTeamName(name) {
    return String(name || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}
