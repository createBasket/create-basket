# Basketball Bracket Builder

React + TypeScript front-end for uploading team spreadsheets, generating brackets, marking winners, and saving/loading via local files.

## Local Development
1) Install Node 18+ and pnpm/npm.
2) `npm install`
3) `npm run dev`

## Saving/Loading
- **Download JSON**: saves the current bracket to a local `.json` file.
- **Load from file**: load a previously downloaded `.json`.

## Data Types
```ts
type Team = { id: string; name: string; priority: boolean; blackoutDates: string[] };
type Match = { id: string; round: number; slot: number; teamAId?: string; teamBId?: string; winnerId?: string };
type Bracket = { code?: string; teams: Team[]; matches: Match[]; createdAt: string; updatedAt: string };
```

## Spreadsheet Format
- Columns: `Team`, `Priority` (`TRUE`/`FALSE`), `Blackout Dates` (comma-separated `YYYY-MM-DD`).
- Optional columns: `Scheduled Games` (comma-separated), `Game Won` (`TRUE`/`FALSE`).
- Accepts CSV or XLSX.
