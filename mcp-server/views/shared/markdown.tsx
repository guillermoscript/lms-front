import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Theme-aware markdown renderer shared by lesson widgets.
 * Lesson content is MDX: standard markdown renders; raw HTML / custom JSX
 * components are stripped by react-markdown's default (safe) behavior.
 */

type Palette = {
  text: string;
  heading: string;
  secondary: string;
  border: string;
  link: string;
  codeText: string;
  codeBg: string;
  codeBorder: string;
  quoteBar: string;
  quoteText: string;
  tableHeadBg: string;
};

function palette(dark: boolean): Palette {
  return {
    text: dark ? "#d4d4d8" : "#1f2937",
    heading: dark ? "#f4f4f5" : "#111827",
    secondary: dark ? "#a1a1aa" : "#6b7280",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    link: dark ? "#a78bfa" : "#7c3aed",
    codeText: dark ? "#e4e4e7" : "#374151",
    codeBg: dark ? "#141414" : "#f4f4f5",
    codeBorder: dark ? "#2a2a2a" : "#e4e4e7",
    quoteBar: dark ? "#3f3f46" : "#d4d4d8",
    quoteText: dark ? "#a1a1aa" : "#4b5563",
    tableHeadBg: dark ? "#1a1a1a" : "#fafafa",
  };
}

function headingStyle(c: Palette, size: number, top: number): CSSProperties {
  return {
    margin: `${top}px 0 8px`,
    fontSize: size,
    fontWeight: 700,
    color: c.heading,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  };
}

export function Markdown({
  content,
  dark,
  fontSize = 14,
}: {
  content: string;
  dark: boolean;
  fontSize?: number;
}) {
  const c = palette(dark);

  const block: CSSProperties = {
    margin: "0 0 12px",
    fontSize,
    lineHeight: 1.7,
    color: c.text,
  };

  return (
    <div
      style={{
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        maxWidth: "72ch",
        overflowWrap: "break-word",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 style={headingStyle(c, fontSize + 6, 20)}>{children}</h2>
          ),
          h2: ({ children }) => (
            <h3 style={headingStyle(c, fontSize + 4, 18)}>{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 style={headingStyle(c, fontSize + 2, 16)}>{children}</h4>
          ),
          h4: ({ children }) => (
            <h5 style={headingStyle(c, fontSize + 1, 14)}>{children}</h5>
          ),
          p: ({ children }) => <p style={block}>{children}</p>,
          ul: ({ children }) => (
            <ul style={{ ...block, paddingLeft: 22 }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ ...block, paddingLeft: 22 }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 4 }}>{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: c.link,
                fontWeight: 500,
                textDecorationColor: c.link,
              }}
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 700, color: c.heading }}>
              {children}
            </strong>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 12px",
                padding: "4px 0 4px 14px",
                borderLeft: `1px solid ${c.quoteBar}`,
                color: c.quoteText,
                fontStyle: "italic",
              }}
            >
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return <code className={className}>{children}</code>;
            }
            return (
              <code
                style={{
                  fontFamily:
                    'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: fontSize - 1.5,
                  padding: "1.5px 5px",
                  borderRadius: 5,
                  backgroundColor: c.codeBg,
                  border: `1px solid ${c.codeBorder}`,
                  color: c.codeText,
                }}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              style={{
                margin: "0 0 12px",
                padding: 14,
                borderRadius: 8,
                backgroundColor: c.codeBg,
                border: `1px solid ${c.codeBorder}`,
                fontSize: fontSize - 1,
                lineHeight: 1.6,
                color: c.codeText,
                overflowX: "auto",
                fontFamily:
                  'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              }}
            >
              {children}
            </pre>
          ),
          hr: () => (
            <hr
              style={{
                border: "none",
                borderTop: `1px solid ${c.border}`,
                margin: "18px 0",
              }}
            />
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  fontSize: fontSize - 1,
                  minWidth: 320,
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: "left",
                padding: "7px 12px",
                border: `1px solid ${c.border}`,
                backgroundColor: c.tableHeadBg,
                color: c.heading,
                fontWeight: 650,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: "7px 12px",
                border: `1px solid ${c.border}`,
                color: c.text,
              }}
            >
              {children}
            </td>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ""}
              loading="lazy"
              style={{
                maxWidth: "100%",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
