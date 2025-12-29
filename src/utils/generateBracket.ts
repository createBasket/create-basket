import { v4 as uuid } from 'uuid';
import { Match, Team } from '../types';

const normalizeName = (value: string) =>
  value
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim();

const nextPowerOfTwo = (value: number) => (value <= 1 ? 1 : 2 ** Math.ceil(Math.log2(value)));

const findNextMatch = (matches: Match[], round: number, slot: number) =>
  matches.find((m) => m.round === round + 1 && m.slot === Math.floor(slot / 2));

const cascadeClear = (matches: Match[], match: Match) => {
  const next = findNextMatch(matches, match.round, match.slot);
  if (!next) return;
  next.winnerId = undefined;
  cascadeClear(matches, next);
};

const chunk = (arr: number[], size: number) => {
  const res: number[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
};

const seedTeams = (sortedTeams: Team[], bracketSize: number): (Team | undefined)[] => {
  const seeded = Array<Team | undefined>(bracketSize).fill(undefined);
  const positions = Array.from({ length: bracketSize }, (_, i) => i);
  const pairGroups = chunk(positions, 2);
  const baseKey = (team?: Team) => (team ? normalizeName(team.name) : '');

  const slotConflicts = (team: Team, slot: number) => {
    const pair = pairGroups.find((g) => g.includes(slot)) || [];
    const opponentIdx = pair.find((idx) => idx !== slot);
    const opponent = opponentIdx !== undefined ? seeded[opponentIdx] : undefined;
    return {
      priorityConflict: opponent?.priority ?? false,
      sameSchoolConflict: opponent ? baseKey(opponent) === baseKey(team) : false
    };
  };

  const rankSlots = (
    team: Team,
    mode: 'priority' | 'nonPriority'
  ): Array<{ slot: number; priorityConflict: boolean; sameSchoolConflict: boolean; hasOpponent: boolean; opponentIsPriority: boolean }> => {
    const openSlots = positions.filter((idx) => !seeded[idx]);
    return openSlots
      .map((slot) => {
        const conflicts = slotConflicts(team, slot);
        const pair = pairGroups.find((g) => g.includes(slot)) || [];
        const opponentIdx = pair.find((idx) => idx !== slot);
        const opponent = opponentIdx !== undefined ? seeded[opponentIdx] : undefined;
        const hasPriorityConflict = conflicts.priorityConflict;
        const hasSameSchoolConflict = conflicts.sameSchoolConflict;
        return {
          slot,
          ...conflicts,
          hasOpponent: !!opponent,
          opponentIsPriority: !!opponent?.priority,
          compositeScore:
            mode === 'priority'
              ? [
                  hasPriorityConflict ? 4 : 0, // avoid priority vs priority
                  hasSameSchoolConflict ? 2 : 0, // avoid same school
                  opponent ? 0 : 3, // avoid bye
                  opponent?.priority ? 2 : 0 // prefer non-priority opponent
                ]
              : [
                  hasSameSchoolConflict ? 3 : 0, // avoid same school strongly
                  opponent ? 0 : 3, // avoid bye
                  opponent?.priority ? 0 : 1 // prefer pairing with priority to protect them
                ]
        };
      })
      .sort((a, b) => {
        const aScore = a.compositeScore;
        const bScore = b.compositeScore;
        const diff = aScore.findIndex((v, i) => v !== bScore[i]);
        if (diff !== -1) return aScore[diff] - bScore[diff];
        return a.slot - b.slot;
      });
  };

  const placeTeam = (team: Team, mode: 'priority' | 'nonPriority') => {
    const ordered = rankSlots(team, mode);
    // Try slots with no conflicts first
    const perfect = ordered.find((s) => !s.priorityConflict && !s.sameSchoolConflict);
    if (perfect) {
      seeded[perfect.slot] = team;
      return;
    }
    // Then allow single conflict depending on mode
    if (mode === 'priority') {
      const noPriority = ordered.find((s) => !s.priorityConflict);
      if (noPriority) {
        seeded[noPriority.slot] = team;
        return;
      }
      const noSameSchool = ordered.find((s) => !s.sameSchoolConflict);
      if (noSameSchool) {
        seeded[noSameSchool.slot] = team;
        return;
      }
    } else {
      const noSameSchool = ordered.find((s) => !s.sameSchoolConflict);
      if (noSameSchool) {
        seeded[noSameSchool.slot] = team;
        return;
      }
    }
    // Last resort: first available slot
    if (ordered[0]) {
      seeded[ordered[0].slot] = team;
    }
  };

  const priorityTeams = sortedTeams.filter((t) => t.priority);
  const others = sortedTeams.filter((t) => !t.priority);

  // Place priorities first
  priorityTeams.forEach((team) => placeTeam(team, 'priority'));
  // Then non-priorities
  others.forEach((team) => placeTeam(team, 'nonPriority'));

  // Post pass: reduce priority vs bye by borrowing opponents.
  const pairs = pairGroups.map((pair) => [pair[0], pair[1]] as const);

  const findDonor = (predicate: (a?: Team, b?: Team) => boolean) =>
    pairs.find((pair) => predicate(seeded[pair[0]], seeded[pair[1]]));

  pairs.forEach(([aIdx, bIdx]) => {
    const a = seeded[aIdx];
    const b = seeded[bIdx];
    const targetPriority = a?.priority ? a : b?.priority ? b : undefined;
    const targetEmptyIdx = !a ? aIdx : !b ? bIdx : undefined;
    if (!targetPriority || targetEmptyIdx === undefined) return;

    // First try to pull a non-priority from a match with two non-priorities.
    const donor = findDonor((x, y) => x && y && !x.priority && !y.priority);
    if (donor) {
      const [dA, dB] = donor;
      const donorTeam = seeded[dA];
      seeded[targetEmptyIdx] = donorTeam;
      seeded[dA] = undefined;
      return;
    }

    // Next try to pull a non-priority from a non-priority + bye match.
    const donorBye = findDonor((x, y) => {
      const nonPriorityWithBye = (t?: Team, u?: Team) => t && !t.priority && !u;
      return nonPriorityWithBye(x, y) || nonPriorityWithBye(y, x);
    });
    if (donorBye) {
      const [dA, dB] = donorBye;
      const donorIdx = seeded[dA] && !seeded[dA]?.priority ? dA : dB;
      const donorTeam = seeded[donorIdx];
      seeded[targetEmptyIdx] = donorTeam;
      seeded[donorIdx] = undefined;
      return;
    }

    // Next, try to pair with another priority that also has a bye.
    const donorPriority = findDonor((x, y) => {
      const hasPriority = (t?: Team) => !!t?.priority;
      const hasEmpty = (!x && y) || (!y && x);
      return hasPriority(x) !== hasPriority(y) && hasEmpty;
    });
    if (donorPriority) {
      const [dA, dB] = donorPriority;
      const donorTeam = seeded[dA] && seeded[dA]?.priority ? seeded[dA] : seeded[dB];
      const donorIdx = donorTeam === seeded[dA] ? dA : dB;
      seeded[targetEmptyIdx] = donorTeam;
      seeded[donorIdx] = undefined;
    }
  });

  // Ensure no priority is left against a bye if any opponent exists elsewhere.
  const resolvePriorityByes = () => {
    let changed = false;
    const priorityByePairs = () =>
      pairs
        .map((pair) => {
          const [aIdx, bIdx] = pair;
          const a = seeded[aIdx];
          const b = seeded[bIdx];
          if (a?.priority && !b) return { pair, priorityIdx: aIdx, emptyIdx: bIdx };
          if (b?.priority && !a) return { pair, priorityIdx: bIdx, emptyIdx: aIdx };
          return null;
        })
        .filter(Boolean) as { pair: readonly [number, number]; priorityIdx: number; emptyIdx: number }[];

    const moveNonPriorityTo = (emptyIdx: number): boolean => {
      // Prefer taking from two-non-priority pairs, then non-priority+bye; never from a pair with a priority.
      const donor = pairs.find(([aIdx, bIdx]) => {
        const a = seeded[aIdx];
        const b = seeded[bIdx];
        const hasPriority = !!a?.priority || !!b?.priority;
        if (hasPriority) return false;
        const nonPriorityCount = (a ? 1 : 0) + (b ? 1 : 0);
        return nonPriorityCount >= 1;
      });
      if (!donor) return false;
      const [dA, dB] = donor;
      const donorIdx = seeded[dA] ? dA : dB;
      const donorTeam = seeded[donorIdx];
      if (!donorTeam) return false;
      seeded[emptyIdx] = donorTeam;
      seeded[donorIdx] = undefined;
      return true;
    };

    const pairPriorities = (target: { priorityIdx: number; emptyIdx: number }, others: typeof priorityByePairs) => {
      const other = others.find((entry) => entry.priorityIdx !== target.priorityIdx);
      if (!other) return false;
      // Move the other priority into the empty slot, leaving its original slot empty (bye assigned to non-priority later).
      seeded[target.emptyIdx] = seeded[other.priorityIdx];
      seeded[other.priorityIdx] = undefined;
      return true;
    };

    const entries = priorityByePairs();
    entries.forEach((entry) => {
      if (seeded[entry.emptyIdx]) return;
      // First try to bring in a non-priority.
      const filled = moveNonPriorityTo(entry.emptyIdx);
      if (filled) {
        changed = true;
        return;
      }
      // Otherwise, pair with another priority that also has a bye.
      const others = priorityByePairs().filter((e) => e.priorityIdx !== entry.priorityIdx);
      if (pairPriorities(entry, others)) {
        changed = true;
      }
    });
    return changed;
  };

  while (resolvePriorityByes()) {
    // repeat until stable
  }

  // Post pass: collapse non-priority + bye pairs together to avoid free passes when two singles exist.
  const collapseNonPriorityByes = () => {
    let changed = false;
    const singles = pairs
      .map(([aIdx, bIdx]) => {
        const a = seeded[aIdx];
        const b = seeded[bIdx];
        if (a && !b && !a.priority) return { filledIdx: aIdx, emptyIdx: bIdx };
        if (b && !a && !b.priority) return { filledIdx: bIdx, emptyIdx: aIdx };
        return null;
      })
      .filter(Boolean) as { filledIdx: number; emptyIdx: number }[];

    while (singles.length >= 2) {
      const first = singles.shift();
      const second = singles.shift();
      if (!first || !second) break;
      // Move team from second into first's empty slot
      const teamToMove = seeded[second.filledIdx];
      if (!teamToMove) continue;
      seeded[first.emptyIdx] = teamToMove;
      seeded[second.filledIdx] = undefined;
      changed = true;
    }
    return changed;
  };

  while (collapseNonPriorityByes()) {
    // repeat until stable
  }

  const swapPriorityByes = () => {
    const priorityByePairs = pairs.filter(([aIdx, bIdx]) => {
      const a = seeded[aIdx];
      const b = seeded[bIdx];
      return (a?.priority && !b) || (b?.priority && !a);
    });
    for (let i = 0; i < priorityByePairs.length; i += 1) {
      for (let j = i + 1; j < priorityByePairs.length; j += 1) {
        const [a1, b1] = priorityByePairs[i];
        const [a2, b2] = priorityByePairs[j];
        const team1 = seeded[a1] || seeded[b1];
        const team2 = seeded[a2] || seeded[b2];
        if (!team1 || !team2) continue;
        const empty1 = seeded[a1] ? b1 : a1;
        const empty2 = seeded[a2] ? b2 : a2;
        seeded[empty1] = team2;
        seeded[empty2] = team1;
        return true;
      }
    }
    return false;
  };

  while (swapPriorityByes()) {
    // repeat until priorities without opponents are paired together
  }

  // Optimization pass: swap teams to reduce priority-vs-priority and same-school collisions.
  const pairScore = (idxA: number, idxB: number) => {
    const a = seeded[idxA];
    const b = seeded[idxB];
    const priorityConflict = !!(a?.priority && b?.priority);
    const sameSchoolConflict = !!(a && b && baseKey(a) === baseKey(b));
    const priorityWithBye = (!!a?.priority && !b) || (!!b?.priority && !a);
    return { priorityConflict, sameSchoolConflict, priorityWithBye };
  };

  const totalScore = () => {
    let priorityConflicts = 0;
    let sameSchoolConflicts = 0;
    let priorityByes = 0;
    pairs.forEach(([aIdx, bIdx]) => {
      const score = pairScore(aIdx, bIdx);
      if (score.priorityConflict) priorityConflicts += 1;
      if (score.sameSchoolConflict) sameSchoolConflicts += 1;
      if (score.priorityWithBye) priorityByes += 1;
    });
    return [priorityConflicts, sameSchoolConflicts, priorityByes] as const;
  };

  const tryImprovePairs = () => {
    const [currPrio, currSame, currByes] = totalScore();
    for (let i = 0; i < pairs.length; i += 1) {
      const [a1, b1] = pairs[i];
      for (const idx1 of [a1, b1]) {
        for (let j = i + 1; j < pairs.length; j += 1) {
          const [a2, b2] = pairs[j];
          for (const idx2 of [a2, b2]) {
            if (idx1 === idx2) continue;
            // Skip empty slots swaps that would create priority+bye
            const team1 = seeded[idx1];
            const team2 = seeded[idx2];
            const dest1Empty = !team2;
            const dest2Empty = !team1;
            if (team1?.priority && dest2Empty) continue;
            if (team2?.priority && dest1Empty) continue;

            // Swap virtually
            const tmp = seeded[idx1];
            seeded[idx1] = seeded[idx2];
            seeded[idx2] = tmp;

            const [newPrio, newSame, newByes] = totalScore();
            const improved =
              newPrio < currPrio ||
              (newPrio === currPrio && newSame < currSame) ||
              (newPrio === currPrio && newSame === currSame && newByes < currByes);

            if (improved) {
              return true; // keep swap
            }

            // revert
            seeded[idx2] = seeded[idx1];
            seeded[idx1] = tmp;
          }
        }
      }
    }
    return false;
  };

  while (tryImprovePairs()) {
    // keep improving until no better swap
  }

  return seeded;
};

export const generateBracket = (teams: Team[]): Match[] => {
  if (!teams.length) return [];
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.priority === b.priority) return a.name.localeCompare(b.name);
    return a.priority ? -1 : 1;
  });

  const bracketSize = nextPowerOfTwo(sortedTeams.length);
  const seededTeams = seedTeams(sortedTeams, bracketSize);

  const totalRounds = Math.log2(bracketSize);
  const matches: Match[] = [];
  let teamsInRound = bracketSize;

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchCount = teamsInRound / 2;
    for (let slot = 0; slot < matchCount; slot += 1) {
      const index = slot * 2;
      const teamA = round === 1 ? seededTeams[index] : undefined;
      const teamB = round === 1 ? seededTeams[index + 1] : undefined;
      matches.push({
        id: uuid(),
        round,
        slot,
        teamAId: teamA?.id,
        teamBId: teamB?.id
      });
    }
    teamsInRound /= 2;
  }

  return propagateAutoAdvances(matches);
};

