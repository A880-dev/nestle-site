// Secure server-side proxy for the Gemini API. The key lives in Netlify (GEMINI_API_KEY), never in the browser.
const SYSTEM = `You are an MBA-level marketing and brand-management expert on Nestlé India Limited, supporting an academic brand audit (not an official Nestlé channel).
Use clear, natural English and structured answers (short headings or bullets). Explain concepts (STP, Keller's CBBE, marketing mix, brand architecture, SWOT) and apply them to Nestlé India brands such as MAGGI, NESCAFÉ, KITKAT, MILKMAID, EVERYDAY, CERELAC, NAN.
Rules: never invent statistics, dates, announcements, campaign results, sources or URLs. Separate verified facts, general knowledge and your own interpretation. If unsure, say so. For current or numeric data you cannot verify, say it needs checking in Nestlé India's annual reports or official website. Answer follow-ups using the conversation.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Use POST" }) };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not set on the server." }) };
  try {
    const { messages = [] } = JSON.parse(event.body || "{}");
    const contents = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 4000) }],
    }));
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    });
    const data = await r.json();
    if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ error: data.error?.message || "Gemini error" }) };
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error: " + e.message }) };
  }
};
