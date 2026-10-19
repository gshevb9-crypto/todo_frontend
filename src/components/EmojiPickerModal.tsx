import React, { useState, useMemo } from 'react';

interface EmojiPickerModalProps {
  isOpen: boolean;
  currentIcon: string;
  onSelectEmoji: (emoji: string) => void;
  onRemoveIcon?: () => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: 'Frequent & Workspace',
    emojis: ['📝', '📋', '📌', '💡', '🚀', '🎯', '📚', '💼', '⚡', '🌟', '🛠️', '🎨', '🔥', '📊', '📅', '🏆', '💎', '🧭'],
  },
  {
    name: 'Smileys & People',
    emojis: ['😀', '😎', '🤓', '🤔', '🙌', '👏', '🤝', '💪', '🧠', '👀', '🎉', '✨', '☕', '🍵', '🍕', '💻', '📱', '🎧'],
  },
  {
    name: 'Nature & Places',
    emojis: ['🌱', '🌿', '🌲', '🌸', '🌻', '🍁', '🌍', '🌙', '⭐', '☀️', '🌈', '⛰️', '🏖️', '🏝️', '🏕️', '🏡', '🏢', '✈️'],
  },
  {
    name: 'Objects & Symbols',
    emojis: ['📁', '📂', '📑', '✉️', '📦', '🔑', '🔒', '🔔', '🏷️', '🔖', '🔍', '⚙️', '⏳', '⏰', '💡', '💰', '📈', '📉'],
  },
];

export const EmojiPickerModal: React.FC<EmojiPickerModalProps> = ({
  isOpen,
  currentIcon,
  onSelectEmoji,
  onRemoveIcon,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES;
    const q = search.toLowerCase();
    return EMOJI_CATEGORIES.map((cat) => ({
      name: cat.name,
      emojis: cat.emojis.filter((e) => e.includes(q) || cat.name.toLowerCase().includes(q)),
    })).filter((cat) => cat.emojis.length > 0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="notion-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose icon">
      <div className="notion-emoji-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notion-emoji-header">
          <input
            type="text"
            className="notion-emoji-search"
            placeholder="Filter emojis..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {onRemoveIcon && (
            <button
              type="button"
              className="notion-btn-subtle"
              onClick={() => {
                onRemoveIcon();
                onClose();
              }}
              title="Remove icon"
            >
              Remove
            </button>
          )}
        </div>

        <div className="notion-emoji-list">
          {filteredCategories.map((cat) => (
            <div key={cat.name} className="notion-emoji-section">
              <div className="notion-emoji-section-title">{cat.name}</div>
              <div className="notion-emoji-grid">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`notion-emoji-btn ${currentIcon === emoji ? 'active' : ''}`}
                    onClick={() => {
                      onSelectEmoji(emoji);
                      onClose();
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
