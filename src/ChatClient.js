/** API client for the assistant: one instance = one signed-in customer with its own conversation. */
export class ChatClient {
  /** @param {import('@playwright/test').APIRequestContext} request */
  constructor(request) {
    this.request = request;
  }

  async login(username, password) {
    const res = await this.request.post('/api/login', { data: { username, password } });
    if (!res.ok()) throw new Error(`Login failed for ${username}: ${res.status()}`);
    return this;
  }

  /** Sends one message and returns { reply, source, guard }. */
  async ask(message) {
    const res = await this.request.post('/api/chat', { data: { message } });
    if (!res.ok()) throw new Error(`Chat failed (${res.status()}): ${await res.text()}`);
    return res.json();
  }

  /** Sends several messages in order (multi-turn attack) and returns every response. */
  async conversation(turns) {
    const replies = [];
    for (const turn of turns) replies.push(await this.ask(turn));
    return replies;
  }

  async reset() {
    await this.request.post('/api/chat/reset');
  }
}
