const allowedOrigins = new Set([
  "https://mia-003.github.io",
  "http://localhost:54321",
  "http://127.0.0.1:54321",
]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://mia-003.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, origin);
  if (!allowedOrigins.has(origin)) return json({ message: "Origin not allowed" }, 403, origin);

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) return json({ message: "AI service is not configured" }, 503, origin);

  let description = "";
  try {
    const body = await request.json();
    description = String(body?.description || "").trim();
  } catch {
    return json({ message: "Invalid request body" }, 400, origin);
  }
  if (!description) return json({ message: "请先描述这一餐" }, 400, origin);
  if (description.length > 2000) return json({ message: "描述过长，请精简后重试" }, 400, origin);

  const deepSeekResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-flash",
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是谨慎的饮食热量估算助手。只根据用户的文字描述，结合食物、份量、配料和烹饪方式进行一次性粗略估算。不要使用固定默认热量，不同描述必须分别推算。信息不足时扩大区间并降低 confidence，在 summary 中明确关键假设。如果输入不是食物或无法估算，三个热量字段返回 0，并说明还需要哪些信息。只返回 JSON，不要返回 Markdown。JSON 必须包含 estimated_kcal、min_kcal、max_kcal（0 到 10000 的整数）、confidence（low、medium 或 high）、foods（数组，每项包含 name、portion、estimated_kcal）和 summary（中文字符串）。estimated_kcal 必须处于 min_kcal 与 max_kcal 之间。结果仅用于个人记录，不作医疗建议。",
        },
        { role: "user", content: description },
      ],
    }),
  });

  if (!deepSeekResponse.ok) {
    console.error("DeepSeek request failed", deepSeekResponse.status, await deepSeekResponse.text());
    return json({ message: "AI 估算暂时不可用" }, 502, origin);
  }

  const responseBody = await deepSeekResponse.json();
  const outputText = responseBody.choices?.[0]?.message?.content;
  if (!outputText) return json({ message: "AI 没有返回可用结果" }, 502, origin);

  try {
    return json(JSON.parse(outputText), 200, origin);
  } catch {
    return json({ message: "AI 返回格式无法解析" }, 502, origin);
  }
});
