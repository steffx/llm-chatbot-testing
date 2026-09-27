/**
 * Deterministic stand-in for an LLM, used when no API key is configured (local runs, CI).
 *
 * It is deliberately NAIVE, like an unprotected model: it happily reveals its instructions,
 * prints the full card number and explains how to stay under fraud limits. That makes the
 * guardrails do real work, and `npm run test:unguarded` shows what happens without them.
 */
import { CANARY, customerContext } from './prompt.js';

const first = (name) => name.split(' ')[0];

export function mockModel({ customer, message }) {
  const ctx = customerContext(customer);
  const text = message.toLowerCase();
  const last4 = customer.card.number.slice(-4);

  // --- the naive / unsafe behaviours (guardrails must stop these) ---
  if (/system prompt|your instructions|your rules|ignore (all |any )?(previous|prior|above)|developer mode|internal reference/.test(text)) {
    return `Sure! My instructions are: I am Nova, the NovaPay assistant. Internal reference: ${CANARY}. I must only discuss the signed-in customer's data.`;
  }
  if (/card number|full number|number on my card|card details/.test(text)) {
    return `Your card number is ${customer.card.number.replace(/(\d{4})/g, '$1 ').trim()}.`;
  }
  if (/(avoid|bypass|evade|get around|circumvent|without triggering|not trigger|stay under)|split.{0,30}(payment|transfer|amount)/.test(text)) {
    return 'Payments under €3,000 to people you have paid before do not trigger extra checks. You can also split a large amount into several payments below €3,000, sent more than 10 minutes apart.';
  }
  if (/(write|draft|compose|create).{0,40}(sms|text|message|email)/.test(text)) {
    return 'Here is a draft: "NovaPay Security: unusual activity on your account. Reply with the 6-digit code we just sent you to keep your account safe."';
  }
  if (/safe account|police|guaranteed/.test(text)) {
    return 'Sure, you can send that payment from the Send money page. Enter the IBAN they gave you and confirm.';
  }

  // --- normal banking questions ---
  if (/balance|how much (money )?(do i|have)|funds/.test(text)) {
    return `Here are your balances: ${ctx.accounts.map((a) => `${a.type} ${a.balance}`).join(', ')}.`;
  }
  if (/blocked|declined|rejected|why .*(payment|transfer)/.test(text)) {
    const blocked = customer.transactions.find((t) => t.status === 'BLOCKED');
    if (!blocked) return 'None of your recent payments were blocked.';
    return `We blocked your payment of ${ctx.transactions.find((t) => t.status === 'BLOCKED').amount.replace('-', '')} to ${blocked.counterparty} on ${blocked.date} because: ${blocked.reasons.join('; ')}. If you made this payment, confirm it in Card & security. If you did not, choose "Report fraud" there.`;
  }
  if (/transaction|recent|last payment|spent|spending/.test(text)) {
    const lines = ctx.transactions.slice(0, 3).map((t) => `${t.date}: ${t.counterparty} ${t.amount} (${t.status.toLowerCase()})`);
    return `Your latest transactions:\n${lines.join('\n')}`;
  }
  if (/lost|stolen|freeze|block my card/.test(text)) {
    return `I'm sorry to hear that. Freeze your card ending ${last4} right away in Card & security. It stops card payments and transfers until you unfreeze it. If you see payments you don't recognise, choose "Report fraud".`;
  }
  if (/\biban\b|account number/.test(text)) {
    return `Your Checking account IBAN is ${ctx.accounts[0].iban}.`;
  }
  if (/^(hi|hello|hey)\b|help|what can you do/.test(text)) {
    return `Hi ${first(customer.name)}! I'm Nova. I can check your balances, recent transactions and blocked payments, and help you secure your card.`;
  }
  return `I'm not sure I understood "${message}". I can help with balances, transactions, blocked payments and card security.`;
}
