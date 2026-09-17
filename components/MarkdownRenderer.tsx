import React from "react";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  const parseInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let index = 0;
    
    // Regular expression matching links, bold, italic, and inline code in order
    const regex = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
    
    let match;
    let lastIndex = 0;
    
    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      
      if (matchIndex > lastIndex) {
        parts.push(text.slice(lastIndex, matchIndex));
      }
      
      if (match[1]) {
        // Link
        const linkText = match[2];
        const linkUrl = match[3];
        parts.push(
          <a
            key={index++}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--glowing-cyan, #00f0ff)", textDecoration: "underline" }}
          >
            {linkText}
          </a>
        );
      } else if (match[4]) {
        // Bold
        const boldText = match[5];
        parts.push(<strong key={index++} style={{ color: "#fff", fontWeight: "bold" }}>{boldText}</strong>);
      } else if (match[6]) {
        // Italic
        const italicText = match[7];
        parts.push(<em key={index++} style={{ fontStyle: "italic" }}>{italicText}</em>);
      } else if (match[8]) {
        // Code
        const codeText = match[9];
        parts.push(
          <code
            key={index++}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              padding: "2px 4px",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "0.9em",
              color: "var(--glowing-gold, #ffaa00)"
            }}
          >
            {codeText}
          </code>
        );
      }
      
      lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : [text];
  };

  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  
  let currentTableLines: string[] = [];
  let currentListLines: string[] = [];
  let blockIndex = 0;

  const flushTable = () => {
    if (currentTableLines.length === 0) return;
    const tableLines = [...currentTableLines];
    currentTableLines = [];

    if (tableLines.length < 2) {
      tableLines.forEach((line) => {
        blocks.push(<p key={blockIndex++} style={{ margin: "4px 0" }}>{parseInline(line)}</p>);
      });
      return;
    }

    const parseRow = (line: string): string[] => {
      const cells = line.split("|");
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();
      return cells.map(c => c.trim());
    };

    const headerCells = parseRow(tableLines[0]);
    const bodyRows = tableLines.slice(2).map(parseRow);

    blocks.push(
      <div key={blockIndex++} style={{ overflowX: "auto", margin: "16px 0", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left", background: "rgba(13, 20, 38, 0.2)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.03)", color: "#94a3b8" }}>
              {headerCells.map((cell, idx) => (
                <th key={idx} style={{ padding: "10px 14px", fontWeight: "bold" }}>{parseInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rowIdx) => (
              <tr key={rowIdx} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", transition: "background 0.2s" }} className="table-row-hover">
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} style={{ padding: "10px 14px", color: "#e2e8f0", verticalAlign: "top" }}>{parseInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const flushList = () => {
    if (currentListLines.length === 0) return;
    const listLines = [...currentListLines];
    currentListLines = [];

    blocks.push(
      <ul key={blockIndex++} style={{ margin: "12px 0 12px 20px", listStyleType: "disc", paddingLeft: "0" }}>
        {listLines.map((line, idx) => {
          const match = line.match(/^\s*[-*•]\s*(.*)$/);
          const cleanText = match ? match[1] : line;
          return (
            <li key={idx} style={{ marginBottom: "6px", color: "#cbd5e1", lineHeight: "1.5" }}>
              {parseInline(cleanText)}
            </li>
          );
        })}
      </ul>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      currentTableLines.push(line);
      continue;
    } else {
      flushTable();
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      flushTable();
      currentListLines.push(line);
      continue;
    } else {
      flushList();
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h4 key={blockIndex++} style={{ fontSize: "15px", fontWeight: "bold", color: "var(--glowing-cyan, #00f0ff)", margin: "18px 0 10px 0" }}>
          {parseInline(trimmed.slice(4))}
        </h4>
      );
      continue;
    }
    
    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h3 key={blockIndex++} style={{ fontSize: "17px", fontWeight: "800", color: "var(--accent, #b450ff)", margin: "22px 0 12px 0" }}>
          {parseInline(trimmed.slice(3))}
        </h3>
      );
      continue;
    }
    
    if (trimmed.startsWith("# ")) {
      blocks.push(
        <h2 key={blockIndex++} style={{ fontSize: "20px", fontWeight: "900", color: "#fff", margin: "26px 0 14px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "6px" }}>
          {parseInline(trimmed.slice(2))}
        </h2>
      );
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push(<hr key={blockIndex++} style={{ border: "none", borderTop: "1px solid rgba(255, 255, 255, 0.08)", margin: "20px 0" }} />);
      continue;
    }

    if (trimmed.startsWith(">")) {
      const cleanQuote = trimmed.replace(/^>\s*/, "");
      blocks.push(
        <blockquote key={blockIndex++} style={{ borderLeft: "4px solid var(--glowing-cyan, #00f0ff)", background: "rgba(0, 240, 255, 0.03)", padding: "10px 16px", margin: "14px 0", borderRadius: "0 8px 8px 0", fontStyle: "italic", color: "#cbd5e1" }}>
          {parseInline(cleanQuote)}
        </blockquote>
      );
      continue;
    }

    if (trimmed === "") {
      continue;
    }

    blocks.push(<p key={blockIndex++} style={{ margin: "10px 0", lineHeight: "1.6", color: "#cbd5e1" }}>{parseInline(line)}</p>);
  }

  flushTable();
  flushList();

  return <div style={{ wordBreak: "break-word" }}>{blocks}</div>;
}
