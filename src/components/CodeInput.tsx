import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface CodeSuggestion {
  insert: string;
  detail: string;
  signature?: string;
}

type SuggestionSource = CodeSuggestion[] | ((value: string, cursor: number) => CodeSuggestion[]);

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  language: "html" | "css" | "javascript" | "garden";
  suggestions?: SuggestionSource;
  disabled?: boolean;
}

const COMMON_SUGGESTIONS: Record<Exclude<CodeInputProps["language"], "garden">, CodeSuggestion[]> = {
  html: [
    { insert: "<main>\n  \n</main>", detail: "Page content" },
    { insert: "<h1></h1>", detail: "Main heading" },
    { insert: "<p></p>", detail: "Paragraph" },
    { insert: "<button></button>", detail: "Interactive button" },
    { insert: '<div class="">\n  \n</div>', detail: "Content container" },
    { insert: '<img src="" alt="">', detail: "Accessible image" },
  ],
  css: [
    { insert: "color: ", detail: "Text color" },
    { insert: "background-color: ", detail: "Background color" },
    { insert: "font-family: ", detail: "Typeface" },
    { insert: "padding: ", detail: "Inner spacing" },
    { insert: "margin: ", detail: "Outer spacing" },
    { insert: "display: flex;", detail: "Flex layout" },
    { insert: "border-radius: ", detail: "Rounded corners" },
  ],
  javascript: [
    { insert: "const ", detail: "Create a constant" },
    { insert: "let ", detail: "Create a variable" },
    { insert: "function () {\n  \n}", detail: "Reusable function" },
    { insert: "document.querySelector('')", detail: "Find an element" },
    { insert: ".addEventListener('click', () => {\n  \n});", detail: "Handle a click" },
    { insert: ".textContent = '';", detail: "Change visible text" },
    { insert: "console.log()", detail: "Inspect a value" },
  ],
};

