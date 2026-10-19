import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getTabs,
  getTabById,
  createTab,
  updateTab,
  deleteTab,
  updateTabContent,
  TabDto,
  TabDetailDto,
  TabImageDto,
} from '../api/tabs.api';
import { uploadTabImage, replaceTabImage, deleteTabImage } from '../api/images.api';
import { ConfirmModal } from '../components/ConfirmModal';
import { RenameModal } from '../components/RenameModal';
import { EmojiPickerModal } from '../components/EmojiPickerModal';
import { CoverPickerModal } from '../components/CoverPickerModal';
import { QuickFindModal } from '../components/QuickFindModal';
import { RichTextEditor, RichTextEditorRef } from '../components/RichTextEditor';

const MAX_IMAGE_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

type NotionFontFamily = 'sans' | 'serif' | 'mono';

export default function NotesPage() {
  const { userEmail, handleLogout } = useAuth();

  // Tabs state
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabDetailDto | null>(null);

  // Responsive sidebar open/collapse state (desktop default open, mobile default closed)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
  });

  // Note content & save state
  const [content, setContent] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [loadingTabs, setLoadingTabs] = useState<boolean>(true);
  const [loadingActiveTab, setLoadingActiveTab] = useState<boolean>(false);

  // Notion Customizations: Theme, Font, Full-width, Cover image
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('notion_theme') as 'dark' | 'light') || 'dark';
  });

  const [fontFamily, setFontFamily] = useState<NotionFontFamily>(() => {
    return (localStorage.getItem('notion_font') as NotionFontFamily) || 'sans';
  });

  const [isFullWidth, setIsFullWidth] = useState<boolean>(() => {
    return localStorage.getItem('notion_fullwidth') === 'true';
  });

  const [coverImage, setCoverImage] = useState<string | null>(null);

  // Quick Find & Modals state
  const [quickFindOpen, setQuickFindOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [pageOptionsMenuOpen, setPageOptionsMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  const [deleteTabModal, setDeleteTabModal] = useState<{ isOpen: boolean; tabId: string | null; title: string }>({
    isOpen: false,
    tabId: null,
    title: '',
  });

  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    tabId: string | null;
    initialTitle: string;
    initialIcon: string;
  }>({
    isOpen: false,
    tabId: null,
    initialTitle: '',
    initialIcon: '📝',
  });

  const [deleteImageModal, setDeleteImageModal] = useState<{ isOpen: boolean; imageId: string | null; fileName: string }>({
    isOpen: false,
    imageId: null,
    fileName: '',
  });

  // Image upload drawer
  const [showImageDrawer, setShowImageDrawer] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);
  const pageOptionsRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);

  // Persistence references
  const pendingContentRef = useRef<string>('');
  const lastSavedContentRef = useRef<string>('');
  const saveTimeoutRef = useRef<number | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const saveVersionRef = useRef<number>(0);

  // Sync theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('notion_theme', theme);
  }, [theme]);

  // Sync font preference
  useEffect(() => {
    localStorage.setItem('notion_font', fontFamily);
  }, [fontFamily]);

  // Sync full-width preference
  useEffect(() => {
    localStorage.setItem('notion_fullwidth', String(isFullWidth));
  }, [isFullWidth]);

  // Sync activeTabIdRef
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
    if (activeTabId) {
      const savedCover = localStorage.getItem(`notion_cover_${activeTabId}`);
      setCoverImage(savedCover || null);
    } else {
      setCoverImage(null);
    }
  }, [activeTabId]);

  // Save cover for current tab
  const handleSelectCover = (cover: string | null) => {
    setCoverImage(cover);
    if (activeTabId) {
      if (cover) {
        localStorage.setItem(`notion_cover_${activeTabId}`, cover);
      } else {
        localStorage.removeItem(`notion_cover_${activeTabId}`);
      }
    }
  };

  // Keyboard shortcut listener: Ctrl+K / Cmd+K for Quick Find, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickFindOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setPageOptionsMenuOpen(false);
        setShareMenuOpen(false);
        if (window.innerWidth < 1024 && sidebarOpen) {
          setSidebarOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (pageOptionsRef.current && !pageOptionsRef.current.contains(target)) {
        setPageOptionsMenuOpen(false);
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(target)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ── Flush Pending Save ─────────────────────────────────────────
  const flushSave = useCallback(async (tabIdToSave?: string | null, textToSave?: string) => {
    const targetTabId = tabIdToSave ?? activeTabIdRef.current;
    if (!targetTabId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const payload = textToSave !== undefined ? textToSave : pendingContentRef.current;

    if (payload === lastSavedContentRef.current) {
      setSaveStatus('saved');
      return;
    }

    const currentVersion = ++saveVersionRef.current;
    setSaveStatus('saving');

    try {
      await updateTabContent(targetTabId, payload);
      if (currentVersion === saveVersionRef.current) {
        lastSavedContentRef.current = payload;
        setSaveStatus('saved');
      }
    } catch (err) {
      console.error('Failed to save tab content', err);
      if (currentVersion === saveVersionRef.current) {
        setSaveStatus('error');
      }
    }
  }, []);

  // ── Debounced Auto-save ─────────────────────────────────────────
  const triggerAutoSave = useCallback(
    (newHtml: string) => {
      pendingContentRef.current = newHtml;

      if (newHtml === lastSavedContentRef.current) {
        setSaveStatus('saved');
        return;
      }

      setSaveStatus('unsaved');

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(() => {
        flushSave(activeTabIdRef.current, newHtml);
      }, 1000);
    },
    [flushSave]
  );

  const handleEditorChange = (newHtml: string) => {
    setContent(newHtml);
    triggerAutoSave(newHtml);
  };

  const handleManualSave = () => {
    flushSave(activeTabId, pendingContentRef.current);
  };

  // ── Flush on Window Unload ────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeTabIdRef.current && pendingContentRef.current !== lastSavedContentRef.current) {
        flushSave(activeTabIdRef.current, pendingContentRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushSave]);

  // ── Load tabs on mount ────────────────────────────────────────
  const fetchTabs = useCallback(async () => {
    try {
      setLoadingTabs(true);
      const data = await getTabs();
      setTabs(data);
      if (data.length > 0 && !activeTabIdRef.current) {
        setActiveTabId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load tabs', err);
    } finally {
      setLoadingTabs(false);
    }
  }, []);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  // ── Load active tab detail ───────────────────────────────────
  const fetchActiveTabDetail = useCallback(async (tabId: string) => {
    try {
      setLoadingActiveTab(true);
      const detail = await getTabById(tabId);
      setActiveTab(detail);
      const initialText = detail.textContent || '';
      setContent(initialText);
      pendingContentRef.current = initialText;
      lastSavedContentRef.current = initialText;
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to load tab detail', err);
    } finally {
      setLoadingActiveTab(false);
    }
  }, []);

  // ── Switch Tab Safely ─────────────────────────────────────────
  const handleSelectTab = (newTabId: string) => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }

    if (newTabId === activeTabId) {
      return;
    }

    if (activeTabId && pendingContentRef.current !== lastSavedContentRef.current) {
      flushSave(activeTabId, pendingContentRef.current);
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setActiveTabId(newTabId);
  };

  useEffect(() => {
    if (activeTabId) {
      fetchActiveTabDetail(activeTabId);
    } else {
      setActiveTab(null);
      setContent('');
      pendingContentRef.current = '';
      lastSavedContentRef.current = '';
    }
  }, [activeTabId, fetchActiveTabDetail]);

  // ── Tab Management Actions ───────────────────────────────────
  const handleCreateNewTab = async () => {
    try {
      if (activeTabId && pendingContentRef.current !== lastSavedContentRef.current) {
        await flushSave(activeTabId, pendingContentRef.current);
      }

      const newTab = await createTab('Untitled', '📝', tabs.length);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    } catch (err) {
      console.error('Failed to create tab', err);
    }
  };

  const handleUpdateTabTitle = async (tabId: string, newTitle: string, newIcon?: string) => {
    try {
      const currentIcon = tabs.find((t) => t.id === tabId)?.icon || '📝';
      const updated = await updateTab(tabId, newTitle || 'Untitled', newIcon || currentIcon);
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, title: updated.title, icon: updated.icon } : t))
      );
      if (activeTabId === tabId) {
        setActiveTab((prev) => (prev ? { ...prev, title: updated.title, icon: updated.icon } : null));
      }
    } catch (err) {
      console.error('Failed to update tab', err);
    }
  };

  const handleConfirmDeleteTab = async () => {
    if (!deleteTabModal.tabId) return;
    try {
      await deleteTab(deleteTabModal.tabId);
      const remaining = tabs.filter((t) => t.id !== deleteTabModal.tabId);
      setTabs(remaining);

      if (activeTabId === deleteTabModal.tabId) {
        setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete tab', err);
    } finally {
      setDeleteTabModal({ isOpen: false, tabId: null, title: '' });
    }
  };

  // ── Image Actions ────────────────────────────────────────────
  const validateImageFile = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WebP, GIF).');
      return false;
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) {
      alert(`Image file size exceeds the 25 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return false;
    }
    return true;
  };

  const handleDirectImageUpload = async (file: File): Promise<string | null> => {
    if (!activeTabId) return null;
    if (!validateImageFile(file)) return null;

    setUploadingImage(true);
    try {
      const uploaded = await uploadTabImage(activeTabId, file);
      setActiveTab((prev) => (prev ? { ...prev, images: [...prev.images, uploaded] } : null));
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, imagesCount: t.imagesCount + 1 } : t))
      );
      return uploaded.url;
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to upload image.');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTabId) return;

    if (!validateImageFile(file)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const uploaded = await uploadTabImage(activeTabId, file);
      setActiveTab((prev) => (prev ? { ...prev, images: [...prev.images, uploaded] } : null));
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, imagesCount: t.imagesCount + 1 } : t))
      );
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingImageId || !activeTabId) return;

    if (!validateImageFile(file)) {
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const replaced = await replaceTabImage(replacingImageId, file);
      setActiveTab((prev) =>
        prev
          ? {
              ...prev,
              images: prev.images.map((img) => (img.id === replacingImageId ? replaced : img)),
            }
          : null
      );
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to replace image.');
    } finally {
      setUploadingImage(false);
      setReplacingImageId(null);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
    }
  };

  const handleConfirmDeleteImage = async () => {
    if (!deleteImageModal.imageId || !activeTabId) return;
    try {
      await deleteTabImage(deleteImageModal.imageId);
      setActiveTab((prev) =>
        prev
          ? {
              ...prev,
              images: prev.images.filter((img) => img.id !== deleteImageModal.imageId),
            }
          : null
      );
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, imagesCount: Math.max(0, t.imagesCount - 1) } : t))
      );
    } catch (err) {
      console.error('Failed to delete image', err);
    } finally {
      setDeleteImageModal({ isOpen: false, imageId: null, fileName: '' });
    }
  };

  const handleInsertImageIntoNote = (image: TabImageDto) => {
    if (editorRef.current) {
      editorRef.current.insertImage(image.url, image.originalFileName);
    }
    if (window.innerWidth < 1024) {
      setShowImageDrawer(false);
    }
  };

  // Export handlers
  const handleCopyPageText = () => {
    if (!activeTab) return;
    const tempEl = document.createElement('div');
    tempEl.innerHTML = activeTab.textContent || '';
    const text = `${activeTab.title}\n\n${tempEl.innerText || ''}`;
    navigator.clipboard.writeText(text);
    alert('Page text copied to clipboard!');
    setShareMenuOpen(false);
  };

  const handleDownloadMarkdown = () => {
    if (!activeTab) return;
    const tempEl = document.createElement('div');
    tempEl.innerHTML = activeTab.textContent || '';
    const blob = new Blob([`# ${activeTab.title}\n\n${tempEl.innerText}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab.title.replace(/[/\\?%*:|"<>]/g, '-') || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShareMenuOpen(false);
  };

  const handleDownloadHtml = () => {
    if (!activeTab) return;
    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${activeTab.title}</title><style>body{font-family:sans-serif;max-width:800px;margin:2rem auto;padding:1rem;line-height:1.6;color:#333;}</style></head><body><h1>${activeTab.title}</h1>${activeTab.textContent}</body></html>`;
    const blob = new Blob([htmlDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab.title.replace(/[/\\?%*:|"<>]/g, '-') || 'note'}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setShareMenuOpen(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`app-container ${sidebarOpen ? 'sidebar-open' : ''}`} data-theme={theme}>
      {/* ── Mobile Sidebar Backdrop Overlay ──────────────────────── */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ── Left Sidebar (Authentic Notion Sidebar) ────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Notebook navigation">
        {/* Workspace Switcher Header */}
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <div className="brand-icon">
              {(userEmail || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="notion-workspace-info">
              <span className="brand-title">
                {userEmail ? `${userEmail.split('@')[0]}'s Workspace` : 'Personal Notion'}
              </span>
              <span className="notion-plan-badge">Pro Workspace</span>
            </div>
          </div>

          <button
            type="button"
            className="btn-sidebar-close"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(false);
            }}
            aria-label="Close notebook sidebar"
            title="Collapse sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        </div>

        {/* Quick Action Buttons: Quick Find & New Page */}
        <div className="notion-sidebar-quick-actions">
          <button
            type="button"
            className="notion-quick-action-btn"
            onClick={() => setQuickFindOpen(true)}
            title="Quick search notebooks (Ctrl+K)"
          >
            <span className="notion-quick-action-icon">🔍</span>
            <span className="notion-quick-action-label">Quick Find</span>
            <span className="notion-kbd-hint">⌘K</span>
          </button>

          <button
            type="button"
            className="notion-quick-action-btn"
            onClick={handleCreateNewTab}
            title="Create a new notebook page"
          >
            <span className="notion-quick-action-icon">➕</span>
            <span className="notion-quick-action-label">New Page</span>
          </button>
        </div>

        {/* Section Header: Pages */}
        <div className="notion-sidebar-section-header">
          <span className="notion-sidebar-section-title">Pages ({tabs.length})</span>
          <button
            type="button"
            className="notion-section-add-btn"
            onClick={handleCreateNewTab}
            title="Add a page"
            aria-label="Add a page"
          >
            +
          </button>
        </div>

        {/* Tabs List */}
        <div className="sidebar-tabs-list">
          {loadingTabs ? (
            <div className="notion-sidebar-empty-state">Loading pages...</div>
          ) : tabs.length === 0 ? (
            <div className="notion-sidebar-empty-state">
              No pages yet. Click + to create your first page!
            </div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
                onClick={() => handleSelectTab(tab.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectTab(tab.id);
                  }
                }}
              >
                <div className="tab-info">
                  <span
                    className="tab-icon"
                    title="Change icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTabId(tab.id);
                      setEmojiPickerOpen(true);
                    }}
                  >
                    {tab.icon || '📝'}
                  </span>
                  <span className="tab-title-text">{tab.title || 'Untitled'}</span>
                </div>

                <div className="tab-actions">
                  {tab.imagesCount > 0 && <span className="tab-badge">{tab.imagesCount} 🖼️</span>}
                  <button
                    type="button"
                    className="tab-btn-icon"
                    title="Rename page"
                    aria-label={`Rename ${tab.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameModal({
                        isOpen: true,
                        tabId: tab.id,
                        initialTitle: tab.title,
                        initialIcon: tab.icon || '📝',
                      });
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="tab-btn-icon delete"
                    title="Delete page"
                    aria-label={`Delete ${tab.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTabModal({
                        isOpen: true,
                        tabId: tab.id,
                        title: tab.title,
                      });
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick New Page Button (Preserves test selector .btn-new-tab) */}
        <button className="btn-new-tab notion-sidebar-bottom-add" onClick={handleCreateNewTab}>
          <span>+</span>
          <span>New page</span>
        </button>

        {/* Sidebar Footer with User Profile & Theme Switcher */}
        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="avatar-circle">{(userEmail || 'U').slice(0, 1)}</div>
            <span className="user-email-text" title={userEmail || ''}>
              {userEmail || 'Signed in'}
            </span>
          </div>

          <div className="notion-sidebar-footer-controls">
            <button
              type="button"
              className="notion-theme-toggle-btn"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            <button type="button" className="btn-logout" title="Sign Out" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Workspace ──────────────────────────────────────── */}
      <main className="workspace">
        {/* ── Always-Accessible Notion-Style Top Bar ─────────────── */}
        <header className="workspace-topbar">
          <div className="workspace-tab-meta">
            {/* Sidebar toggle button */}
            <button
              type="button"
              className="btn-sidebar-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? 'Hide notebook sidebar' : 'Open notebook sidebar'}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>

            {/* Breadcrumb Path */}
            <div className="notion-breadcrumb">
              <span className="notion-breadcrumb-root">Workspace</span>
              <span className="notion-breadcrumb-sep">/</span>
              {activeTab ? (
                <span className="notion-breadcrumb-current">
                  <span className="notion-breadcrumb-icon">{activeTab.icon || '📝'}</span>
                  <span>{activeTab.title || 'Untitled'}</span>
                </span>
              ) : (
                <span className="workspace-placeholder-title">
                  {loadingTabs ? 'Loading...' : 'Empty Workspace'}
                </span>
              )}
            </div>
          </div>

          <div className="workspace-actions">
            {activeTab && (
              <>
                {/* Save status pill */}
                <div
                  className={`save-status-pill ${saveStatus}`}
                  role="status"
                  aria-live="polite"
                  onClick={saveStatus === 'error' ? handleManualSave : undefined}
                  style={saveStatus === 'error' ? { cursor: 'pointer' } : undefined}
                  title={saveStatus === 'error' ? 'Click to retry save' : undefined}
                >
                  {saveStatus === 'saved' && <span>● Saved</span>}
                  {saveStatus === 'saving' && <span>○ Saving...</span>}
                  {saveStatus === 'unsaved' && <span>○ Unsaved</span>}
                  {saveStatus === 'error' && <span>⚠ Retry</span>}
                </div>

                {/* Attached Images Button */}
                <button
                  type="button"
                  className={`btn-action-secondary ${showImageDrawer ? 'active' : ''}`}
                  onClick={() => setShowImageDrawer((prev) => !prev)}
                  aria-label="Toggle images gallery"
                  title="View attached notebook photos"
                >
                  <span>🖼️ Gallery ({activeTab.images.length})</span>
                </button>

                {/* Share / Export Dropdown */}
                <div className="notion-dropdown-wrapper" ref={shareMenuRef}>
                  <button
                    type="button"
                    className={`btn-action-secondary ${shareMenuOpen ? 'active' : ''}`}
                    onClick={() => setShareMenuOpen((prev) => !prev)}
                    title="Export or Share page"
                  >
                    <span>Share</span>
                  </button>

                  {shareMenuOpen && (
                    <div className="notion-topbar-menu">
                      <button type="button" className="notion-menu-item" onClick={handleCopyPageText}>
                        <span>📋</span>
                        <span>Copy page text</span>
                      </button>
                      <button type="button" className="notion-menu-item" onClick={handleDownloadMarkdown}>
                        <span>📥</span>
                        <span>Download Markdown (.md)</span>
                      </button>
                      <button type="button" className="notion-menu-item" onClick={handleDownloadHtml}>
                        <span>🌐</span>
                        <span>Download HTML (.html)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Page Options Menu (···) */}
                <div className="notion-dropdown-wrapper" ref={pageOptionsRef}>
                  <button
                    type="button"
                    className="notion-topbar-icon-btn"
                    onClick={() => setPageOptionsMenuOpen((prev) => !prev)}
                    title="Page options & font styling"
                    aria-label="Page options"
                  >
                    ⋯
                  </button>

                  {pageOptionsMenuOpen && (
                    <div className="notion-topbar-menu">
                      <div className="notion-menu-label">Style</div>
                      <div className="notion-font-picker-row">
                        <button
                          type="button"
                          className={`notion-font-btn ${fontFamily === 'sans' ? 'active' : ''}`}
                          onClick={() => setFontFamily('sans')}
                        >
                          <span style={{ fontFamily: 'var(--font-sans)' }}>Default</span>
                        </button>
                        <button
                          type="button"
                          className={`notion-font-btn ${fontFamily === 'serif' ? 'active' : ''}`}
                          onClick={() => setFontFamily('serif')}
                        >
                          <span style={{ fontFamily: 'var(--font-serif)' }}>Serif</span>
                        </button>
                        <button
                          type="button"
                          className={`notion-font-btn ${fontFamily === 'mono' ? 'active' : ''}`}
                          onClick={() => setFontFamily('mono')}
                        >
                          <span style={{ fontFamily: 'var(--font-mono)' }}>Mono</span>
                        </button>
                      </div>

                      <div className="notion-menu-divider" />

                      <div className="notion-menu-row-toggle" onClick={() => setIsFullWidth((prev) => !prev)}>
                        <span>Full width</span>
                        <input
                          type="checkbox"
                          checked={isFullWidth}
                          onChange={(e) => setIsFullWidth(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      <div className="notion-menu-divider" />

                      <button
                        type="button"
                        className="notion-menu-item danger"
                        onClick={() => {
                          setPageOptionsMenuOpen(false);
                          setDeleteTabModal({
                            isOpen: true,
                            tabId: activeTab.id,
                            title: activeTab.title,
                          });
                        }}
                      >
                        <span>🗑️</span>
                        <span>Delete page</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Save button (Preserves test selector .btn-save-quick) */}
                <button
                  type="button"
                  className="btn-action-primary btn-save-quick"
                  onClick={handleManualSave}
                  disabled={saveStatus === 'saving'}
                  title="Save current note (Ctrl+S)"
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </>
            )}

            {!activeTab && (
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleCreateNewTab}
              >
                + New Page
              </button>
            )}
          </div>
        </header>

        {/* ── Note Workspace Body ─────────────────────────────────── */}
        {activeTab ? (
          <div className="notion-scrollable-canvas">
            {/* ── Notion Page Cover Banner ──────────────────────────── */}
            {coverImage && (
              <div
                className="notion-cover-container"
                style={{
                  background: coverImage.startsWith('url') ? coverImage : coverImage,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div className="notion-cover-actions">
                  <button
                    type="button"
                    className="notion-cover-btn"
                    onClick={() => setCoverPickerOpen(true)}
                  >
                    Change cover
                  </button>
                  <button
                    type="button"
                    className="notion-cover-btn"
                    onClick={() => handleSelectCover(null)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <div
              className={`notion-canvas ${isFullWidth ? 'full-width' : ''}`}
              data-font={fontFamily}
            >
              {/* Hover Buttons to Add Cover / Add Icon if not present */}
              <div className="notion-header-controls">
                {!activeTab.icon && (
                  <button
                    type="button"
                    className="notion-header-btn"
                    onClick={() => setEmojiPickerOpen(true)}
                  >
                    <span>😀</span>
                    <span>Add icon</span>
                  </button>
                )}
                {!coverImage && (
                  <button
                    type="button"
                    className="notion-header-btn"
                    onClick={() => setCoverPickerOpen(true)}
                  >
                    <span>🖼️</span>
                    <span>Add cover</span>
                  </button>
                )}
              </div>

              {/* Page Icon (Large Emoji) */}
              {activeTab.icon && (
                <div className={`notion-page-icon-wrapper ${coverImage ? 'has-cover' : ''}`}>
                  <span
                    className="notion-page-icon-large"
                    onClick={() => setEmojiPickerOpen(true)}
                    title="Change icon"
                    role="button"
                    tabIndex={0}
                  >
                    {activeTab.icon}
                  </span>
                </div>
              )}

              {/* Notion Large Seamless Page Title */}
              <input
                type="text"
                className="notion-page-title-input tab-title-input"
                value={activeTab.title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setActiveTab((prev) => (prev ? { ...prev, title: newTitle } : null));
                  setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, title: newTitle } : t)));
                }}
                onBlur={() => handleUpdateTabTitle(activeTab.id, activeTab.title, activeTab.icon)}
                placeholder="Untitled"
                aria-label="Page title"
              />

              {/* Editor Component */}
              {loadingActiveTab ? (
                <div className="empty-state">
                  <div style={{ fontSize: '2rem' }}>⏳</div>
                  <p>Loading page contents...</p>
                </div>
              ) : (
                <div className="editor-container">
                  <RichTextEditor
                    ref={editorRef}
                    content={content}
                    onChange={handleEditorChange}
                    onSave={handleManualSave}
                    onUploadImage={handleDirectImageUpload}
                    attachedImages={activeTab.images}
                  />
                </div>
              )}
            </div>

            {/* Hidden file inputs for image uploads */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleFileSelected}
            />
            <input
              type="file"
              ref={replaceFileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleReplaceFileSelected}
            />

            {/* ── Slide-up Image Gallery Drawer Panel ─────────────── */}
            {showImageDrawer && (
              <div className="image-drawer" aria-label="Attached images drawer">
                <div className="image-drawer-header">
                  <div className="image-drawer-title">
                    <span>Attached Gallery ({activeTab.images.length})</span>
                    <span className="image-drawer-subtitle">(Saved to cloud storage)</span>
                  </div>

                  <div className="image-drawer-header-actions">
                    <button
                      type="button"
                      className="btn-action-primary"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? 'Uploading...' : '+ Upload Image'}
                    </button>
                    <button
                      type="button"
                      className="btn-drawer-close"
                      onClick={() => setShowImageDrawer(false)}
                      aria-label="Close image drawer"
                      title="Close drawer"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {activeTab.images.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--notion-text-muted)', padding: '0.75rem 0' }}>
                    No photos attached to this page yet. Click "+ Upload Image" or type <code>/image</code> in the document.
                  </p>
                ) : (
                  <div className="image-grid">
                    {activeTab.images.map((img) => (
                      <div key={img.id} className="image-card">
                        <img src={img.url} alt={img.originalFileName} className="image-preview" loading="lazy" />
                        <div className="image-meta">
                          <div className="image-name" title={img.originalFileName}>
                            {img.originalFileName}
                          </div>
                          <div className="image-size">{formatFileSize(img.fileSize)}</div>
                          <div className="image-card-actions">
                            <button
                              type="button"
                              className="btn-image-action"
                              title="Insert into note"
                              onClick={() => handleInsertImageIntoNote(img)}
                            >
                              Insert
                            </button>
                            <button
                              type="button"
                              className="btn-image-action"
                              title="Replace file"
                              onClick={() => {
                                setReplacingImageId(img.id);
                                replaceFileInputRef.current?.click();
                              }}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              className="btn-image-action delete"
                              title="Delete permanently"
                              onClick={() =>
                                setDeleteImageModal({
                                  isOpen: true,
                                  imageId: img.id,
                                  fileName: img.originalFileName,
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">📝</span>
            <h2>No Page Selected</h2>
            <p>Select a page from the sidebar or create a new one to begin writing.</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-action-secondary"
                onClick={() => setSidebarOpen(true)}
              >
                ☰ Open Pages
              </button>
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleCreateNewTab}
              >
                + Create First Page
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Notion Modals ────────────────────────────────────────── */}
      <EmojiPickerModal
        isOpen={emojiPickerOpen}
        currentIcon={activeTab?.icon || '📝'}
        onSelectEmoji={(emoji) => {
          if (activeTabId && activeTab) {
            handleUpdateTabTitle(activeTabId, activeTab.title, emoji);
          }
        }}
        onRemoveIcon={() => {
          if (activeTabId && activeTab) {
            handleUpdateTabTitle(activeTabId, activeTab.title, '');
          }
        }}
        onClose={() => setEmojiPickerOpen(false)}
      />

      <CoverPickerModal
        isOpen={coverPickerOpen}
        currentCover={coverImage}
        onSelectCover={handleSelectCover}
        onClose={() => setCoverPickerOpen(false)}
      />

      <QuickFindModal
        isOpen={quickFindOpen}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onClose={() => setQuickFindOpen(false)}
      />

      <ConfirmModal
        isOpen={deleteTabModal.isOpen}
        title="Delete Page"
        message={`Are you sure you want to delete "${deleteTabModal.title}"? All note blocks and attached images will be permanently removed.`}
        confirmLabel="Delete Page"
        isDestructive={true}
        onConfirm={handleConfirmDeleteTab}
        onCancel={() => setDeleteTabModal({ isOpen: false, tabId: null, title: '' })}
      />

      <ConfirmModal
        isOpen={deleteImageModal.isOpen}
        title="Delete Image"
        message={`Are you sure you want to delete "${deleteImageModal.fileName}"? The physical file will be removed from storage.`}
        confirmLabel="Delete Image"
        isDestructive={true}
        onConfirm={handleConfirmDeleteImage}
        onCancel={() => setDeleteImageModal({ isOpen: false, imageId: null, fileName: '' })}
      />

      <RenameModal
        isOpen={renameModal.isOpen}
        initialTitle={renameModal.initialTitle}
        initialIcon={renameModal.initialIcon}
        onSave={(title, icon) => {
          if (renameModal.tabId) {
            handleUpdateTabTitle(renameModal.tabId, title, icon);
          }
          setRenameModal({ isOpen: false, tabId: null, initialTitle: '', initialIcon: '📝' });
        }}
        onCancel={() => setRenameModal({ isOpen: false, tabId: null, initialTitle: '', initialIcon: '📝' })}
      />
    </div>
  );
}
