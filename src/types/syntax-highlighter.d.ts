declare module "react-syntax-highlighter/dist/esm/prism" {
  import { ComponentType, CSSProperties } from "react";
  interface SyntaxHighlighterProps {
    language: string;
    style: Record<string, unknown>;
    children: string;
    className?: string;
    showLineNumbers?: boolean;
    wrapLines?: boolean;
    lineProps?: (lineNumber: number) => { style?: CSSProperties };
    customStyle?: CSSProperties;
  }
  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>;
  export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  const vscDarkPlus: Record<string, unknown>;
  export { vscDarkPlus };
}