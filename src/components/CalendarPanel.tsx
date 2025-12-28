import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import { Match, ScheduledMatch, Team } from '../types';
import { useEffect, useRef } from 'react';

type Props = {
  teams: Team[];
  matches: Match[];
  scheduled: ScheduledMatch[];
  onSchedule: (date: string, teamAId: string, teamBId: string, round: number) => boolean;
  onCancel: (id: string) => void;
};

type DayCell = {
  date: string;
  inMonth: boolean;
};

const pairKey = (a: string, b: string) => [a, b].sort().join('::');

const CalendarPanel = ({ teams, matches, scheduled, onSchedule, onCancel }: Props) => {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [dragging, setDragging] = useState<Match | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const isAvailable = (teamId: string, date: string) => {
    const t = teams.find((team) => team.id === teamId);
    if (!t) return false;
    if (t.blackoutDates.map((d) => d.trim()).includes(date)) return false;
    if ((t.scheduledGames || []).some((entry) => entry.startsWith(date))) return false;
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

  const scheduledSet = useMemo(
    () => new Set(scheduled.map((s) => pairKey(s.teamAId, s.teamBId))),
    [scheduled]
  );

  const availableMatches = useMemo(() => {
    const list = matches.filter((m) => m.teamAId && m.teamBId) as Match[];
    return list.filter(
      (m) => !scheduledSet.has(pairKey(m.teamAId as string, m.teamBId as string))
    );
  }, [matches, scheduledSet]);

  const scheduledByDate = useMemo(() => {
    const map: Record<string, ScheduledMatch[]> = {};
    scheduled.forEach((s) => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [scheduled]);

  const teamLookup = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const handleDrop = (date: string) => {
    if (!dragging || !dragging.teamAId || !dragging.teamBId) return;
    if (!isAvailable(dragging.teamAId, date) || !isAvailable(dragging.teamBId, date)) return;
    const ok = onSchedule(date, dragging.teamAId, dragging.teamBId, dragging.round);
    if (ok) setDragging(null);
  };

  const isBlockedForDrag = (date: string) => {
    if (!dragging || !dragging.teamAId || !dragging.teamBId) return false;
    return !isAvailable(dragging.teamAId, date) || !isAvailable(dragging.teamBId, date);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleManualSet = (year: number, month: number) => {
    setCursor(startOfMonth(new Date(year, month)));
    setShowPicker(false);
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
        <div className="status">Drag a matchup onto a date to schedule. Cancel to reschedule.</div>
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
        <div className="matchups">
          {availableMatches.length === 0 && <div className="empty">All matchups scheduled.</div>}
          {availableMatches.map((m) => {
            const a = teamLookup.get(m.teamAId || '');
            const b = teamLookup.get(m.teamBId || '');
            const label = `${a?.name || 'TBD'} vs ${b?.name || 'TBD'} (R${m.round})`;
            return (
              <div
                key={m.id}
                className="pill matchup draggable"
                draggable
                onDragStart={() => setDragging(m)}
                onDragEnd={() => setDragging(null)}
                title="Drag to a date"
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
            className={`calendar-cell ${day.inMonth ? '' : 'faded'} ${isBlockedForDrag(day.date) ? 'blocked' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(day.date)}
          >
            <div className="calendar-date">{format(parseISO(day.date), 'd')}</div>
            <div className="scheduled-list">
              {(scheduledByDate[day.date] || []).map((s) => {
                const parts = getMatchParts(s);
                return (
                  <div className="pill matchup scheduled" key={s.id}>
                    <div className="match-lines">
                      <div>{parts.line1}</div>
                      <div>{parts.line2}</div>
                      <div>{parts.line3}</div>
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
