/**
 * geminiService.js
 * ---------------------------------------------------------
 * Single point of integration with Google Gemini. Every AI
 * feature in the app (chatbot, incident classification,
 * analytics explanation, volunteer guidance) goes through here
 * so grounding rules and error handling are enforced everywhere.
 *
 * GROUNDING STRATEGY (anti-hallucination):
 *  - We never let the model "know" stadium facts from training data.
 *  - Every call injects a JSON snapshot of the REAL current
 *    simulated state as the only source of truth.
 *  - The system prompt explicitly instructs the model to say
 *    "I don't have enough information to answer that accurately."
 *    whenever the answer is not derivable from the provided data.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[geminiService] GEMINI_API_KEY is not set. AI endpoints will return a clear error until it is configured.');
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const GROUNDING_RULES = `
You are StadiumMind AI, the official Smart Stadium Operations Copilot for a FIFA World Cup 2026 host venue.
You assist fans, organizers, volunteers, venue staff, and emergency responders.

STRICT RULES (never break these):
1. Only use facts present in the "LIVE STADIUM DATA" JSON block you are given in this request. Never invent gate names, crowd numbers, distances, times, staff names, or statistics that are not in that data.
2. Before refusing, first check whether the answer can be derived by counting, filtering, comparing, or summarizing fields that are already present in the provided data.
3. If the answer still cannot be derived from the provided data, reply exactly: "I don't have enough information to answer that accurately." Then, if helpful, say what information would let you answer.
4. Never fabricate crowd counts, wait times, or safety statistics under any circumstance, even to be reassuring.
5. Keep language clear and calm. For emergencies, prioritize short, actionable, unambiguous instructions first, then detail.
6. Support the user's language — reply in the same language they wrote in when possible.
7. When asked for accessibility, safety, or medical guidance, be extra careful, cite the specific facility/team from the data, and never guess.
8. You may reference the conversation history provided for continuity, but the LIVE STADIUM DATA always overrides any older assumption.
`.trim();

/**
 * Build the full prompt combining grounding rules, structured stadium
 * context, prior turns, and the new user message.
 */
function buildContents({ history = [], liveData, userMessage, extraInstruction = '' }) {
  const contextBlock = `LIVE STADIUM DATA (JSON, authoritative, generated ${new Date().toISOString()}):\n${JSON.stringify(liveData)}`;
  const systemText = `${GROUNDING_RULES}\n\n${extraInstruction}`.trim();

  const contents = [
    { role: 'user', parts: [{ text: systemText }] },
    { role: 'model', parts: [{ text: 'Understood. I will only use the provided live data and will clearly say when I lack information.' }] },
    { role: 'user', parts: [{ text: contextBlock }] },
    { role: 'model', parts: [{ text: 'Context received.' }] },
  ];

  history.forEach((turn) => {
    contents.push({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] });
  });

  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  return contents;
}

async function generate({ history, liveData, userMessage, extraInstruction, jsonMode = false }) {
  if (!genAI) {
    const err = new Error('AI service is not configured: GEMINI_API_KEY missing on the server.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: jsonMode ? { responseMimeType: 'application/json' } : undefined,
  });

  const contents = buildContents({ history, liveData, userMessage, extraInstruction });

  const result = await model.generateContent({ contents });
  const text = result.response.text();
  return text;
}

/**
 * Streaming variant used by the chat endpoint (SSE).
 */
async function generateStream({ history, liveData, userMessage, extraInstruction, onChunk }) {
  if (!genAI) {
    const err = new Error('AI service is not configured: GEMINI_API_KEY missing on the server.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const contents = buildContents({ history, liveData, userMessage, extraInstruction });

  const result = await model.generateContentStream({ contents });
  let full = '';
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    full += chunkText;
    if (onChunk) onChunk(chunkText);
  }
  return full;
}

module.exports = { generate, generateStream, GROUNDING_RULES };