const propagateAutoAdvances = (matches: Match[]): Match[] => {
  let updated = [...matches];
  let changed = false;

  updated.forEach((match) => {
    if (match.teamAId && !match.teamBId && !match.winnerId) {
      updated = propagateWinner(updated, match.id, match.teamAId, true);
      changed = true;
    } else if (!match.teamAId && match.teamBId && !match.winnerId) {
      updated = propagateWinner(updated, match.id, match.teamBId, true);
      changed = true;
    }
  });

  return changed ? propagateAutoAdvances(updated) : updated;
};

export const propagateWinner = (
  matches: Match[],
  matchId: string,
  winnerId: string,
  auto = false
): Match[] => {
  const updated = matches.map((m) => ({ ...m }));
  const match = updated.find((m) => m.id === matchId);
  if (!match) return matches;

  match.winnerId = winnerId;

  const next = findNextMatch(updated, match.round, match.slot);
  if (!next) return updated;

  const targetKey = match.slot % 2 === 0 ? 'teamAId' : 'teamBId';
  const previousValue = next[targetKey];
  next[targetKey] = winnerId;

  const opponentKey = targetKey === 'teamAId' ? 'teamBId' : 'teamAId';
  const opponent = next[opponentKey];

  if (previousValue !== winnerId) {
    next.winnerId = undefined;
    cascadeClear(updated, next);
  }

  if (next.winnerId && next.winnerId !== next.teamAId && next.winnerId !== next.teamBId) {
    next.winnerId = undefined;
    cascadeClear(updated, next);
  }

  if (!auto && opponent && opponent === winnerId) {
    next.winnerId = undefined;
  }

  return updated;
};

