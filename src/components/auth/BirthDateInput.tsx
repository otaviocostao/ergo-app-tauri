import { useEffect, useId, useRef, useState, type FocusEventHandler, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import Input from "../Input";
import CalendarSelect from "./CalendarSelect";
import { authFieldStyles } from "./authStyles";
import { birthDateBounds, dateValue, parseBirthDate } from "../../auth/birthDatePolicy";

interface BirthDateInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  error?: string;
  disabled?: boolean;
}

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fullDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });

function dateAt(year: number, month: number, day: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month, day);
  return date;
}

export default function BirthDateInput({ value, onChange, onBlur, error, disabled = false }: BirthDateInputProps) {
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const today = new Date();
  const { earliest, latest } = birthDateBounds(today);
  const earliestValue = dateValue(earliest);
  const latestValue = dateValue(latest);
  const selected = parseBirthDate(value);
  const initial = selected && dateValue(selected) >= earliestValue && dateValue(selected) <= latestValue ? selected : latest;
  const [view, setView] = useState(() => dateAt(initial.getFullYear(), initial.getMonth(), 1));
  const [activeDay, setActiveDay] = useState(initial.getDate());
  const year = view.getFullYear();
  const month = view.getMonth();
  const dayCount = dateAt(year, month + 1, 0).getDate();
  const firstWeekday = view.getDay();
  const years = Array.from({ length: latest.getFullYear() - earliest.getFullYear() + 1 }, (_, index) => latest.getFullYear() - index);
  const canGoBack = year > earliest.getFullYear() || month > earliest.getMonth();
  const canGoForward = year < latest.getFullYear() || month < latest.getMonth();

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function focusDay(day: number) {
    requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
    });
  }

  function toggleCalendar() {
    if (open) { setOpen(false); return; }
    setView(dateAt(initial.getFullYear(), initial.getMonth(), 1));
    setActiveDay(initial.getDate());
    setOpen(true);
    focusDay(initial.getDate());
  }

  function closeCalendar() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function changeMonth(nextYear: number, nextMonth: number, day = activeDay) {
    let next = dateAt(nextYear, nextMonth, 1);
    const nextDay = dateAt(next.getFullYear(), next.getMonth(), Math.min(day, dateAt(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    if (dateValue(nextDay) < earliestValue) next = earliest;
    else if (dateValue(nextDay) > latestValue) next = latest;
    else next = nextDay;
    setView(dateAt(next.getFullYear(), next.getMonth(), 1));
    setActiveDay(next.getDate());
    return next;
  }

  function navigateDays(event: KeyboardEvent<HTMLButtonElement>, day: number) {
    const date = dateAt(year, month, day);
    let next: Date;
    switch (event.key) {
      case "ArrowLeft": next = dateAt(year, month, day - 1); break;
      case "ArrowRight": next = dateAt(year, month, day + 1); break;
      case "ArrowUp": next = dateAt(year, month, day - 7); break;
      case "ArrowDown": next = dateAt(year, month, day + 7); break;
      case "Home": next = dateAt(year, month, day - date.getDay()); break;
      case "End": next = dateAt(year, month, day + 6 - date.getDay()); break;
      case "PageUp":
      case "PageDown": {
        const nextMonth = month + (event.key === "PageUp" ? -1 : 1);
        next = dateAt(year, nextMonth, Math.min(day, dateAt(year, nextMonth + 1, 0).getDate()));
        break;
      }
      default: return;
    }
    event.preventDefault();
    const destination = changeMonth(next.getFullYear(), next.getMonth(), next.getDate());
    focusDay(destination.getDate());
  }

  return (
    <div ref={containerRef} className="relative w-full" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCalendar(); }
    }}>
      <Input ref={inputRef} name="birthDate" label="Data de nascimento" type="date" lang="pt-BR" autoComplete="bday"
        value={selected ? dateValue(selected) : ""} min={earliestValue} max={latestValue}
        onChange={(event) => onChange(event.target.value)} onBlur={onBlur}
        onInput={(event) => onChange(event.currentTarget.value)}
        error={error} disabled={disabled}
        {...authFieldStyles}
        inputClassName={`${authFieldStyles.inputClassName} pr-14! [&::-webkit-calendar-picker-indicator]:hidden`}
        rightIcon={
          <button ref={triggerRef} type="button" disabled={disabled} onClick={toggleCalendar}
            aria-label="Escolher data de nascimento no calendário" aria-haspopup="dialog" aria-expanded={open}
            aria-controls={open ? calendarId : undefined}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary-50 px-2.5 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-100 dark:bg-primary-950/50 dark:text-primary-200 dark:hover:bg-primary-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-50">
            <CalendarDays size={16} aria-hidden="true" />
          </button>
        } />
      {open && !disabled && (
        <div id={calendarId} role="dialog" aria-label="Escolher data de nascimento"
          className="absolute left-0 top-full z-30 mt-2 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Selecione sua data de nascimento</p>
            <button type="button" onClick={closeCalendar} aria-label="Fechar calendário"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-primary-600">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <button type="button" onClick={() => { if (canGoBack) changeMonth(year, month - 1); }} aria-disabled={!canGoBack}
              aria-label="Mês anterior" className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-primary-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-30">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <CalendarSelect label="Mês de nascimento" value={month} onChange={(value) => changeMonth(year, value)}
              className="flex-1" options={months.map((label, index) => ({ value: index, label, disabled: (year === earliest.getFullYear() && index < earliest.getMonth()) || (year === latest.getFullYear() && index > latest.getMonth()) }))} />
            <CalendarSelect label="Ano de nascimento" value={year} onChange={(value) => changeMonth(value, month)}
              className="w-22 shrink-0" options={years.map((option) => ({ value: option, label: String(option) }))} />
            <button type="button" onClick={() => { if (canGoForward) changeMonth(year, month + 1); }} aria-disabled={!canGoForward}
              aria-label="Próximo mês" className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-primary-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-30">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="sr-only" aria-live="polite">{months[month]} de {year}</p>
          <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-slate-500 dark:text-slate-400" aria-hidden="true">
            {weekdays.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Dias de ${months[month]} de ${year}`}>
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} aria-hidden="true" />)}
            {Array.from({ length: dayCount }, (_, index) => {
              const day = index + 1;
              const date = dateAt(year, month, day);
              const iso = dateValue(date);
              const isSelected = selected ? iso === dateValue(selected) : false;
              return <button key={day} type="button" data-day={day} disabled={iso < earliestValue || iso > latestValue}
                tabIndex={day === activeDay ? 0 : -1} aria-label={fullDate.format(date)} aria-pressed={isSelected}
                onFocus={() => setActiveDay(day)}
                onKeyDown={(event) => navigateDays(event, day)}
                onClick={() => { onChange(iso); setOpen(false); inputRef.current?.focus(); }}
                className={`flex h-9 items-center justify-center rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-slate-600 ${isSelected ? "bg-primary-700 font-semibold text-white hover:bg-primary-800 dark:bg-primary-500 dark:text-slate-950 dark:hover:bg-primary-400" : "text-slate-700 hover:bg-primary-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                {day}
              </button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
