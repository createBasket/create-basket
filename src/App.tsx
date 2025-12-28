import { useMemo, useState } from 'react';
import UploadPanel from './components/UploadPanel';
import BracketEditor from './components/BracketEditor';
import CalendarPanel from './components/CalendarPanel';
import SaveLoadPanel from './components/SaveLoadPanel';
import TeamsPanel from './components/TeamsPanel';
import { Bracket, Match, ScheduledMatch, Team } from './types';
import { generateBracket, propagateWinner } from './utils/generateBracket';
import { v4 as uuid } from 'uuid';

const App = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState<string>('Waiting for input');
  const [busy, setBusy] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledMatch[]>([]);

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
  };

  const handleBracketLoaded = (data: Bracket) => {
    setTeams(data.teams);
    setMatches(data.matches);
    setScheduled(data.scheduled || []);
    setStatus('Bracket JSON loaded.');
  };

  const handleWinner = (matchId: string, winnerId: string) => {
    setMatches((prev) => propagateWinner(prev, matchId, winnerId));
  };

  const handleDownload = () => {
    if (!teams.length || !matches.length) {
      setStatus('Nothing to save yet.');
      return;
    }
    const payload: Bracket = {
      teams,
      matches,
      scheduled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bracket-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded bracket JSON to your device.');
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Bracket;
      if (!parsed.teams || !parsed.matches) {
        throw new Error('Invalid bracket file.');
      }
      setTeams(parsed.teams);
      setMatches(parsed.matches);
      setScheduled(parsed.scheduled || []);
      setStatus(`Loaded bracket from ${file.name}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setBusy(false);
    }
  };

  const handleDriveSave = () => {
    setStatus('Google Drive save: wire this button to Drive Picker / REST API.');
  };

  const handleDriveLoad = () => {
    setStatus('Google Drive load: wire this button to Drive Picker / REST API.');
  };

  const handleReset = () => {
    setTeams([]);
    setMatches([]);
    setStatus('Reset. Upload a spreadsheet or load a saved file to begin.');
    setScheduled([]);
  };

  const pairKey = (a: string, b: string) => [a, b].sort().join('::');

  const scheduleMatch = (date: string, teamAId: string, teamBId: string, round: number) => {
    // unique pairing
    if (scheduled.some((s) => pairKey(s.teamAId, s.teamBId) === pairKey(teamAId, teamBId))) {
      setStatus('This pairing is already scheduled.');
      return false;
    }

    // Round order: ensure this date is after any earlier round dates
    const prior = scheduled.filter((s) => s.round < round);
    if (prior.length) {
      const latestPrior = prior.reduce((max, cur) => (cur.date > max ? cur.date : max), prior[0].date);
      if (date <= latestPrior) {
        setStatus(`Round ${round} games must be after ${latestPrior}.`);
        return false;
      }
    }

    const entry: ScheduledMatch = { id: uuid(), date, teamAId, teamBId, round };
    setScheduled((prev) => [...prev, entry]);
    setTeams((prev) => {
      const a = prev.find((t) => t.id === teamAId);
      const b = prev.find((t) => t.id === teamBId);
      if (!a || !b) return prev;
      const label = `${date}: ${a.name} vs ${b.name} [${entry.id}]`;
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

  const activeTeamsText = teams.length ? `${teams.length} teams` : 'No teams yet';
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    teams: true,
    bracket: true,
    availability: false
  });

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="page">
      <header className="stack">
        <div className="badge">React + AWS-ready</div>
        <h1>Basketball Bracket + Scheduler</h1>
        <p style={{ maxWidth: 720, color: '#3c3f57' }}>
          Upload a spreadsheet to generate a bracket. Advance winners, view availability, and save/load via local files
          or hook up Google Drive.
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
            disabled={busy}
          />
          <SaveLoadPanel
            onDownload={handleDownload}
            onUpload={handleUpload}
            onDriveSave={handleDriveSave}
            onDriveLoad={handleDriveLoad}
            disabled={busy}
            hasData={!!teams.length && !!matches.length}
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
            {expanded.teams && <TeamsPanel teams={teams} onTeamsChange={setTeams} disabled={busy} />}
          </div>
          <div className="panel stack">
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Bracket</h2>
              <button className="btn secondary" onClick={() => toggle('bracket')}>
                {expanded.bracket ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {expanded.bracket && <BracketEditor matches={matches} teams={teams} onWinner={handleWinner} />}
          </div>
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
