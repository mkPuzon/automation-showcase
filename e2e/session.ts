/**
 * The bits two e2e files would otherwise duplicate, and the one place the test credentials are written
 * down.
 *
 * `ADMIN_PASSWORD` and `SESSION_SECRET` are not secrets — they are agreed values between the two
 * processes `playwright.config.ts` starts, so the cookie the web process signs is the cookie the API
 * accepts. They exist so the repo's real `.env` is never read by a test and never appears in one. If
 * anything ever points these values at a deployment, that is a bug in whoever did it, not in here.
 */

import { expect, type Page } from '@playwright/test';

export const ADMIN_PASSWORD = 'techshare-e2e-admin-password';
export const SESSION_SECRET = 'techshare-e2e-session-secret-not-for-anything-real';

/**
 * Sign in as the reviewer.
 *
 * Deliberately through the form rather than by writing a cookie: the signed session cookie is itself
 * part of what is under test, and a test that minted its own would pass even if signing broke.
 */
export async function signIn(page: Page): Promise<void> {
	await page.goto('/admin');
	await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin\/dashboard/);
}
