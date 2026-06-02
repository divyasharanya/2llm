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
  info: string;
  cleanCode: string;
  timestamp: string;
}

export default function CodeReviewClient() {
  const [language, setLanguage] = useState("python");
  const [mode, setMode] = useState<"describe" | "paste">("describe");
  const [input, setInput] = useState("");
  const [currentRound, setCurrentRound] = useState(0);
  const [info, setInfo] = useState("");
  const [cleanCode, setCleanCode] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [issues, setIssues] = useState({ critical: 0, warning: 0, suggestion: 0 });
  const [score, setScore] = useState(0);
  const reviewRef = useRef<HTMLDivElement>(null);

  const languages = ["python", "javascript", "typescript", "java", "cpp"];

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
        max_tokens: 800,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "API error");
    }
    return data.choices?.[0]?.message?.content || "No response";
  };

  const startReview = async () => {
    if (!input.trim()) return;

    setIsReviewing(true);
    setCurrentRound(0);
    setInfo("");
    setCleanCode("");
    setIssues({ critical: 0, warning: 0, suggestion: 0 });

    const originalCode = input;

    // Round 1: Gemini provides analysis and insights
    setCurrentRound(1);
    const infoPrompt = `You are Gemini, an elite code analysis expert. Analyze this code thoroughly without fixing it. Identify all issues, explain their impact, and provide insights. ${mode === "describe" ? "Task: " + input : "Code: " + input}. Give a detailed technical analysis.`;
    const infoResponse = await callGemini(infoPrompt).catch(() => "");
    setInfo(infoResponse || "Analysis unavailable");

    // Round 2: Groq provides optimized code
    setCurrentRound(2);
    const groqPrompt = mode === "describe"
      ? `You are LLaMA, a senior software architect. Write production-ready, optimized, well-documented code for: ${input}. Return ONLY clean code in markdown block. Handle all edge cases, use best practices, include error handling. Language: ${language}`
      : `You are LLaMA, a senior software architect. Fix ALL bugs and return ONLY the corrected code in markdown block.\n\n${input}\n\nRequirements: Handle edge cases, add error handling, use best practices, production-ready code.`;
    const groqResponse = await callGroq(groqPrompt);
    const codeMatch = groqResponse.match(/```[\w]*\n([\s\S]*?)\n```/);
    const extractedCode = codeMatch ? codeMatch[1] : groqResponse;
    setCleanCode(extractedCode);

    // Count issues from Gemini analysis
    const critical = (infoResponse.match(/\[CRITICAL\]|critical|error|bug|security|injection/i) || []).length;
    const warning = (infoResponse.match(/\[WARNING\]|warning|inefficient|performance/i) || []).length;
    const suggestion = (infoResponse.match(/\[SUGGESTION\]|suggestion|improve|best practice/i) || []).length;
    setIssues({ critical, warning, suggestion: suggestion || 1 });

    // Score
    const scoreText = await callGroq(`Rate code quality 1-10. Original had issues, fixed version: ${extractedCode}`).catch(() => "7/10");
    const scoreMatch = scoreText.match(/(\d+)\s*\/\s*10/);
    setScore(scoreMatch ? Number(scoreMatch[1]) : 7);

    setIsReviewing(false);

    const history: ReviewHistory = {
      input,
      language,
      mode: mode === "describe" ? "Describe code" : "Paste code",
      info: infoResponse,
      cleanCode: extractedCode,
      timestamp: new Date().toISOString(),
    };
    const stored = localStorage.getItem("reviewHistory") || "[]";
    const histories = JSON.parse(stored);
    histories.unshift(history);
    localStorage.setItem("reviewHistory", JSON.stringify(histories.slice(0, 5)));
  };

  const downloadCleanCode = () => {
    const blob = new Blob([cleanCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clean-code.${language === "cpp" ? "cpp" : language}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDFReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Code Review Report - Gemini x LLaMA", 20, 20);
    doc.setFontSize(12);
    let y = 30;
    doc.text("Gemini Analysis:", 20, y);
    y += 5;
    const splitInfo = doc.splitTextToSize(info || "No analysis available", 170);
    doc.text(splitInfo, 20, y);
    y += splitInfo.length * 5 + 10;
    doc.text("LLaMA Optimized Code:", 20, y);
    y += 5;
    const splitCode = doc.splitTextToSize(cleanCode || "No code generated", 170);
    doc.text(splitCode, 20, y);
    doc.save("code-review-report.pdf");
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6 bg-gradient-to-br from-gray-950 to-black min-h-screen">
      <div className="w-full max-w-5xl flex flex-col gap-6 mb-8">
        <div className="flex gap-4">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </option>
            ))}
          </select>

          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setMode("describe")}
              className={`px-4 py-1 rounded transition-all ${mode === "describe" ? "bg-blue-600 text-white" : "text-gray-400"}`}
            >
              Describe
            </button>
            <button
              onClick={() => setMode("paste")}
              className={`px-4 py-1 rounded transition-all ${mode === "paste" ? "bg-blue-600 text-white" : "text-gray-400"}`}
            >
              Paste Code
            </button>
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "describe" ? "Describe what the code should accomplish..." : "Paste code for review..."}
          className="w-full h-56 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 placeholder-gray-500 resize-none font-mono"
          disabled={isReviewing}
        />

        <button
          onClick={startReview}
          disabled={isReviewing || !input.trim()}
          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 w-fit shadow-lg"
        >
          {isReviewing ? "Processing..." : "Start Code Review"}
        </button>
      </div>

      {isReviewing && (
        <div className="w-full max-w-5xl mb-6">
          <div className="bg-gray-800 rounded-full h-3 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${(currentRound / 2) * 100}%` }} />
          </div>
          <p className="text-gray-400 text-sm mt-2">Round {currentRound} of 2 - Processing...</p>
        </div>
      )}

      <div ref={reviewRef} className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl p-6 border-2 border-blue-500/50 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Gemini 2.5 Flash</h3>
              <p className="text-blue-400 text-sm font-medium">Senior Code Analyst</p>
            </div>
          </div>
          <div className="bg-gray-950 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono">{info || "Analysis will appear here..."}</pre>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border-2 border-orange-500/50 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">LLaMA 3.1</h3>
              <p className="text-orange-400 text-sm font-medium">Code Architect</p>
            </div>
          </div>
          {cleanCode && (
            <div className="max-h-96 overflow-y-auto rounded-lg">
              <SyntaxHighlighter language={language} style={vscDarkPlus} className="text-xs rounded">
                {cleanCode}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      </div>

      {!isReviewing && info && (
        <div className="w-full max-w-5xl mt-8 flex flex-col gap-6">
          <div className="flex gap-8 justify-center">
            <div className="bg-red-900/30 border border-red-500/50 px-6 py-4 rounded-xl">
              <p className="text-red-400 font-bold text-lg">Critical: {issues.critical}</p>
            </div>
            <div className="bg-yellow-900/30 border border-yellow-500/50 px-6 py-4 rounded-xl">
              <p className="text-yellow-400 font-bold text-lg">Warnings: {issues.warning}</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/50 px-6 py-4 rounded-xl">
              <p className="text-blue-400 font-bold text-lg">Suggestions: {issues.suggestion}</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-8 text-center border border-gray-700">
            <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Code Quality Score</p>
            <p className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">{score}<span className="text-3xl text-gray-400">/10</span></p>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={downloadCleanCode}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg transition-all"
            >
              Download Clean Code
            </button>
            <button
              onClick={exportPDFReport}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg transition-all"
            >
              Export PDF Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}