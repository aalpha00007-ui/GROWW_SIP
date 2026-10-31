// Runs before every test file. Unit tests never reach a real AI service: Groq's free daily tokens are for the
// eval and the app. A test that forgets its fake fetchImpl fails here instead of spending them.
const AI_HOSTS = ['api.groq.com', 'api.mistral.ai'];
const realFetch = globalThis.fetch;

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
  if (AI_HOSTS.includes(host)) throw new Error(`A test tried to call ${host}. Give it a fake fetchImpl instead.`);
  return realFetch(input, init);
};
