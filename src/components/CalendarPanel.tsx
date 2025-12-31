import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  addHours,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import { Match, ScheduledMatch, Team } from '../types';
import { useRef } from 'react';

type Props = {
  teams: Team[];
  matches: Match[];
  scheduled: ScheduledMatch[];
  onSchedule: (date: string, teamAId: string, teamBId: string, round: number, startTime?: string) => boolean;
  onUpdateTime: (id: string, startTime: string) => void;
  onCancel: (id: string) => void;
};

const buildIcs = (scheduled: ScheduledMatch[], teamLookup: Map<string, Team>): string => {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//create-basket//scheduler//EN',
    'CALSCALE:GREGORIAN'
  ];

  scheduled.forEach((s) => {
    const allDay = !s.startTime;
    const startDateObj = s.startTime ? parseISO(`${s.date}T${s.startTime}`) : null;
    const endDateObj = startDateObj ? addHours(startDateObj, 1) : null;
    const startDateStr = s.startTime
      ? format(startDateObj as Date, "yyyyMMdd'T'HHmmss")
      : s.date.replace(/-/g, '');
    const endDateStr = endDateObj ? format(endDateObj, "yyyyMMdd'T'HHmmss") : undefined;
    const summary = `${teamLookup.get(s.teamAId)?.name || 'Team A'} vs ${teamLookup.get(s.teamBId)?.name || 'Team B'} (R${s.round})`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${s.id}@create-basket`);
    lines.push(`DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss")}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${startDateStr}`);
      // All-day events typically omit DTEND or use next day; leave out to avoid same-time issue.
    } else {
      lines.push(`DTSTART:${startDateStr}`);
      if (endDateStr) lines.push(`DTEND:${endDateStr}`);
      else lines.push('DURATION:PT1H');
    }
    lines.push(`SUMMARY:${summary}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

type DayCell = {
  date: string;
  inMonth: boolean;
};

const pairKey = (a: string, b: string) => [a, b].sort().join('::');
const parseTimeToMinutesLocal = (value: string): number | null => {
  const cleaned = value.trim();
  const match = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours >= 24 || minutes >= 60) return null;
  return hours * 60 + minutes;
};

const CalendarPanel = ({ teams, matches, scheduled, onSchedule, onUpdateTime, onCancel }: Props) => {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedTime, setSelectedTime] = useState('18:00');
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const parseRange = (entry: string) => {
    if (!entry.includes(':')) return { date: entry.trim(), start: null, end: null };
    const [day, range] = entry.split(':');
    const [startRaw, endRaw] = range.split('-');
    const toMinutes = (val?: string | null) => {
      if (!val) return null;
      const m = val.match(/(\d{1,2}):?(\d{2})?/);
      if (!m) return null;
      const h = Number(m[1]);
      const min = m[2] ? Number(m[2]) : 0;
      if (h >= 24 || min >= 60) return null;
      return h * 60 + min;
    };
    return { date: day.trim(), start: toMinutes(startRaw), end: toMinutes(endRaw) };
  };

  const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
    Math.max(startA, startB) < Math.min(endA, endB);

  const isAvailable = (teamId: string, date: string, startTime?: string) => {
    const t = teams.find((team) => team.id === teamId);
    if (!t) return false;
    const startMinutes = startTime ? parseTimeToMinutesLocal(startTime) : null;
    const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
      startA <= endB && startB <= endA; // inclusive endpoints

    for (const entry of t.blackoutDates) {
      const { date: d, start, end } = parseRange(entry);
      if (d !== date) continue;
      if (start === null || end === null || startMinutes === null) return false; // full-day block or no time provided
      if (rangesOverlap(start, end, startMinutes, startMinutes + 60)) return false;
    }

    const parseScheduledEntry = (entry: string) => {
      const m = entry.match(/^(\d{4}-\d{2}-\d{2})(?:\s*@\s*([0-9]{1,2}:[0-9]{2}))?/);
      if (!m) return null;
      const day = m[1];
      const time = m[2];
      const mins = time ? parseTimeToMinutesLocal(time) : null;
      return { day, mins };
    };

    const hasConflict = (t.scheduledGames || []).some((entry) => {
      const parsed = parseScheduledEntry(entry);
      if (!parsed || parsed.day !== date) return false;
      // if existing entry has no time or current pick has no time, treat as conflict
      if (parsed.mins === null || startMinutes === null) return true;
      return rangesOverlap(parsed.mins, parsed.mins + 60, startMinutes, startMinutes + 60);
    });
    if (hasConflict) return false;

    return true;
  };

  const days: DayCell[] = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end }).map((d) => ({
      date: format(d, 'yyyy-MM-dd'),
      inMonth: isSameMonth(d, cursor)
    }));
  }, [cursor]);

  const matchLookup = useMemo(() => {
    const map = new Map<string, Match>();
    matches.forEach((m) => {
      if (m.teamAId && m.teamBId) {
        const key = `${pairKey(m.teamAId, m.teamBId)}::${m.round}`;
        map.set(key, m);
      }
    });
    return map;
  }, [matches]);

  const scheduledSet = useMemo(() => {
    const set = new Set<string>();
    scheduled.forEach((s) => {
      const key = `${pairKey(s.teamAId, s.teamBId)}::${s.round}`;
      set.add(key);
    });
    return set;
  }, [scheduled]);

  const availableMatches = useMemo(() => {
    const list = matches.filter((m) => m.teamAId && m.teamBId && !m.winnerId) as Match[];
    return list.filter(
      (m) => !scheduledSet.has(`${pairKey(m.teamAId as string, m.teamBId as string)}::${m.round}`)
    );
  }, [matches, scheduledSet]);

  const scheduledByDate = useMemo(() => {
    const map: Record<string, ScheduledMatch[]> = {};
    scheduled.forEach((s) => {
      const key = `${pairKey(s.teamAId, s.teamBId)}::${s.round}`;
      const match = matchLookup.get(key);
      if (match?.winnerId) return; // hide completed matches from scheduler
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [scheduled, matchLookup]);

  const teamLookup = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const handleDateSelect = (date: string) => {
    if (!selectedMatch || !selectedMatch.teamAId || !selectedMatch.teamBId) return;
    if (
      !isAvailable(selectedMatch.teamAId, date, selectedTime) ||
      !isAvailable(selectedMatch.teamBId, date, selectedTime)
    )
      return;
    const ok = onSchedule(date, selectedMatch.teamAId, selectedMatch.teamBId, selectedMatch.round, selectedTime);
    if (ok) setSelectedMatch(null);
  };

  const isBlockedForSelection = (date: string) => {
    if (!selectedMatch || !selectedMatch.teamAId || !selectedMatch.teamBId) return false;
    return !isAvailable(selectedMatch.teamAId, date, selectedTime) || !isAvailable(selectedMatch.teamBId, date, selectedTime);
  };

  const handleManualSet = (year: number, month: number) => {
    setCursor(startOfMonth(new Date(year, month)));
    setShowPicker(true);
  };

  const getMatchParts = (s: ScheduledMatch) => {
    const a = teamLookup.get(s.teamAId);
    const b = teamLookup.get(s.teamBId);
    return {
      line1: a?.name || 'Team A',
      line2: b?.name ? `vs ${b.name}` : 'vs Team B',
      line3: `Round ${s.round}`
    };
  };

  return (
    <div className="stack">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="actions">
          <button className="btn secondary" onClick={() => setCursor((c) => addMonths(c, -1))}>
            Prev
          </button>
          <button className="btn secondary" onClick={() => setShowPicker((s) => !s)}>
            {format(cursor, 'MMMM yyyy')}
          </button>
          <button className="btn secondary" onClick={() => setCursor((c) => addMonths(c, 1))}>
            Next
          </button>
        </div>
        <div className="status">
          Select a matchup, then click an available date to schedule. Red X means blackout for the selected matchup.
        </div>
        <button
          className="btn secondary"
          onClick={() => {
            const content = buildIcs(scheduled, teamLookup);
            const blob = new Blob([content], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bracket-schedule-${format(new Date(), 'yyyyMMdd-HHmmss')}.ics`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export .ics
        </button>
      </div>

      {showPicker && (
        <div className="picker" ref={pickerRef}>
          <div className="picker-row">
            <label>Month</label>
            <select
              value={cursor.getMonth()}
              onChange={(e) => handleManualSet(cursor.getFullYear(), Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {format(new Date(2000, i, 1), 'MMMM')}
                </option>
              ))}
            </select>
          </div>
          <div className="picker-row">
            <label>Year</label>
            <input
              type="number"
              value={cursor.getFullYear()}
              onChange={(e) => handleManualSet(Number(e.target.value), cursor.getMonth())}
            />
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setShowPicker(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="drag-source">
        <div className="status">Unscheduled matchups</div>
        <div className="actions" style={{ alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Start time</label>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            style={{ maxWidth: 140 }}
          />
        </div>
        <div className="matchups">
          {availableMatches.length === 0 && <div className="empty">All matchups scheduled.</div>}
          {availableMatches.map((m) => {
            const a = teamLookup.get(m.teamAId || '');
            const b = teamLookup.get(m.teamBId || '');
            const label = `${a?.name || 'TBD'} vs ${b?.name || 'TBD'} (R${m.round})`;
            return (
              <div
                key={m.id}
                className={`pill matchup ${selectedMatch?.id === m.id ? 'selected' : ''}`}
                onClick={() => setSelectedMatch((prev) => (prev?.id === m.id ? null : m))}
                title="Click to select"
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="calendar-grid month-view">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="calendar-header">
            {d}
          </div>
        ))}
        {days.map((day) => (
          <div
            key={day.date}
            className={`calendar-cell ${day.inMonth ? '' : 'faded'} ${isBlockedForSelection(day.date) ? 'blocked' : ''}`}
            onClick={() => handleDateSelect(day.date)}
          >
            <div className="calendar-date">{format(parseISO(day.date), 'd')}</div>
            {isBlockedForSelection(day.date) && <div className="blackout-x">✕</div>}
            <div className="scheduled-list">
              {(scheduledByDate[day.date] || []).map((s) => {
                const parts = getMatchParts(s);
                return (
                  <div className="pill matchup scheduled" key={s.id}>
                    <div className="match-lines">
                      <div>{parts.line1}</div>
                      <div>{parts.line2}</div>
                      <div>{parts.line3}</div>
                      <div className="time-edit">
                        <label>Time</label>
                        <input
                          type="time"
                          value={s.startTime || ''}
                          onChange={(e) => onUpdateTime(s.id, e.target.value)}
                        />
                      </div>
                    </div>
                    <button className="btn secondary small" onClick={() => onCancel(s.id)}>
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarPanel;
