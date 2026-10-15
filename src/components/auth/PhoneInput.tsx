import { useLayoutEffect, useRef, type ChangeEvent, type ClipboardEvent } from "react";
import Input, { type InputProps } from "../Input";
import { FormatterHelper } from "../../helpers/FormatterHelper";

type PhoneInputProps = Omit<InputProps, "type" | "inputMode" | "maxLength" | "value" | "onChange" | "onPaste"> & {
  value: string;
  onChange: (value: string) => void;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");

function caretAfterDigits(value: string, count: number): number {
  if (count === 0) return value ? 1 : 0;
  let seen = 0;
  for (let index = 0; index < value.length; index++) {
    if (/[0-9]/.test(value[index]) && ++seen === count) return index + 1;
  }
  return value.length;
}

export default function PhoneInput({ value, onChange, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (nextCaret.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(nextCaret.current, nextCaret.current);
    nextCaret.current = null;
  });

  function update(digits: string, caretDigits: number) {
    const formatted = FormatterHelper.formatMobilePhone(digits);
    nextCaret.current = caretAfterDigits(formatted, Math.min(caretDigits, 11));
    onChange(formatted);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    let digits = digitsOnly(raw);
    let caretDigits = digitsOnly(raw.slice(0, caret)).length;
    const inputType = (event.nativeEvent as InputEvent).inputType;

    // Deleting mask punctuation removes the adjacent digit instead of restoring
    // the punctuation and leaving the user stuck at the same cursor position.
    if (digits === digitsOnly(value) && inputType?.startsWith("deleteContent")) {
      const backward = inputType === "deleteContentBackward";
      const digitIndex = backward ? caretDigits - 1 : caretDigits;
      if (digitIndex >= 0 && digitIndex < digits.length) {
        digits = digits.slice(0, digitIndex) + digits.slice(digitIndex + 1);
        if (backward) caretDigits--;
      }
    }
    update(digits, caretDigits);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const before = digitsOnly(value.slice(0, start));
    const after = digitsOnly(value.slice(end));
    const pasted = digitsOnly(event.clipboardData.getData("text"));
    update(before + pasted + after, before.length + pasted.length);
  }

  return (
    <Input {...props} ref={inputRef} type="tel" inputMode="numeric" maxLength={15}
      value={value} onChange={handleChange} onPaste={handlePaste} />
  );
}
