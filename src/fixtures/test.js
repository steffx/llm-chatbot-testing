import { test as base, expect } from '@playwright/test';
import { ChatClient } from '../ChatClient.js';
import { ChatPage } from '../pages/ChatPage.js';
import { CUSTOMERS } from '../../app/data/customers.js';

export const test = base.extend({
  /** Factory: chatAs('alex') returns a logged-in ChatClient with its own cookie jar and conversation. */
  chatAs: async ({ playwright, baseURL }, use) => {
    const contexts = [];
    await use(async (username = 'alex') => {
      const context = await playwright.request.newContext({ baseURL });
      contexts.push(context);
      const { password } = CUSTOMERS[username];
      return new ChatClient(context).login(username, password);
    });
    await Promise.all(contexts.map((c) => c.dispose()));
  },

  /** The chat page, signed in as Alex through the API (no UI login clicks). */
  chatPage: async ({ page }, use) => {
    const res = await page.request.post('/api/login', { data: { username: 'alex', password: CUSTOMERS.alex.password } });
    expect(res.ok()).toBeTruthy();
    const chatPage = new ChatPage(page);
    await chatPage.goto();
    await use(chatPage);
  },
});

export { expect };