function highlightCode(value: string, language: CodeInputProps["language"]): ReactNode[] {
  const pattern = language === "html"
    ? /(<\/?[\w-]+|>|<!doctype\b|"[^"]*")/gi
    : language === "css"
      ? /(\/\*[\s\S]*?\*\/|#[0-9a-f]{3,8}\b|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\w-]+(?=\s*:)|[{};])/gi
      : language === "javascript"
        ? /(\/\/[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|var|function|return|if|else|new|true|false|null|undefined|document|window|this)\b|\b\d+(?:\.\d+)?\b)/gi
        : /(#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:move|harvest|plant|collect|wait|turn|repeat|if|else|let|function|tile_is|energy_at_least|storage_has_room)\b|\b\d+\b)/gi;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(value.slice(lastIndex, index));
    parts.push(<span className="code-input__token" data-language={language} key={`${index}:${match[0]}`}>{match[0]}</span>);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  if (value.endsWith("\n")) parts.push(" ");
  return parts;
}

export function CodeInput({ value, onChange, label, language, suggestions, disabled }: CodeInputProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [dismissedPrefix, setDismissedPrefix] = useState("");
  const [cursor, setCursor] = useState(value.length);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== document.activeElement) setCursor(value.length);
    else setCursor((current) => Math.min(current, value.length));
  }, [value]);

  const candidates = useMemo(() => {
    const selection = typeof suggestions === "function"
      ? suggestions(value, cursor)
      : suggestions ?? (language === "garden" ? [] : COMMON_SUGGESTIONS[language]);
    const before = value.slice(0, cursor);
    const word = before.match(/[A-Za-z_][\w-]*$/)?.[0] ?? "";
    const insideGardenArgument = language === "garden" &&
      /(?:\b(?:move|turn|plant|tile_is|energy_at_least|storage_has_room|repeat)\s*\(\s*|\bif\s*\()\s*["']?$/.test(before);
    if (word.length === 0 && !insideGardenArgument) return [];
    if ((word.length === 0 && (language !== "garden" || selection.length === 0)) ||
      (dismissedPrefix !== "" && word === dismissedPrefix) || (!word && dismissedPrefix === "$context")) return [];
    return selection
      .filter((item) => item.insert.toLowerCase().startsWith(word.toLowerCase()) && item.insert.toLowerCase() !== word.toLowerCase())
      .slice(0, 6);
  }, [cursor, dismissedPrefix, language, suggestions, value]);

  function insertText(text: string, replaceWord: boolean) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = value.slice(0, start);
    const wordMatch = replaceWord ? before.match(/[A-Za-z_][\w-]*$/) : null;
    const replaceStart = wordMatch ? start - wordMatch[0].length : start;
    const next = `${value.slice(0, replaceStart)}${text}${value.slice(end)}`;
    onChange(next);
    setActiveSuggestion(0);
    setDismissedPrefix("");
    setCursor(replaceStart + text.length);
    requestAnimationFrame(() => {
      editor.focus();
      const caret = replaceStart + text.length;
      editor.setSelectionRange(caret, caret);
    });
  }

  function acceptSuggestion(index = activeSuggestion) {
    const suggestion = candidates[Math.min(index, candidates.length - 1)];
    if (suggestion) insertText(suggestion.insert, true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (candidates.length > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % candidates.length);
      return;
    }
    if (candidates.length > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((index) => (index + candidates.length - 1) % candidates.length);
      return;
    }
    if (candidates.length > 0 && (event.key === "Tab" || event.key === "Enter")) {
      event.preventDefault();
      acceptSuggestion();
      return;
    }
    if (event.key === "Escape" && candidates.length > 0) {
      event.preventDefault();
      const word = value.slice(0, event.currentTarget.selectionStart).match(/[A-Za-z_][\w-]*$/)?.[0] ?? "";
      setDismissedPrefix(word || "$context");
      return;
    }
    if ([")", "}", "]", "'", '"'].includes(event.key) && event.currentTarget.value[event.currentTarget.selectionStart] === event.key) {
      event.preventDefault();
      const editor = event.currentTarget;
      editor.setSelectionRange(editor.selectionStart + 1, editor.selectionStart + 1);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      onChange(`${value.slice(0, start)}  ${value.slice(end)}`);
      setCursor(start + 2);
      requestAnimationFrame(() => editor.setSelectionRange(start + 2, start + 2));
      return;
    }
    if (["(", "{", "[", "'", '"'].includes(event.key)) {
      const close = ({ "(": ")", "{": "}", "[": "]", "'": "'", '"': '"' } as Record<string, string>)[event.key];
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      event.preventDefault();
      const next = `${value.slice(0, start)}${event.key}${value.slice(start, end)}${close}${value.slice(end)}`;
      onChange(next);
      setCursor(start + 1);
      requestAnimationFrame(() => {
        editor.setSelectionRange(start + 1, start + 1);
      });
      return;
    }
    if (event.key === "Enter") {
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const indent = value.slice(lineStart, start).match(/^\s*/)?.[0] ?? "";
      if (indent) {
        event.preventDefault();
        insertText(`\n${indent}`, false);
      }
    }
  }

  const suggestionsId = `code-suggestions-${language}`;
  const showSuggestions = candidates.length > 0;
  return (
    <div className={`code-input${disabled ? " code-input--disabled" : ""}`}>
      <pre aria-hidden="true" className="code-input__highlight">{highlightCode(value, language)}<br /></pre>
      <textarea
        ref={editorRef}
        aria-activedescendant={showSuggestions ? `${suggestionsId}-option-${activeSuggestion}` : undefined}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? suggestionsId : undefined}
        aria-expanded={showSuggestions}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        disabled={disabled}
        onChange={(event) => {
          setActiveSuggestion(0);
          setDismissedPrefix("");
          setCursor(event.currentTarget.selectionStart);
          onChange(event.target.value);
        }}
        onClick={(event) => setCursor(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
        onScroll={(event) => {
          const highlight = event.currentTarget.parentElement?.querySelector<HTMLElement>(".code-input__highlight");
          if (highlight) {
            highlight.scrollTop = event.currentTarget.scrollTop;
            highlight.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
        spellCheck={false}
        value={value}
      />
      {showSuggestions && (
        <ul className="code-input__suggestions" id={suggestionsId} role="listbox" aria-label="Code suggestions">
          {candidates.map((suggestion, index) => (
            <li id={`${suggestionsId}-option-${index}`} key={`${suggestion.insert}:${index}`} role="option" aria-selected={index === activeSuggestion}>
              <button
                onMouseDown={(event) => { event.preventDefault(); acceptSuggestion(index); }}
                tabIndex={-1}
                type="button"
              >
                <code>{suggestion.signature ?? suggestion.insert.split("\n")[0]}</code><span>{suggestion.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
