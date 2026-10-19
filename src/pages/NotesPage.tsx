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
import { RichTextEditor, RichTextEditorRef } from '../components/RichTextEditor';

const MAX_IMAGE_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

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

  // Note content state
  const [content, setContent] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [loadingTabs, setLoadingTabs] = useState<boolean>(true);
  const [loadingActiveTab, setLoadingActiveTab] = useState<boolean>(false);

  // Modals state
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

  // Image upload state (default closed on mobile so editor has 100% height)
  const [showImageDrawer, setShowImageDrawer] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);

  // Persistence references
  const pendingContentRef = useRef<string>('');
  const lastSavedContentRef = useRef<string>('');
  const saveTimeoutRef = useRef<number | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const saveVersionRef = useRef<number>(0);

  // Keep activeTabIdRef in sync
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Close sidebar on Escape key if in mobile drawer mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.innerWidth < 1024 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  // ── Flush Pending Save ─────────────────────────────────────────
  const flushSave = useCallback(async (tabIdToSave?: string | null, textToSave?: string) => {
    const targetTabId = tabIdToSave ?? activeTabIdRef.current;
    if (!targetTabId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const payload = textToSave !== undefined ? textToSave : pendingContentRef.current;

    // If nothing changed since last save, set saved and return
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
    // 1. Immediately dismiss mobile drawer synchronously so note editor is revealed
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }

    if (newTabId === activeTabId) {
      return;
    }

    // 2. Flush any pending unsaved changes from previous tab in background
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

      const newTab = await createTab('Untitled Notebook', '📝', tabs.length);
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
      const updated = await updateTab(tabId, newTitle, newIcon || currentIcon);
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title: updated.title, icon: updated.icon } : t)));
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

  // Direct Image Upload used by RichTextEditor's toolbar button
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
    // On mobile, auto close the image drawer so user returns to typing
    if (window.innerWidth < 1024) {
      setShowImageDrawer(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`app-container ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* ── Mobile Sidebar Backdrop Overlay ──────────────────────── */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ── Left Sidebar (Responsive Drawer on Mobile, Collapsible on Desktop) ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Notebook navigation">
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <span className="brand-icon">📓</span>
            <span className="brand-title">Workspace</span>
          </div>
          {/* Prominent, accessible close button inside drawer */}
          <button
            type="button"
            className="btn-sidebar-close"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(false);
            }}
            aria-label="Close notebook sidebar"
            title="Close sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <button className="btn-new-tab" onClick={handleCreateNewTab}>
          <span>+</span>
          <span>New Notebook</span>
        </button>

        <div className="sidebar-tabs-list">
          {loadingTabs ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading notebooks...</div>
          ) : tabs.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No notebooks yet. Click + to create one!
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
                  <span className="tab-icon">{tab.icon || '📝'}</span>
                  <span className="tab-title-text">{tab.title}</span>
                </div>

                <div className="tab-actions">
                  {tab.imagesCount > 0 && <span className="tab-badge">{tab.imagesCount} 🖼️</span>}
                  <button
                    type="button"
                    className="tab-btn-icon"
                    title="Rename / Edit Icon"
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
                    title="Delete Notebook"
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

        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="avatar-circle">{(userEmail || 'U').slice(0, 1)}</div>
            <span className="user-email-text" title={userEmail || ''}>
              {userEmail || 'Signed in'}
            </span>
          </div>
          <button type="button" className="btn-logout" title="Sign Out" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Workspace ──────────────────────────────────────── */}
      <main className="workspace">
        {/* ── Always-Accessible Notion-Style Top Bar ─────────────── */}
        <header className="workspace-topbar">
          <div className="workspace-tab-meta">
            {/* Sidebar toggle button (Always present so mobile users can never get stuck!) */}
            <button
              type="button"
              className="btn-sidebar-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? 'Hide notebook sidebar' : 'Open notebook sidebar'}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {activeTab ? (
              <>
                <button
                  type="button"
                  className="tab-icon-picker-btn"
                  title="Change icon"
                  aria-label="Change notebook icon"
                  onClick={() =>
                    setRenameModal({
                      isOpen: true,
                      tabId: activeTab.id,
                      initialTitle: activeTab.title,
                      initialIcon: activeTab.icon || '📝',
                    })
                  }
                >
                  {activeTab.icon || '📝'}
                </button>

                <input
                  type="text"
                  className="tab-title-input"
                  value={activeTab.title}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setActiveTab((prev) => (prev ? { ...prev, title: newTitle } : null));
                    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, title: newTitle } : t)));
                  }}
                  onBlur={() => handleUpdateTabTitle(activeTab.id, activeTab.title, activeTab.icon)}
                  placeholder="Notebook title..."
                  aria-label="Notebook title"
                />
              </>
            ) : (
              <span className="workspace-placeholder-title">
                {loadingTabs ? 'Loading notebooks...' : 'Workspace'}
              </span>
            )}
          </div>

          <div className="workspace-actions">
            {activeTab && (
              <>
                {/* Save status indicator */}
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

                <button
                  type="button"
                  className={`btn-action-secondary ${showImageDrawer ? 'active' : ''}`}
                  onClick={() => setShowImageDrawer((prev) => !prev)}
                  aria-label="Toggle images drawer"
                  title="View attached images"
                >
                  <span>🖼️ Images ({activeTab.images.length})</span>
                </button>

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
                + New Notebook
              </button>
            )}
          </div>
        </header>

        {/* ── Note Workspace Body ─────────────────────────────────── */}
        {activeTab ? (
          <>
            {loadingActiveTab ? (
              <div className="empty-state">
                <div style={{ fontSize: '2rem' }}>⏳</div>
                <p>Loading note contents...</p>
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

            {/* ── Slide-up Image Drawer Panel ─────────────────────── */}
            {showImageDrawer && (
              <div className="image-drawer" aria-label="Attached images drawer">
                <div className="image-drawer-header">
                  <div className="image-drawer-title">
                    <span>Attached Images ({activeTab.images.length})</span>
                    <span className="image-drawer-subtitle">
                      (Saved to server storage)
                    </span>
                  </div>

                  <div className="image-drawer-header-actions">
                    <button
                      type="button"
                      className="btn-action-primary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
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
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                    No images attached to this notebook yet. Click "+ Upload Image" or use the 🖼️ button in the formatting bar to add photos.
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
                              title="Insert image into note editor"
                              onClick={() => handleInsertImageIntoNote(img)}
                            >
                              Insert
                            </button>
                            <button
                              type="button"
                              className="btn-image-action"
                              title="Replace this image with a new file"
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
                              title="Delete image permanently"
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
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">📝</span>
            <h2>No Notebook Selected</h2>
            <p>Select a notebook from the sidebar or create a new one to begin writing.</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-action-secondary"
                onClick={() => setSidebarOpen(true)}
              >
                ☰ Open Notebooks Menu
              </button>
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleCreateNewTab}
              >
                + Create First Notebook
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ──────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={deleteTabModal.isOpen}
        title="Delete Notebook"
        message={`Are you sure you want to delete "${deleteTabModal.title}"? All saved notes and attached physical images will be permanently removed.`}
        confirmLabel="Delete Notebook"
        isDestructive={true}
        onConfirm={handleConfirmDeleteTab}
        onCancel={() => setDeleteTabModal({ isOpen: false, tabId: null, title: '' })}
      />

      <ConfirmModal
        isOpen={deleteImageModal.isOpen}
        title="Delete Image"
        message={`Are you sure you want to delete "${deleteImageModal.fileName}"? The physical file will be removed from server storage.`}
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
