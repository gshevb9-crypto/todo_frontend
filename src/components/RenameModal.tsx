import React, { useState, useEffect } from 'react';

interface RenameModalProps {
  isOpen: boolean;
  initialTitle: string;
  initialIcon?: string;
  onSave: (title: string, icon: string) => void;
  onCancel: () => void;
}

const COMMON_ICONS = ['📝', '💡', '📌', '🚀', '🎯', '📚', '💼', '⚡', '🌟', '🛠️', '🎨', '🔥'];

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  initialTitle,
  initialIcon = '📝',
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState(initialIcon);

  useEffect(() => {
    setTitle(initialTitle);
    setIcon(initialIcon || '📝');
  }, [initialTitle, initialIcon, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title.trim(), icon);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Notebook Tab</h3>
          <p>Change tab title and choose an icon.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Tab Icon</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {COMMON_ICONS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  style={{
                    fontSize: '1.25rem',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: icon === emoji ? 'var(--accent-blue)' : 'var(--border-color)',
                    backgroundColor: icon === emoji ? 'var(--bg-active)' : 'var(--bg-surface-elevated)',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tab Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Work Projects, Personal Notes..."
              autoFocus
              required
            />
          </div>

          <div className="modal-footer" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn-action-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-action-primary" disabled={!title.trim()}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
