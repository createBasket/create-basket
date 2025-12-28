import { v4 as uuid } from 'uuid';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file';
import { Team } from '../types';

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
};

const parseList = (raw: unknown): string[] =>
  String(raw ?? '')
    .split(',')
    .map((date) => date.trim())
    .filter(Boolean);

const normalizeRow = (row: Record<string, unknown>): Team | null => {
  const name = String(row.Team ?? row.team ?? '').trim();
  if (!name) return null;
  const priority = toBoolean(row.Priority ?? row.priority);
  const blackoutDates = parseList(row['Blackout Dates'] ?? row.blackout ?? row.blackouts);
  const scheduledGames = parseList(row['Scheduled Games'] ?? row.scheduled ?? row.games);
  const gameWon = toBoolean(row['Game Won'] ?? row.gameWon ?? row.won);
  return {
    id: uuid(),
    name,
    priority,
    blackoutDates,
    scheduledGames,
    gameWon
  };
};

const parseCsv = async (file: File): Promise<Team[]> => {
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });
  if (result.errors.length) {
    throw new Error(result.errors[0].message || 'Failed to parse CSV');
  }
  return result.data.map(normalizeRow).filter((t): t is Team => Boolean(t));
};

const parseXlsx = async (file: File): Promise<Team[]> => {
  const rows = await readXlsxFile(file, { sheet: 1 });
  if (!rows.length) return [];
  const [header, ...rest] = rows;
  const teams = rest
    .map((row) => {
      const record: Record<string, unknown> = {};
      header.forEach((colName, idx) => {
        record[String(colName)] = row[idx];
      });
      return normalizeRow(record);
    })
    .filter((t): t is Team => Boolean(t));
  return teams;
};

export const parseSpreadsheet = (file: File): Promise<Team[]> => {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) return parseCsv(file);
  return parseXlsx(file);
};