const buildRoundFromWinners = (winners: Team[], round: number): Match[] => {
  const result: Match[] = [];
  let slot = 0;
  for (let i = 0; i < winners.length; i += 2) {
    const teamA = winners[i];
    const teamB = winners[i + 1];
    result.push({
      id: uuid(),
      round,
      slot,
      teamAId: teamA?.id,
      teamBId: teamB?.id
    });
    slot += 1;
  }
  return result;
};

export const reseedMatches = (matches: Match[], teams: Team[]): Match[] => {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const roundOne = matches.filter((m) => m.round === 1);
  const newMatches: Match[] = roundOne.map((m) => ({ ...m }));

  const getExistingMatch = (round: number, teamAId?: string, teamBId?: string) =>
    matches.find(
      (m) =>
        m.round === round &&
        m.teamAId &&
        m.teamBId &&
        ((m.teamAId === teamAId && m.teamBId === teamBId) ||
          (m.teamAId === teamBId && m.teamBId === teamAId))
    );

  const winnersForRound = (round: number) =>
    (round === 1 ? roundOne : matches.filter((m) => m.round === round))
      .filter((m) => m.winnerId)
      .map((m) => (m.winnerId ? teamMap.get(m.winnerId) : undefined))
      .filter((t): t is Team => !!t);

  let currentRound = 1;
  let winners = winnersForRound(currentRound);

  while (winners.length >= 2) {
    const nextRoundNumber = currentRound + 1;
    const generated = generateBracket(winners).filter((m) => m.round === 1);

    const nextRoundMatches = generated.map((m) => {
      const teamAId = m.teamAId;
      const teamBId = m.teamBId;
      const prior = getExistingMatch(nextRoundNumber, teamAId, teamBId);
      const winnerId =
        prior && prior.winnerId && (prior.winnerId === teamAId || prior.winnerId === teamBId)
          ? prior.winnerId
          : undefined;
      return {
        id: uuid(),
        round: nextRoundNumber,
        slot: m.slot,
        teamAId,
        teamBId,
        winnerId
      } as Match;
    });

    newMatches.push(...nextRoundMatches);
    winners = winnersForRound(nextRoundNumber);
    currentRound = nextRoundNumber;
  }

  return newMatches;
};
  const swapPriorityByes = () => {
    const priorityByePairs = pairs.filter(([aIdx, bIdx]) => {
      const a = seeded[aIdx];
      const b = seeded[bIdx];
      return (a?.priority && !b) || (b?.priority && !a);
    });
    for (let i = 0; i < priorityByePairs.length; i += 1) {
      for (let j = i + 1; j < priorityByePairs.length; j += 1) {
        const [a1, b1] = priorityByePairs[i];
        const [a2, b2] = priorityByePairs[j];
        const team1 = seeded[a1] || seeded[b1];
        const team2 = seeded[a2] || seeded[b2];
        if (!team1 || !team2) continue;
        const empty1 = seeded[a1] ? b1 : a1;
        const empty2 = seeded[a2] ? b2 : a2;
        // swap so priorities face each other
        seeded[empty1] = team2;
        seeded[empty2] = team1;
        return true;
      }
    }
    return false;
  };
