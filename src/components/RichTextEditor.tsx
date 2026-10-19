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

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  placeholder?: string;
  editable?: boolean;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ content, onChange, onSave, placeholder = 'Start typing your note here...', editable = true }, ref) => {
    const [overflowOpen, setOverflowOpen] = useState(false);
    const overflowMenuRef = useRef<HTMLDivElement>(null);
    const overflowButtonRef = useRef<HTMLButtonElement>(null);
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

    // Close overflow menu when clicking outside
    useEffect(() => {
      if (!overflowOpen) return;

      const handlePointerDownOutside = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (
          overflowMenuRef.current &&
          !overflowMenuRef.current.contains(target) &&
          overflowButtonRef.current &&
          !overflowButtonRef.current.contains(target)
        ) {
          setOverflowOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOverflowOpen(false);
          editor?.commands.focus();
        }
      };

      document.addEventListener('pointerdown', handlePointerDownOutside);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('pointerdown', handlePointerDownOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [overflowOpen, editor]);

    // Prevent mousedown from stealing editor selection focus
    const handlePreventFocusLoss = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
    }, []);

    // Save selection and toggle overflow menu
    const toggleOverflowMenu = useCallback(() => {
      if (editor) {
        // Save current selection coordinates
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

        // Restore saved selection if available
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

    if (!editor) {
      return (
        <div className="editor-loading-placeholder">
          <span>Preparing rich text editor...</span>
        </div>
      );
    }

    return (
      <div className="rich-editor-wrapper">
        {/* ── Responsive Formatting Toolbar ─────────────────────────────── */}
        <div className="toolbar" role="toolbar" aria-label="Text formatting toolbar">
          {/* History Controls (Always visible) */}
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

          {/* Quick Bold Control (Always visible on all screens) */}
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
          </div>

          {/* Desktop-only Block Formatting: Paragraph & Headings */}
          <div className="toolbar-group toolbar-desktop-only">
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

          <div className="toolbar-divider toolbar-desktop-only" />

          {/* Desktop-only Inline Styles: Italic, Underline, Strikethrough, Code */}
          <div className="toolbar-group toolbar-desktop-only">
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

          <div className="toolbar-divider toolbar-desktop-only" />

          {/* Desktop-only Lists & Blocks */}
          <div className="toolbar-group toolbar-desktop-only">
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

          <div className="toolbar-divider toolbar-desktop-only" />

          {/* Desktop-only Formatting Reset */}
          <div className="toolbar-group toolbar-desktop-only">
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

          {/* ── Mobile Overflow Trigger Button ─────────────────────── */}
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

            {/* ── Responsive Three-Dot Overflow Dropdown Menu ──────────── */}
            {overflowOpen && (
              <div
                ref={overflowMenuRef}
                className="toolbar-overflow-menu"
                role="menu"
                aria-label="Extended formatting options"
                onMouseDown={handlePreventFocusLoss}
              >
                {/* Section: Headings */}
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

                {/* Section: Inline Styles */}
                <div className="overflow-section-label">Text Styles</div>
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

                {/* Section: Lists & Blocks */}
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

                {/* Section: Formatting Reset */}
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

        {/* ── ProseMirror Editor Content Area ──────────────────────────────── */}
        <div className="editor-viewport" onClick={() => editor.commands.focus()}>
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);
RichTextEditor.displayName = 'RichTextEditor';
