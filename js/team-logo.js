export function getTeamLogoMarkup(team, className = 'h-6 w-6') {
    if (!team?.logo) return '';
    return `<img src="${team.logo}" alt="" class="inline-block ${className} shrink-0 rounded-md object-contain bg-[#0e1a4f] align-middle">`;
}

export function getTeamNameMarkup(team, {
    logoClassName = 'h-6 w-6',
    className = '',
    textClassName = ''
} = {}) {
    if (!team) return '';
    return `<span class="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-2 whitespace-nowrap ${className}">
        ${getTeamLogoMarkup(team, logoClassName)}
        <span class="min-w-0 truncate ${textClassName}" title="${escapeTeamName(team.name)}">${escapeTeamName(team.name)}</span>
    </span>`;
}

export function getTeamProfileLinkMarkup(team, options = {}) {
    if (!team) return '';
    const { linkClassName = '', ...nameOptions } = options;
    return `<a href="/tymy" onclick="event.preventDefault(); if (switchTab('teams')) selectTeam(${Number(team.id)});" aria-label="Otevřít profil týmu ${escapeTeamName(team.name)}" title="${escapeTeamName(team.name)}" class="inline-flex min-w-0 max-w-full items-center underline decoration-white/40 underline-offset-2 hover:decoration-[#aefb12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#aefb12] ${linkClassName}">
        ${getTeamNameMarkup(team, nameOptions)}
    </a>`;
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
