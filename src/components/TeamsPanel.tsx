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

  const parseDates = (value: string) =>
    value
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

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
                  updateTeam(team.id, { blackoutDates: parseDates(e.target.value) });
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
