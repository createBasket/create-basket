import { addDays, format } from 'date-fns';
import { Team } from '../types';

export type TeamAvailability = {
  team: Team;
  availableDates: string[];
};

export const computeAvailability = (
  teams: Team[],
  start: Date = new Date(),
  days: number = 30
): TeamAvailability[] =>
  teams.map((team) => {
    const blackoutSet = new Set(team.blackoutDates.map((d) => d.trim()));
    const availableDates: string[] = [];

    for (let i = 0; i < days; i += 1) {
      const candidate = addDays(start, i);
      const iso = format(candidate, 'yyyy-MM-dd');
      if (!blackoutSet.has(iso)) availableDates.push(iso);
    }

    return { team, availableDates };
  });
