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
  children?: FileNode[];
}

interface Issue {
  file: string;
  line: number;
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  description: string;
  fix?: string;
}

interface ReviewHistory {
  files: FileNode[];
  framework: string;
  issues: Issue[];
  score: number;
  timestamp: string;
}

const fileExtensionMap: { [key: string]: string } = {
  py: "python", js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
  java: "java", cpp: "cpp", c: "cpp", go: "go", rs: "rust",
};

const frameworkPatterns: { [key: string]: RegExp } = {
  react: /react|jsx|tsx/i,
  nextjs: /next\.config|pages\/|app\/router/i,
  django: /django|settings\.py|views\.py/i,
  express: /express|require\(|import express/i,
};

const secretPatterns = [
  /api[_-]?key\s*[:=]\s*['"][\w-]+/i,
  /password\s*[:=]\s*['"][\w-]+/i,
  /secret\s*[:=]\s*['"][\w-]+/i,
  /token\s*[:=]\s*['"][\w-]+/i,
];

export default function CodeReviewClient() {
  const [inputMode, setInputMode] = useState<"paste" | "file" | "folder">("paste");
  const [language, setLanguage] = useState("python");
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [score, setScore] = useState(0);
  const [framework, setFramework] = useState("");
  const [scanProgress, setScanProgress] = useState("");
  const [fixedFiles, setFixedFiles] = useState<{ [path: string]: string }>({});
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (input && !language) detectLanguage();
  }, [input]);

  const detectLanguage = () => {
    for (const [lang, pattern] of Object.entries(frameworkPatterns)) {
      if (pattern.test(input)) {
        if (lang === "nextjs") setFramework("Next.js");
        else if (lang === "react") setFramework("React");
        else if (lang === "django") setFramework("Django");
        else if (lang === "express") setFramework("Express");
      }
    }
    for (const ext of Object.keys(fileExtensionMap)) {
      if (input.includes(`.${ext}`)) {
        setLanguage(fileExtensionMap[ext]);
        break;
      }
    }
  };

  const preScanCode = (content: string, filename: string): Issue[] => {
    const found: Issue[] = [];
    const lines = content.split("\n");
    
    lines.forEach((line, i) => {
      if (/console\.(log|error|warn)/i.test(line)) {
        found.push({ file: filename, line: i + 1, severity: "WARNING", description: "Console statement left in production code" });
      }
      if (/TODO|FIXME/i.test(line)) {
        found.push({ file: filename, line: i + 1, severity: "SUGGESTION", description: "TODO/FIXME comment found" });
      }
      if (/catch\s*\(\s*\)\s*\{/i.test(line)) {
        found.push({ file: filename, line: i + 1, severity: "WARNING", description: "Empty catch block" });
      }
      secretPatterns.forEach((pattern, idx) => {
        if (pattern.test(line)) {
          found.push({ file: filename, line: i + 1, severity: "CRITICAL", description: `Potential hardcoded secret detected` });
        }
      });
    });
    
    return found;
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
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
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
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], max_tokens: 1200 }),
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
    
    const newNode: FileNode = {
      name: file.name,
      path: file.name,
      content,
      type: "file"
    };
    setFiles([newNode]);
    setSelectedFile(newNode);
    setInput(content);
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    const totalFiles = fileList.length;
    let scanned = 0;
    
    const allFiles: FileNode[] = [];
    const allIssues: Issue[] = [];
    
    for (const file of fileList) {
      scanned++;
      setScanProgress(`Scanning file ${scanned}/${totalFiles}...`);
      
      const content = await file.text();
      const pathParts = file.webkitRelativePath?.split("/") || [file.name];
      const ext = pathParts[pathParts.length - 1].split(".").pop() || "";
      
      allFiles.push({
        name: pathParts[pathParts.length - 1],
        path: file.webkitRelativePath || file.name,
        content,
        type: "file"
      });
      
      const fileIssues = preScanCode(content, pathParts[pathParts.length - 1]);
      allIssues.push(...fileIssues);
    }
    
    setFiles(allFiles);
    setIssues(allIssues);
    detectFramework(allFiles);
  };

  const detectFramework = (files: FileNode[]) => {
    const content = files.map(f => f.content).join("\n");
    for (const [fw, pattern] of Object.entries(frameworkPatterns)) {
      if (pattern.test(content)) {
        setFramework(fw.charAt(0).toUpperCase() + fw.slice(1));
        break;
      }
    }
  };

  const startReview = async () => {
    if (!input.trim() && files.length === 0) return;
    
    setIsReviewing(true);
    setCurrentRound(0);
    setIssues([]);
    setFixedFiles({});

    const concatenated = files.length > 0 
      ? files.map(f => `=== FILE: ${f.path} ===\n${f.content}`).join("\n\n")
      : input;

    // Round 1: Gemini analysis
    setCurrentRound(1);
    const infoPrompt = `You are Gemini, elite analyst. Analyze this full project. Identify bugs, security issues, cross-file problems (${framework}). List issues with [FILE: name] [LINE: #] [SEVERITY: LEVEL]. Give detailed analysis.\n\n${concatenated}`;
    const infoResponse = await callGemini(infoPrompt).catch(() => "");
    
    const parsedIssues: Issue[] = [];
    const issueMatches = infoResponse.matchAll(/\[FILE:\s*([^\]]+)\]\s*\[LINE:\s*(\d+)\]\s*\[SEVERITY:\s*(\w+)\]/gi);
    for (const match of issueMatches) {
      parsedIssues.push({
        file: match[1].trim(),
        line: parseInt(match[2]),
        severity: match[3].toUpperCase() as any,
        description: infoResponse.substring(match.index!, infoResponse.indexOf("\n", match.index!)).replace(/\[FILE:[^\]]+\]\s*\[LINE:[^\]]+\]\s*\[SEVERITY:[^\]]+\]/gi, "").trim()
      });
    }
    setIssues(parsedIssues);

    // Round 2: LLaMA fixes
    setCurrentRound(2);
    const fixedCodeMap: { [path: string]: string } = {};
    for (const file of files) {
      const fixPrompt = `Fix this ${fileExtensionMap[file.path.split(".").pop() || ""]} code. Return only corrected code in markdown block:\n\n${file.content}`;
      const fixedRes = await callGroq(fixPrompt).catch(() => "");
      const fixedCode = fixedRes.match(/```[\w]*\n([\s\S]*?)\n```/)?.[1] || file.content;
      fixedCodeMap[file.path] = fixedCode;
    }
    setFixedFiles(fixedCodeMap);
    if (files.length > 0 && Object.keys(fixedCodeMap).length > 0) {
      setInput(Object.values(fixedCodeMap)[0]);
    }

    // Round 3: Score
    setCurrentRound(3);
    const scoreRes = await callGroq(`Rate overall project quality 1-10. Issues found: ${parsedIssues.length}`).catch(() => "7/10");
    const scoreMatch = scoreRes.match(/(\d+)\s*\/\s*10/);
    setScore(scoreMatch ? Number(scoreMatch[1]) : 7);

    setIsReviewing(false);
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDFReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Project Security Audit Report", 20, 25);
    doc.setFontSize(12);
    doc.text(`Framework: ${framework || "Unknown"}`, 20, 35);
    doc.text(`Files: ${files.length}`, 20, 42);
    doc.text(`Date: ${new Date().toLocaleString()}`, 20, 49);
    doc.setFontSize(14);
    doc.text(`Quality Score: ${score}/10`, 20, 60);
    doc.setFontSize(12);
    
    let y = 75;
    issues.forEach((issue, i) => {
      if (y > 270) { doc.addPage(); y = 30; }
      doc.text(`${issue.severity}: ${issue.file}:${issue.line}`, 20, y);
      y += 5;
      doc.setFontSize(10);
      doc.text(`  ${issue.description.substring(0, 80)}`, 25, y);
      y += 8;
    });
    doc.save("project-audit.pdf");
  };

  return (
    <div className="flex-1 flex flex-col items-center p-4 bg-gradient-to-br from-gray-950 to-black min-h-screen">
      <div className="w-full max-w-7xl flex flex-col gap-4 mb-6">
        <div className="flex gap-2 bg-gray-800 rounded-lg p-1 w-fit">
          <button onClick={() => setInputMode("paste")} className={`px-4 py-1 rounded ${inputMode === "paste" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Paste Code</button>
          <button onClick={() => setInputMode("file")} className={`px-4 py-1 rounded ${inputMode === "file" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Upload File</button>
          <button onClick={() => setInputMode("folder")} className={`px-4 py-1 rounded ${inputMode === "folder" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Upload Folder</button>
        </div>

        {inputMode === "folder" && (
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
            <input type="file" webkitdirectory="" multiple onChange={handleFolderUpload} className="hidden" id="folder-input" {...{ webkitdirectory: "" } as any} />
            <label htmlFor="folder-input" className="cursor-pointer text-gray-400 hover:text-white">
              <p>📁 Drop folder here or click to browse</p>
              <p className="text-xs mt-2">Supports: .py .js .ts .jsx .tsx .java .cpp .c .go .rs</p>
            </label>
          </div>
        )}

        {inputMode === "file" && (
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center">
            <input type="file" accept=".py,.js,.ts,.jsx,.tsx,.java,.cpp,.c,.go,.rs" onChange={handleFileUpload} className="hidden" id="file-input" />
            <label htmlFor="file-input" className="cursor-pointer text-gray-400">📄 Click to upload file</label>
          </div>
        )}

        {(inputMode === "paste" || (files.length > 0 && inputMode !== "folder")) && (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste code here..."
            className="w-full h-48 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 font-mono"
            disabled={isReviewing}
          />
        )}

        {scanProgress && <p className="text-blue-400 animate-pulse">{scanProgress}</p>}

        <button onClick={startReview} disabled={isReviewing} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-lg font-semibold">
          {isReviewing ? "Reviewing..." : "Start Review"}
        </button>
      </div>

      {(files.length > 0 || input) && (
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-4 gap-6">
          {files.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 max-h-96 overflow-y-auto">
              <p className="text-white font-bold mb-2">Files ({files.length})</p>
              <p className="text-gray-400 text-xs mb-3">Total Issues: {issues.length}</p>
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} onClick={() => setSelectedFile(f)} className="cursor-pointer p-2 rounded hover:bg-gray-800 text-gray-300 text-sm">
                    📄 {f.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`${files.length > 0 ? "lg:col-span-3" : "lg:col-span-4"} bg-gray-900 rounded-xl p-6`}>
            {selectedFile && files.length > 0 && (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-bold">{selectedFile.name}</h3>
                  <button onClick={() => downloadFile(selectedFile.name, selectedFile.content)} className="text-gray-400 hover:text-white text-xs">Download</button>
                </div>
                <SyntaxHighlighter language={fileExtensionMap[selectedFile.path.split(".").pop() || ""] || "text"} style={vscDarkPlus} className="text-xs rounded">
                  {selectedFile.content}
                </SyntaxHighlighter>
              </>
            )}

            {files.length === 0 && input && (
              <SyntaxHighlighter language={language} style={vscDarkPlus} className="text-xs rounded">
                {input}
              </SyntaxHighlighter>
            )}
          </div>
        </div>
      )}

      {!isReviewing && issues.length > 0 && (
        <div className="w-full max-w-7xl mt-8">
          <div className="bg-gray-900 rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">Issues Found</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {issues.map((issue, i) => (
                <div key={i} className={`p-4 rounded border-l-4 ${issue.severity === "CRITICAL" ? "border-red-500 bg-red-900/20" : issue.severity === "WARNING" ? "border-yellow-500 bg-yellow-900/20" : "border-blue-500 bg-blue-900/20"}`}>
                  <p className="text-white font-semibold text-sm">{issue.file}:{issue.line}</p>
                  <p className="text-gray-300 text-xs mt-1">{issue.description}</p>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex gap-4 mt-4 justify-center">
            <button onClick={exportPDFReport} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold">Export PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}