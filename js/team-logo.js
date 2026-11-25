export function getTeamLogoMarkup(team, className = 'h-6 w-6') {
    if (!team?.logo) return '';
    return `<img src="${team.logo}" alt="" class="inline-block ${className} shrink-0 rounded-md object-contain bg-[#0e1a4f] align-middle">`;
}

export function getTeamNameMarkup(team, { logoClassName = 'h-6 w-6', className = '', textClassName = '' } = {}) {
    if (!team) return '';
    return `<span class="inline-flex min-w-max shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap ${className}">
        ${getTeamLogoMarkup(team, logoClassName)}
        <span class="whitespace-nowrap ${textClassName}">${escapeTeamName(team.name)}</span>
    </span>`;
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
