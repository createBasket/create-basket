import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import UploadPanel from './components/UploadPanel';
import BracketEditor from './components/BracketEditor';
import CalendarPanel from './components/CalendarPanel';
import TeamsPanel from './components/TeamsPanel';
import PlacingsPanel from './components/PlacingsPanel';
import { Bracket, Match, ScheduledMatch, Team } from './types';
import { generateBracket, propagateWinner } from './utils/generateBracket';
import { v4 as uuid } from 'uuid';

const App = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [consolationMatches, setConsolationMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState<string>('Waiting for input');
  const [busy, setBusy] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledMatch[]>([]);
  const [baseline, setBaseline] = useState<Bracket | null>(null);

  const roundCount = useMemo(
    () => (matches.length ? Math.max(...matches.map((m) => m.round)) : 0),
    [matches]
  );

  const handleTeamsParsed = (parsed: Team[]) => {
    setTeams(parsed);
    const generated = generateBracket(parsed);
    setMatches(generated);
    setStatus(`Loaded ${parsed.length} team${parsed.length === 1 ? '' : 's'}. Bracket ready.`);
    setScheduled([]);
    setConsolationMatches([]);
    setBaseline({
      teams: parsed,
      matches: generated,
      consolationMatches: [],
      scheduled: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  const handleBracketLoaded = (data: Bracket) => {
    setTeams(data.teams);
    setMatches(data.matches);
    setConsolationMatches(data.consolationMatches || []);
    setScheduled(data.scheduled || []);
    setStatus('Bracket JSON loaded.');
    setBaseline({
      ...data,
      consolationMatches: data.consolationMatches || [],
      scheduled: data.scheduled || []
    });
  };

  const handleWinner = (matchId: string, winnerId?: string) => {
    setMatches((prev) => propagateWinner(prev, matchId, winnerId));
  };

  const handleConsolationWinner = (matchId: string, winnerId?: string) => {
    setConsolationMatches((prev) => propagateWinner(prev, matchId, winnerId));
  };

  const handleDownload = () => {
    if (!teams.length || !matches.length) {
      setStatus('Nothing to save yet.');
      return;
    }
    const payload: Bracket = {
      teams,
      matches,
      consolationMatches,
      scheduled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = format(new Date(), 'yyyy-MM-dd--HH-mm-ss');
    link.download = `bracket--${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded bracket JSON to your device.');
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Partial<Bracket>;
      if (!Array.isArray(raw?.teams) || !Array.isArray(raw?.matches)) {
        throw new Error('Invalid bracket file. Expecting "teams" and "matches" arrays.');
      }
      const normalized: Bracket = {
        teams: raw.teams,
        matches: raw.matches,
        scheduled: raw.scheduled || [],
        consolationMatches: raw.consolationMatches || [],
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setTeams(normalized.teams);
      setMatches(normalized.matches);
      setScheduled(normalized.scheduled || []);
      setConsolationMatches(normalized.consolationMatches || []);
      setStatus(`Loaded bracket from ${file.name}.`);
      setBaseline(normalized);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    if (baseline) {
      setTeams(baseline.teams);
      setMatches(baseline.matches);
      setScheduled(baseline.scheduled || []);
      setConsolationMatches(baseline.consolationMatches || []);
      setStatus('Reset to last uploaded bracket.');
    } else {
      setTeams([]);
      setMatches([]);
      setConsolationMatches([]);
      setStatus('Reset. Upload a spreadsheet or load a saved file to begin.');
      setScheduled([]);
    }
  };

  const regenerateBracket = (nextTeams: Team[], message?: string) => {
    const regenerated = generateBracket(nextTeams);
    setTeams(nextTeams);
    setMatches(regenerated);
    setConsolationMatches([]);
    setScheduled([]);
    setStatus(message || `Bracket refreshed for ${nextTeams.length} team${nextTeams.length === 1 ? '' : 's'}.`);
  };

  const handleAddTeam = () => {
    const newTeam: Team = {
      id: uuid(),
      name: `Team ${teams.length + 1}`,
      priority: false,
      blackoutDates: [],
      scheduledGames: [],
      gameWon: false
    };
    regenerateBracket([newTeam, ...teams], `Added ${newTeam.name}. Bracket refreshed for ${teams.length + 1} teams.`);
  };

  const handleRemoveTeam = (id: string) => {
    const team = teams.find((t) => t.id === id);
    const updated = teams.filter((t) => t.id !== id);
    regenerateBracket(updated, `Removed ${team?.name || 'team'}. Bracket refreshed for ${updated.length} teams.`);
  };

  const pairKey = (a: string, b: string) => [a, b].sort().join('::');

  const scheduleMatch = (date: string, teamAId: string, teamBId: string, round: number, startTime?: string) => {
    // unique pairing
    if (scheduled.some((s) => pairKey(s.teamAId, s.teamBId) === pairKey(teamAId, teamBId))) {
      setStatus('This pairing is already scheduled.');
      return false;
    }

    const entry: ScheduledMatch = { id: uuid(), date, teamAId, teamBId, round, startTime };
    setScheduled((prev) => [...prev, entry]);
    setTeams((prev) => {
      const a = prev.find((t) => t.id === teamAId);
      const b = prev.find((t) => t.id === teamBId);
      if (!a || !b) return prev;
      const timeLabel = startTime ? ` @ ${startTime}` : '';
      const label = `${date}${timeLabel}: ${a.name} vs ${b.name} [${entry.id}]`;
      const updateTeam = (team: Team) => ({
        ...team,
        scheduledGames: [...(team.scheduledGames || []), label]
      });
      return prev.map((team) => {
        if (team.id === a.id) return updateTeam(team);
        if (team.id === b.id) return updateTeam(team);
        return team;
      });
    });
    setStatus(`Scheduled ${date}`);
    return true;
  };

  const cancelMatch = (id: string) => {
    setScheduled((prev) => prev.filter((s) => s.id !== id));
    setTeams((prev) =>
      prev.map((team) => ({
        ...team,
        scheduledGames: (team.scheduledGames || []).filter((entry) => !entry.includes(id))
      }))
    );
    setStatus('Match canceled. Reschedule as needed.');
  };

  const updateScheduledTime = (id: string, startTime: string) => {
    setScheduled((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        return { ...s, startTime };
      })
    );
    setTeams((prev) =>
      prev.map((team) => ({
        ...team,
        scheduledGames: (team.scheduledGames || []).map((entry) => {
          if (!entry.includes(id)) return entry;
          // replace time segment if present; simplest is to rebuild label
          return entry.replace(/^\d{4}-\d{2}-\d{2}( @ [0-9:]{4,5})?/, `${entry.slice(0, 10)}${startTime ? ` @ ${startTime}` : ''}`);
        })
      }))
    );
  };

  const activeTeamsText = teams.length ? `${teams.length} teams` : 'No teams yet';
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    teams: true,
    bracket: true,
    availability: false,
    consolation: true
  });

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const firstRoundMatches = matches.filter((m) => m.round === 1);

    const losers = firstRoundMatches
      .map((match) => {
        if (!match.teamAId || !match.teamBId || !match.winnerId) return undefined;
        return match.winnerId === match.teamAId ? match.teamBId : match.teamAId;
      })
      .filter(Boolean) as string[];

    if (!losers.length) {
      setConsolationMatches([]);
      return;
    }

    const loserTeams = losers
      .map((id) => teams.find((team) => team.id === id))
      .filter(Boolean) as Team[];

    setConsolationMatches((prev) => {
      const prevIds = new Set(
        prev.flatMap((m) => [m.teamAId, m.teamBId]).filter((id): id is string => !!id)
      );
      const loserIds = new Set(losers);
      const sameSet =
        prevIds.size === loserIds.size && [...prevIds].every((id) => loserIds.has(id));
      if (prev.length && sameSet) return prev;
      return generateBracket(loserTeams);
    });
  }, [matches, teams]);

  return (
    <div className="page">
      <header className="stack">
        <div className="badge">React</div>
        <h1>Basketball Bracket + Scheduler</h1>
        <p style={{ maxWidth: 720, color: '#3c3f57' }}>
          Upload a spreadsheet to generate a bracket. Advance winners, view availability, and save/load via local files.
        </p>
        <div className="actions">
          <div className="badge">{activeTeamsText}</div>
          <div className="badge">Rounds: {roundCount || '—'}</div>
          <div className="badge">{status}</div>
        </div>
      </header>

      <div className="grid">
        <div className="stack">
          <UploadPanel
            onTeamsParsed={handleTeamsParsed}
            onClear={handleReset}
            onBracketLoaded={handleBracketLoaded}
            onDownload={handleDownload}
            canDownload={!!teams.length && !!matches.length}
            disabled={busy}
          />
        </div>

        <div className="stack">
          <div className="panel stack">
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Teams</h2>
              <button className="btn secondary" onClick={() => toggle('teams')}>
                {expanded.teams ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {expanded.teams && (
              <TeamsPanel
                teams={teams}
                onTeamsChange={setTeams}
                onAddTeam={handleAddTeam}
                onRemoveTeam={handleRemoveTeam}
                disabled={busy}
              />
            )}
          </div>
          <div className="panel stack">
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Championship</h2>
              <button className="btn secondary" onClick={() => toggle('bracket')}>
                {expanded.bracket ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {expanded.bracket && (
              <BracketEditor
                matches={matches}
                teams={teams}
                onWinner={handleWinner}
                direction="right"
                description="Click a team to advance toward the championship."
                emptyMessage="Upload a spreadsheet or load a start code to generate matches."
              />
            )}
          </div>
          <div className="panel stack">
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Consolation</h2>
              <button className="btn secondary" onClick={() => toggle('consolation')}>
                {expanded.consolation ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {expanded.consolation && (
              <BracketEditor
                matches={consolationMatches}
                teams={teams}
                onWinner={handleConsolationWinner}
                description="First-round losers play for consolation standings."
                emptyMessage="Complete all first-round winners to seed the consolation bracket."
                title="Consolation Bracket"
                direction="left"
              />
            )}
          </div>
          <PlacingsPanel matches={matches} teams={teams} title="Championship Places" />
          <PlacingsPanel
            matches={consolationMatches}
            teams={teams}
            title="Consolation Places"
            subtitle="Finish consolation rounds to show 1st–4th."
          />
          <div className="panel stack">
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Availability</h2>
              <button className="btn secondary" onClick={() => toggle('availability')}>
                {expanded.availability ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {expanded.availability && (
              <CalendarPanel
                teams={teams}
                matches={matches}
                scheduled={scheduled}
                onSchedule={scheduleMatch}
                onUpdateTime={updateScheduledTime}
                onCancel={cancelMatch}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
