/**
 * Text highlighting utility for smart search matches.
 *
 * GH#1391 follow-up: Highlights matching substrings in cell text
 * when global search is active.
 */

/**
 * Escape HTML special characters to prevent XSS when using innerHTML.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Create an HTML string with matching substrings wrapped in <mark> tags.
 *
 * Returns null if no match is found (caller should use plain textContent instead).
 * Only highlights the first occurrence to keep DOM simple.
 *
 * @param text - The cell display text
 * @param searchText - The active search query (will be trimmed + lowercased)
 * @returns HTML string with <mark> highlight, or null if no match
 */
export function highlightMatch(text: string, searchText: string): string | null {
  if (!searchText || !text) return null

  const search = searchText.trim().toLowerCase()
  if (!search) return null

  const lowerText = text.toLowerCase()
  const idx = lowerText.indexOf(search)
  if (idx === -1) return null

  const before = escapeHtml(text.slice(0, idx))
  const match = escapeHtml(text.slice(idx, idx + search.length))
  const after = escapeHtml(text.slice(idx + search.length))

  return `${before}<mark class="vg-search-highlight">${match}</mark>${after}`
}
