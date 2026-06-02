"use client";

import { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface FileNode {
  name: string;
  path: string;
  content: string;
  type: "file" | "folder";
}

interface Issue {
  file: string;
  line: number;
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  description: string;
  fix?: string;
}

const fileExtensionMap: { [key: string]: string } = {
  py: "python", js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
  java: "java", cpp: "cpp", c: "cpp", go: "go", rs: "rust",
};

export default function CodeReviewClient() {
  const [inputMode, setInputMode] = useState<"paste" | "file" | "folder">("paste");
  const [language, setLanguage] = useState("python");
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [geminiInfo, setGeminiInfo] = useState("");
  const [llamaFixedCode, setLlamaFixedCode] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [score, setScore] = useState(0);
  const [scanProgress, setScanProgress] = useState("");
  const reviewRef = useRef<HTMLDivElement>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
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
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], max_tokens: 4000 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API error");
    return data.choices?.[0]?.message?.content || "No response";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const ext = file.name.split(".").pop() || "";
    setLanguage(fileExtensionMap[ext] || "text");
    const newNode: FileNode = { name: file.name, path: file.name, content, type: "file" };
    setFiles([newNode]);
    setSelectedFile(newNode);
    setInput(content);
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    const allFiles: FileNode[] = [];
    let scanned = 0;
    
    for (const file of fileList) {
      scanned++;
      setScanProgress(`Scanning file ${scanned}/${fileList.length}...`);
      const content = await file.text();
      allFiles.push({
        name: (file as any).webkitRelativePath?.split("/").pop() || file.name,
        path: (file as any).webkitRelativePath || file.name,
        content,
        type: "file"
      });
    }
    
    setFiles(allFiles);
    setScanProgress("");
    if (allFiles.length > 0) setInput(allFiles[0].content);
  };

  const startReview = async () => {
    if (!input.trim() && files.length === 0) return;
    
    setIsReviewing(true);
    setCurrentRound(0);
    setGeminiInfo("");
    setLlamaFixedCode("");
    setIssues([]);

    const code = files.length > 0 
      ? files.map(f => `=== FILE: ${f.path} ===\n${f.content}`).join("\n\n")
      : input;

    // Gemini analysis
    setCurrentRound(1);
    const geminiResp = await callGemini(`You are a senior code analyst. Return ONLY valid JSON array: [{"file":"x.py","line":1,"severity":"CRITICAL|WARNING|SUGGESTION","description":"issue"}]. If no issues, return [].\n${code}`).catch((err) => {
      console.error("Gemini error:", err);
      return "API ERROR: " + err.message;
    });
    setGeminiInfo(geminiResp || "Analysis unavailable");

    // Parse issues
    let parsedIssues: Issue[] = [];
    try {
      const clean = geminiResp.replace(/```json|```/g, "").trim();
      if (clean.startsWith("[")) {
        const arr = JSON.parse(clean);
        if (Array.isArray(arr)) {
          parsedIssues = arr.map((t: any) => ({
            file: t.file || "unknown",
            line: parseInt(t.line) || 1,
            severity: (t.severity?.toUpperCase() || "WARNING") as Issue["severity"],
            description: t.description || t.title || "Issue"
          }));
        }
      }
    } catch (e) {
      console.log("Parse error:", e);
    }
    setIssues(parsedIssues);

    // LLaMA fixed code
    setCurrentRound(2);
    const llamaResp = await callGroq(`Fix all bugs in this code. Return only code in markdown block:\n\n${code}`).catch((err) => {
      console.error("Groq error:", err);
      return "API ERROR: " + err.message;
    });
    const fixedMatch = llamaResp.match(/```[\w]*\n([\s\S]*?)\n```/);
    setLlamaFixedCode(fixedMatch ? fixedMatch[1] : llamaResp || "Fix unavailable");

    // Score
    setCurrentRound(3);
    const scoreResp = await callGroq(`Quality score 1-10 for this code`).catch(() => "7/10");
    const m = scoreResp.match(/(\d+)\s*\/\s*10/);
    setScore(m ? Number(m[1]) : 7);

    setIsReviewing(false);
  };

  const downloadAll = () => {
    const blob = new Blob([llamaFixedCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fixed-code.${language}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Code Review Report", 20, 25);
    doc.setFontSize(12);
    doc.text(`Score: ${score}/10`, 20, 35);
    doc.setFontSize(14);
    doc.text("Issues", 20, 45);
    doc.setFontSize(10);
    let y = 52;
    issues.forEach((i, idx) => {
      if (y > 270) { doc.addPage(); y = 30; }
      doc.text(`${i.severity}: ${i.file}:${i.line}`, 20, y);
      y += 5;
      doc.text(`  ${i.description.substring(0, 70)}`, 25, y);
      y += 8;
    });
    doc.save("review.pdf");
  };

  return (
    <div className="flex-1 flex flex-col items-center p-4 bg-gradient-to-br from-gray-950 to-black min-h-screen">
      <div className="w-full max-w-7xl flex flex-col gap-4 mb-6">
        <div className="flex gap-2 bg-gray-800 rounded-lg p-1 w-fit">
          <button onClick={() => setInputMode("paste")} className={`px-4 py-1 rounded ${inputMode === "paste" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Paste</button>
          <button onClick={() => setInputMode("file")} className={`px-4 py-1 rounded ${inputMode === "file" ? "bg-blue-600 text-white" : "text-gray-400"}`}>File</button>
          <button onClick={() => setInputMode("folder")} className={`px-4 py-1 rounded ${inputMode === "folder" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Folder</button>
        </div>

        {inputMode === "folder" && (
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 w-full text-center">
            <input type="file" multiple {...{ webkitdirectory: "" } as any} onChange={handleFolderUpload} className="hidden" id="folder-input" />
            <label htmlFor="folder-input" className="cursor-pointer text-gray-400">📁 Upload folder</label>
          </div>
        )}

        {inputMode === "file" && (
          <div className="border-2 border-dashed border-gray-500 rounded-lg p-4 w-full text-center hover:border-green-500 transition-colors">
            <input type="file" accept=".py,.js,.ts,.jsx,.tsx,.java,.cpp,.c,.go,.rs" onChange={handleFileUpload} className="hidden" id="file-input" />
            <label htmlFor="file-input" className="cursor-pointer text-gray-400 hover:text-green-400">📄 Upload file</label>
          </div>
        )}

        {(inputMode === "paste" || (files.length > 0 && inputMode !== "folder")) && (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste code..."
            className="w-full h-48 bg-gray-800 text-white p-3 rounded font-mono"
            disabled={isReviewing}
          />
        )}

        {scanProgress && <p className="text-blue-400">{scanProgress}</p>}

        <button onClick={startReview} disabled={isReviewing} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold">
          {isReviewing ? "Reviewing..." : "Start Review"}
        </button>
      </div>

      {isReviewing && (
        <div className="w-full max-w-7xl mb-4">
          <div className="bg-gray-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(currentRound / 3) * 100}%` }} />
          </div>
          <p className="text-gray-400 text-sm mt-1">Round {currentRound}/3 - LLM reviewing...</p>
        </div>
      )}

      {(geminiInfo || llamaFixedCode) && !isReviewing && (
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-blue-400 font-bold mb-2">Gemini Analysis</h3>
            <pre className="text-gray-300 text-xs max-h-64 overflow-y-auto">{geminiInfo}</pre>
          </div>

          <div className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-orange-400 font-bold">LLaMA Fixed Code</h3>
              {llamaFixedCode && <button onClick={downloadAll} className="text-green-400 hover:text-green-300 text-xs">Download</button>}
            </div>
            {llamaFixedCode && (
              <SyntaxHighlighter language={language} style={vscDarkPlus} className="text-xs max-h-64 overflow-y-auto rounded">
                {llamaFixedCode}
              </SyntaxHighlighter>
            )}
          </div>
        </div>
      )}

      {!isReviewing && issues.length > 0 && (
        <div className="w-full max-w-7xl mt-6">
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-white font-bold mb-4">Issues ({issues.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {issues.map((issue, i) => (
                <div key={i} className={`p-3 rounded border-l-4 ${issue.severity === "CRITICAL" ? "border-red-500 bg-red-900/20" : issue.severity === "WARNING" ? "border-yellow-500 bg-yellow-900/20" : "border-blue-500 bg-blue-900/20"}`}>
                  <p className="text-white text-sm">{issue.file}:{issue.line}</p>
                  <p className="text-gray-300 text-xs">{issue.description}</p>
                </div>
              ))}
            </div>
            <button onClick={exportPDF} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Export PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}