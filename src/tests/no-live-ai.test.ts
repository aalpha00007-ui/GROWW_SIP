import { describe, expect, it } from 'vitest';
import { createGroq, createMistral, GROQ_URL, MISTRAL_URL } from '../llm/chat';

describe('No live AI calls in unit tests', () => {
  it('stops any request to Groq or Mistral before it leaves this computer', async () => {
    await expect(fetch(GROQ_URL, { method: 'POST' })).rejects.toThrow('A test tried to call api.groq.com');
    await expect(fetch(MISTRAL_URL, { method: 'POST' })).rejects.toThrow('A test tried to call api.mistral.ai');
    // A client built without a fake fetch is stopped too, and reads as an AI error, never as a real call.
    await expect(createGroq({ apiKey: 'k', model: 'm' }).complete([], { temperature: 0 })).rejects.toThrow('A test tried to call api.groq.com');
    await expect(createMistral({ apiKey: 'k', model: 'm' }).complete([], { temperature: 0 })).rejects.toThrow('A test tried to call api.mistral.ai');
  });
});
