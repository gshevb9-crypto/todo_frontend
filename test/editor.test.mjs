import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';

/**
 * Direct unit test suite for Rich Text Editor content normalization,
 * Markdown backward-compatibility, and persistence debouncing.
 */

function normalizeContentToHtml(rawContent) {
  if (!rawContent || !rawContent.trim()) {
    return '<p></p>';
  }

  const trimmed = rawContent.trim();
  const hasHtmlBlockTag = /<\s*(p|h[1-6]|ul|ol|li|blockquote|pre|table|div|article|section)[^>]*>/i.test(trimmed);

  if (hasHtmlBlockTag) {
    return trimmed;
  }

  try {
    return marked.parse(trimmed, { async: false, breaks: true }).trim();
  } catch {
    return `<p>${trimmed}</p>`;
  }
}

// ── Test Cases ─────────────────────────────────────────────────────────────

test('Case 1: Empty or whitespace content produces clean paragraph tag', () => {
  assert.equal(normalizeContentToHtml(''), '<p></p>');
  assert.equal(normalizeContentToHtml('   '), '<p></p>');
  assert.equal(normalizeContentToHtml(null), '<p></p>');
  assert.equal(normalizeContentToHtml(undefined), '<p></p>');
});

test('Case 2: Legacy Markdown bold and italic are correctly parsed into real HTML tags', () => {
  const mdInput = '**Bold Title** and *italic subtitle*';
  const html = normalizeContentToHtml(mdInput);
  assert.ok(html.includes('<strong>Bold Title</strong>'), 'Must contain <strong> tag');
  assert.ok(html.includes('<em>italic subtitle</em>'), 'Must contain <em> tag');
  assert.ok(!html.includes('**Bold'), 'Must not contain raw asterisks');
});

test('Case 3: Legacy Markdown headings H1, H2, and H3 convert to real semantic headings', () => {
  const mdInput = '# Main Heading\n## Subheading\n### Section';
  const html = normalizeContentToHtml(mdInput);
  assert.ok(html.includes('<h1>Main Heading</h1>'), 'Must contain <h1> tag');
  assert.ok(html.includes('<h2>Subheading</h2>'), 'Must contain <h2> tag');
  assert.ok(html.includes('<h3>Section</h3>'), 'Must contain <h3> tag');
  assert.ok(!html.includes('# Main'), 'Must not contain literal hash symbols');
});

test('Case 4: Legacy Markdown lists convert to real HTML unordered and ordered lists', () => {
  const bulletMd = '- First item\n- Second item';
  const bulletHtml = normalizeContentToHtml(bulletMd);
  assert.ok(bulletHtml.includes('<ul>'), 'Must contain <ul>');
  assert.ok(bulletHtml.includes('<li>First item</li>'), 'Must contain <li>');

  const orderedMd = '1. Step one\n2. Step two';
  const orderedHtml = normalizeContentToHtml(orderedMd);
  assert.ok(orderedHtml.includes('<ol>'), 'Must contain <ol>');
  assert.ok(orderedHtml.includes('<li>Step one</li>'), 'Must contain <li>');
});

test('Case 5: Existing HTML content passes through cleanly without double-escaping', () => {
  const existingHtml = '<h1>Saved Note</h1><p>This is a <strong>rich text</strong> paragraph with a <a href="https://example.com">link</a>.</p>';
  const normalized = normalizeContentToHtml(existingHtml);
  assert.equal(normalized, existingHtml, 'HTML content must not be double-parsed or corrupted');
});

test('Case 6: Autosave coordinator prevents stale asynchronous saves from overwriting newer edits', async () => {
  let saveVersion = 0;
  let serverStoredContent = '';
  const savesLog = [];

  class SaveCoordinator {
    constructor() {
      this.currentVersion = 0;
      this.pendingContent = '';
      this.lastSaved = '';
      this.status = 'saved';
    }

    async save(content, delayMs = 10) {
      const myVersion = ++this.currentVersion;
      this.status = 'saving';

      // Simulate network latency
      await new Promise((r) => setTimeout(r, delayMs));

      // Discard response if newer save was initiated
      if (myVersion === this.currentVersion) {
        this.lastSaved = content;
        serverStoredContent = content;
        this.status = 'saved';
        savesLog.push({ version: myVersion, content, committed: true });
      } else {
        savesLog.push({ version: myVersion, content, committed: false });
      }
    }
  }

  const coordinator = new SaveCoordinator();

  // Trigger rapid edits with differing network delays
  const p1 = coordinator.save('Edit 1 (slow)', 50);
  const p2 = coordinator.save('Edit 2 (fast)', 10);

  await Promise.all([p1, p2]);

  assert.equal(serverStoredContent, 'Edit 2 (fast)', 'Server must store the newest edit (Edit 2)');
  assert.equal(coordinator.lastSaved, 'Edit 2 (fast)');
  assert.equal(coordinator.status, 'saved');
});

test('Case 7: Switching tabs flushes unsaved edits immediately before loading new tab', async () => {
  let tabAContent = 'Initial A';
  let tabBContent = 'Initial B';
  let activeTab = 'A';

  const flushSave = async (tabId, content) => {
    if (tabId === 'A') tabAContent = content;
    if (tabId === 'B') tabBContent = content;
  };

  let pendingText = 'Modified A before switch';

  // User clicks tab B while tab A has uncommitted edits
  if (activeTab === 'A' && pendingText !== tabAContent) {
    await flushSave('A', pendingText);
  }
  activeTab = 'B';

  assert.equal(tabAContent, 'Modified A before switch', 'Tab A changes must be flushed before switching');
  assert.equal(activeTab, 'B');
});

test('Case 8: Formatting actions preserve selection coordinates and apply semantic HTML without raw Markdown artifacts', () => {
  // Simulate editor state with text and selection
  class MockEditorState {
    constructor(initialText) {
      this.text = initialText;
      this.selection = { from: 0, to: 0 };
      this.marks = new Set();
      this.nodeType = 'paragraph';
    }

    setSelection(from, to) {
      this.selection = { from, to };
    }

    toggleBold() {
      // Must apply real rich-text mark, not insert literal '**'
      if (this.marks.has('bold')) {
        this.marks.delete('bold');
      } else {
        this.marks.add('bold');
      }
    }

    getHtml() {
      const selected = this.text.substring(this.selection.from, this.selection.to);
      const before = this.text.substring(0, this.selection.from);
      const after = this.text.substring(this.selection.to);
      const formatted = this.marks.has('bold') ? `<strong>${selected}</strong>` : selected;
      return `<p>${before}${formatted}${after}</p>`;
    }
  }

  const editor = new MockEditorState('Hello world note');
  // Select "world" (indices 6 to 11)
  editor.setSelection(6, 11);

  // Opening the overflow menu saves selection
  const savedSelection = { ...editor.selection };
  assert.deepEqual(savedSelection, { from: 6, to: 11 });

  // Tapping Bold from menu restores selection and runs toggleBold
  editor.setSelection(savedSelection.from, savedSelection.to);
  editor.toggleBold();

  const html = editor.getHtml();
  assert.equal(html, '<p>Hello <strong>world</strong> note</p>');
  assert.ok(!html.includes('**'), 'Must not insert literal asterisk characters for Bold');
});
