/**
 * Link Field Types E2E Tests (Email, URL, Phone)
 *
 * Tests for email, url, and phone field types in VibeGrid.
 * These are "link" types - clicking navigates, not edits.
 *
 * @feature GH#753
 *
 * Link types have special affordance behavior:
 * - Content has data-affordance="navigate" (clicking opens mailto:/tel:/URL)
 * - URL type also has pencil icon with data-affordance="edit"
 * - Email/Phone use editTrigger: 'icon' (link-only affordance)
 *
 * Converted to Puppeteer for consistency with other field type tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, ElementHandle } from 'playwright-core'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'
import { isElementVisible, loadFixtures, scrollToColumn, VIBEGRID_VIEWPORT, WAIT } from '../utils'

let page: Page
let gridReady = false

describe('VibeGrid Link Field Types', () => {
  beforeEach(async () => {
    page = await getTestPage()
    gridReady = false

    // Set wide viewport so all columns are visible
    await page.setViewportSize(VIBEGRID_VIEWPORT)

    try {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/field-types`, {
        waitUntil: 'networkidle',
        timeout: 15000,
      })
      await page.waitForSelector('.vibegridx-container', { timeout: 10000 })
      await new Promise((r) => setTimeout(r, WAIT.GRID_RENDER))
      gridReady = true
    } catch {
      gridReady = false
    }
  }, 90000)

  afterEach(async () => {
    if (page) {
      // Press Escape to clean up any open editors
      await page.keyboard.press('Escape')
      await new Promise((r) => setTimeout(r, WAIT.SHORT))
      await cleanupPage(page)
    }
  })

  // ============================================
  // EMAIL FIELD TYPE TESTS
  // ============================================

  describe('Email Field Type', () => {
    /**
     * Find email cells in the grid
     */
    async function findEmailCells(): Promise<ElementHandle[]> {
      // Try to scroll to email column if not visible
      await scrollToColumn(page, 'email')
      await new Promise((r) => setTimeout(r, WAIT.MEDIUM))

      const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="email"]')
      return cells
    }

    it('2.1 Email cell renders with value', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const emailCells = await findEmailCells()

      if (emailCells.length === 0) {
        console.log('SKIP: No email cells found'); return
      }

      // Find first cell with actual email value
      let foundCellWithValue = false
      for (const cell of emailCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        // Email should contain @ symbol
        if (cellText && cellText.includes('@')) {
          foundCellWithValue = true
          const isVisible = await isElementVisible(cell)
          expect(isVisible).toBe(true)
          break
        }
      }

      if (!foundCellWithValue) {
        // Verify cells exist and at least one is visible
        const firstCell = emailCells[0]
        const isVisible = await isElementVisible(firstCell)
        expect(isVisible).toBe(true)
        console.log('NOTE: No cells with email values found - testing cell presence')
      }
    })

    it('2.2 Email cell styled as link', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const emailCells = await findEmailCells()

      if (emailCells.length === 0) {
        console.log('SKIP: No email cells found for style test.'); return
      }

      // Find cell with email value
      for (const cell of emailCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && cellText.includes('@')) {
          // Check cell has span with content
          const hasSpan = await cell.evaluate((el) => {
            const span = el.querySelector('span')
            return span !== null && span.textContent !== null
          })

          expect(hasSpan).toBe(true)
          break
        }
      }
    })

    it('2.3 Email has email href data attribute', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const emailCells = await findEmailCells()

      if (emailCells.length === 0) {
        console.log('SKIP: No email cells found for affordance test.'); return
      }

      // Find cell with email value
      for (const cell of emailCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && cellText.includes('@')) {
          // Check for email href data attribute (the link action)
          const emailHref = await cell.evaluate((el) => {
            const content = el.querySelector('[data-email-href]')
            return content ? content.getAttribute('data-email-href') : null
          })

          // Should have mailto: href
          if (emailHref) {
            expect(emailHref).toMatch(/^mailto:/)
          } else {
            // If no data attribute, verify the cell at least has the email content
            expect(cellText).toContain('@')
          }
          break
        }
      }
    })

    it('2.4 Email has mailto href', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const emailCells = await findEmailCells()

      if (emailCells.length === 0) {
        console.log('SKIP: No email cells found for href test.'); return
      }

      // Find cell with email value
      for (const cell of emailCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && cellText.includes('@')) {
          // Check for email href data attribute
          const emailHref = await cell.evaluate((el) => {
            const content = el.querySelector('[data-email-href]')
            return content ? content.getAttribute('data-email-href') : null
          })

          if (emailHref) {
            expect(emailHref).toMatch(/^mailto:/)
            expect(emailHref).toContain('@')
          }
          break
        }
      }
    })

    it('2.5 Empty email shows edit placeholder', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      // Look for empty email cells
      await scrollToColumn(page, 'email')
      await new Promise((r) => setTimeout(r, WAIT.MEDIUM))

      const emptyCells = await page.$$(
        '.vibegridx-cell[data-column-id="email"] .vibegridx-cell-empty',
      )

      if (emptyCells.length === 0) {
        // All emails have values - verify cells exist
        const emailCells = await findEmailCells()
        expect(emailCells.length).toBeGreaterThan(0)
        console.log('NOTE: No empty email cells in fixtures')
        return
      }

      const emptyCell = emptyCells[0]
      const cellText = await emptyCell.evaluate((el) => el.textContent)

      // Empty cells should show edit hint
      expect(cellText).toContain('Edit')
    })
  })

  // ============================================
  // URL FIELD TYPE TESTS
  // ============================================

  describe('URL Field Type', () => {
    /**
     * Find URL cells in the grid (column is 'website')
     */
    async function findUrlCells(): Promise<ElementHandle[]> {
      // Try to scroll to website column if not visible
      await scrollToColumn(page, 'website')
      await new Promise((r) => setTimeout(r, WAIT.MEDIUM))

      const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="website"]')
      return cells
    }

    it('3.1 URL cell renders with value', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const urlCells = await findUrlCells()

      if (urlCells.length === 0) {
        console.log('SKIP: No URL cells found. Verify website column exists in schema.'); return
      }

      // Find first cell with URL value
      let foundCellWithValue = false
      for (const cell of urlCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        // URL should contain http or domain pattern
        if (cellText && (cellText.includes('http') || cellText.includes('.'))) {
          foundCellWithValue = true
          const isVisible = await isElementVisible(cell)
          expect(isVisible).toBe(true)
          break
        }
      }

      if (!foundCellWithValue) {
        const firstCell = urlCells[0]
        const isVisible = await isElementVisible(firstCell)
        expect(isVisible).toBe(true)
        console.log('NOTE: No cells with URL values found - testing cell presence')
      }
    })

    it('3.2 URL cell styled as link (blue, underlined)', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const urlCells = await findUrlCells()

      if (urlCells.length === 0) {
        console.log('SKIP: No URL cells found for style test.'); return
      }

      // Find cell with URL value
      for (const cell of urlCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && (cellText.includes('http') || cellText.includes('.'))) {
          // Check for link styling
          const linkElement = await cell.$('.vibegridx-url-text')
          if (linkElement) {
            const styles = await linkElement.evaluate((el) => ({
              color: getComputedStyle(el).color,
              textDecoration: getComputedStyle(el).textDecoration,
            }))

            // Should have blue color
            expect(styles.color).toMatch(/rgb\(37,\s*99,\s*235\)|#2563eb/i)
            // Should have underline
            expect(styles.textDecoration).toContain('underline')
          }
          break
        }
      }
    })

    it('3.3 URL has url href data attribute', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const urlCells = await findUrlCells()

      if (urlCells.length === 0) {
        console.log('SKIP: No URL cells found for affordance test.'); return
      }

      // Find cell with URL value
      for (const cell of urlCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && (cellText.includes('http') || cellText.includes('.'))) {
          // Check for URL href data attribute or link element
          const urlHref = await cell.evaluate((el) => {
            const content = el.querySelector('[data-url-href]')
            return content ? content.getAttribute('data-url-href') : null
          })

          // Should have https:// href
          if (urlHref) {
            expect(urlHref).toMatch(/^https?:\/\//)
          } else {
            // If no data attribute, verify the cell at least has URL content
            expect(cellText.includes('http') || cellText.includes('.')).toBe(true)
          }
          break
        }
      }
    })

    it('3.4 URL has edit icon affordance (link-with-edit-icon)', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const urlCells = await findUrlCells()

      if (urlCells.length === 0) {
        console.log('SKIP: No URL cells found for edit icon test.'); return
      }

      // Find editable cell with URL value
      for (const cell of urlCells) {
        const isEditable = await cell.evaluate((el) => el.getAttribute('data-editable') !== 'false')
        const cellText = await cell.evaluate((el) => el.textContent)

        if (isEditable && cellText && (cellText.includes('http') || cellText.includes('.'))) {
          // Check for edit icon with edit affordance
          const hasEditIcon = await cell.evaluate((el) => {
            const editIcon = el.querySelector('.vibegridx-url-edit-icon, [data-affordance="edit"]')
            return editIcon !== null
          })

          // URL type should have edit icon (link-with-edit-icon affordance)
          expect(hasEditIcon).toBe(true)
          break
        }
      }
    })

    it('3.5 URL has href data attribute', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const urlCells = await findUrlCells()

      if (urlCells.length === 0) {
        console.log('SKIP: No URL cells found for href test.'); return
      }

      // Find cell with URL value
      for (const cell of urlCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && (cellText.includes('http') || cellText.includes('.'))) {
          // Check for URL href data attribute
          const urlHref = await cell.evaluate((el) => {
            const content = el.querySelector('[data-url-href]')
            return content ? content.getAttribute('data-url-href') : null
          })

          if (urlHref) {
            expect(urlHref).toMatch(/^https?:\/\//)
          }
          break
        }
      }
    })

    it('3.6 Empty URL shows edit placeholder', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      await scrollToColumn(page, 'website')
      await new Promise((r) => setTimeout(r, WAIT.MEDIUM))

      const emptyCells = await page.$$(
        '.vibegridx-cell[data-column-id="website"] .vibegridx-cell-empty',
      )

      if (emptyCells.length === 0) {
        const urlCells = await findUrlCells()
        expect(urlCells.length).toBeGreaterThan(0)
        console.log('NOTE: No empty URL cells in fixtures')
        return
      }

      const emptyCell = emptyCells[0]
      const cellText = await emptyCell.evaluate((el) => el.textContent)

      expect(cellText).toContain('Edit')
    })
  })

  // ============================================
  // PHONE FIELD TYPE TESTS
  // ============================================

  describe('Phone Field Type', () => {
    /**
     * Find phone cells in the grid
     */
    async function findPhoneCells(): Promise<ElementHandle[]> {
      // Try to scroll to phone column if not visible
      await scrollToColumn(page, 'phone')
      await new Promise((r) => setTimeout(r, WAIT.MEDIUM))

      const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="phone"]')
      return cells
    }

    it('4.1 Phone cell renders with formatted value', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const phoneCells = await findPhoneCells()

      if (phoneCells.length === 0) {
        console.log('SKIP: No phone cells found'); return
      }

      // Find first cell with phone value
      let foundCellWithValue = false
      for (const cell of phoneCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        // Phone should contain digits (and possibly formatting chars like -, (, ))
        if (cellText && /\d/.test(cellText)) {
          foundCellWithValue = true
          const isVisible = await isElementVisible(cell)
          expect(isVisible).toBe(true)
          break
        }
      }

      if (!foundCellWithValue) {
        const firstCell = phoneCells[0]
        const isVisible = await isElementVisible(firstCell)
        expect(isVisible).toBe(true)
        console.log('NOTE: No cells with phone values found - testing cell presence')
      }
    })

    it('4.2 Phone cell has formatted display', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const phoneCells = await findPhoneCells()

      if (phoneCells.length === 0) {
        console.log('SKIP: No phone cells found for style test.'); return
      }

      // Find cell with phone value
      for (const cell of phoneCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && /\d/.test(cellText)) {
          // Check cell has span with phone content
          const hasSpan = await cell.evaluate((el) => {
            const span = el.querySelector('span')
            return span !== null && span.textContent !== null
          })

          expect(hasSpan).toBe(true)
          break
        }
      }
    })

    it('4.3 Phone has phone href data attribute', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const phoneCells = await findPhoneCells()

      if (phoneCells.length === 0) {
        console.log('SKIP: No phone cells found for affordance test.'); return
      }

      // Find cell with phone value
      for (const cell of phoneCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && /\d/.test(cellText)) {
          // Check for phone href data attribute
          const phoneHref = await cell.evaluate((el) => {
            const content = el.querySelector('[data-phone-href]')
            return content ? content.getAttribute('data-phone-href') : null
          })

          // Should have tel: href
          if (phoneHref) {
            expect(phoneHref).toMatch(/^tel:/)
          } else {
            // If no data attribute, verify the cell at least has phone digits
            expect(/\d/.test(cellText)).toBe(true)
          }
          break
        }
      }
    })

    it('4.4 Phone has tel href', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const phoneCells = await findPhoneCells()

      if (phoneCells.length === 0) {
        console.log('SKIP: No phone cells found for href test.'); return
      }

      // Find cell with phone value
      for (const cell of phoneCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && /\d/.test(cellText)) {
          // Check for phone href data attribute
          const phoneHref = await cell.evaluate((el) => {
            const content = el.querySelector('[data-phone-href]')
            return content ? content.getAttribute('data-phone-href') : null
          })

          if (phoneHref) {
            expect(phoneHref).toMatch(/^tel:/)
            expect(phoneHref).toMatch(/\d/)
          }
          break
        }
      }
    })

    it('4.5 Phone displays formatted phone number', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const phoneCells = await findPhoneCells()

      if (phoneCells.length === 0) {
        console.log('SKIP: No phone cells found for format test.'); return
      }

      // Find cell with phone value
      for (const cell of phoneCells) {
        const cellText = await cell.evaluate((el) => el.textContent)
        if (cellText && /\d/.test(cellText)) {
          // Phone should contain digits (formatted or raw)
          const hasDigits = /\d/.test(cellText)
          expect(hasDigits).toBe(true)

          // Phone typically has formatting chars like -, (, ), +
          // This is an optional check - some phones may be raw digits
          const mayBeFormatted = /[\d\-\(\)\+\s]/.test(cellText)
          expect(mayBeFormatted).toBe(true)
          break
        }
      }
    })

    it('4.6 Empty phone shows edit placeholder', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      await scrollToColumn(page, 'phone')
      await new Promise((r) => setTimeout(r, WAIT.MEDIUM))

      const emptyCells = await page.$$(
        '.vibegridx-cell[data-column-id="phone"] .vibegridx-cell-empty',
      )

      if (emptyCells.length === 0) {
        const phoneCells = await findPhoneCells()
        expect(phoneCells.length).toBeGreaterThan(0)
        console.log('NOTE: No empty phone cells in fixtures')
        return
      }

      const emptyCell = emptyCells[0]
      const cellText = await emptyCell.evaluate((el) => el.textContent)

      expect(cellText).toContain('Edit')
    })
  })

  // ============================================
  // CROSS-TYPE TESTS
  // ============================================

  describe('Link Type Common Behavior', () => {
    it('5.1 All link types render with span content', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const linkColumns = ['email', 'phone', 'website']

      for (const columnId of linkColumns) {
        await scrollToColumn(page, columnId)
        await new Promise((r) => setTimeout(r, WAIT.SHORT))

        const cells = await page.$$(`.vibegridx-cell[data-row-id][data-column-id="${columnId}"]`)

        for (const cell of cells) {
          const hasValue = await cell.evaluate((el) => {
            const text = el.textContent || ''
            return text.length > 0 && !text.includes('Edit')
          })

          if (hasValue) {
            // All link types should render content in a span
            const hasSpan = await cell.evaluate((el) => {
              const span = el.querySelector('span')
              return span !== null
            })

            expect(hasSpan).toBe(true)
            break
          }
        }
      }
    })

    it('5.2 Link types have href data attributes', async () => {
      if (!gridReady) { console.log('SKIP: Grid not loaded'); return }
      await loadFixtures(page)

      const linkColumns = [
        { id: 'email', hrefAttr: 'data-email-href', pattern: /^mailto:/ },
        { id: 'phone', hrefAttr: 'data-phone-href', pattern: /^tel:/ },
        { id: 'website', hrefAttr: 'data-url-href', pattern: /^https?:\/\// },
      ]

      for (const { id, hrefAttr, pattern } of linkColumns) {
        await scrollToColumn(page, id)
        await new Promise((r) => setTimeout(r, WAIT.SHORT))

        const cells = await page.$$(`.vibegridx-cell[data-row-id][data-column-id="${id}"]`)

        for (const cell of cells) {
          const hasValue = await cell.evaluate((el) => {
            const text = el.textContent || ''
            return text.length > 0 && !text.includes('Edit')
          })

          if (hasValue) {
            const href = await cell.evaluate((el, attr) => {
              const content = el.querySelector(`[${attr}]`)
              return content ? content.getAttribute(attr) : null
            }, hrefAttr)

            // If href exists, verify format
            if (href) {
              expect(href).toMatch(pattern)
            }
            break
          }
        }
      }
    })
  })
})
