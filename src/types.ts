export type Team = {
  id: string;
  name: string;
  priority: boolean;
  blackoutDates: string[]; // ISO day or day+time ranges, e.g. "2025-12-14" or "2025-12-14:12:00-16:00"
  scheduledGames?: string[];
  gameWon?: boolean;
};

export type ScheduledMatch = {
  id: string;
  date: string; // YYYY-MM-DD
  teamAId: string;
  teamBId: string;
  round: number;
  startTime?: string; // HH:mm (local)
};

export type Match = {
  id: string;
  round: number;
  slot: number;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  scheduledDate?: string;
};

export type Bracket = {
  code?: string;
  teams: Team[];
  matches: Match[];
  scheduled?: ScheduledMatch[];
  consolationMatches?: Match[];
  createdAt: string;
  updatedAt: string;
};
