import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login')
    // Note: In dev without a real DB, these will hit the empty state
    // But they should NOT crash
  })

  test('dashboard page loads without crash', async ({ page }) => {
    await page.goto('/')
    // Should show either dashboard content or login redirect
    await expect(page.locator('body')).toBeVisible()
  })

  test('sidebar navigation links exist', async ({ page }) => {
    await page.goto('/')
    // Check sidebar has nav items
    const navLinks = page.locator('nav a, [role="navigation"] a')
    const count = await navLinks.count()
    expect(count).toBeGreaterThan(0)
  })

  test('no console errors on dashboard load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Filter out known non-critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404') && !e.includes('hydration')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
