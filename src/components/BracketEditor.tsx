import { useState } from 'react';
import { Match, Team } from '../types';

type Props = {
  matches: Match[];
  teams: Team[];
  onWinner: (matchId: string, winnerId: string) => void;
  title?: string;
  description?: string;
  emptyMessage?: string;
};

const BracketEditor = ({
  matches,
  teams,
  onWinner,
  title = 'Bracket',
  description = 'Click a team to mark the winner and advance them.',
  emptyMessage = 'Upload a spreadsheet or load a start code to generate matches.'
}: Props) => {
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  const teamLookup = new Map(teams.map((team) => [team.id, team]));
  const [collapsedRounds, setCollapsedRounds] = useState<Record<number, boolean>>({});
  const [compact, setCompact] = useState(false);

  const handleWinner = (matchId: string, winnerId?: string) => {
    if (!winnerId) return;
    onWinner(matchId, winnerId);
  };

  const toggleRound = (round: number) => {
    setCollapsedRounds((prev) => ({ ...prev, [round]: !prev[round] }));
  };

  return (
    <div className={`panel stack ${compact ? 'compact' : ''}`}>
      <div>
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2>{title}</h2>
            <div className="status">{description}</div>
          </div>
          {matches.length > 6 && (
            <button className="btn secondary small" onClick={() => setCompact((prev) => !prev)}>
              {compact ? 'Full size' : 'Compact'}
            </button>
          )}
        </div>
      </div>
      {!matches.length && <div className="empty">{emptyMessage}</div>}
      {matches.length > 0 && (
        <div className="bracket vertical">
          {rounds.map((round) => {
            const collapsed = collapsedRounds[round];
            return (
              <div className="round stack">
                <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Round {round}</strong>
                  <button className="btn secondary small" onClick={() => toggleRound(round)}>
                    {collapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
                {!collapsed && (
                  <div className="round-grid">
                    {matches
                      .filter((m) => m.round === round && (m.teamAId || m.teamBId))
                      .sort((a, b) => a.slot - b.slot)
                      .map((match) => {
                        const teamA = match.teamAId ? teamLookup.get(match.teamAId) : undefined;
                        const teamB = match.teamBId ? teamLookup.get(match.teamBId) : undefined;
                        const winner = match.winnerId ? teamLookup.get(match.winnerId) : undefined;
                        return (
                          <div className="match" key={match.id}>
                            <div className={`team ${teamA?.priority ? 'prime' : ''}`}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                <input
                                  type="radio"
                                  name={match.id}
                                  checked={match.winnerId === teamA?.id}
                                  onChange={() => handleWinner(match.id, teamA?.id)}
                                  disabled={!teamA}
                                />
                                <span>{teamA?.name || 'TBD'}</span>
                              </label>
                              {teamA?.priority && <span className="badge">Priority</span>}
                            </div>
                            <div className={`team ${teamB?.priority ? 'prime' : ''}`}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                <input
                                  type="radio"
                                  name={match.id}
                                  checked={match.winnerId === teamB?.id}
                                  onChange={() => handleWinner(match.id, teamB?.id)}
                                  disabled={!teamB}
                                />
                                <span>{teamB?.name || 'TBD'}</span>
                              </label>
                              {teamB?.priority && <span className="badge">Priority</span>}
                            </div>
                            {winner && <div className="winner">Winner: {winner.name}</div>}
                          </div>
                        );
                      })}
                    {matches.filter((m) => m.round === round && !(m.teamAId || m.teamBId)).length > 0 && (
                      <div className="empty">Byes fill the remaining slots in this round.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BracketEditor;
