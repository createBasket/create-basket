import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Team } from '../types';

type Props = {
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
  onAddTeam?: () => void;
  onRemoveTeam?: (id: string) => void;
  disabled?: boolean;
};

const TeamsPanel = ({ teams, onTeamsChange, onAddTeam, onRemoveTeam, disabled }: Props) => {
  const [blackoutDraft, setBlackoutDraft] = useState<Record<string, string>>({});

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
    // Already normalized
    if (/^\d{4}-\d{2}-\d{2}(:\d{2}:\d{2}-\d{2}:\d{2})?$/.test(text)) return text;

    const re =
      /(?:\b(?:mon|tue|wed|thu|thur|fri|sat|sun)\b,?\s*)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(\d{4}))?(?:\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)))?/i;
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

    const iso = text.match(/(\d{4}-\d{2}-\d{2})(?::(\d{2}):(\d{2})-(\d{2}):(\d{2}))?/);
    if (iso) {
      if (iso[2] && iso[3] && iso[4] && iso[5]) {
        return `${iso[1]}:${iso[2]}:${iso[3]}-${iso[4]}:${iso[5]}`;
      }
      return iso[1];
    }
    return null;
  };

  const normalizeBlackoutList = (value: string): string[] =>
    value
      .split(',')
      .map((entry) => normalizeBlackoutEntry(entry))
      .filter((v): v is string => Boolean(v));

  const updateTeam = (id: string, changes: Partial<Team>) => {
    onTeamsChange(teams.map((team) => (team.id === id ? { ...team, ...changes } : team)));
  };

  const addTeam = () => {
    if (onAddTeam) {
      onAddTeam();
      return;
    }
    const newTeam: Team = {
      id: uuid(),
      name: `Team ${teams.length + 1}`,
      priority: false,
      blackoutDates: [],
      scheduledGames: [],
      gameWon: false
    };
    onTeamsChange([newTeam, ...teams]);
  };

  const removeTeam = (id: string) => {
    const team = teams.find((t) => t.id === id);
    const confirmation = window.prompt(
      `Type "confirm" to remove ${team?.name || 'this team'}. This cannot be undone.`
    );
    if (!confirmation || confirmation.toLowerCase() !== 'confirm') return;
    if (onRemoveTeam) {
      onRemoveTeam(id);
    } else {
      onTeamsChange(teams.filter((team) => team.id !== id));
    }
  };

  return (
    <div className="stack teams-scroll">
      {!teams.length && <div className="empty">Load a spreadsheet to manage teams.</div>}
      <div className="team-cards">
        <div className="match add-card">
          <div className="stack" style={{ height: '100%', justifyContent: 'center', alignItems: 'center' }}>
            <div className="status">Add a new team to this bracket</div>
            <button className="btn primary" onClick={addTeam} disabled={disabled}>
              Add Team
            </button>
          </div>
        </div>
        {teams.map((team) => (
          <div className="match" key={team.id}>
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <input
                type="text"
                value={team.name}
                onChange={(e) => updateTeam(team.id, { name: e.target.value })}
                disabled={disabled}
                style={{ flex: 1 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={team.priority}
                  onChange={(e) => updateTeam(team.id, { priority: e.target.checked })}
                  disabled={disabled}
                />
                Priority
              </label>
              <button className="btn secondary" onClick={() => removeTeam(team.id)} disabled={disabled}>
                Remove
              </button>
            </div>
            <label className="status" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              Blackout Dates (YYYY-MM-DD for all day or YYYY-MM-DD:HH:MM-HH:MM comma-separated)
              <input
                type="text"
                value={blackoutDraft[team.id] ?? team.blackoutDates.join(', ')}
                onChange={(e) => {
                  const next = e.target.value;
                  setBlackoutDraft((prev) => ({ ...prev, [team.id]: next }));
                }}
                onBlur={(e) => {
                  const normalized = normalizeBlackoutList(e.target.value);
                  const pretty = normalized.join(', ');
                  setBlackoutDraft((prev) => ({ ...prev, [team.id]: pretty }));
                  updateTeam(team.id, { blackoutDates: normalized });
                }}
                disabled={disabled}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamsPanel;
