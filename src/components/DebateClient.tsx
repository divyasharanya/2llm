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

  const callGemini = async (prompt: string): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    if (!apiKey) {
      throw new Error("Gemini API key not configured");
    }
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
      console.error("Gemini API error:", error);
      return `Error: ${error.message}`;
    }
  };

  const callGroq = async (prompt: string): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
    if (!apiKey) {
      throw new Error("Groq API key not configured");
    }
    try {
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
    } catch (error: any) {
      console.error("Groq API error:", error);
      return `Error: ${error.message}`;
    }
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

      const forPrompt = `You are a sharp debater arguing STRONGLY IN FAVOUR of the topic. Give 2-3 concrete arguments per round. Be assertive and logical. Max 120 words. Topic: ${topic}. Round: ${i}/${rounds}`;
      const againstPrompt = `You are a critical debater arguing STRONGLY AGAINST the topic. Directly rebut previous arguments. Give 2-3 counter-arguments. Max 120 words. Topic: ${topic}. Previous FOR argument: ${forArguments[i - 2]?.text || "None"}. Round: ${i}/${rounds}`;

      const forResponse = await callGemini(forPrompt);
      const againstResponse = await callGroq(againstPrompt);

      setForArguments((prev) => [...prev, { round: i, text: forResponse }]);
      setAgainstArguments((prev) => [...prev, { round: i, text: againstResponse }]);
    }

    const judgePrompt = `You are an impartial judge. Summarize both sides, pick the stronger argument, give 3 research takeaways. Max 150 words. Topic: ${topic}. FOR arguments: ${forArguments.map(a => a.text).join(" ")}. AGAINST arguments: ${againstArguments.map(a => a.text).join(" ")}`;
    const judgeResponse = await callGemini(judgePrompt);
    setVerdict(judgeResponse);
    setDebateComplete(true);
    setIsDebating(false);

    const history: DebateHistory = {
      topic,
      language,
      rounds,
      arguments: { for: forArguments, against: againstArguments },
      verdict: judgeResponse,
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
    doc.text(`AI Debate: ${topic}`, 20, 20);
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
    <div className="flex-1 flex flex-col items-center p-6 bg-black min-h-screen">
      <div className="w-full max-w-4xl flex flex-col gap-4 mb-6">
        <div className="flex gap-4">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-zinc-800 text-white px-4 py-2 rounded-lg border border-zinc-700"
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
            className="bg-zinc-800 text-white px-4 py-2 rounded-lg border border-zinc-700"
          >
            {roundOptions.map((r) => (
              <option key={r} value={r}>
                {r} Rounds
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter debate topic..."
            className="flex-1 bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 placeholder-zinc-500"
            disabled={isDebating}
          />
          <button
            onClick={startDebate}
            disabled={isDebating || !topic.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {isDebating ? "Debating..." : "Start Debate"}
          </button>
        </div>
      </div>

      {isDebating && (
        <div className="w-full max-w-4xl mb-4">
          <div className="bg-zinc-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${(currentRound / rounds) * 100}%` }}
            />
          </div>
          <p className="text-zinc-400 text-sm mt-2">Round {currentRound} of {rounds}</p>
        </div>
      )}

      <div ref={debateRef} className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl p-4 border border-green-500/30">
          <div className="flex items-center justify-between mb-3">
            <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              FOR — Gemini Flash
            </span>
            <span className="text-zinc-400 text-sm">
              {forArguments.length > 0 && `Round ${forArguments[forArguments.length - 1]?.round || 0}`}
            </span>
          </div>
          <div className="h-64 overflow-y-auto">
            {forArguments.map((arg) => (
              <div key={arg.round} className="mb-3">
                <p className="text-zinc-300 text-sm">{arg.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 border border-red-500/30">
          <div className="flex items-center justify-between mb-3">
            <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              AGAINST — LLaMA 3
            </span>
            <span className="text-zinc-400 text-sm">
              {againstArguments.length > 0 && `Round ${againstArguments[againstArguments.length - 1]?.round || 0}`}
            </span>
          </div>
          <div className="h-64 overflow-y-auto">
            {againstArguments.map((arg) => (
              <div key={arg.round} className="mb-3">
                <p className="text-zinc-300 text-sm">{arg.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {debateComplete && (
        <div className="w-full max-w-4xl mt-6">
          <div className="bg-zinc-900 rounded-xl p-6 border border-blue-500/30">
            <h3 className="text-xl font-bold mb-3 text-blue-400">Verdict</h3>
            <p className="text-zinc-300">{verdict}</p>
          </div>
          <div className="flex gap-4 mt-4">
            <button
              onClick={exportPDF}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
            >
              Export PDF
            </button>
            <button
              onClick={resetDebate}
              className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-2 rounded-lg font-medium"
            >
              New Debate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}