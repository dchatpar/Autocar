import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1, h2').first()).toBeVisible()
    await expect(page.getByPlaceholder(/email/i)).toBeVisible()
    await expect(page.getByPlaceholder(/password/i)).toBeVisible()
  })

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in|log in|login/i }).click()
    // Should show error, not crash
    await expect(page.locator('[role="alert"], .text-danger, [data-error]').first()).toBeVisible()
  })

  test('password field is masked', async ({ page }) => {
    await page.goto('/login')
    const passwordInput = page.getByPlaceholder(/password/i)
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
