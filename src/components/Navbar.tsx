import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="w-full bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
      <Link href="/" className="text-xl font-bold text-white hover:text-blue-400 transition-colors">
        AI Debate Arena
      </Link>
      <div className="flex gap-4">
        <Link href="/debate" className="text-zinc-300 hover:text-white transition-colors">
          Debate
        </Link>
        <Link href="/code-review" className="text-zinc-300 hover:text-white transition-colors">
          Code Review
        </Link>
      </div>
    </nav>
  );
}