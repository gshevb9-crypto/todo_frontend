import React, { useEffect, forwardRef, useImperativeHandle } from 'react';
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
          // Handle Ctrl+S / Cmd+S
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

    // Expose imperative methods to parent (e.g. for inserting uploaded images)
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

    // Synchronize editor content when active tab changes externally
    useEffect(() => {
      if (!editor) return;

      const currentHtml = editor.getHTML();
      const normalizedIncoming = normalizeContentToHtml(content);

      // Only update if there is a substantive content difference (e.g. switched tabs)
      if (normalizedIncoming !== currentHtml && !editor.isFocused) {
        editor.commands.setContent(normalizedIncoming, { emitUpdate: false });
      }
    }, [content, editor]);

    if (!editor) {
      return (
        <div className="editor-loading-placeholder">
          <span>Preparing rich text editor...</span>
        </div>
      );
    }

    // Helper to prevent mousedown from stealing editor selection focus
    const handleToolbarMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
    };

    return (
      <div className="rich-editor-wrapper">
        {/* ── Rich Formatting Toolbar ─────────────────────────────────────── */}
        <div className="toolbar" role="toolbar" aria-label="Text formatting toolbar">
          {/* History Controls */}
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              ↩
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().redo().run()}
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
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              ¶
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              title="Heading 1"
              aria-label="Heading 1"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              H1
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              title="Heading 2"
              aria-label="Heading 2"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
              title="Heading 3"
              aria-label="Heading 3"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              H3
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Inline Text Styles: Bold, Italic, Underline, Strikethrough, Code */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
              title="Bold (Ctrl+B)"
              aria-label="Bold text"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
              title="Italic (Ctrl+I)"
              aria-label="Italic text"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
              title="Underline (Ctrl+U)"
              aria-label="Underline text"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
              title="Strikethrough"
              aria-label="Strikethrough text"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('code') ? 'active' : ''}`}
              title="Inline Code"
              aria-label="Inline code"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              &lt;&gt;
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Lists & Block Elements */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
              title="Bulleted List"
              aria-label="Bulleted list"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              • List
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
              title="Numbered List"
              aria-label="Numbered list"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              1. List
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
              title="Blockquote"
              aria-label="Blockquote"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              " Quote
            </button>
            <button
              type="button"
              className={`toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
              title="Code Block"
              aria-label="Code block"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              {`{ }`}
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Formatting Reset */}
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              title="Clear Formatting"
              aria-label="Clear formatting"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              🧹 Clear
            </button>
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
