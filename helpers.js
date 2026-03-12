import { Marked } from 'marked';

// HTML-escape to prevent stored XSS from DB values
// Uses == null to catch both null and undefined (M1 fix)
const esc = (s) => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Normalize Unicode to NFC — prevents NFD decomposition gaps in Vietnamese text
// Returns null for null/undefined instead of passing through (E5 fix)
const nfc = (s) => s != null ? String(s).normalize('NFC') : null;

// Isolated Marked instance — strip raw HTML tags from markdown (M6 fix)
// Uses Marked class instead of global marked.use() to avoid cross-contamination
const markedInstance = new Marked();
markedInstance.use({ renderer: { html: () => '' } });

export { esc, nfc, markedInstance };
