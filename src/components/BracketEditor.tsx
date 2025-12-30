import { useMemo, useState } from 'react';
import { Match, Team } from '../types';
import { PASS_ID } from '../utils/generateBracket';

type Props = {
  matches: Match[];
  teams: Team[];
  onWinner: (matchId: string, winnerId?: string) => void;
  title?: string;
  description?: string;
  emptyMessage?: string;
  direction?: 'right' | 'left';
};

const BracketEditor = ({
  matches,
  teams,
  onWinner,
  title = 'Bracket',
  description = 'Click a team to mark the winner and advance them.',
  emptyMessage = 'Upload a spreadsheet or load a start code to generate matches.',
  direction = 'right'
}: Props) => {
  const roundsAsc = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  const maxRound = roundsAsc.length ? Math.max(...roundsAsc) : 0;
  const teamLookup = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const [compact, setCompact] = useState(false);

  const handleWinner = (match: Match, teamId?: string) => {
    if (!teamId) return;
    const deselect = match.winnerId === teamId;
    onWinner(match.id, deselect ? undefined : teamId);
  };

  const sourceByWinner = useMemo(() => {
    const map = new Map<string, Match>();
    matches.forEach((m) => {
      if (m.winnerId) map.set(m.winnerId, m);
    });
    return map;
  }, [matches]);

  const layout = useMemo(() => {
    if (!matches.length) return { items: [], width: 0, height: 0 };
    const firstRoundCount = matches.filter((m) => m.round === 1).length || 1;
    const cardWidth = 220;
    const cardHeight = compact ? 66 : 80; // ~10% taller for readability
    const verticalGap = compact ? 64 : 80;
    const step = cardHeight + verticalGap;
    const totalHeight = step * firstRoundCount;
    const colWidth = cardWidth + 32;
    const width = colWidth * roundsAsc.length;

    const items = matches.map((match) => {
      const colIndex = direction === 'right' ? match.round - 1 : maxRound - match.round;
      const x = colIndex * colWidth;
      const factor = Math.pow(2, match.round - 1);
      const centerY = step * factor * (match.slot + 0.5);
      const y = centerY - cardHeight / 2;
      return { match, x, y, centerY, width: cardWidth, height: cardHeight };
    });

    return { items, width, height: totalHeight };
  }, [matches, compact, roundsAsc.length, maxRound, direction]);

  const lines = useMemo(() => {
    const entries = new Map<string, (typeof layout.items)[number]>();
    layout.items.forEach((item) => entries.set(`${item.match.round}-${item.match.slot}`, item));

    const connectors: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    layout.items.forEach((item) => {
      const parent = entries.get(`${item.match.round + 1}-${Math.floor(item.match.slot / 2)}`);
      if (!parent) return;
      const xStart = direction === 'right' ? item.x + item.width : item.x;
      const xEnd = direction === 'right' ? parent.x : parent.x + parent.width;
      connectors.push({
        x1: xStart,
        y1: item.centerY,
        x2: xEnd,
        y2: parent.centerY
      });
    });
    return connectors;
  }, [layout.items, direction]);

  return (
    <div className={`panel stack bracket-panel ${compact ? 'compact' : ''}`}>
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
        <div className={`bracket-canvas ${direction}`}>
          <svg className="bracket-lines" width={layout.width} height={layout.height}>
            {lines.map((line, idx) => {
              const midX = (line.x1 + line.x2) / 2;
              return (
                <polyline
                  key={idx}
                  points={`${line.x1},${line.y1} ${midX},${line.y1} ${midX},${line.y2} ${line.x2},${line.y2}`}
                  fill="none"
                  stroke="#cdd3ff"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
          <div className="bracket-grid" style={{ width: layout.width, height: layout.height }}>
            {layout.items.map((item) => {
              const { match, x, y, height, width: w } = item;
              const isPass = (id?: string) => id === PASS_ID;
              const hasSide = (id?: string) => !!id && (isPass(id) || teamLookup.has(id));
              const teamA = match.teamAId ? teamLookup.get(match.teamAId) : undefined;
              const teamB = match.teamBId ? teamLookup.get(match.teamBId) : undefined;
              const labelFor = (id?: string, fallback = 'TBD') =>
                isPass(id) ? 'Pass' : id ? teamLookup.get(id)?.name || fallback : fallback;
              const winnerLabel = match.winnerId ? labelFor(match.winnerId, 'TBD') : undefined;
              const fromPrev = (teamId?: string) => {
                if (!teamId) return false;
                if (isPass(teamId)) return true;
                const source = sourceByWinner.get(teamId);
                if (!source) return true; // seeded directly
                return !!source.winnerId;
              };
              const hasPassSide = isPass(match.teamAId) || isPass(match.teamBId);
              const canPick =
                !hasPassSide &&
                hasSide(match.teamAId) &&
                hasSide(match.teamBId) &&
                fromPrev(match.teamAId) &&
                fromPrev(match.teamBId);
              const options = [
                { label: 'Select winner', value: '' },
                match.teamAId ? { label: labelFor(match.teamAId), value: match.teamAId } : null,
                match.teamBId ? { label: labelFor(match.teamBId), value: match.teamBId } : null
              ].filter(Boolean) as { label: string; value: string }[];
              return (
                <div
                  className={`match-card ${match.winnerId ? 'decided' : ''}`}
                  key={match.id}
                  style={{ top: y, left: x, height, width: w }}
                >
                  <div className="match-meta">
                    <span className="badge subtle">Round {match.round}</span>
                    {winnerLabel && <span className="winner-label">Advances: {winnerLabel}</span>}
                  </div>
                  <div className="select-row">
                    <label className="sr-only">Pick winner</label>
                    <select
                      value={match.winnerId || ''}
                      onChange={(e) => handleWinner(match, e.target.value || undefined)}
                      disabled={!canPick}
                    >
                      {options.map((option) => (
                        <option key={option.value || 'empty'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="teams-mini">
                    <div className={`pill ${teamA?.priority ? 'prime' : ''}`}>{teamA?.name || 'TBD'}</div>
                    <div className={`pill ${teamB?.priority ? 'prime' : ''}`}>{teamB?.name || 'TBD'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketEditor;
