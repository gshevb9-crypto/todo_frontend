import React, { useState, useEffect, useRef } from 'react';
import { TabDto } from '../api/tabs.api';

interface QuickFindModalProps {
  isOpen: boolean;
  tabs: TabDto[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onClose: () => void;
}

export const QuickFindModal: React.FC<QuickFindModalProps> = ({
  isOpen,
  tabs,
  activeTabId,
  onSelectTab,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredTabs = tabs.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredTabs.length > 0 ? (prev + 1) % filteredTabs.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredTabs.length > 0 ? (prev - 1 + filteredTabs.length) % filteredTabs.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTabs[selectedIndex]) {
        onSelectTab(filteredTabs[selectedIndex].id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="notion-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Quick search">
      <div className="notion-quickfind-card" onClick={(e) => e.stopPropagation()}>
        <div className="notion-quickfind-input-wrap">
          <span className="notion-quickfind-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="notion-quickfind-input"
            placeholder="Search pages or notebooks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="notion-kbd-pill">ESC</span>
        </div>

        <div className="notion-quickfind-results">
          {filteredTabs.length === 0 ? (
            <div className="notion-quickfind-empty">No matching pages found for "{query}"</div>
          ) : (
            filteredTabs.map((tab, idx) => (
              <div
                key={tab.id}
                className={`notion-quickfind-item ${idx === selectedIndex ? 'selected' : ''} ${
                  activeTabId === tab.id ? 'current' : ''
                }`}
                onClick={() => {
                  onSelectTab(tab.id);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="notion-quickfind-item-icon">{tab.icon || '📝'}</span>
                <span className="notion-quickfind-item-title">{tab.title}</span>
                {tab.imagesCount > 0 && (
                  <span className="notion-quickfind-badge">{tab.imagesCount} 🖼️</span>
                )}
                {activeTabId === tab.id && (
                  <span className="notion-quickfind-current-tag">Current</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
