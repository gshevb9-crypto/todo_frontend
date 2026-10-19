import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { normalizeContentToHtml } from '../utils/contentUtils';

export interface RichTextEditorRef {
  insertImage: (url: string, alt?: string) => void;
  getHtml: () => string;
  focus: () => void;
}

export interface AttachedImageItem {
  id: string;
  url: string;
  originalFileName: string;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  onUploadImage?: (file: File) => Promise<string | null>;
  attachedImages?: AttachedImageItem[];
  placeholder?: string;
  editable?: boolean;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      content,
      onChange,
      onSave,
      onUploadImage,
      attachedImages = [],
      placeholder = 'Type something, or use the formatting tools above...',
      editable = true,
    },
    ref
  ) => {
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [imageMenuOpen, setImageMenuOpen] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    const overflowMenuRef = useRef<HTMLDivElement>(null);
    const overflowButtonRef = useRef<HTMLButtonElement>(null);
    const imageMenuRef = useRef<HTMLDivElement>(null);
    const imageButtonRef = useRef<HTMLButtonElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Underline,
        Placeholder.configure({
          placeholder,
          emptyEditorClass: 'is-editor-empty',
        }),
        Image.configure({
          inline: false,
          allowBase64: true,
          HTMLAttributes: {
            class: 'note-embedded-image',
          },
        }),
      ],
      content: normalizeContentToHtml(content),
      editable,
      editorProps: {
        attributes: {
          class: 'prose-editor-content',
          dir: 'auto',
          'aria-label': 'Note Content Editor',
        },
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            if (onSave) {
              onSave();
            }
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        const html = currentEditor.getHTML();
        onChange(html);
      },
    });

    // Expose imperative methods to parent
    useImperativeHandle(
      ref,
      () => ({
        insertImage: (url: string, alt: string = '') => {
          if (editor) {
            editor.chain().focus().setImage({ src: url, alt }).run();
          }
        },
        getHtml: () => {
          return editor ? editor.getHTML() : '';
        },
        focus: () => {
          if (editor) {
            editor.commands.focus();
          }
        },
      }),
      [editor]
    );

    // Synchronize editor content when tab changes externally
    useEffect(() => {
      if (!editor) return;

      const currentHtml = editor.getHTML();
      const normalizedIncoming = normalizeContentToHtml(content);

      if (normalizedIncoming !== currentHtml && !editor.isFocused) {
        editor.commands.setContent(normalizedIncoming, { emitUpdate: false });
      }
    }, [content, editor]);

    // Handle clicks outside dropdown menus
    useEffect(() => {
      const handlePointerDownOutside = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (
          overflowOpen &&
          overflowMenuRef.current &&
          !overflowMenuRef.current.contains(target) &&
          overflowButtonRef.current &&
          !overflowButtonRef.current.contains(target)
        ) {
          setOverflowOpen(false);
        }

        if (
          imageMenuOpen &&
          imageMenuRef.current &&
          !imageMenuRef.current.contains(target) &&
          imageButtonRef.current &&
          !imageButtonRef.current.contains(target)
        ) {
          setImageMenuOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOverflowOpen(false);
          setImageMenuOpen(false);
          setPreviewImageUrl(null);
          editor?.commands.focus();
        }
      };

      document.addEventListener('pointerdown', handlePointerDownOutside);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('pointerdown', handlePointerDownOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [overflowOpen, imageMenuOpen, editor]);

    // Click handler for images inside editor to preview full-screen
    const handleEditorContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'IMG' && target.classList.contains('note-embedded-image')) {
        const src = (target as HTMLImageElement).src;
        if (src) {
          setPreviewImageUrl(src);
        }
      }
    };

    // Prevent mousedown from stealing editor selection focus
    const handlePreventFocusLoss = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
    }, []);

    // Save selection and toggle overflow menu
    const toggleOverflowMenu = useCallback(() => {
      if (editor) {
        savedSelectionRef.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        };
      }
      setOverflowOpen((prev) => !prev);
    }, [editor]);

    // Execute rich-text action preserving selection
    const runFormattingAction = useCallback(
      (action: () => void, closeMenu = false) => {
        if (!editor) return;

        if (savedSelectionRef.current) {
          editor.commands.setTextSelection(savedSelectionRef.current);
        }

        editor.chain().focus();
        action();

        if (closeMenu) {
          setOverflowOpen(false);
        }
      },
      [editor]
    );

    // Direct Image Upload Trigger
    const handleImageButtonClick = () => {
      if (!onUploadImage) {
        // Fallback: prompt for image URL
        const url = window.prompt('Enter image URL:');
        if (url && editor) {
          editor.chain().focus().setImage({ src: url }).run();
        }
        return;
      }

      if (attachedImages.length > 0) {
        // Show options menu: Upload new or pick from existing
        setImageMenuOpen((prev) => !prev);
      } else {
        // Directly trigger file picker
        fileInputRef.current?.click();
      }
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onUploadImage) return;

      setIsUploadingImage(true);
      try {
        const uploadedUrl = await onUploadImage(file);
        if (uploadedUrl && editor) {
          editor.chain().focus().setImage({ src: uploadedUrl, alt: file.name }).run();
        }
      } catch (err) {
        console.error('Image upload failed', err);
      } finally {
        setIsUploadingImage(false);
        setImageMenuOpen(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    const handleInsertExistingImage = (img: AttachedImageItem) => {
      if (editor) {
        editor.chain().focus().setImage({ src: img.url, alt: img.originalFileName }).run();
      }
      setImageMenuOpen(false);
    };

    if (!editor) {
      return (
        <div className="editor-loading-placeholder">
          <span>Preparing rich text editor...</span>
        </div>
      );
    }

    return (
      <div className="rich-editor-wrapper">
        {/* Hidden File Input for Direct Toolbar Image Upload */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          onChange={handleFileInputChange}
        />

        {/* ── Notion-Style Touch-Friendly Formatting Toolbar Ribbon ─────────────────── */}
        <div className="toolbar" role="toolbar" aria-label="Text formatting toolbar">
          {/* History Controls */}
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().undo().run())}
              disabled={!editor.can().undo()}
            >
              ↩
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().redo().run())}
              disabled={!editor.can().redo()}
            >
              ↪
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Block Formatting: Paragraph & Headings */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('paragraph') ? 'active' : ''}`}
              title="Normal Paragraph"
              aria-label="Normal text"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().setParagraph().run())}
            >
              ¶
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              title="Heading 1"
              aria-label="Heading 1"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
            >
              H1
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              title="Heading 2"
              aria-label="Heading 2"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
            >
              H2
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
              title="Heading 3"
              aria-label="Heading 3"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
            >
              H3
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Inline Styles: Bold, Italic, Underline, Strikethrough, Code */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
              title="Bold (Ctrl+B)"
              aria-label="Bold text"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleBold().run())}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
              title="Italic (Ctrl+I)"
              aria-label="Italic text"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleItalic().run())}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
              title="Underline (Ctrl+U)"
              aria-label="Underline text"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleUnderline().run())}
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
              title="Strikethrough"
              aria-label="Strikethrough text"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleStrike().run())}
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('code') ? 'active' : ''}`}
              title="Inline Code"
              aria-label="Inline code"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleCode().run())}
            >
              &lt;&gt;
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Lists & Blocks: Bullet, Numbered, Quote, Code Block */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
              title="Bulleted List"
              aria-label="Bulleted list"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleBulletList().run())}
            >
              • List
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
              title="Numbered List"
              aria-label="Numbered list"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleOrderedList().run())}
            >
              1. List
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
              title="Blockquote"
              aria-label="Blockquote"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleBlockquote().run())}
            >
              " Quote
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
              title="Code Block"
              aria-label="Code block"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleCodeBlock().run())}
            >
              {`{ }`}
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* ── Direct Image Insert/Upload Control ───────────────── */}
          <div className="toolbar-group toolbar-image-container">
            <button
              ref={imageButtonRef}
              type="button"
              className={`toolbar-btn toolbar-image-btn ${isUploadingImage ? 'uploading' : ''}`}
              title="Insert Image (Upload or Pick from Tab)"
              aria-label="Insert Image"
              onMouseDown={handlePreventFocusLoss}
              onClick={handleImageButtonClick}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? (
                <span className="toolbar-loading-spinner" />
              ) : (
                <span>🖼️ Image</span>
              )}
            </button>

            {/* Image Source Dropdown (if tab already has attached photos) */}
            {imageMenuOpen && (
              <div
                ref={imageMenuRef}
                className="toolbar-dropdown-menu image-picker-dropdown"
                onMouseDown={handlePreventFocusLoss}
              >
                <div className="dropdown-section-title">Insert Image into Note</div>
                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  <span className="dropdown-item-icon">📁</span>
                  <span>Upload from device</span>
                </button>

                {attachedImages.length > 0 && (
                  <>
                    <div className="dropdown-divider" />
                    <div className="dropdown-section-title">Notebook Gallery ({attachedImages.length})</div>
                    <div className="toolbar-image-grid-preview">
                      {attachedImages.map((img) => (
                        <div
                          key={img.id}
                          className="toolbar-thumb-item"
                          title={`Insert ${img.originalFileName}`}
                          onClick={() => handleInsertExistingImage(img)}
                        >
                          <img src={img.url} alt={img.originalFileName} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="toolbar-divider" />

          {/* Quick Clear Formatting */}
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              title="Clear Formatting"
              aria-label="Clear formatting"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().unsetAllMarks().clearNodes().run())}
            >
              🧹 Clear
            </button>
          </div>

          {/* ── Extended Formatting Overflow Trigger (Three-dot) ──── */}
          <div className="toolbar-overflow-container">
            <button
              ref={overflowButtonRef}
              type="button"
              className={`toolbar-btn toolbar-overflow-trigger ${overflowOpen ? 'active' : ''}`}
              title="More formatting options"
              aria-label="More formatting options"
              aria-haspopup="true"
              aria-expanded={overflowOpen}
              onMouseDown={handlePreventFocusLoss}
              onClick={toggleOverflowMenu}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>

            {/* Overflow Dropdown Menu */}
            {overflowOpen && (
              <div
                ref={overflowMenuRef}
                className="toolbar-overflow-menu"
                role="menu"
                aria-label="Extended formatting options"
                onMouseDown={handlePreventFocusLoss}
              >
                <div className="overflow-section-label">Headings & Structure</div>
                <div className="overflow-grid">
                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('paragraph') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().setParagraph().run(), true)}
                  >
                    <span className="overflow-item-icon">¶</span>
                    <span>Normal Text</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), true)}
                  >
                    <span className="overflow-item-icon">H1</span>
                    <span>Heading 1</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), true)}
                  >
                    <span className="overflow-item-icon">H2</span>
                    <span>Heading 2</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), true)}
                  >
                    <span className="overflow-item-icon">H3</span>
                    <span>Heading 3</span>
                  </button>
                </div>

                <div className="overflow-menu-divider" />

                <div className="overflow-section-label">Inline Styles</div>
                <div className="overflow-grid">
                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('bold') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleBold().run(), true)}
                  >
                    <span className="overflow-item-icon"><strong>B</strong></span>
                    <span>Bold</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('italic') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleItalic().run(), true)}
                  >
                    <span className="overflow-item-icon"><em>I</em></span>
                    <span>Italic</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('underline') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleUnderline().run(), true)}
                  >
                    <span className="overflow-item-icon"><span style={{ textDecoration: 'underline' }}>U</span></span>
                    <span>Underline</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('strike') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleStrike().run(), true)}
                  >
                    <span className="overflow-item-icon"><span style={{ textDecoration: 'line-through' }}>S</span></span>
                    <span>Strikethrough</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('code') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleCode().run(), true)}
                  >
                    <span className="overflow-item-icon">&lt;&gt;</span>
                    <span>Inline Code</span>
                  </button>
                </div>

                <div className="overflow-menu-divider" />

                <div className="overflow-section-label">Lists & Blocks</div>
                <div className="overflow-grid">
                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('bulletList') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleBulletList().run(), true)}
                  >
                    <span className="overflow-item-icon">•</span>
                    <span>Bullet List</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('orderedList') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleOrderedList().run(), true)}
                  >
                    <span className="overflow-item-icon">1.</span>
                    <span>Numbered List</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('blockquote') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleBlockquote().run(), true)}
                  >
                    <span className="overflow-item-icon">“</span>
                    <span>Blockquote</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`overflow-menu-item ${editor.isActive('codeBlock') ? 'active' : ''}`}
                    onMouseDown={handlePreventFocusLoss}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleCodeBlock().run(), true)}
                  >
                    <span className="overflow-item-icon">{`{ }`}</span>
                    <span>Code Block</span>
                  </button>
                </div>

                <div className="overflow-menu-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="overflow-menu-item clear-action"
                  onMouseDown={handlePreventFocusLoss}
                  onClick={() => runFormattingAction(() => editor.chain().focus().unsetAllMarks().clearNodes().run(), true)}
                >
                  <span className="overflow-item-icon">🧹</span>
                  <span>Clear Formatting</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── ProseMirror Editor Viewport ─────────────────────────────────── */}
        <div
          className="editor-viewport"
          onClick={handleEditorContainerClick}
        >
          <EditorContent editor={editor} />
        </div>

        {/* ── Image Lightbox Fullscreen Preview Modal ──────────────────────── */}
        {previewImageUrl && (
          <div
            className="image-lightbox-overlay"
            onClick={() => setPreviewImageUrl(null)}
            role="dialog"
            aria-label="Image preview"
          >
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setPreviewImageUrl(null)}
              aria-label="Close image preview"
            >
              ✕
            </button>
            <div
              className="image-lightbox-content"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={previewImageUrl} alt="Enlarged note attachment" />
              <div className="image-lightbox-actions">
                <a
                  href={previewImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-lightbox-action"
                >
                  Open Original
                </a>
                <button
                  type="button"
                  className="btn-lightbox-action"
                  onClick={() => setPreviewImageUrl(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
RichTextEditor.displayName = 'RichTextEditor';
