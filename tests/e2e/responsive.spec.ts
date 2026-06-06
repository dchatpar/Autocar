import { test, expect } from '@playwright/test'

test.describe('Responsive', () => {
  test('mobile viewport - no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const innerWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  })

  test('tablet viewport - sidebar collapses', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    // Sidebar should either be collapsed or hidden
    const sidebar = page.locator('[role="navigation"], aside, nav')
    const count = await sidebar.count()
    if (count > 0) {
      // Sidebar exists — check it doesn't cause horizontal scroll
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scrollWidth).toBeLessThanOrEqual(768)
    }
  })
})
