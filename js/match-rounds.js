export function getMatchRoundLabel(match) {
    if (match.competition === 'MOL Cup') return match.cupStage || 'MOL Cup';
    if (match.competition === 'Baráž o 1. Ligu') {
        return `Baráž — ${Number(match.round) === 2 ? 'Odveta' : '1. zápas'}`;
    }
    return match.cupStage?.startsWith('Skupina o ')
        ? match.cupStage
        : `${match.round}. Kolo`;
}

export function getRoundFilterOptions(competition, { includeAll = true } = {}) {
    const options = includeAll ? [{ value: 'ALL', label: competition === 'ALL' ? 'Všechna kola / fáze' : 'Všechna kola' }] : [];
    if (competition === 'MOL Cup') {
        return options.concat(['Osmifinále', 'Čtvrtfinále', 'Semifinále', 'Finále']
            .map(stage => ({ value: `stage:${stage}`, label: stage })));
    }
    if (competition === 'Baráž o 1. Ligu') {
        return options.concat([
            { value: '1', label: 'Baráž — 1. zápasy' },
            { value: '2', label: 'Baráž — odvety' }
        ]);
    }
    if (competition === 'CVFL 1. Liga') {
        options.push(...Array.from({ length: 14 }, (_, index) => ({
            value: String(index + 1),
            label: `${index + 1}. Kolo`
        })));
        ['Skupina o titul', 'Skupina o udržení'].forEach(group => {
            for (let round = 1; round <= 4; round++) {
                const stage = `${group} — ${round}. kolo`;
                options.push({ value: `stage:${stage}`, label: stage });
            }
        });
        return options;
    }
    if (competition === 'CVFL 2. Liga') {
        options.push(...Array.from({ length: 14 }, (_, index) => ({
            value: String(index + 1),
            label: `${index + 1}. Kolo`
        })));
        return options;
    }
    return options;
}

export function matchesRoundFilter(match, value) {
    if (value === 'ALL') return true;
    if (value.startsWith('stage:')) return match.cupStage === value.slice('stage:'.length);
    return Number(match.round) === Number(value);
}
