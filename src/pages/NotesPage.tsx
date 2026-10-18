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

export default function NotesPage() {
  const { userEmail, handleLogout } = useAuth();

  // Tabs state
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabDetailDto | null>(null);

  // Note content state
  const [content, setContent] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
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

  // Image upload state
  const [showImageDrawer, setShowImageDrawer] = useState<boolean>(true);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // ── Load tabs on mount ────────────────────────────────────────
  const fetchTabs = useCallback(async () => {
    try {
      setLoadingTabs(true);
      const data = await getTabs();
      setTabs(data);
      if (data.length > 0 && !activeTabId) {
        setActiveTabId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load tabs', err);
    } finally {
      setLoadingTabs(false);
    }
  }, [activeTabId]);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  // ── Load active tab detail ───────────────────────────────────
  const fetchActiveTabDetail = useCallback(async (tabId: string) => {
    try {
      setLoadingActiveTab(true);
      const detail = await getTabById(tabId);
      setActiveTab(detail);
      setContent(detail.textContent || '');
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to load tab detail', err);
    } finally {
      setLoadingActiveTab(false);
    }
  }, []);

  useEffect(() => {
    if (activeTabId) {
      fetchActiveTabDetail(activeTabId);
    } else {
      setActiveTab(null);
      setContent('');
    }
  }, [activeTabId, fetchActiveTabDetail]);

  // ── Auto-save note content with debounce ─────────────────────
  const triggerAutoSave = useCallback(
    (newText: string) => {
      if (!activeTabId) return;

      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(async () => {
        try {
          await updateTabContent(activeTabId, newText);
          setSaveStatus('saved');
        } catch (err) {
          console.error('Auto-save failed', err);
        }
      }, 1000);
    },
    [activeTabId]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    triggerAutoSave(val);
  };

  const handleManualSave = async () => {
    if (!activeTabId) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSaveStatus('saving');
    try {
      await updateTabContent(activeTabId, content);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Manual save failed', err);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ── Tab Management Actions ───────────────────────────────────
  const handleCreateNewTab = async () => {
    try {
      const newTab = await createTab('Untitled Note', '📝', tabs.length);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (err) {
      console.error('Failed to create tab', err);
    }
  };

  const handleUpdateTabTitle = async (newTitle: string, newIcon?: string) => {
    if (!activeTabId || !activeTab) return;
    try {
      const updated = await updateTab(activeTabId, newTitle, newIcon || activeTab.icon);
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, title: updated.title, icon: updated.icon } : t)));
      setActiveTab((prev) => (prev ? { ...prev, title: updated.title, icon: updated.icon } : null));
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
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTabId) return;

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

  const insertMarkdownImage = (image: TabImageDto) => {
    const markdownTag = `\n![${image.originalFileName}](${image.url})\n`;
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.substring(0, start) + markdownTag + content.substring(end);

    setContent(newContent);
    triggerAutoSave(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + markdownTag.length, start + markdownTag.length);
    }, 50);
  };

  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);

    const formatted = `${prefix}${selected || 'text'}${suffix}`;
    const newContent = content.substring(0, start) + formatted + content.substring(end);

    setContent(newContent);
    triggerAutoSave(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + formatted.length - suffix.length);
    }, 50);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="app-container">
      {/* ── Left Sidebar ────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <span className="brand-icon">📓</span>
            <span className="brand-title">Workspace</span>
          </div>
        </div>

        <button className="btn-new-tab" onClick={handleCreateNewTab}>
          <span>+</span>
          <span>New Notebook</span>
        </button>

        <div className="sidebar-tabs-list">
          {loadingTabs ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading notebooks...</div>
          ) : tabs.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No notebooks yet. Click + to create one!</div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <div className="tab-info">
                  <span className="tab-icon">{tab.icon || '📝'}</span>
                  <span className="tab-title-text">{tab.title}</span>
                </div>

                <div className="tab-actions">
                  {tab.imagesCount > 0 && <span className="tab-badge">{tab.imagesCount} 🖼️</span>}
                  <button
                    className="tab-btn-icon"
                    title="Rename / Edit Icon"
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
                    className="tab-btn-icon delete"
                    title="Delete Notebook"
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
          <button className="btn-logout" title="Sign Out" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Workspace ──────────────────────────────────────── */}
      <main className="workspace">
        {activeTab ? (
          <>
            <div className="workspace-topbar">
              <div className="workspace-tab-meta">
                <button
                  className="tab-icon-picker-btn"
                  title="Change icon"
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
                  onBlur={() => handleUpdateTabTitle(activeTab.title)}
                  placeholder="Notebook title..."
                />
              </div>

              <div className="workspace-actions">
                <div className={`save-status-pill ${saveStatus}`}>
                  <span>{saveStatus === 'saved' ? '● Saved' : '○ Saving...'}</span>
                </div>

                <button
                  className="btn-action-secondary"
                  onClick={() => setShowImageDrawer((prev) => !prev)}
                >
                  <span>🖼️ Images ({activeTab.images.length})</span>
                </button>

                <button className="btn-action-primary" onClick={handleManualSave}>
                  Save Note
                </button>
              </div>
            </div>

            {loadingActiveTab ? (
              <div className="empty-state">
                <div style={{ fontSize: '2rem' }}>⏳</div>
                <p>Loading note contents...</p>
              </div>
            ) : (
              <div className="editor-container">
                {/* Formatting toolbar */}
                <div className="toolbar">
                  <button className="toolbar-btn" title="Bold" onClick={() => insertFormatting('**', '**')}>
                    <strong>B</strong>
                  </button>
                  <button className="toolbar-btn" title="Italic" onClick={() => insertFormatting('*', '*')}>
                    <em>I</em>
                  </button>
                  <div className="toolbar-divider" />
                  <button className="toolbar-btn" title="Heading 1" onClick={() => insertFormatting('# ')}>
                    H1
                  </button>
                  <button className="toolbar-btn" title="Heading 2" onClick={() => insertFormatting('## ')}>
                    H2
                  </button>
                  <button className="toolbar-btn" title="Heading 3" onClick={() => insertFormatting('### ')}>
                    H3
                  </button>
                  <div className="toolbar-divider" />
                  <button className="toolbar-btn" title="Bullet List" onClick={() => insertFormatting('- ')}>
                    • List
                  </button>
                  <button className="toolbar-btn" title="Numbered List" onClick={() => insertFormatting('1. ')}>
                    1. List
                  </button>
                  <button className="toolbar-btn" title="Quote" onClick={() => insertFormatting('> ')}>
                    " Quote
                  </button>
                  <button className="toolbar-btn" title="Code Block" onClick={() => insertFormatting('```\n', '\n```')}>
                    &lt;/&gt; Code
                  </button>
                  <div className="toolbar-divider" />
                  <button
                    className="toolbar-btn"
                    title="Upload Image"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ color: 'var(--accent-blue)' }}
                  >
                    + Upload Image
                  </button>
                </div>

                {/* Textarea note editor */}
                <textarea
                  ref={textareaRef}
                  className="editor-textarea"
                  value={content}
                  onChange={handleContentChange}
                  placeholder="Start typing your note here in Markdown or plain text..."
                  autoFocus
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

            {/* ── Image Drawer Panel ───────────────────────────── */}
            {showImageDrawer && (
              <div className="image-drawer">
                <div className="image-drawer-header">
                  <div className="image-drawer-title">
                    <span>Attached Images</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      (Stored in optimized WebP format on backend)
                    </span>
                  </div>

                  <button
                    className="btn-action-primary"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? 'Uploading...' : '+ Upload New Image'}
                  </button>
                </div>

                {activeTab.images.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    No images attached to this tab yet. Click "+ Upload New Image" to add photos or screenshots.
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
                              className="btn-image-action"
                              title="Insert tag into note content"
                              onClick={() => insertMarkdownImage(img)}
                            >
                              Insert
                            </button>
                            <button
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
            <button className="btn-action-primary" onClick={handleCreateNewTab}>
              + Create First Notebook
            </button>
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
          handleUpdateTabTitle(title, icon);
          setRenameModal({ isOpen: false, tabId: null, initialTitle: '', initialIcon: '📝' });
        }}
        onCancel={() => setRenameModal({ isOpen: false, tabId: null, initialTitle: '', initialIcon: '📝' })}
      />
    </div>
  );
}
