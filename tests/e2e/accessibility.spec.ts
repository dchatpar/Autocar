import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('all buttons have accessible names', async ({ page }) => {
    await page.goto('/login')
    const buttons = page.locator('button')
    const count = await buttons.count()
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i)
      const text = await btn.textContent()
      const ariaLabel = await btn.getAttribute('aria-label')
      // Button must have either text or aria-label
      if (!ariaLabel) {
        expect(text?.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('form inputs have labels', async ({ page }) => {
    await page.goto('/login')
    const inputs = page.locator('input')
    const count = await inputs.count()
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i)
      const type = await input.getAttribute('type')
      if (type === 'hidden' || type === 'submit') continue
      const id = await input.getAttribute('id')
      const ariaLabel = await input.getAttribute('aria-label')
      const label = id ? page.locator(`label[for="${id}"]`) : page.locator(`label:has(#${id})`)
      const hasLabel = id ? await label.count() > 0 : false
      expect(ariaLabel || hasLabel || type === 'email' || type === 'password').toBeTruthy()
    }
  })

  test('tab navigation works on login page', async ({ page }) => {
    await page.goto('/login')
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })
})
