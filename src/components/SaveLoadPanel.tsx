import { useRef } from 'react';

type Props = {
  onDownload: () => void;
  onUpload: (file: File) => void;
  disabled?: boolean;
  hasData: boolean;
};

const SaveLoadPanel = ({ onDownload, onUpload, disabled, hasData }: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerUpload = () => {
    inputRef.current?.click();
  };

  return (
    <div className="panel stack">
      <h2>Save & Load</h2>
      <div className="status">Download to a local file or load a previous save.</div>
      <div className="actions">
        <button className="btn primary" onClick={onDownload} disabled={!hasData || disabled}>
          Download Bracket (.json)
        </button>
        <button className="btn secondary" onClick={triggerUpload} disabled={disabled}>
          Load from File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
};

export default SaveLoadPanel;
