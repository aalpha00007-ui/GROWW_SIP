// The PII guard runs before anything reaches Mistral (PRD §3.3, step 1b; build spec §9).

export const PII_MESSAGE = "Please don't share personal details. Tell us the reason in your own words.";

// Checked in this order, so a phone number is named a phone, not an account number.
const PATTERNS: { kind: string; regex: RegExp }[] = [
  { kind: 'email', regex: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { kind: 'OTP', regex: /\bOTP\b\D{0,12}\d{4,6}\b/gi },
  { kind: 'PAN', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/gi },
  { kind: 'Aadhaar', regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g },
  { kind: 'phone', regex: /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g },
  { kind: 'account number', regex: /\b\d{9,18}\b/g },
];

export interface PiiResult {
  /** Kinds found, empty when the text is clean. */
  found: string[];
  /** The text with each match replaced by its kind, safe to log. */
  redacted: string;
}

export function findPii(text: string): PiiResult {
  const found: string[] = [];
  let redacted = text;
  for (const { kind, regex } of PATTERNS) {
    redacted = redacted.replace(regex, () => {
      if (!found.includes(kind)) found.push(kind);
      return `[${kind}]`;
    });
  }
  return { found, redacted };
}
