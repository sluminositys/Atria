import { useRef, type KeyboardEvent } from "react";
import {
  advanceMathPlaceholder,
  expandMathSnippet,
  insertMathDelimiter,
  removeMathDelimiterPair,
  skipMathDelimiter,
  type MathEditResult,
} from "@atria/editor";

interface MathSourceInputProps {
  value: string;
  multiline?: boolean;
  autoFocus?: boolean;
  ariaLabel: string;
  onChange(value: string): void;
  onBlur?(): void;
  onExit?(): void;
}

export function MathSourceInput({
  value,
  multiline = false,
  autoFocus = false,
  ariaLabel,
  onChange,
  onBlur,
  onExit,
}: MathSourceInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  function apply(result: MathEditResult) {
    onChange(result.value);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const target = event.currentTarget;
    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? start;
    let result: MathEditResult | null = null;

    if (event.key === "Tab") {
      result = expandMathSnippet(value, start, end) ?? advanceMathPlaceholder(value, start);
    } else if (["(", "[", "{"].includes(event.key)) {
      result = insertMathDelimiter(value, start, end, event.key);
    } else if ([")", "]", "}"].includes(event.key) && start === end) {
      result = skipMathDelimiter(value, start, event.key);
    } else if (event.key === "Backspace" && start === end) {
      result = removeMathDelimiterPair(value, start);
    } else if (!multiline && (event.key === "Enter" || event.key === "Escape")) {
      event.preventDefault();
      onExit?.();
      return;
    }

    if (!result) return;
    event.preventDefault();
    apply(result);
  }

  const shared = {
    value,
    autoFocus,
    "aria-label": ariaLabel,
    onBlur,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown,
  };

  if (multiline) {
    return <textarea ref={(element) => { inputRef.current = element; }} rows={4} {...shared} />;
  }
  return <input ref={(element) => { inputRef.current = element; }} {...shared} />;
}
