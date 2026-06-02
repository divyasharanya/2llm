"use client";

import { useState, useRef } from "react";
import jsPDF from "jspdf";

interface Argument {
  round: number;
  text: string;
}

interface DebateHistory {
  topic: string;
  language: string;
  rounds: number;
  arguments: { for: Argument[]; against: Argument[] };
  verdict: string;
  timestamp: string;
}

export default function DebateClient() {
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("English");
  const [rounds, setRounds] = useState(2);
  const [currentRound, setCurrentRound] = useState(0);
  const [forArguments, setForArguments] = useState<Argument[]>([]);
  const [againstArguments, setAgainstArguments] = useState<Argument[]>([]);
  const [verdict, setVerdict] = useState("");
  const [isDebating, setIsDebating] = useState(false);
  const [debateComplete, setDebateComplete] = useState(false);
  const debateRef = useRef<HTMLDivElement>(null);

  const languages = ["English", "Hindi", "Telugu"];
  const roundOptions = [2, 3, 4];

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const callGemini = async (prompt: string, retries = 3): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    if (!apiKey) {
      throw new Error("Gemini API key not configured");
    }
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || "API error");
        }
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
      } catch (error: any) {
        if (attempt === retries - 1) {
          throw error;
        }
        await sleep(1000 * (attempt + 1));
      }
    }
    throw new Error("Max retries exceeded");
  };

  const callGroq = async (prompt: string): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
    if (!apiKey) {
      throw new Error("Groq API key not configured");
    }
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "API error");
    }
    return data.choices?.[0]?.message?.content || "No response";
  };

  const startDebate = async () => {
    if (!topic.trim()) return;

    setIsDebating(true);
    setCurrentRound(0);
    setForArguments([]);
    setAgainstArguments([]);
    setVerdict("");
    setDebateComplete(false);

    for (let i = 1; i <= rounds; i++) {
      setCurrentRound(i);

      const forPrompt = `You are Gemini, a sharp debater arguing STRONGLY IN FAVOUR of: "${topic}". Give 2-3 concrete arguments. Be assertive and logical. Max 120 words.`;
      const againstPrompt = `You are LLaMA, a critical debater arguing STRONGLY AGAINST: "${topic}". Rebut the FOR side and give 2-3 counter-arguments. Max 120 words.`;

      const forResponse = await callGemini(forPrompt).catch(() => "");
      const againstResponse = await callGroq(againstPrompt).catch(() => "");

      setForArguments((prev) => [...prev, { round: i, text: forResponse || "Analysis unavailable" }]);
      setAgainstArguments((prev) => [...prev, { round: i, text: againstResponse || "Analysis unavailable" }]);
    }

    const judgePrompt = `You are Gemini, an impartial judge. Summarize both sides of "${topic}", pick the stronger argument, and give 3 research takeaways. Max 150 words. FOR: ${forArguments.map(a => a.text).join(" ")}. AGAINST: ${againstArguments.map(a => a.text).join(" ")}`;
    const judgeResponse = await callGemini(judgePrompt).catch(() => "");
    const finalVerdict = judgeResponse || "Verdict unavailable due to API limits";
    setVerdict(finalVerdict);
    setDebateComplete(true);
    setIsDebating(false);

    const history: DebateHistory = {
      topic,
      language,
      rounds,
      arguments: { for: [...forArguments], against: [...againstArguments] },
      verdict: finalVerdict,
      timestamp: new Date().toISOString(),
    };
    const stored = localStorage.getItem("debateHistory") || "[]";
    const histories = JSON.parse(stored);
    histories.unshift(history);
    localStorage.setItem("debateHistory", JSON.stringify(histories.slice(0, 10)));
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`AI Debate Arena - ${topic}`, 20, 20);
    doc.setFontSize(12);
    let y = 30;
    forArguments.forEach((arg) => {
      doc.text(`FOR (Round ${arg.round}):`, 20, y);
      y += 5;
      const splitFor = doc.splitTextToSize(arg.text, 170);
      doc.text(splitFor, 20, y);
      y += splitFor.length * 5 + 5;
    });
    againstArguments.forEach((arg) => {
      doc.text(`AGAINST (Round ${arg.round}):`, 20, y);
      y += 5;
      const splitAgainst = doc.splitTextToSize(arg.text, 170);
      doc.text(splitAgainst, 20, y);
      y += splitAgainst.length * 5 + 5;
    });
    doc.text("Verdict:", 20, y);
    y += 5;
    const splitVerdict = doc.splitTextToSize(verdict, 170);
    doc.text(splitVerdict, 20, y);
    doc.save("debate.pdf");
  };

  const resetDebate = () => {
    setTopic("");
    setForArguments([]);
    setAgainstArguments([]);
    setVerdict("");
    setDebateComplete(false);
    setCurrentRound(0);
  };

  return (
    <div className="flex-1 flex flex-col items-center p-8 bg-gradient-to-br from-gray-950 to-black min-h-screen">
      <div className="w-full max-w-5xl flex flex-col gap-6 mb-8">
        <div className="flex gap-4">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            {roundOptions.map((r) => (
              <option key={r} value={r}>
                {r} Rounds
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter debate topic..."
            className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 placeholder-gray-500"
            disabled={isDebating}
          />
          <button
            onClick={startDebate}
            disabled={isDebating || !topic.trim()}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 shadow-lg"
          >
            {isDebating ? "Debating..." : "Start Debate"}
          </button>
        </div>
      </div>

      {isDebating && (
        <div className="w-full max-w-5xl mb-6">
          <div className="bg-gray-800 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${(currentRound / rounds) * 100}%` }}
            />
          </div>
          <p className="text-gray-400 text-sm mt-2">Round {currentRound} of {rounds}</p>
        </div>
      )}

      <div ref={debateRef} className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl p-6 border-2 border-green-500/50 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">G</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Gemini 2.5 Flash</h3>
              <p className="text-green-400 text-sm font-medium">FOR - Champion</p>
            </div>
          </div>
          <div className="bg-gray-950 rounded-lg p-4 h-80 overflow-y-auto">
            {forArguments.map((arg) => (
              <div key={arg.round} className="mb-3">
                <p className="text-gray-300 text-sm leading-relaxed">{arg.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border-2 border-orange-500/50 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">L</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">LLaMA 3.1</h3>
              <p className="text-orange-400 text-sm font-medium">AGAINST - Challenger</p>
            </div>
          </div>
          <div className="bg-gray-950 rounded-lg p-4 h-80 overflow-y-auto">
            {againstArguments.map((arg) => (
              <div key={arg.round} className="mb-3">
                <p className="text-gray-300 text-sm leading-relaxed">{arg.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {debateComplete && (
        <div className="w-full max-w-5xl mt-8">
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-6 border border-blue-500/50">
            <h3 className="text-xl font-bold mb-3 text-blue-400">Verdict - Gemini Judge</h3>
            <p className="text-gray-300 leading-relaxed">{verdict}</p>
          </div>
          <div className="flex gap-4 mt-4 justify-center">
            <button
              onClick={exportPDF}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold shadow-lg"
            >
              Export PDF
            </button>
            <button
              onClick={resetDebate}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold shadow-lg"
            >
              New Debate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}