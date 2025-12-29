import { useMemo } from 'react';
import { Match, Team } from '../types';

type Placement = {
  label: string;
  team?: Team;
  detail: string;
};

type Props = {
  matches: Match[];
  teams: Team[];
  title?: string;
  subtitle?: string;
};

const PlacingsPanel = ({
  matches,
  teams,
  title = 'Top Finishers',
  subtitle = 'Populates once the bracket is decided.'
}: Props) => {
  const teamLookup = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const { placements, note } = useMemo(() => {
    if (!matches.length || !teams.length) {
      return {
        placements: [] as Placement[],
        note: 'Load teams and advance winners to see the top finishers.'
      };
    }

    const finalRound = Math.max(...matches.map((m) => m.round));
    const finalMatch = matches.find((m) => m.round === finalRound);
    const result: Placement[] = [
      { label: '1st', detail: 'Champion' },
      { label: '2nd', detail: 'Runner-up' },
      { label: '3rd', detail: 'Lost to champion in semifinal' },
      { label: '4th', detail: 'Lost to runner-up in semifinal' }
    ];

    if (!finalMatch || !finalMatch.winnerId || !finalMatch.teamAId || !finalMatch.teamBId) {
      return {
        placements: result,
        note: 'Pick winners through the championship game to lock standings.'
      };
    }

    const champion = teamLookup.get(finalMatch.winnerId);
    const runnerUpId =
      finalMatch.teamAId === finalMatch.winnerId ? finalMatch.teamBId : finalMatch.teamAId;
    const runnerUp = runnerUpId ? teamLookup.get(runnerUpId) : undefined;
    result[0].team = champion;
    result[1].team = runnerUp;
    if (!champion || !runnerUp) {
      return {
        placements: result,
        note: 'Final matchup is incomplete.'
      };
    }

    const semifinalRound = finalRound - 1;
    const semifinalMatches = matches.filter((m) => m.round === semifinalRound);
    if (semifinalRound < 1 || semifinalMatches.length < 2) {
      return {
        placements: result,
        note: 'Need at least four teams to surface 3rd and 4th place.'
      };
    }
    const semisReady =
      semifinalMatches.length >= 2 &&
      semifinalMatches.every((m) => m.teamAId && m.teamBId && m.winnerId);

    if (!semisReady) {
      return {
        placements: result,
        note: 'Finish both semifinal winners to reveal 3rd and 4th place.'
      };
    }

    const semifinalLoser = (match: Match, winnerId: string) => {
      const { teamAId, teamBId } = match;
      if (!teamAId || !teamBId) return undefined;
      return winnerId === teamAId ? teamBId : teamAId;
    };

    const championSemi = semifinalMatches.find((m) => m.winnerId === champion.id);
    const runnerUpSemi = semifinalMatches.find((m) => m.winnerId === runnerUp.id);

    const thirdId = championSemi ? semifinalLoser(championSemi, champion.id) : undefined;
    const fourthId = runnerUpSemi ? semifinalLoser(runnerUpSemi, runnerUp.id) : undefined;

    const third = thirdId ? teamLookup.get(thirdId) : undefined;
    const fourth = fourthId ? teamLookup.get(fourthId) : undefined;

    const fallbackLosers = semifinalMatches
      .map((match) => {
        if (!match.winnerId) return undefined;
        const loserId = semifinalLoser(match, match.winnerId);
        return loserId ? teamLookup.get(loserId) : undefined;
      })
      .filter(Boolean) as Team[];

    result[2].team = third ?? fallbackLosers[0];
    result[3].team = fourth ?? fallbackLosers.find((team) => team.id !== result[2].team?.id);

    return {
      placements: result,
      note: result.every((p) => p.team) ? '' : 'Could not identify every semifinal loser.'
    };
  }, [matches, teams, teamLookup]);

  return (
    <div className="panel stack">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{title}</h2>
        <div className="status">{subtitle}</div>
      </div>
      {!placements.length && <div className="empty">Standings will appear after games are decided.</div>}
      {placements.length > 0 && (
        <div className="placements">
          {placements.map((place) => (
            <div className="placement-card stack" key={place.label}>
              <div className="badge">{place.label} place</div>
              <strong style={{ fontSize: 16 }}>{place.team?.name ?? 'TBD'}</strong>
              <span className="status">{place.team ? place.detail : 'Waiting for results'}</span>
            </div>
          ))}
        </div>
      )}
      {note && <div className="status">{note}</div>}
    </div>
  );
};

export default PlacingsPanel;
