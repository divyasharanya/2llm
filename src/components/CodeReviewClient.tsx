"use client";

import { useState, useRef } from "react";
import jsPDF from "jspdf";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ReviewRound {
  round: number;
  code: string;
  explanation: string;
}

interface ReviewHistory {
  input: string;
  language: string;
  mode: string;
  rounds: ReviewRound[];
  score: number;
  timestamp: string;
}

export default function CodeReviewClient() {
  const [language, setLanguage] = useState("python");
  const [mode, setMode] = useState<"describe" | "paste">("describe");
  const [input, setInput] = useState("");
  const [currentRound, setCurrentRound] = useState(0);
  const [builderRounds, setBuilderRounds] = useState<ReviewRound[]>([]);
  const [attackerRounds, setAttackerRounds] = useState<ReviewRound[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [score, setScore] = useState(0);
  const [cleanCode, setCleanCode] = useState("");
  const reviewRef = useRef<HTMLDivElement>(null);

  const languages = ["python", "javascript", "typescript", "java", "cpp"];

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
          max_tokens: 250,
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

  const startReview = async () => {
    if (!input.trim()) return;

    setIsReviewing(true);
    setCurrentRound(0);
    setBuilderRounds([]);
    setAttackerRounds([]);
    setReviewComplete(false);

    let originalCode = input;
    let fixedCode = "";

    // Round 1: Attacker finds issues
    setCurrentRound(1);
    const attackerPrompt1 = `You are a strict security auditor and code reviewer. Find all bugs, security holes, bad practices, and performance issues in the code. Label each issue as [CRITICAL], [WARNING], or [SUGGESTION]. Max 150 words. ${mode === "describe" ? "Task: " : "Code: "}${input}`;
    const attackerResponse1 = await callGroq(attackerPrompt1);
    setAttackerRounds([{ round: 1, code: "", explanation: attackerResponse1 }]);

    // Round 2: Builder fixes issues
    setCurrentRound(2);
    const builderPrompt = `You are a senior software engineer. Write clean, efficient, well-commented code fixing the issues found. ${mode === "describe" ? "Task: " : "Fix this code: "}${input}. Issues found: ${attackerResponse1}`;
    const builderResponse = await callGemini(builderPrompt);
    const codeMatch = builderResponse.match(/```[\w]*\n([\s\S]*?)\n```/);
    fixedCode = codeMatch ? codeMatch[1] : builderResponse;
    setCleanCode(fixedCode);
    setBuilderRounds([{ round: 2, code: fixedCode, explanation: builderResponse }]);

    // Round 2: Attacker reviews fixes
    const attackerPrompt2 = `You are a strict security auditor. Review the fixed code and find any remaining issues. Max 150 words. Code: ${fixedCode}`;
    const attackerResponse2 = await callGroq(attackerPrompt2);
    setAttackerRounds((prev) => [...prev, { round: 2, code: "", explanation: attackerResponse2 }]);

    // Judge scoring
    const judgePrompt = `Review the original and fixed code. Give a quality score out of 10. List what was improved. Max 100 words. Original: ${originalCode}. Fixed: ${fixedCode}`;
    const judgeResponse = await callGemini(judgePrompt);
    const scoreMatch = judgeResponse.match(/(\d+)\/10/);
    setScore(scoreMatch ? Number(scoreMatch[1]) : 7);

    setReviewComplete(true);
    setIsReviewing(false);

    const history: ReviewHistory = {
      input,
      language,
      mode: mode === "describe" ? "Describe code" : "Paste code",
      rounds: [...builderRounds, ...attackerRounds],
      score: scoreMatch ? Number(scoreMatch[1]) : 7,
      timestamp: new Date().toISOString(),
    };
    const stored = localStorage.getItem("reviewHistory") || "[]";
    const histories = JSON.parse(stored);
    histories.unshift(history);
    localStorage.setItem("reviewHistory", JSON.stringify(histories.slice(0, 5)));
  };

  const countIssues = (text: string) => {
    const critical = (text.match(/\[CRITICAL\]/g) || []).length;
    const warning = (text.match(/\[WARNING\]/g) || []).length;
    const suggestion = (text.match(/\[SUGGESTION\]/g) || []).length;
    return { critical, warning, suggestion };
  };

  const allAttackerText = attackerRounds.map(r => r.explanation).join(" ");
  const issues = countIssues(allAttackerText);

  const downloadCleanCode = () => {
    const blob = new Blob([cleanCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clean-code.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDFReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Code Review Report", 20, 20);
    doc.setFontSize(12);
    let y = 30;
    attackerRounds.forEach((round) => {
      doc.text(`Attacker Round ${round.round}:`, 20, y);
      y += 5;
      const split = doc.splitTextToSize(round.explanation || "", 170);
      doc.text(split, 20, y);
      y += split.length * 5 + 5;
    });
    builderRounds.forEach((round) => {
      if (round.code) {
        doc.text(`Builder Round ${round.round} (Clean Code):`, 20, y);
        y += 5;
        const split = doc.splitTextToSize(round.code, 170);
        doc.text(split, 20, y);
        y += split.length * 5 + 5;
      }
    });
    doc.text(`Score: ${score}/10`, 20, y);
    doc.save("code-review-report.pdf");
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6 bg-black min-h-screen">
      <div className="w-full max-w-4xl flex flex-col gap-4 mb-6">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-zinc-800 text-white px-4 py-2 rounded-lg border border-zinc-700 w-48"
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang.charAt(0).toUpperCase() + lang.slice(1)}
            </option>
          ))}
        </select>

        <div className="flex gap-2 bg-zinc-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setMode("describe")}
            className={`px-4 py-1 rounded transition-colors ${mode === "describe" ? "bg-blue-600 text-white" : "text-zinc-400"}`}
          >
            Describe code
          </button>
          <button
            onClick={() => setMode("paste")}
            className={`px-4 py-1 rounded transition-colors ${mode === "paste" ? "bg-blue-600 text-white" : "text-zinc-400"}`}
          >
            Paste code
          </button>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "describe" ? "Describe what the code should do..." : "Paste your code here..."}
          className="w-full h-48 bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 placeholder-zinc-500 resize-none"
          disabled={isReviewing}
        />

        <button
          onClick={startReview}
          disabled={isReviewing || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50 w-fit"
        >
          {isReviewing ? "Reviewing..." : "Start Review"}
        </button>
      </div>

      {isReviewing && (
        <div className="w-full max-w-4xl mb-4">
          <div className="bg-zinc-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full w-1/2 transition-all" />
          </div>
          <p className="text-zinc-400 text-sm mt-2">Round {currentRound} of 2</p>
        </div>
      )}

      <div ref={reviewRef} className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl p-4 border-2 border-green-500">
          <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium inline-block mb-3">
            Builder — LLM Alpha
          </div>
          <div className="max-h-96 overflow-y-auto">
            {builderRounds.map((round) => (
              <div key={round.round} className="mb-4">
                {round.code && (
                  <SyntaxHighlighter language={language} style={vscDarkPlus} className="text-xs rounded mb-2">
                    {round.code}
                  </SyntaxHighlighter>
                )}
                {round.explanation && <p className="text-zinc-300 text-sm">{round.explanation}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 border-2 border-red-500">
          <div className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium inline-block mb-3">
            Attacker — LLM Beta
          </div>
          <div className="max-h-96 overflow-y-auto">
            {attackerRounds.map((round) => (
              <div key={round.round} className="mb-4">
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{round.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reviewComplete && (
        <>
          <div className="w-full max-w-4xl mt-6 flex gap-4">
            <span className="bg-red-600 text-white px-4 py-2 rounded-full font-medium">
              Critical: {issues.critical}
            </span>
            <span className="bg-yellow-600 text-white px-4 py-2 rounded-full font-medium">
              Warning: {issues.warning}
            </span>
            <span className="bg-blue-600 text-white px-4 py-2 rounded-full font-medium">
              Suggestion: {issues.suggestion}
            </span>
          </div>

          <div className="w-full max-w-4xl mt-4 bg-zinc-900 rounded-xl p-6">
            <h3 className="text-2xl font-bold mb-2">Code Quality Score</h3>
            <p className="text-5xl font-bold text-blue-400">{score}/10</p>
          </div>

          <div className="flex gap-4 mt-4">
            <button
              onClick={downloadCleanCode}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium"
            >
              Download Clean Code
            </button>
            <button
              onClick={exportPDFReport}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
            >
              Download Report PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}