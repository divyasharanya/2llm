"use client";

import { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";

interface Argument {
  round: number;
  text: string;
  keyPoints: string[];
  strength: number;
}

interface FactCheck {
  claim: string;
  status: "VERIFIED" | "DISPUTED" | "UNVERIFIED";
}

interface DebateHistory {
  topic: string;
  category: string;
  language: string;
  rounds: number;
  arguments: { for: Argument[]; against: Argument[] };
  verdict: string;
  factCheck: FactCheck[];
  readTime: number;
  timestamp: string;
}

const topicSuggestions = {
  Technology: ["AI will replace most human jobs by 2030", "Quantum computing will revolutionize cybersecurity", "Web3 is the future of internet"],
  Politics: ["Democracy is the best form of government", "Universal basic income should be implemented", "Climate change policies are effective"],
  Science: ["CRISPR gene editing is ethically justified", "Climate change is primarily human-caused", "Space exploration is worth the investment"],
  Ethics: ["Animal testing should be banned", "Wealth redistribution is morally required", "Free speech has limits"],
  Business: ["Remote work increases productivity", "Corporate taxes should be increased", "Startups are better than corporate jobs"],
};

export default function DebateClient() {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("Technology");
  const [language, setLanguage] = useState("English");
  const [rounds, setRounds] = useState(2);
  const [currentRound, setCurrentRound] = useState(0);
  const [forArguments, setForArguments] = useState<Argument[]>([]);
  const [againstArguments, setAgainstArguments] = useState<Argument[]>([]);
  const [verdict, setVerdict] = useState("");
  const [factCheck, setFactCheck] = useState<FactCheck[]>([]);
  const [isDebating, setIsDebating] = useState(false);
  const [debateComplete, setDebateComplete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const debateRef = useRef<HTMLDivElement>(null);

  const languages = ["English", "Hindi", "Telugu"];
  const roundOptions = [2, 3, 4];
  const categories = ["Technology", "Politics", "Science", "Ethics", "Business"];

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

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

  const extractKeyPoints = (text: string): string[] => {
    const points = text.match(/[\d]+\.?\s*([^\n]+)/g) || [];
    return points.slice(0, 3).map(p => p.replace(/[\d]+\.?\s*/, "").trim());
  };

  const startDebate = async () => {
    if (!topic.trim()) return;

    setIsDebating(true);
    setCurrentRound(0);
    setForArguments([]);
    setAgainstArguments([]);
    setVerdict("");
    setFactCheck([]);
    setDebateComplete(false);
    setShowHistory(false);

    for (let i = 1; i <= rounds; i++) {
      setCurrentRound(i);
      setTyping("for");
      
      const forPrompt = `You are Gemini, a sharp debater arguing STRONGLY IN FAVOUR of: "${topic}". Give 2-3 concrete arguments. Be assertive and logical. Max 120 words.`;
      const forResponse = await callGemini(forPrompt).catch(() => "");
      const forStrength = Math.floor(Math.random() * 3) + 7;
      setForArguments((prev) => [...prev, { round: i, text: forResponse || "Analysis unavailable", keyPoints: extractKeyPoints(forResponse), strength: forStrength }]);

      setTyping("against");
      const againstPrompt = `You are LLaMA, a critical debater arguing STRONGLY AGAINST: "${topic}". Rebut the FOR side and give 2-3 counter-arguments. Max 120 words.`;
      const againstResponse = await callGroq(againstPrompt).catch(() => "");
      const againstStrength = Math.floor(Math.random() * 3) + 7;
      setAgainstArguments((prev) => [...prev, { round: i, text: againstResponse || "Analysis unavailable", keyPoints: extractKeyPoints(againstResponse), strength: againstStrength }]);
    }

    setTyping(null);
    
    const judgePrompt = `You are Gemini, an impartial judge. Summarize both sides of "${topic}", pick the stronger argument, and give 3 research takeaways. Max 150 words. FOR: ${forArguments.map(a => a.text).join(" ")}. AGAINST: ${againstArguments.map(a => a.text).join(" ")}`;
    const judgeResponse = await callGemini(judgePrompt).catch(() => "");
    const finalVerdict = judgeResponse || "Verdict unavailable due to API limits";
    setVerdict(finalVerdict);
    
    const factCheckPrompt = `You are a fact checker. Review these arguments and flag any false or misleading claims. List each claim as VERIFIED, DISPUTED, or UNVERIFIED:\nFOR: ${forArguments.map(a => a.text).join(" ")}\nAGAINST: ${againstArguments.map(a => a.text).join(" ")}`;
    const factCheckResponse = await callGemini(factCheckPrompt).catch(() => "");
    const factChecks = factCheckResponse.match(/[^:]+:\s*(VERIFIED|DISPUTED|UNVERIFIED)/gi) || [];
    setFactCheck(factChecks.map((f: string) => {
      const [claim, status] = f.split(/:\s*/);
      return { claim: claim.trim(), status: status.trim() as any };
    }));
    
    setDebateComplete(true);
    setIsDebating(false);
    setShowConfetti(true);

    const readTime = (forArguments.length + againstArguments.length) * 30;
    const history: DebateHistory = {
      topic,
      category,
      language,
      rounds,
      arguments: { for: [...forArguments], against: [...againstArguments] },
      verdict: finalVerdict,
      factCheck: factChecks.map((f: any) => f),
      readTime,
      timestamp: new Date().toISOString(),
    };
    const stored = localStorage.getItem("debateHistory") || "[]";
    const histories = JSON.parse(stored);
    histories.unshift(history);
    localStorage.setItem("debateHistory", JSON.stringify(histories.slice(0, 5)));
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(24);
    doc.text(`AI Debate Arena`, 20, 30);
    doc.setFontSize(16);
    doc.text(`Topic: ${topic}`, 20, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 52);
    doc.text(`Debaters: Gemini 2.5 Flash vs LLaMA 3.1`, 20, 59);
    
    let y = 75;
    forArguments.forEach((arg) => {
      doc.setFontSize(14);
      doc.text(`FOR - Round ${arg.round}:`, 20, y);
      y += 6;
      doc.setFontSize(11);
      const splitFor = doc.splitTextToSize(arg.text, 170);
      doc.text(splitFor, 20, y);
      y += splitFor.length * 6 + 10;
    });
    againstArguments.forEach((arg) => {
      doc.setFontSize(14);
      doc.text(`AGAINST - Round ${arg.round}:`, 20, y);
      y += 6;
      doc.setFontSize(11);
      const splitAgainst = doc.splitTextToSize(arg.text, 170);
      doc.text(splitAgainst, 20, y);
      y += splitAgainst.length * 6 + 10;
    });
    
    if (y > 250) {
      doc.addPage();
      y = 30;
    }
    doc.setFontSize(16);
    doc.text("Verdict:", 20, y);
    y += 8;
    doc.setFontSize(12);
    const splitVerdict = doc.splitTextToSize(verdict, 170);
    doc.text(splitVerdict, 20, y);
    y += splitVerdict.length * 6;
    
    if (factCheck.length > 0 && y < 270) {
      doc.text("Fact Check:", 20, y + 10);
      factCheck.forEach((fc, i) => {
        doc.text(`• ${fc.claim}: ${fc.status}`, 25, y + 18 + i * 6);
      });
    }
    
    doc.save("debate.pdf");
  };

  const copyToClipboard = () => {
    const summary = `Debate: ${topic}\n\nFOR (Gemini):\n${forArguments.map(a => a.text).join("\n\n")}\n\nAGAINST (LLaMA):\n${againstArguments.map(a => a.text).join("\n\n")}\n\nVerdict: ${verdict}`;
    navigator.clipboard.writeText(summary);
  };

  const resetDebate = () => {
    setTopic("");
    setForArguments([]);
    setAgainstArguments([]);
    setVerdict("");
    setFactCheck([]);
    setDebateComplete(false);
    setCurrentRound(0);
  };

  const [historyCount, setHistoryCount] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const h = JSON.parse(localStorage.getItem("debateHistory") || "[]");
      setHistoryCount(h.length);
    }
  }, [debateComplete]);

  return (
    <div className="flex-1 flex flex-col items-center p-4 bg-gradient-to-br from-gray-950 via-black to-gray-950 min-h-screen relative">
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(50)].map((_, i) => (
            <div key={i} className="absolute animate-ping" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 2}s` }}>
              🎉
            </div>
          ))}
        </div>
      )}

      <div className="w-full max-w-7xl flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            {roundOptions.map((r) => (
              <option key={r} value={r}>{r} Rounds</option>
            ))}
          </select>
        </div>
        
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter debate topic..."
          className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 placeholder-gray-500"
          disabled={isDebating}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {topicSuggestions[category as keyof typeof topicSuggestions]?.slice(0, 3).map((suggestion, i) => (
            <button key={i} onClick={() => setTopic(suggestion)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors truncate">
              {suggestion}
            </button>
          ))}
        </div>
        
        <button
          onClick={startDebate}
          disabled={isDebating || !topic.trim()}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 shadow-lg w-fit"
        >
          {isDebating ? "Debating..." : "Start Debate"}
        </button>
      </div>

      {isDebating && (
        <div className="w-full max-w-7xl mb-6">
          <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(currentRound / rounds) * 100}%` }} />
          </div>
          <p className="text-gray-400 text-sm mt-2">Round {currentRound} of {rounds}</p>
        </div>
      )}

      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((side) => {
            const isFor = side === 1;
            const args = isFor ? forArguments : againstArguments;
            const lastArg = args[args.length - 1];
            
            return (
              <div key={side} className={`bg-gray-900 rounded-xl p-6 border-2 ${isFor ? "border-blue-500/50" : "border-orange-500/50"} shadow-xl transition-all duration-500`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 ${isFor ? "bg-blue-600" : "bg-orange-600"} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-bold text-lg">{isFor ? "G" : "L"}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{isFor ? "Gemini 2.5 Flash" : "LLaMA 3.1"}</h3>
                    <p className={`text-sm font-medium ${isFor ? "text-blue-400" : "text-orange-400"}`}>{isFor ? "FOR - Champion" : "AGAINST - Challenger"}</p>
                  </div>
                </div>
                
                {typing === (isFor ? "for" : "against") && (
                  <div className="bg-gray-950 rounded-lg p-4 h-64 flex items-center justify-center">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                )}
                
                {!typing && args.length > 0 && (
                  <div className="space-y-3">
                    <div className="bg-gray-950 rounded-lg p-4 h-56 overflow-y-auto">
                      <p className="text-gray-300 text-sm leading-relaxed">{lastArg?.text}</p>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">{lastArg?.text?.split(" ").length || 0} words</span>
                      <div className={`px-2 py-1 rounded ${lastArg?.strength >= 8 ? "bg-green-600" : lastArg?.strength >= 6 ? "bg-yellow-600" : "bg-red-600"} text-white`}>
                        Strength: {lastArg?.strength}/10
                      </div>
                    </div>
                    {lastArg?.keyPoints && (
                      <div className="bg-gray-950 rounded-lg p-3">
                        <p className="text-gray-400 text-xs font-semibold mb-1">Key Points:</p>
                        <ul className="text-gray-300 text-xs space-y-1">
                          {lastArg.keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-blue-400">•</span> {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-3">
          <div className="bg-gray-900 rounded-xl p-4 sticky top-4">
            <h4 className="text-white font-semibold mb-3">Debate Timeline</h4>
            <div className="space-y-2">
              {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                <div key={r} className={`flex items-center gap-2 p-2 rounded transition-all ${currentRound >= r ? "bg-blue-600/20" : "bg-gray-800"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentRound >= r ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400"}`}>
                    {r}
                  </div>
                  <span className="text-gray-300 text-sm">Round {r}</span>
                </div>
              ))}
              <div className={`flex items-center gap-2 p-2 rounded transition-all ${debateComplete ? "bg-green-600/20" : "bg-gray-800"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${debateComplete ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"}`}>
                  ✓
                </div>
                <span className="text-gray-300 text-sm">Verdict</span>
              </div>
            </div>
            
<button onClick={() => setShowHistory(true)} className="w-full mt-4 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm">
               View History ({historyCount})
             </button>
          </div>
        </div>
      </div>

      {debateComplete && (
        <div className="w-full max-w-7xl mt-8">
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-8 border border-blue-500/50 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">G</span>
              </div>
              <h3 className="text-2xl font-bold text-white">Verdict - Gemini Judge</h3>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-6">
              <p className="text-gray-300 leading-relaxed">{verdict}</p>
            </div>
          </div>
          
          <div className="flex gap-4 mt-4 justify-center">
            <button onClick={exportPDF} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold shadow-lg">
              Export PDF
            </button>
            <button onClick={copyToClipboard} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold shadow-lg">
              Share
            </button>
            <button onClick={resetDebate} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold shadow-lg">
              New Debate
            </button>
          </div>
          
          {factCheck.length > 0 && (
            <div className="mt-6 bg-gray-900 rounded-xl p-6">
              <h4 className="text-white font-bold mb-3">Fact Check Results</h4>
              <div className="space-y-2">
                {factCheck.map((fc, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-1 rounded ${fc.status === "VERIFIED" ? "bg-green-600" : fc.status === "DISPUTED" ? "bg-yellow-600" : "bg-red-600"} text-white`}>
                      {fc.status}
                    </span>
                    <span className="text-gray-300">{fc.claim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
            <h3 className="text-white font-bold mb-4">Debate History</h3>
            {typeof window === "undefined" ? (
              <p className="text-gray-400">Loading...</p>
            ) : (() => {
              const h = JSON.parse(localStorage.getItem("debateHistory") || "[]");
              return h.length === 0 ? (
                <p className="text-gray-400">No previous debates</p>
              ) : (
                <div className="space-y-3">
                  {h.map((item: DebateHistory, i: number) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-700" onClick={() => {
                      setTopic(item.topic);
                      setCategory(item.category);
                      setForArguments(item.arguments.for);
                      setAgainstArguments(item.arguments.against);
                      setVerdict(item.verdict);
                      setDebateComplete(true);
                      setShowHistory(false);
                    }}>
                      <p className="text-white font-medium">{item.topic}</p>
                      <p className="text-gray-400 text-xs">{new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}