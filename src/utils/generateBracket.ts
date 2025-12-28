import { v4 as uuid } from 'uuid';
import { Match, Team } from '../types';

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
  const quadGroups = chunk(positions, 4);
  const pairGroups = chunk(positions, 2);

  const priorityTeams = sortedTeams.filter((t) => t.priority);
  const others = sortedTeams.filter((t) => !t.priority);

  // Pass 1: spread priority teams across quads (groups of 4) to avoid round-2 collisions when possible
  // Only do this when non-priority teams exist; otherwise priorities can meet earlier.
  if (others.length > 0) {
    quadGroups.forEach((group) => {
      if (!priorityTeams.length) return;
      const target = group.find((idx) => idx < bracketSize);
      if (target !== undefined) {
        seeded[target] = priorityTeams.shift();
      }
    });
  }

  // Pass 2: ensure each pair (round 1 match) has at most one priority when possible.
  pairGroups.forEach((group) => {
    if (!priorityTeams.length) return;
    const hasPriority = group.some((idx) => seeded[idx]?.priority);
    if (hasPriority) return;
    const target = group.find((idx) => seeded[idx] === undefined);
    if (target !== undefined) {
      seeded[target] = priorityTeams.shift();
    }
  });

  // Pass 3: fill remaining slots with leftover priority (if unavoidable) then others.
  const remaining = [...priorityTeams, ...others];
  seeded.forEach((slot, idx) => {
    if (!slot && remaining.length) {
      seeded[idx] = remaining.shift();
    }
  });

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
    if (match.teamAId && !match.teamBId) {
      updated = propagateWinner(updated, match.id, match.teamAId, true);
      changed = true;
    } else if (!match.teamAId && match.teamBId) {
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
