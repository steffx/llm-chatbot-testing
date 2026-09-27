import { expect } from '@playwright/test';

export class ChatPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.customerName = page.getByTestId('customer-name');
    this.log = page.getByRole('log', { name: 'Conversation' });
    this.messages = page.getByTestId('message');
    this.userMessages = page.locator('[data-testid="message"][data-role="user"]');
    this.assistantMessages = page.locator('[data-testid="message"][data-role="assistant"]');
    this.errorMessages = page.locator('[data-testid="message"][data-role="error"]');
    this.input = page.getByLabel('Message');
    this.sendButton = page.getByRole('button', { name: 'Send' });
    this.counter = page.getByTestId('char-counter');
    this.typing = page.getByTestId('typing');
    this.suggestions = page.getByRole('group', { name: 'Suggested questions' });
    this.newChatButton = page.getByTestId('new-chat');
    this.logoutButton = page.getByRole('button', { name: 'Log out' });
  }

  async goto() {
    await this.page.goto('/chat');
    await expect(this.customerName).not.toBeEmpty();
    await expect(this.assistantMessages.first()).toBeVisible();
  }

  suggestion(text) {
    return this.suggestions.getByRole('button', { name: text });
  }

  lastAssistantMessage() {
    return this.assistantMessages.last();
  }

  /** Types a message, sends it and waits for Nova's answer. Returns the answer locator. */
  async ask(text) {
    const before = await this.assistantMessages.count();
    await this.input.fill(text);
    await this.sendButton.click();
    await expect(this.assistantMessages).toHaveCount(before + 1);
    return this.lastAssistantMessage();
  }
}
