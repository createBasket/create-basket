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

const monthIndex = (name: string): number | null => {
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december'
  ];
  const idx = months.indexOf(name.toLowerCase());
  return idx === -1 ? null : idx;
};

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const parseTimeToMinutes = (value: string): number | null => {
  const cleaned = value.trim().toLowerCase();
  const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours >= 24 || minutes >= 60) return null;
  return hours * 60 + minutes;
};

const normalizeBlackoutEntry = (raw: string): string | null => {
  const text = raw.trim();
  if (!text) return null;

  // Already normalized form
  if (/^\d{4}-\d{2}-\d{2}(:\d{2}(:\d{2})?-\d{2}(:\d{2})?)?$/.test(text)) return text;

  // Try to parse formats like "December 14 2025 12pm - 4pm" or "Sunday December 14th 12pm-4pm"
  const re = /([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(\d{4}))?.*?(\d{1,2}(?::\d{2})?\s*(?:am|pm))?\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))?/;
  const m = text.match(re);
  const currentYear = new Date().getFullYear();
  if (m) {
    const monthName = m[1];
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : currentYear;
    const monthIdx = monthIndex(monthName);
    if (monthIdx !== null) {
      const dateStr = `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
      const start = m[4] ? parseTimeToMinutes(m[4]) : null;
      const end = m[5] ? parseTimeToMinutes(m[5]) : null;
      if (start !== null && end !== null && end > start) {
        const startLabel = `${pad(Math.floor(start / 60))}:${pad(start % 60)}`;
        const endLabel = `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
        return `${dateStr}:${startLabel}-${endLabel}`;
      }
      return dateStr;
    }
  }

  // Fallback: allow raw date parse YYYY-MM-DD
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  return null;
};

const parseListGeneric = (raw: unknown): string[] =>
  String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseBlackoutList = (raw: unknown): string[] => {
  const text = String(raw ?? '');
  const result: string[] = [];
  const currentYear = new Date().getFullYear();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const re =
    /(?:\b(?:mon|tue|wed|thu|thur|fri|sat|sun)\b,?\s*)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(\d{4}))?(?:\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)))?/gi;

  for (const match of text.matchAll(re)) {
    const monthName = match[1];
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : currentYear;
    const startRaw = match[4];
    const endRaw = match[5];
    const monthIdx = monthIndex(monthName);
    if (monthIdx === null || Number.isNaN(day) || Number.isNaN(year)) continue;
    const dateStr = `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
    const start = startRaw ? parseTimeToMinutes(startRaw) : null;
    const end = endRaw ? parseTimeToMinutes(endRaw) : null;
    if (start !== null && end !== null && end > start) {
      const startLabel = `${pad(Math.floor(start / 60))}:${pad(start % 60)}`;
      const endLabel = `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
      result.push(`${dateStr}:${startLabel}-${endLabel}`);
    } else {
      result.push(dateStr);
    }
  }

  if (result.length) return result;

  return text
    .split(',')
    .map((date) => normalizeBlackoutEntry(date))
    .filter((v): v is string => Boolean(v));
};

const normalizeRow = (row: Record<string, unknown>): Team | null => {
  const baseName = String(row.Team ?? row.team ?? row['Team Name'] ?? row['School Name'] ?? '').trim();
  const color = String(row['Team Color'] ?? '').trim();
  const name = color ? `${baseName} (${color})` : baseName;
  if (!name) return null;
  const priority = toBoolean(row.Priority ?? row.priority);
  const blackoutSource = row['Blackout Dates'] ?? row.blackout ?? row.blackouts ?? row['Team Conflicts'];
  const blackoutDates = parseBlackoutList(blackoutSource);
  const scheduledGames = parseListGeneric(row['Scheduled Games'] ?? row.scheduled ?? row.games);
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
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true
  });

  if (result.errors.length && !result.data.length) {
    throw new Error(result.errors[0].message || 'Failed to parse CSV');
  }

  const rows = result.data as string[][];
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  const body = rows.slice(1).map((row) => {
    // Merge any extra columns into the last (blackout) field so commas inside dates don't break parsing.
    if (row.length > headers.length && headers.length >= 3) {
      row[2] = row.slice(2).join(',');
      row.length = headers.length;
    }
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx];
    });
    return record;
  });

  // Fallback if no headers: assume Team, Priority, Blackout Dates
  const headerKnown = headers.length >= 2 && headers.some((h) => /team/i.test(h));
  const normalizedBody =
    headerKnown && headers.length
      ? body
      : rows.map((row) => ({
          Team: row[0],
          Priority: row[1],
          'Blackout Dates': row.slice(2).join(',')
        }));

  return normalizedBody.map(normalizeRow).filter((t): t is Team => Boolean(t));
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
