import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { prompt, max_tokens } = await request.json();
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "Groq API key not configured on server" }, { status: 500 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${apiKey}` 
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: max_tokens || 300,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Groq API error" }, { status: response.status });
    }

    const text = data.choices?.[0]?.message?.content || "No response";
    return NextResponse.json({ text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
