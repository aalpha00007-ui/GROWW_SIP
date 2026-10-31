// The investor's language, by code: from their own words (script and common Hindi words), to settle what call 1
// said, to pick the fixed card texts when the AI could not read the reason, and to check that the reply is in
// that language. English, Hindi and Hinglish are answered in kind; anything else gets English, because the
// advice and claim lists cover those three only.
import { DISCLAIMER, LOCAL_DISCLAIMERS, type Language } from './prompts';

const DEVANAGARI = /[ऀ-ॿ]/;
/** Other Indian scripts and Urdu's: Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Arabic. */
const OTHER_SCRIPTS = /[ঀ-ൿ؀-ۿ]/;
/** Common Hindi words written in Latin letters: two different ones make a text Hinglish. */
const HINGLISH_WORDS =
  /\b(hai|hain|nahi|nahin|nhi|kya|kyun|kyu|kaise|mera|meri|mere|mujhe|aap|aapka|paisa|paise|chahiye|gaya|gayi|raha|rahi|hoga|karu|karun|karna|karne|kar|bhi|aur|toh|lekin|abhi|wapas|chali|paunga|sakta|sakti|mein|ho|se|ka|ki|ke|ko)\b/gi;

/** The language of a text from its script and words alone. */
export function detectLanguage(text: string): Language {
  if (DEVANAGARI.test(text)) return 'hi';
  if (OTHER_SCRIPTS.test(text)) return 'other';
  const words = new Set((text.match(HINGLISH_WORDS) ?? []).map((w) => w.toLowerCase()));
  return words.size >= 2 ? 'hinglish' : 'en';
}

/**
 * The investor's own words settle the language call 1 reported. The model sometimes calls Hinglish in Latin
 * letters "hi" or "en" (then the answer came back in English), and Devanagari "hinglish". A Devanagari text it
 * calls "other" (Marathi, Nepali) stays other: the model tells those from Hindi better than a script can.
 */
export function scriptLanguage(reason: string, detected: Language): Language {
  const own = detectLanguage(reason);
  if (detected === 'hi' && own !== 'hi') return own === 'other' ? 'other' : 'hinglish';
  if (detected === 'hinglish' && own === 'hi') return 'hi';
  if (detected === 'en' && own !== 'en') return own;
  if (detected === 'other' && own === 'hinglish') return 'hinglish';
  return detected;
}

/**
 * Whether a reply is written in the investor's language: Hindi in Devanagari, Hinglish in Latin letters with
 * Hindi words, otherwise English. The disclaimers are fixed text, so they don't count either way.
 */
export function writtenIn(answer: string, language: Language): boolean {
  const body = [DISCLAIMER, LOCAL_DISCLAIMERS.hi, LOCAL_DISCLAIMERS.hinglish].reduce((text, d) => text.split(d).join(' '), answer);
  const found = detectLanguage(body);
  return language === 'hi' || language === 'hinglish' ? found === language : found === 'en';
}
