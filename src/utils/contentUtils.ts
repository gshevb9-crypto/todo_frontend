import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Normalizes note content to clean, safe HTML.
 * - If the content is already HTML, it is sanitized with DOMPurify to prevent XSS.
 * - If the content contains legacy Markdown syntax, it is parsed to HTML and sanitized.
 * - Preserves existing notes seamlessly without loss of formatting.
 */
export function normalizeContentToHtml(rawContent: string | null | undefined): string {
  if (!rawContent || !rawContent.trim()) {
    return '<p></p>';
  }

  const trimmed = rawContent.trim();

  // Check if content already contains HTML block tags
  const hasHtmlBlockTag = /<\s*(p|h[1-6]|ul|ol|li|blockquote|pre|table|div|article|section|hr)[^>]*>/i.test(trimmed);

  let htmlResult: string;

  if (hasHtmlBlockTag) {
    htmlResult = trimmed;
  } else {
    // Legacy Markdown or plain text
    try {
      htmlResult = marked.parse(trimmed, { async: false, breaks: true }) as string;
    } catch {
      htmlResult = `<p>${escapeHtml(trimmed)}</p>`;
    }
  }

  // Sanitize HTML in browser environments
  if (typeof window !== 'undefined' && DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(htmlResult, {
      ADD_TAGS: ['iframe', 'input', 'hr'],
      ADD_ATTR: ['target', 'rel', 'data-type', 'data-checked', 'checked', 'type', 'disabled', 'class', 'style'],
    });
  }

  return htmlResult;
}

/**
 * Minimal HTML escaping helper for fallback plain text
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
