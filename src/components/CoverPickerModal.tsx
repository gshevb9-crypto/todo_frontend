import React, { useState } from 'react';

interface CoverPickerModalProps {
  isOpen: boolean;
  currentCover: string | null;
  onSelectCover: (cover: string | null) => void;
  onClose: () => void;
}

export const COVER_PRESETS = [
  {
    id: 'gradient-sunset',
    name: 'Sunset Aura',
    value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    id: 'gradient-ocean',
    name: 'Deep Ocean',
    value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  {
    id: 'gradient-emerald',
    name: 'Emerald Forest',
    value: 'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)',
  },
  {
    id: 'gradient-cosmic',
    name: 'Cosmic Night',
    value: 'linear-gradient(135deg, #182236 0%, #291838 50%, #151b2e 100%)',
  },
  {
    id: 'gradient-lavender',
    name: 'Lavender Dusk',
    value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'gradient-gold',
    name: 'Golden Hour',
    value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  },
  {
    id: 'gradient-cyber',
    name: 'Cyberpunk Neon',
    value: 'linear-gradient(135deg, #b224ef 0%, #7579ff 100%)',
  },
  {
    id: 'gradient-slate',
    name: 'Nordic Slate',
    value: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
  },
];

export const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
  isOpen,
  currentCover,
  onSelectCover,
  onClose,
}) => {
  const [customUrl, setCustomUrl] = useState('');

  if (!isOpen) return null;

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim()) {
      onSelectCover(`url("${customUrl.trim()}")`);
      onClose();
    }
  };

  return (
    <div className="notion-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Change cover">
      <div className="notion-cover-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-modal-title-row">
          <span className="notion-modal-heading">Change cover</span>
          {currentCover && (
            <button
              type="button"
              className="notion-btn-subtle danger"
              onClick={() => {
                onSelectCover(null);
                onClose();
              }}
            >
              Remove cover
            </button>
          )}
        </div>

        <div className="notion-cover-section">
          <div className="notion-cover-section-label">Gradients & Presets</div>
          <div className="notion-cover-grid">
            {COVER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`notion-cover-thumb ${currentCover === preset.value ? 'active' : ''}`}
                style={{ background: preset.value }}
                title={preset.name}
                onClick={() => {
                  onSelectCover(preset.value);
                  onClose();
                }}
              >
                <span className="notion-cover-thumb-name">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="notion-cover-divider" />

        <form onSubmit={handleApplyCustomUrl} className="notion-cover-url-form">
          <div className="notion-cover-section-label">Image URL</div>
          <div className="notion-cover-url-row">
            <input
              type="url"
              className="notion-cover-input"
              placeholder="Paste image link (e.g. Unsplash URL)..."
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
            />
            <button type="submit" className="notion-btn-primary" disabled={!customUrl.trim()}>
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
