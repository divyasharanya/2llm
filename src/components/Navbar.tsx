import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="w-full bg-black/80 backdrop-blur-md border-b border-gray-800 px-6 py-4 flex justify-between items-center z-10">
      <Link href="/" className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        AI Debate Arena
      </Link>
      <div className="flex gap-6">
        <Link href="/debate" className="text-gray-300 hover:text-blue-400 transition-colors relative group">
          Debate
          <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 group-hover:w-full transition-all"></span>
        </Link>
        <Link href="/code-review" className="text-gray-300 hover:text-blue-400 transition-colors relative group">
          Code Review
          <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 group-hover:w-full transition-all"></span>
        </Link>
      </div>
    </nav>
  );
}