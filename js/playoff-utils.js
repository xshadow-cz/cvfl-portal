export function isPromotionPlayoffSecondLeg(match) {
    return match?.competition === 'Baráž o 1. Ligu' &&
        match.cupStage === 'Semifinále' && Number(match.round) === 2;
}

export function getPromotionPlayoffAggregate(match, matches) {
    if (match?.competition !== 'Baráž o 1. Ligu' || match.cupStage !== 'Semifinále') return null;
    const firstLeg = matches.find(item =>
        item.id !== match.id &&
        item.competition === 'Baráž o 1. Ligu' &&
        item.cupStage === 'Semifinále' &&
        Number(item.round) === 1 &&
        [item.homeTeamId, item.awayTeamId].includes(match.homeTeamId) &&
        [item.homeTeamId, item.awayTeamId].includes(match.awayTeamId)
    );
    if (!firstLeg) return null;
    const homeScore = (firstLeg.homeTeamId === match.homeTeamId ? firstLeg.homeScore : firstLeg.awayScore) +
        (Number(match.homeScore) || 0);
    const awayScore = (firstLeg.homeTeamId === match.awayTeamId ? firstLeg.homeScore : firstLeg.awayScore) +
        (Number(match.awayScore) || 0);
    return {
        homeScore,
        awayScore,
        tied: homeScore === awayScore,
        firstLegCompleted: firstLeg.status === 'Completed'
    };
}
