import { useState } from 'react';

type Props = {
  onLoad: (code: string) => Promise<void> | void;
  currentCode?: string;
  loading?: boolean;
};

const StartCodePanel = ({ onLoad, currentCode, loading }: Props) => {
  const [codeInput, setCodeInput] = useState('');

  const handleLoad = async () => {
    if (!codeInput.trim()) return;
    await onLoad(codeInput.trim());
  };

  return (
    <div className="panel stack">
      <div>
        <h2>Start Code</h2>
        <div className="status">Resume a bracket without re-uploading.</div>
      </div>
      <input
        type="text"
        placeholder="Enter start code"
        value={codeInput}
        onChange={(e) => setCodeInput(e.target.value)}
        disabled={loading}
      />
      <div className="actions">
        <button className="btn primary" onClick={handleLoad} disabled={loading || !codeInput.trim()}>
          Load Bracket
        </button>
        {currentCode && <div className="badge">Current code: {currentCode}</div>}
      </div>
    </div>
  );
};

export default StartCodePanel;
