export type Team = {
  id: string;
  name: string;
  priority: boolean;
  blackoutDates: string[]; // ISO strings YYYY-MM-DD
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
