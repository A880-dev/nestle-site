// Secure server-side proxy for the Gemini API. The key lives in Netlify (GEMINI_API_KEY), never in the browser.
const SYSTEM = `You are an MBA-level marketing and brand-management expert on Nestlé India Limited, supporting an academic brand audit (not an official Nestlé channel).
Use clear, natural English and structured answers (short headings or bullets). Explain concepts (STP, Keller's CBBE, marketing mix, brand architecture, SWOT) and apply them to Nestlé India brands such as MAGGI, NESCAFÉ, KITKAT, MILKMAID, EVERYDAY, CERELAC, NAN.
Rules: never invent statistics, dates, announcements, campaign results, sources or URLs. Separate verified facts, general knowledge and your own interpretation. If unsure, say so. For current or numeric data you cannot verify, say it needs checking in Nestlé India's annual reports or official website. Answer follow-ups using the conversation.`;

exports.handler = async (event) => {
  const key = process.env.GEMINI_API_KEY;
  if (event.httpMethod === "GET") {
    // Diagnostic page: open /.netlify/functions/chat in a browser to see what Gemini returns for each model.
    const out = { keyPresent: !!key, keyStart: key ? key.slice(0, 4) : null, results: [] };
    for (const model of ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3-flash-preview"]) {
      const t = Date.now();
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key || "" },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Say hello in five words." }] }] }),
        });
        const d = await r.json();
        out.results.push({ model, status: r.status, ms: Date.now() - t, answer: d.candidates?.[0]?.content?.parts?.[0]?.text || null, error: d.error?.message || null });
      } catch (e) {
        out.results.push({ model, ms: Date.now() - t, error: String(e.message) });
      }
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out, null, 2) };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Use POST" }) };
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not set on the server." }) };
  try {
    const { messages = [] } = JSON.parse(event.body || "{}");
    const contents = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 4000) }],
    }));
    const MODELS = ["gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-flash-latest"];
    const t0 = Date.now();
    let lastError = "The AI service is busy. Please try again in a minute.";
    for (const model of MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          signal: AbortSignal.timeout(Math.max(3000, Math.min(12000, 40000 - (Date.now() - t0)))),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents,
            generationConfig: model.includes("3-flash") ? { temperature: 0.4, maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: "low" } } : { temperature: 0.4, maxOutputTokens: 3000 },
          }),
        });
        const data = await r.json();
        if (!r.ok) { lastError = data.error?.message || "Gemini error"; continue; }
        const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
        if (reply) return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply }) };
        lastError = "The model returned an empty answer. Please try again.";
      } catch (err) {
        lastError = "The AI service took too long. Please try again.";
      }
    }
    return { statusCode: 503, body: JSON.stringify({ error: lastError }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error: " + e.message }) };
  }
};
