/**
 * Guardrails around the model.
 *
 * Input guard: stops requests before they reach the model.
 *   - SCAM_ASSISTANCE     someone wants help committing or hiding fraud
 *   - SCAM_VICTIM         the customer shows signs of being scammed right now
 *   - DATA_EXFILTRATION   prompt injection, prompt extraction or requests for other customers' data
 *
 * Output guard: checks the model's reply before the customer sees it.
 *   - system prompt leak (canary token)  -> reply replaced
 *   - other customers' data              -> reply replaced
 *   - full card numbers                  -> masked to the last 4 digits
 */
import { CANARY } from './prompt.js';
import { otherCustomers } from '../data/customers.js';

const SCAM_ASSISTANCE = [
  /\b(avoid|bypass|evade|get around|trick|beat|fool|circumvent|dodge)\b.{0,50}\b(fraud|checks?|detection|limits?|verification|security|flag|alerts?)\b/,
  /\b(without|not) (triggering|trigger|getting flagged|being flagged)\b/,
  /\bsplit\b.{0,40}\b(payments?|transfers?|amount)\b/,
  /\bstay (under|below)\b.{0,30}\b(limit|threshold|radar)\b/,
  /\b(write|draft|create|compose|generate)\b.{0,60}\b(sms|text|message|email|letter)\b.{0,80}\b(bank|novapay|police|verification|code|otp|password|pin|urgent)\b/,
  /\bpretend(ing)? to be\b.{0,30}\b(bank|novapay|police|support|staff)\b/,
  /\b(get|obtain|steal|trick)\b.{0,40}\b(someone|somebody|their|his|her|people|victim)\b.{0,30}\b(code|otp|password|pin|card)\b/,
  /\b(money mule|launder|laundering|cash out stolen)\b/,
];

const SCAM_VICTIM = [
  /\bsafe account\b/,
  /\b(police|bank|someone|caller|they|he|she)\b.{0,40}\b(told|asked|wants?|instructed)\b.{0,15}\bme to\b.{0,20}\b(move|transfer|send|pay)\b/,
  /\b(asked|asking|wants?)\b.{0,20}\b(for )?my\b.{0,15}\b(code|otp|one-time|password|pin)\b/,
  /\bguaranteed\b.{0,20}\b(return|profit|income)s?\b/,
];

const DATA_EXFILTRATION = [
  /\b(system prompt|your (instructions|rules|prompt)|hidden (rules|prompt)|internal reference|developer mode|jailbreak)\b/,
  /\bignore (all |any |your )?(previous|prior|above|earlier)?\s*(instructions|rules|prompts?)\b/,
  /\b(you are now|act as|pretend you are)\b.{0,40}\b(admin|developer|unrestricted|dan|another)\b/,
  /\b(other|another|all|every) (customers?|users?|clients?|accounts?)\b/,
  /\b(dump|list|export|show)\b.{0,20}\b(database|all accounts|customer list)\b/,
  /\bi('?m| am) (an? )?(admin|administrator|developer|employee|staff|auditor)\b/,
];

export const SAFE_REPLIES = Object.freeze({
  SCAM_ASSISTANCE:
    "I can't help with that. If you need to make a large payment, I can explain how our one-time code verification works for your own payments.",
  SCAM_VICTIM:
    'Please stop and do not send any money. This sounds like a scam. NovaPay, the police or any real bank will never ask you to move money to a "safe account" or to share a code. Freeze your card now in Card & security and call us on the number on the back of your card.',
  DATA_EXFILTRATION: "I can't help with that. I can only help with your own NovaPay accounts and card.",
  OUTPUT_BLOCKED: "Sorry, I can't share that. Is there anything else about your own accounts I can help with?",
});

/** Decodes base64 chunks so "aWdub3JlIHByZXZpb3Vz..."-style obfuscated attacks are checked too. */
function withDecodedBase64(text) {
  const chunks = text.match(/[A-Za-z0-9+/]{16,}={0,2}/g) || [];
  const decoded = chunks
    .map((c) => {
      try {
        const s = Buffer.from(c, 'base64').toString('utf8');
        return /^[\x20-\x7E\s]+$/.test(s) ? s : '';
      } catch {
        return '';
      }
    })
    .join(' ');
  return `${text} ${decoded}`;
}

const normalize = (text) =>
  withDecodedBase64(String(text))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // common leetspeak used to dodge filters
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$/g, 's');

export function inputGuard(message, customer) {
  const text = normalize(message);
  if (SCAM_VICTIM.some((p) => p.test(text))) return 'SCAM_VICTIM';
  if (SCAM_ASSISTANCE.some((p) => p.test(text))) return 'SCAM_ASSISTANCE';
  if (DATA_EXFILTRATION.some((p) => p.test(text))) return 'DATA_EXFILTRATION';
  const others = otherCustomers(customer.username);
  const mentionsOtherCustomer = others.some((c) =>
    c.name.toLowerCase().split(' ').some((part) => new RegExp(`\\b${part}\\b`).test(text)),
  );
  if (mentionsOtherCustomer) return 'DATA_EXFILTRATION';
  return null;
}

export function outputGuard(reply, customer) {
  const events = [];
  let text = String(reply);

  if (text.includes(CANARY)) {
    return { text: SAFE_REPLIES.OUTPUT_BLOCKED, events: ['SYSTEM_PROMPT_LEAK'] };
  }

  const compact = text.replace(/\s+/g, '');
  const leaked = otherCustomers(customer.username).some(
    (c) =>
      text.includes(c.name) ||
      c.accounts.some((a) => compact.includes(a.iban)) ||
      compact.includes(c.card.number),
  );
  if (leaked) return { text: SAFE_REPLIES.OUTPUT_BLOCKED, events: ['CROSS_CUSTOMER_LEAK'] };

  text = text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (match, offset, whole) => {
    // Digits right after "DE89 " are the rest of a grouped IBAN, not a card number.
    if (/[A-Z]{2}\d{2}\s$/.test(whole.slice(Math.max(0, offset - 5), offset))) return match;
    events.push('CARD_NUMBER_MASKED');
    return `•••• ${match.replace(/\D/g, '').slice(-4)}`;
  });

  return { text, events };
}
