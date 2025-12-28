import { useEffect, useState } from 'react';
import { Team } from '../types';

type Props = {
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
  disabled?: boolean;
};

const TeamsPanel = ({ teams, onTeamsChange, disabled }: Props) => {
  const [blackoutDraft, setBlackoutDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    // Initialize or sync blackout text when teams change
    const next: Record<string, string> = {};
    teams.forEach((team) => {
      next[team.id] = blackoutDraft[team.id] ?? team.blackoutDates.join(', ');
    });
    setBlackoutDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const updateTeam = (id: string, changes: Partial<Team>) => {
    onTeamsChange(
      teams.map((team) => (team.id === id ? { ...team, ...changes } : team))
    );
  };

  const parseDates = (value: string) =>
    value
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

  return (
    <div className="stack teams-scroll">
      {!teams.length && <div className="empty">Load a spreadsheet to manage teams.</div>}
      <div className="team-cards">
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
            </div>
            <label className="status" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              Blackout Dates (YYYY-MM-DD comma-separated)
              <input
                type="text"
                value={blackoutDraft[team.id] ?? ''}
                onChange={(e) => {
                  const next = e.target.value;
                  setBlackoutDraft((prev) => ({ ...prev, [team.id]: next }));
                }}
                onBlur={(e) => {
                  updateTeam(team.id, { blackoutDates: parseDates(e.target.value) });
                  setBlackoutDraft((prev) => ({ ...prev, [team.id]: e.target.value }));
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
