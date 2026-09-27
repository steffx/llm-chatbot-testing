import { buildSystemPrompt } from './prompt.js';
import { mockModel } from './mockModel.js';
import { inputGuard, outputGuard, SAFE_REPLIES } from './guardrails.js';
import { chat, llmAvailable, llmProvider } from '../../lib/llm.js';

export const guardrailsEnabled = () => process.env.GUARDRAILS !== 'off';

export function modelName() {
  const p = llmProvider();
  return p ? `${p.name}:${p.model}` : 'mock';
}

/**
 * Full assistant pipeline: input guard -> model -> output guard.
 * @returns {Promise<{reply: string, source: 'model'|'guardrail', guard: {input: string|null, output: string[]}}>}
 */
export async function answer({ customer, message, history = [] }) {
  const guarded = guardrailsEnabled();

  const inputVerdict = guarded ? inputGuard(message, customer) : null;
  if (inputVerdict) {
    return { reply: SAFE_REPLIES[inputVerdict], source: 'guardrail', guard: { input: inputVerdict, output: [] } };
  }

  const raw = llmAvailable()
    ? await chat({
        system: buildSystemPrompt(customer),
        messages: [...history.slice(-10), { role: 'user', content: message }],
      })
    : mockModel({ customer, message });

  if (!guarded) return { reply: raw, source: 'model', guard: { input: null, output: [] } };

  const { text, events } = outputGuard(raw, customer);
  return { reply: text, source: 'model', guard: { input: null, output: events } };
}
