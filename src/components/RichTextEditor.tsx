import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
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

interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: (editor: any) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      content,
      onChange,
      onSave,
      onUploadImage,
      attachedImages = [],
      placeholder = "Type '/' for commands, or start writing...",
      editable = true,
    },
    ref
  ) => {
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [imageMenuOpen, setImageMenuOpen] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    // Slash command state
    const [slashOpen, setSlashOpen] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const [slashPos, setSlashPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const slashRangeRef = useRef<{ from: number; to: number } | null>(null);

    // Selection bubble menu state
    const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);

    const overflowMenuRef = useRef<HTMLDivElement>(null);
    const overflowButtonRef = useRef<HTMLButtonElement>(null);
    const imageMenuRef = useRef<HTMLDivElement>(null);
    const imageButtonRef = useRef<HTMLButtonElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const slashMenuRef = useRef<HTMLDivElement>(null);
    const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

    // Define Slash Commands List
    const slashCommands: SlashCommandItem[] = [
      {
        id: 'text',
        title: 'Text',
        description: 'Just start writing with plain text.',
        icon: '📝',
        action: (ed) => ed.chain().focus().setParagraph().run(),
      },
      {
        id: 'todo',
        title: 'To-do list',
        description: 'Track tasks with a to-do list checkbox.',
        icon: '☑️',
        action: (ed) => ed.chain().focus().toggleTaskList().run(),
      },
      {
        id: 'h1',
        title: 'Heading 1',
        description: 'Large section heading.',
        icon: 'H1',
        action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: 'h2',
        title: 'Heading 2',
        description: 'Medium section heading.',
        icon: 'H2',
        action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: 'h3',
        title: 'Heading 3',
        description: 'Small section heading.',
        icon: 'H3',
        action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: 'bullet',
        title: 'Bulleted list',
        description: 'Create a simple bulleted list.',
        icon: '•',
        action: (ed) => ed.chain().focus().toggleBulletList().run(),
      },
      {
        id: 'number',
        title: 'Numbered list',
        description: 'Create a list with numbering.',
        icon: '1.',
        action: (ed) => ed.chain().focus().toggleOrderedList().run(),
      },
      {
        id: 'quote',
        title: 'Quote',
        description: 'Capture a quote or blockquote.',
        icon: '❝',
        action: (ed) => ed.chain().focus().toggleBlockquote().run(),
      },
      {
        id: 'callout',
        title: 'Callout',
        description: 'Make writing stand out with an icon.',
        icon: '💡',
        action: (ed) =>
          ed
            .chain()
            .focus()
            .insertContent(
              '<blockquote class="notion-callout"><p>💡 Type important notes or callouts here...</p></blockquote>'
            )
            .run(),
      },
      {
        id: 'code',
        title: 'Code block',
        description: 'Capture a code snippet.',
        icon: '💻',
        action: (ed) => ed.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: 'divider',
        title: 'Divider',
        description: 'Visually divide blocks with a line.',
        icon: '➖',
        action: (ed) => ed.chain().focus().setHorizontalRule().run(),
      },
      {
        id: 'image',
        title: 'Image',
        description: 'Upload an image or pick from gallery.',
        icon: '🖼️',
        action: () => handleImageButtonClick(),
      },
    ];

    const filteredSlashCommands = slashCommands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(slashQuery.toLowerCase()) ||
        cmd.description.toLowerCase().includes(slashQuery.toLowerCase()) ||
        cmd.id.toLowerCase().includes(slashQuery.toLowerCase())
    );

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
          horizontalRule: false,
        }),
        HorizontalRule,
        TaskList,
        TaskItem.configure({
          nested: true,
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
          // Ctrl+S / Cmd+S save shortcut
          if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            if (onSave) {
              onSave();
            }
            return true;
          }

          // Handle Slash Menu Navigation
          if (slashOpen) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSlashSelectedIndex((prev) =>
                filteredSlashCommands.length > 0 ? (prev + 1) % filteredSlashCommands.length : 0
              );
              return true;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSlashSelectedIndex((prev) =>
                filteredSlashCommands.length > 0
                  ? (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
                  : 0
              );
              return true;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const chosen = filteredSlashCommands[slashSelectedIndex];
              if (chosen) {
                executeSlashCommand(chosen);
              }
              return true;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setSlashOpen(false);
              return true;
            }
          }

          return false;
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        const html = currentEditor.getHTML();
        onChange(html);

        // Check for Slash Command trigger in current text
        checkSlashCommand(currentEditor);
      },
      onSelectionUpdate: ({ editor: currentEditor }) => {
        updateBubbleMenu(currentEditor);
        checkSlashCommand(currentEditor);
      },
    });

    // Detect if slash was typed at cursor
    const checkSlashCommand = (currentEditor: any) => {
      if (!currentEditor) return;
      const { state } = currentEditor;
      const { selection } = state;
      const { $from } = selection;

      // Only single cursor (no range selection)
      if (!selection.empty) {
        setSlashOpen(false);
        return;
      }

      // Get text before cursor in current line
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
      const slashIndex = textBefore.lastIndexOf('/');

      if (slashIndex !== -1 && (slashIndex === 0 || textBefore[slashIndex - 1] === ' ')) {
        const query = textBefore.slice(slashIndex + 1);
        // Only trigger if no spaces in query
        if (!query.includes(' ')) {
          const from = $from.pos - query.length - 1;
          const to = $from.pos;
          slashRangeRef.current = { from, to };
          setSlashQuery(query);
          setSlashSelectedIndex(0);

          try {
            const coords = currentEditor.view.coordsAtPos(from);
            setSlashPos({
              top: coords.bottom + 6,
              left: Math.min(coords.left, window.innerWidth - 320),
            });
            setSlashOpen(true);
            return;
          } catch {
            // Ignore if coordinates calculation fails
          }
        }
      }

      setSlashOpen(false);
    };

    const executeSlashCommand = (cmd: SlashCommandItem) => {
      if (!editor) return;

      if (slashRangeRef.current) {
        // Delete the "/query" text from document
        editor.chain().focus().deleteRange(slashRangeRef.current).run();
      }

      setSlashOpen(false);
      cmd.action(editor);
    };

    // Update Floating Bubble Menu
    const updateBubbleMenu = (currentEditor: any) => {
      if (!currentEditor || !currentEditor.isFocused) {
        setBubblePos(null);
        return;
      }

      const { state } = currentEditor;
      const { selection } = state;

      if (selection.empty || selection.from === selection.to) {
        setBubblePos(null);
        return;
      }

      try {
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect && rect.width > 0) {
            setBubblePos({
              top: Math.max(10, rect.top - 46),
              left: Math.max(10, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 300)),
            });
            return;
          }
        }
      } catch {
        // Ignore selection rect calculation error
      }

      setBubblePos(null);
    };

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

        if (
          slashOpen &&
          slashMenuRef.current &&
          !slashMenuRef.current.contains(target)
        ) {
          setSlashOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOverflowOpen(false);
          setImageMenuOpen(false);
          setSlashOpen(false);
          setBubblePos(null);
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
    }, [overflowOpen, imageMenuOpen, slashOpen, editor]);

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
        const url = window.prompt('Enter image URL:');
        if (url && editor) {
          editor.chain().focus().setImage({ src: url }).run();
        }
        return;
      }

      if (attachedImages.length > 0) {
        setImageMenuOpen((prev) => !prev);
      } else {
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
          <span>Preparing Notion editor...</span>
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

        {/* ── Notion-Style Floating Bubble Menu (Shown on text highlight) ──────── */}
        {bubblePos && (
          <div
            className="notion-bubble-menu"
            style={{ top: `${bubblePos.top}px`, left: `${bubblePos.left}px` }}
            onMouseDown={handlePreventFocusLoss}
          >
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('bold') ? 'active' : ''}`}
              title="Bold"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('italic') ? 'active' : ''}`}
              title="Italic"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('underline') ? 'active' : ''}`}
              title="Underline"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <u>U</u>
            </button>
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('strike') ? 'active' : ''}`}
              title="Strikethrough"
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <s>S</s>
            </button>
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('code') ? 'active' : ''}`}
              title="Inline Code"
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              &lt;&gt;
            </button>
            <div className="toolbar-divider" />
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              title="Heading 1"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              H1
            </button>
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              title="Heading 2"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </button>
            <button
              type="button"
              className={`notion-bubble-btn ${editor.isActive('taskList') ? 'active' : ''}`}
              title="To-do list"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              ☑️
            </button>
          </div>
        )}

        {/* ── Notion Slash Command Popover Menu ─────────────────────── */}
        {slashOpen && (
          <div
            ref={slashMenuRef}
            className="slash-menu-popup"
            style={{ top: `${slashPos.top}px`, left: `${slashPos.left}px` }}
            onMouseDown={handlePreventFocusLoss}
          >
            <div className="slash-menu-header">Basic blocks</div>
            {filteredSlashCommands.length === 0 ? (
              <div className="slash-menu-empty">No matching commands for "{slashQuery}"</div>
            ) : (
              filteredSlashCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  className={`slash-menu-item ${idx === slashSelectedIndex ? 'selected' : ''}`}
                  onClick={() => executeSlashCommand(cmd)}
                  onMouseEnter={() => setSlashSelectedIndex(idx)}
                >
                  <div className="slash-menu-icon">{cmd.icon}</div>
                  <div className="slash-menu-text">
                    <span className="slash-menu-title">{cmd.title}</span>
                    <span className="slash-menu-desc">{cmd.description}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Desktop & Touch-Friendly Formatting Toolbar Ribbon ─────────────────── */}
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

          {/* Block Formatting: Paragraph, Checkbox, Headings */}
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
              className={`toolbar-btn ${editor.isActive('taskList') ? 'active' : ''}`}
              title="To-do Checkbox List"
              aria-label="To-do list"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().toggleTaskList().run())}
            >
              ☑️ Todo
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

          {/* Lists & Blocks: Bullet, Numbered, Quote, Callout, Divider */}
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
              className="toolbar-btn"
              title="Callout Box"
              aria-label="Callout box"
              onMouseDown={handlePreventFocusLoss}
              onClick={() =>
                runFormattingAction(() =>
                  editor
                    .chain()
                    .focus()
                    .insertContent(
                      '<blockquote class="notion-callout"><p>💡 Type your callout note here...</p></blockquote>'
                    )
                    .run()
                )
              }
            >
              💡 Callout
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Divider (Line)"
              aria-label="Divider"
              onMouseDown={handlePreventFocusLoss}
              onClick={() => runFormattingAction(() => editor.chain().focus().setHorizontalRule().run())}
            >
              ➖ Line
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

            {/* Image Source Dropdown */}
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
                    <div className="dropdown-section-title">Gallery Photos ({attachedImages.length})</div>
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
              aria-label="More options"
              onMouseDown={handlePreventFocusLoss}
              onClick={toggleOverflowMenu}
            >
              ⋯
            </button>

            {overflowOpen && (
              <div
                ref={overflowMenuRef}
                className="toolbar-overflow-menu"
                onMouseDown={handlePreventFocusLoss}
              >
                <div className="overflow-section-label">Block Type</div>
                <div className="overflow-grid">
                  <button
                    type="button"
                    className={`overflow-menu-item ${editor.isActive('paragraph') ? 'active' : ''}`}
                    onClick={() => runFormattingAction(() => editor.chain().focus().setParagraph().run(), true)}
                  >
                    <span className="overflow-item-icon">¶</span>
                    <span>Text</span>
                  </button>
                  <button
                    type="button"
                    className={`overflow-menu-item ${editor.isActive('taskList') ? 'active' : ''}`}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleTaskList().run(), true)}
                  >
                    <span className="overflow-item-icon">☑️</span>
                    <span>To-do</span>
                  </button>
                  <button
                    type="button"
                    className={`overflow-menu-item ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), true)}
                  >
                    <span className="overflow-item-icon">H1</span>
                    <span>Heading 1</span>
                  </button>
                  <button
                    type="button"
                    className={`overflow-menu-item ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), true)}
                  >
                    <span className="overflow-item-icon">H2</span>
                    <span>Heading 2</span>
                  </button>
                  <button
                    type="button"
                    className={`overflow-menu-item ${editor.isActive('bulletList') ? 'active' : ''}`}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleBulletList().run(), true)}
                  >
                    <span className="overflow-item-icon">•</span>
                    <span>Bullet list</span>
                  </button>
                  <button
                    type="button"
                    className={`overflow-menu-item ${editor.isActive('orderedList') ? 'active' : ''}`}
                    onClick={() => runFormattingAction(() => editor.chain().focus().toggleOrderedList().run(), true)}
                  >
                    <span className="overflow-item-icon">1.</span>
                    <span>Number list</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Document Viewport ─────────────────────────────────── */}
        <div className="editor-viewport" onClick={handleEditorContainerClick}>
          <EditorContent editor={editor} />
        </div>

        {/* ── Mobile Touch Accessory Bar (Fixed bottom for iPhone/Android) ─────── */}
        <div className="notion-mobile-toolbar" onMouseDown={handlePreventFocusLoss}>
          <button
            type="button"
            className={`notion-mobile-btn ${editor.isActive('taskList') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="Checklist"
          >
            ☑️
          </button>
          <button
            type="button"
            className={`notion-mobile-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            • List
          </button>
          <button
            type="button"
            className={`notion-mobile-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="H1"
          >
            H1
          </button>
          <button
            type="button"
            className={`notion-mobile-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="H2"
          >
            H2
          </button>
          <button
            type="button"
            className={`notion-mobile-btn ${editor.isActive('bold') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`notion-mobile-btn ${editor.isActive('italic') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="notion-mobile-btn"
            onClick={handleImageButtonClick}
            title="Image"
          >
            🖼️
          </button>
          <button
            type="button"
            className="notion-mobile-btn"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent(
                  '<blockquote class="notion-callout"><p>💡 Note...</p></blockquote>'
                )
                .run()
            }
            title="Callout"
          >
            💡
          </button>
          <button
            type="button"
            className="notion-mobile-btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            ↩
          </button>
          <button
            type="button"
            className="notion-mobile-btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            ↪
          </button>
        </div>

        {/* ── Image Fullscreen Lightbox Preview Modal ──────────────────────── */}
        {previewImageUrl && (
          <div
            className="image-lightbox-overlay"
            onClick={() => setPreviewImageUrl(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Image Preview Lightbox"
          >
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setPreviewImageUrl(null)}
              aria-label="Close image preview"
              title="Close (Esc)"
            >
              ✕
            </button>
            <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
              <img src={previewImageUrl} alt="Full screen preview" />
              <div className="image-lightbox-actions">
                <a
                  href={previewImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-lightbox-action"
                  download
                >
                  Download Image
                </a>
                <button
                  type="button"
                  className="btn-lightbox-action"
                  onClick={() => {
                    navigator.clipboard.writeText(previewImageUrl);
                    alert('Image URL copied to clipboard!');
                  }}
                >
                  Copy URL
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
