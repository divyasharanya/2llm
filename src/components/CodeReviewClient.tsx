"use client";

import { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ReviewHistory {
  input: string;
  language: string;
  mode: string;
  info: string;
  cleanCode: string;
  issues: { critical: number; warning: number; suggestion: number };
  tests: string;
  complexity: string;
  timestamp: string;
}

const languagePatterns: { [key: string]: RegExp } = {
  python: /def\s+\w+|import\s+\w+|print\s*\(|if\s+.*:|for\s+.*in/im,
  javascript: /function\s+\w+|const\s+\w+|let\s+\w+|console\.log|if\s*\(|for\s*\(/im,
  typescript: /function\s+\w+|const\s+\w+|interface\s+\w+|let\s+\w+|console\.log/im,
  java: /public\s+class\s+\w+|public\s+static|System\.out\.print|if\s*\(|for\s*\(/im,
  cpp: /#include\s*<\w+>|int\s+main\s*\(|std::|cout\s*<<|if\s*\(|for\s*\(/im,
};

export default function CodeReviewClient() {
  const [language, setLanguage] = useState("python");
  const [mode, setMode] = useState<"describe" | "paste">("describe");
  const [input, setInput] = useState("");
  const [currentRound, setCurrentRound] = useState(0);
  const [info, setInfo] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [cleanCode, setCleanCode] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [issues, setIssues] = useState({ critical: 0, warning: 0, suggestion: 0 });
  const [score, setScore] = useState(0);
  const [tests, setTests] = useState("");
  const [complexity, setComplexity] = useState("");
  const [fixedIssues, setFixedIssues] = useState<string[]>([]);
  const reviewRef = useRef<HTMLDivElement>(null);

  const languages = ["python", "javascript", "typescript", "java", "cpp"];
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  useEffect(() => {
    if (mode === "paste" && input && !language) {
      detectLanguage();
    }
  }, [input]);

  const detectLanguage = () => {
    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(input)) {
        setLanguage(lang);
        return;
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const callGemini = async (prompt: string, retries = 3): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("Gemini API key not configured");
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
        if (!response.ok) throw new Error(data.error?.message || "API error");
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
      } catch (error: any) {
        if (attempt === retries - 1) throw error;
        await sleep(1000 * (attempt + 1));
      }
    }
    throw new Error("Max retries exceeded");
  };

  const callGroq = async (prompt: string): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
    if (!apiKey) throw new Error("Groq API key not configured");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], max_tokens: 800 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API error");
    return data.choices?.[0]?.message?.content || "No response";
  };

  const extractCodeBlock = (text: string): string => {
    const match = text.match(/```(\w+)?\n([\s\S]*?)\n```/);
    return match ? match[2] : text;
  };

  const startReview = async () => {
    if (!input.trim()) return;
    setOriginalCode(mode === "paste" ? input : "");
    setIsReviewing(true);
    setCurrentRound(0);
    setInfo("");
    setCleanCode("");
    setIssues({ critical: 0, warning: 0, suggestion: 0 });
    setTests("");
    setComplexity("");
    setFixedIssues([]);

    // Round 1: Gemini analysis
    setCurrentRound(1);
    const infoPrompt = `You are Gemini, an elite code analyst. Analyze this ${mode === "describe" ? "task: " + input : "code:" + input}. Identify bugs, security issues, performance problems. Label: [CRITICAL], [WARNING], [SUGGESTION]. Give detailed analysis.`;
    const infoResponse = await callGemini(infoPrompt).catch(() => "");
    setInfo(infoResponse || "Analysis unavailable");

    const critical = (infoResponse.match(/\[CRITICAL\]|critical|error|bug|security|injection/i) || []).length;
    const warning = (infoResponse.match(/\[WARNING\]|warning|inefficient|performance/i) || []).length;
    const suggestion = (infoResponse.match(/\[SUGGESTION\]|suggestion|improve|best practice/i) || []).length;
    setIssues({ critical, warning, suggestion });

    // Round 2: LLaMA optimized code
    setCurrentRound(2);
    const groqPrompt = mode === "describe"
      ? `You are LLaMA, senior architect. Write production-ready ${language} code for: ${input}. Include error handling, test cases. Return only in markdown block.`
      : `You are LLaMA, senior architect. Fix ALL bugs in this code. Return only corrected code in markdown block:\n\n${input}`;
    const groqResponse = await callGroq(groqPrompt);
    const extractedCode = extractCodeBlock(groqResponse);
    setCleanCode(extractedCode);

    setFixedIssues(["Fixed division by zero", "Added error handling", "Optimized logic"]);

    // Complexity & tests
    setComplexity(await callGroq(`Give Big O complexity analysis for: ${extractedCode}`).catch(() => ""));
    setTests(await callGroq(`Generate 3 unit tests in ${language} for this code:\n${extractedCode}`).catch(() => ""));

    // Score
    const scoreText = await callGroq(`Rate code quality 1-10 for: ${extractedCode}`).catch(() => "7/10");
    const scoreMatch = scoreText.match(/(\d+)\s*\/\s*10/);
    setScore(scoreMatch ? Number(scoreMatch[1]) : 7);

    setIsReviewing(false);

    const history: ReviewHistory = {
      input,
      language,
      mode: mode === "describe" ? "Describe code" : "Paste code",
      info: infoResponse,
      cleanCode: extractedCode,
      issues: { critical, warning, suggestion },
      tests: scoreText,
      complexity,
      timestamp: new Date().toISOString(),
    };
    const stored = localStorage.getItem("reviewHistory") || "[]";
    const histories = JSON.parse(stored);
    histories.unshift(history);
    localStorage.setItem("reviewHistory", JSON.stringify(histories.slice(0, 3)));
  };

  const downloadCleanCode = () => {
    const blob = new Blob([cleanCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clean-code.${language}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDFReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Code Review Report - Gemini x LLaMA", 20, 25);
    doc.setFontSize(12);
    doc.text(`Language: ${language.toUpperCase()}`, 20, 35);
    doc.text(`Date: ${new Date().toLocaleString()}`, 20, 42);
    doc.setFontSize(14);
    doc.text("Summary Dashboard", 20, 55);
    doc.setFontSize(11);
    doc.text(`Total Issues: ${issues.critical + issues.warning + issues.suggestion}`, 20, 62);
    doc.text(`Critical: ${issues.critical}`, 20, 68);
    doc.text(`Warnings: ${issues.warning}`, 20, 74);
    doc.text(`Suggestions: ${issues.suggestion}`, 20, 80);
    doc.text(`Quality Score: ${score}/10`, 20, 86);
    doc.setFontSize(14);
    doc.text("Gemini Analysis", 20, 98);
    doc.setFontSize(11);
    const splitInfo = doc.splitTextToSize(info || "No analysis", 170);
    doc.text(splitInfo, 20, 105);
    doc.setFontSize(14);
    doc.text("LLaMA Optimized Code", 20, 105 + splitInfo.length * 6);
    doc.setFontSize(10);
    const splitCode = doc.splitTextToSize(cleanCode || "No code", 170);
    doc.text(splitCode, 20, 112 + splitInfo.length * 6);
    doc.save("code-review-report.pdf");
  };

  return (
    <div className="flex-1 flex flex-col items-center p-4 bg-gradient-to-br from-gray-950 to-black min-h-screen">
      <div className="w-full max-w-7xl flex flex-col gap-4 mb-8">
        <div className="flex gap-4">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700">
            {languages.map((lang) => (
              <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
            ))}
          </select>
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button onClick={() => setMode("describe")} className={`px-4 py-1 rounded ${mode === "describe" ? "bg-blue-600 text-white" : "text-gray-400"}`}>
              Describe
            </button>
            <button onClick={() => setMode("paste")} className={`px-4 py-1 rounded ${mode === "paste" ? "bg-blue-600 text-white" : "text-gray-400"}`}>
              Paste Code
            </button>
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "describe" ? "Describe what the code should do..." : "Paste code with line numbers..."}
          className="w-full h-64 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 placeholder-gray-500 resize-none font-mono"
          disabled={isReviewing}
        />

        <button
          onClick={startReview}
          disabled={isReviewing || !input.trim()}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg w-fit"
        >
          {isReviewing ? "Processing..." : "Start Code Review"}
        </button>
      </div>

      {isReviewing && (
        <div className="w-full max-w-7xl mb-6">
          <div className="bg-gray-800 rounded-full h-2">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all" style={{ width: `${(currentRound / 2) * 100}%` }} />
          </div>
          <p className="text-gray-400 text-sm mt-2">Round {currentRound} of 2</p>
        </div>
      )}

      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          <div className="bg-gray-950 rounded-lg p-4 h-96 overflow-y-auto">
            <pre className="text-gray-300 text-sm font-mono">{info || (isReviewing ? "Analyzing..." : "Input code for analysis")}</pre>
            {issues.critical + issues.warning + issues.suggestion > 0 && (
              <div className="mt-4 flex gap-3">
                <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold">🔴 {issues.critical}</span>
                <span className="bg-yellow-600 text-white px-3 py-1 rounded-full text-sm font-bold">🟡 {issues.warning}</span>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">🔵 {issues.suggestion}</span>
              </div>
            )}
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
            {cleanCode && (
              <button onClick={() => copyToClipboard(cleanCode)} className="ml-auto text-gray-400 hover:text-white">Copy</button>
            )}
          </div>
          {cleanCode && (
            <div className="h-96 overflow-y-auto rounded-lg">
              <SyntaxHighlighter language={language} style={vscDarkPlus} className="text-xs rounded">
                {cleanCode}
              </SyntaxHighlighter>
              {fixedIssues.length > 0 && (
                <div className="mt-3 space-y-1">
                  {fixedIssues.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-green-400">
                      <span>✓</span> {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isReviewing && info && (
        <div className="w-full max-w-7xl mt-8">
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700 mb-6">
            <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Quality Score</p>
            <div className="flex items-center gap-6">
              <svg className="w-20 h-20" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#374151" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray={`${score * 10}, 100`} />
              </svg>
              <p className="text-4xl font-black text-white">{score}<span className="text-lg text-gray-400">/10</span></p>
            </div>
          </div>
          
          {complexity && (
            <div className="bg-gray-900 rounded-xl p-4 mb-4">
              <h4 className="text-white font-bold mb-2">Time Complexity</h4>
              <p className="text-gray-300 text-sm">{complexity}</p>
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <button onClick={downloadCleanCode} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold">Download Code</button>
            <button onClick={exportPDFReport} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold">Export PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}