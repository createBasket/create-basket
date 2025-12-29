import { useRef, useState } from 'react';
import { parseSpreadsheet } from '../utils/parseSpreadsheet';
import { Bracket, Team } from '../types';

type Props = {
  onTeamsParsed: (teams: Team[]) => void;
  onClear: () => void;
  onBracketLoaded?: (bracket: Bracket) => void;
  onDownload?: () => void;
  canDownload?: boolean;
  disabled?: boolean;
};

const UploadPanel = ({ onTeamsParsed, onClear, onBracketLoaded, onDownload, canDownload, disabled }: Props) => {
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = async (file?: File) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text) as Bracket;
        if (!data.teams || !data.matches) throw new Error('Invalid bracket JSON');
        onBracketLoaded?.(data);
      } else {
        const teams = await parseSpreadsheet(file);
        onTeamsParsed(teams);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse spreadsheet');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="panel stack">
      <div>
        <h2>Save & Load from Spreadsheet</h2>
        <div className="status">
          Upload CSV, XLSX, or bracket JSON. CSV/XLSX should have Team, Priority, Blackout Dates columns.
        </div>
      </div>
      <div className="actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={disabled}>
          Load from File
        </button>
        <button className="btn secondary" onClick={onClear} disabled={disabled}>
          Reset
        </button>
        <button className="btn secondary" onClick={onDownload} disabled={disabled || !canDownload}>
          Download Bracket (.json)
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv, .json, application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        style={{ display: 'none' }}
        onChange={(e) => handleChange(e.target.files?.[0] || undefined)}
        disabled={disabled}
      />
      {fileName && <div className="badge">Loaded: {fileName}</div>}
      {error && <div className="status" style={{ color: '#c91d1d' }}>{error}</div>}
    </div>
  );
};

export default UploadPanel;
