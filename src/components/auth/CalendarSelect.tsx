import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

interface CalendarOption {
  value: number;
  label: string;
  disabled?: boolean;
}

interface CalendarSelectProps {
  label: string;
  value: number;
  options: CalendarOption[];
  onChange: (value: number) => void;
  className?: string;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function CalendarSelect({ label, value, options, onChange, className = "" }: CalendarSelectProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: "", time: 0 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const list = listRef.current;
    const option = list.children[activeIndex] as HTMLElement | undefined;
    if (option) list.scrollTop = option.offsetTop - (list.clientHeight - option.offsetHeight) / 2;
  }, [open, activeIndex]);

  function openList(index = selectedIndex) {
    searchRef.current = { text: "", time: 0 };
    setActiveIndex(index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const enabledIndices = options.flatMap((option, index) => option.disabled ? [] : [index]);
    if (!enabledIndices.length) return;
    const currentIndex = open ? activeIndex : selectedIndex;
    const currentPosition = enabledIndices.indexOf(currentIndex);

    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter" || event.key === " ") {
        if (open) choose(activeIndex); else openList();
        return;
      }
      let index = currentIndex;
      if (event.key === "Home") index = enabledIndices[0];
      else if (event.key === "End") index = enabledIndices[enabledIndices.length - 1];
      else if (open) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        index = enabledIndices[Math.max(0, Math.min(enabledIndices.length - 1, currentPosition + step))];
      }
      if (open) setActiveIndex(index); else openList(index);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const key = normalize(event.key);
      const prefix = now - searchRef.current.time < 700 ? searchRef.current.text + key : key;
      searchRef.current = { text: prefix, time: now };
      const match = options.findIndex((option) => !option.disabled && normalize(option.label).startsWith(prefix));
      if (match >= 0) {
        event.preventDefault();
        setActiveIndex(match);
        setOpen(true);
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={buttonRef} type="button" role="combobox" aria-label={label} aria-expanded={open}
        aria-haspopup="listbox" aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onClick={() => { if (open) setOpen(false); else openList(); }} onKeyDown={handleKeyDown}
        className={`flex h-9 w-full cursor-pointer items-center justify-between gap-1 rounded-lg border px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${open ? "border-primary-200 bg-primary-50 text-primary-800" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-primary-200 hover:bg-primary-50"}`}>
        <span className="truncate">{options[selectedIndex]?.label}</span>
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-primary-700 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={listRef} id={listId} role="listbox" aria-label={label}
          className="absolute left-0 top-full z-40 mt-1.5 max-h-44 w-max min-w-full max-w-48 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-primary-100 bg-white p-1 shadow-lg [scrollbar-color:var(--color-primary-200)_transparent] [scrollbar-width:thin]">
          {options.map((option, index) => (
            <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined} onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={`flex min-h-8 items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${option.disabled ? "cursor-not-allowed text-slate-300" : `cursor-pointer ${index === activeIndex ? "bg-primary-50 text-primary-800" : "text-slate-600 hover:bg-primary-50 hover:text-primary-800"}`} ${option.value === value ? "font-semibold text-primary-800" : ""}`}>
              {option.label}
              {option.value === value && <Check size={14} className="shrink-0 text-primary-700" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
