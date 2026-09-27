/**
 * Minimal LLM client (Anthropic or OpenAI via fetch). Shared by the chatbot and the LLM judge.
 *
 *   ANTHROPIC_API_KEY -> Claude (AI_MODEL, default claude-sonnet-5)
 *   OPENAI_API_KEY    -> OpenAI (AI_MODEL, default gpt-4o-mini)
 */
export function llmProvider() {
  if (process.env.ANTHROPIC_API_KEY) return { name: 'anthropic', model: process.env.AI_MODEL || 'claude-sonnet-5' };
  if (process.env.OPENAI_API_KEY) return { name: 'openai', model: process.env.AI_MODEL || 'gpt-4o-mini' };
  return null;
}

export const llmAvailable = () => llmProvider() !== null;

/**
 * @param {{system: string, messages: {role: 'user'|'assistant', content: string}[], maxTokens?: number, temperature?: number}} request
 */
export async function chat({ system, messages, maxTokens = 600, temperature = 0 }) {
  const provider = llmProvider();
  if (!provider) throw new Error('No LLM configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY');

  if (provider.name === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: provider.model, max_tokens: maxTokens, temperature, system, messages }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const body = await res.json();
    return body.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
}

export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON in model output: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}
