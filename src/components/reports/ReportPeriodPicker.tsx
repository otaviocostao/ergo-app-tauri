import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import CalendarSelect from "../auth/CalendarSelect";
import { addDays, dateKey, formatDate, parseDate, periodBounds, type ReportPeriod } from "../../data/reports";

interface ReportPeriodPickerProps {
  period: ReportPeriod;
  value: string;
  onChange: (value: string) => void;
}

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const periodNames = { day: "dia", week: "semana", month: "mês" };
const fullDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });
const iconButtonClass = "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-default disabled:opacity-30";

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function periodLabel(period: ReportPeriod, value: string) {
  if (period === "day") return formatDate(value, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (period === "month") {
    const date = parseDate(value);
    return `${months[date.getMonth()]} de ${date.getFullYear()}`;
  }
  const { start, end } = periodBounds("week", value);
  const first = formatDate(dateKey(start), {
    day: "2-digit", month: "2-digit",
    ...(start.getFullYear() !== end.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${first} – ${formatDate(dateKey(end), { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

export default function ReportPeriodPicker({ period, value, onChange }: ReportPeriodPickerProps) {
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthStart(parseDate(value)));
  const [activeDate, setActiveDate] = useState(value);
  const [popupLayout, setPopupLayout] = useState({ maxHeight: 480, offset: 0 });
  const today = dateKey(new Date());
  const current = parseDate(today);
  const selected = periodBounds(period, value);
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstYear = Math.min(current.getFullYear() - 20, parseDate(value).getFullYear(), year);
  const years = Array.from({ length: current.getFullYear() - firstYear + 1 }, (_, index) => current.getFullYear() - index);
  const firstDay = addDays(view, -((view.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(firstDay, index));
  const label = periodLabel(period, value);

  useEffect(() => { setOpen(false); }, [period, value]);

  useLayoutEffect(() => {
    if (!open) return;
    const updateLayout = () => {
      if (!triggerRef.current || !popupRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const bounds = containerRef.current?.closest("main")?.getBoundingClientRect();
      const top = Math.max(8, (bounds?.top ?? 0) + 8);
      const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - 8;
      const maxHeight = bottom - top;
      const preferredTop = trigger.bottom + 8;
      const popupTop = Math.max(top, Math.min(preferredTop, bottom - popupRef.current.getBoundingClientRect().height));
      const offset = popupTop - preferredTop;
      setPopupLayout((previous) => previous.maxHeight === maxHeight && previous.offset === offset
        ? previous : { maxHeight, offset });
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [open, period, view, popupLayout.maxHeight]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [open]);

  function focusDate(date: Date) {
    requestAnimationFrame(() => {
      const selector = period === "month"
        ? `[data-calendar-month="${date.getMonth()}"]`
        : `[data-calendar-date="${dateKey(date)}"]`;
      const button = containerRef.current?.querySelector<HTMLButtonElement>(selector);
      button?.focus({ preventScroll: true });
      const scrollArea = containerRef.current?.querySelector<HTMLElement>("[data-calendar-scroll]");
      if (button && scrollArea) {
        const buttonBounds = button.getBoundingClientRect();
        const scrollBounds = scrollArea.getBoundingClientRect();
        if (buttonBounds.bottom > scrollBounds.bottom) scrollArea.scrollTop += buttonBounds.bottom - scrollBounds.bottom;
        else if (buttonBounds.top < scrollBounds.top + 24) scrollArea.scrollTop -= scrollBounds.top + 24 - buttonBounds.top;
      }
    });
  }

  function toggleCalendar() {
    if (open) { setOpen(false); return; }
    const date = parseDate(value);
    setView(monthStart(date));
    setActiveDate(value);
    setOpen(true);
    focusDate(date);
  }

  function closeCalendar() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function choose(date: Date) {
    if (dateKey(date) > today) return;
    onChange(dateKey(periodBounds(period, dateKey(date)).start));
    closeCalendar();
  }

  function changeView(nextYear: number, nextMonth: number) {
    const next = new Date(nextYear, nextMonth, 1, 12);
    if (next.getFullYear() < 100 || dateKey(next) > today) return;
    setView(next);
    setActiveDate(dateKey(next));
  }

  function moveFocus(date: Date) {
    if (date.getFullYear() < 100 || dateKey(date) > today) return;
    setView(monthStart(date));
    setActiveDate(dateKey(date));
    focusDate(date);
  }

  function navigateDays(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    let next: Date;
    switch (event.key) {
      case "ArrowLeft": next = addDays(date, -1); break;
      case "ArrowRight": next = addDays(date, 1); break;
      case "ArrowUp": next = addDays(date, -7); break;
      case "ArrowDown": next = addDays(date, 7); break;
      case "Home": next = periodBounds("week", dateKey(date)).start; break;
      case "End": {
        const end = periodBounds("week", dateKey(date)).end;
        next = dateKey(end) > today ? current : end;
        break;
      }
      case "PageUp":
      case "PageDown": {
        const nextMonth = date.getMonth() + (event.key === "PageUp" ? -1 : 1);
        const lastDay = new Date(date.getFullYear(), nextMonth + 1, 0, 12).getDate();
        next = new Date(date.getFullYear(), nextMonth, Math.min(date.getDate(), lastDay), 12);
        break;
      }
      default: return;
    }
    event.preventDefault();
    moveFocus(next);
  }

  function navigateMonths(event: KeyboardEvent<HTMLButtonElement>, monthIndex: number) {
    let next: Date;
    switch (event.key) {
      case "ArrowLeft": next = new Date(year, monthIndex - 1, 1, 12); break;
      case "ArrowRight": next = new Date(year, monthIndex + 1, 1, 12); break;
      case "ArrowUp": next = new Date(year, monthIndex - 3, 1, 12); break;
      case "ArrowDown": next = new Date(year, monthIndex + 3, 1, 12); break;
      case "Home": next = new Date(year, 0, 1, 12); break;
      case "End": next = new Date(year, year === current.getFullYear() ? current.getMonth() : 11, 1, 12); break;
      case "PageUp": next = new Date(year - 1, monthIndex, 1, 12); break;
      case "PageDown": next = new Date(year + 1, monthIndex, 1, 12); break;
      default: return;
    }
    event.preventDefault();
    moveFocus(next);
  }

  return <div ref={containerRef} className="relative min-w-0" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      requestAnimationFrame(() => {
        if (!containerRef.current?.contains(document.activeElement)) setOpen(false);
      });
    }
  }} onKeyDown={(event) => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCalendar(); }
  }}>
    <button ref={triggerRef} type="button" onClick={toggleCalendar}
      aria-label={`Selecionar ${periodNames[period]} do relatório: ${label}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? calendarId : undefined}
      className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${open ? "border-primary-200 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-700 hover:border-primary-200 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>
      <CalendarDays size={16} className="shrink-0 text-primary-600" aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
    {open && <div ref={popupRef} id={calendarId} role="dialog" aria-label={`Selecionar ${periodNames[period]} do relatório`}
      style={{ maxHeight: popupLayout.maxHeight, transform: `translateY(${popupLayout.offset}px)` }}
      className="absolute right-0 top-full z-30 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl [color-scheme:light]">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold">Selecione {period === "week" ? "a semana" : period === "month" ? "o mês" : "o dia"}</p>
        <button type="button" onClick={closeCalendar} aria-label="Fechar calendário" className={iconButtonClass}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <button type="button" aria-label={period === "month" ? "Ano anterior no calendário" : "Mês anterior no calendário"}
          disabled={year <= 100 && (period === "month" || month === 0)}
          onClick={() => changeView(period === "month" ? year - 1 : year, period === "month" ? 0 : month - 1)} className={iconButtonClass}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        {period !== "month" && <CalendarSelect label="Mês do calendário" value={month}
          onChange={(nextMonth) => changeView(year, nextMonth)} className="flex-1"
          options={months.map((label, index) => ({ value: index, label, disabled: year === current.getFullYear() && index > current.getMonth() }))} />}
        <CalendarSelect label="Ano do calendário" value={year}
          onChange={(nextYear) => changeView(nextYear, Math.min(month, nextYear === current.getFullYear() ? current.getMonth() : 11))}
          className={period === "month" ? "flex-1" : "w-22 shrink-0"}
          options={years.map((option) => ({ value: option, label: String(option) }))} />
        <button type="button" aria-label={period === "month" ? "Próximo ano no calendário" : "Próximo mês no calendário"}
          disabled={period === "month" ? year >= current.getFullYear() : dateKey(new Date(year, month + 1, 1, 12)) > today}
          onClick={() => changeView(period === "month" ? year + 1 : year, period === "month" ? 0 : month + 1)} className={iconButtonClass}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{period === "month" ? year : `${months[month]} de ${year}`}</p>
      <div data-calendar-scroll className="min-h-0 overflow-y-auto overscroll-contain">
      {period === "month" ? <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Meses de ${year}`}>
        {months.map((name, index) => {
          const date = new Date(year, index, 1, 12);
          const isSelected = year === selected.start.getFullYear() && index === selected.start.getMonth();
          return <button key={name} type="button" data-calendar-month={index}
            aria-label={`${name} de ${year}`} aria-pressed={isSelected} disabled={dateKey(date) > today}
            tabIndex={index === parseDate(activeDate).getMonth() ? 0 : -1}
            onFocus={() => setActiveDate(dateKey(date))} onKeyDown={(event) => navigateMonths(event, index)} onClick={() => choose(date)}
            className={`h-11 cursor-pointer rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:text-slate-300 ${isSelected ? "bg-primary-700 font-semibold text-white hover:bg-primary-800" : "text-slate-700 hover:bg-primary-50"}`}>
            {name.slice(0, 3)}
          </button>;
        })}
      </div> : <>
        <div className="sticky top-0 z-10 mb-1 grid grid-cols-7 bg-white text-center text-xs font-medium text-slate-500" aria-hidden="true">
          {weekdays.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
        </div>
        <div className={`grid grid-cols-7 ${period === "week" ? "gap-y-1" : "gap-1"}`} role="group" aria-label={`Dias de ${months[month]} de ${year}`}>
          {days.map((date) => {
            const iso = dateKey(date);
            const isSelected = iso >= dateKey(selected.start) && iso <= dateKey(selected.end);
            const selectionClass = period === "week"
              ? `bg-primary-50 font-semibold text-primary-800 ${date.getDay() === 1 ? "rounded-l-lg" : date.getDay() === 0 ? "rounded-r-lg" : ""}`
              : "rounded-lg bg-primary-700 font-semibold text-white hover:bg-primary-800";
            return <button key={iso} type="button" data-calendar-date={iso}
              aria-label={period === "week" ? `Selecionar semana ${periodLabel("week", iso)}` : fullDate.format(date)}
              aria-pressed={isSelected} aria-current={iso === today ? "date" : undefined} disabled={iso > today}
              tabIndex={iso === activeDate ? 0 : -1} onFocus={() => setActiveDate(iso)}
              onKeyDown={(event) => navigateDays(event, date)} onClick={() => choose(date)}
              className={`flex h-9 cursor-pointer items-center justify-center text-sm transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:text-slate-300 ${isSelected ? selectionClass : `rounded-lg hover:bg-primary-50 ${date.getMonth() === month ? "text-slate-700" : "text-slate-400"}`} ${iso === today && !isSelected ? "ring-1 ring-inset ring-primary-200 font-semibold" : ""}`}>
              {date.getDate()}
            </button>;
          })}
        </div>
        {period === "week" && <p className="mt-3 text-xs leading-relaxed text-slate-500">Selecione um dia para consultar a semana inteira, de segunda a domingo.</p>}
      </>}
      </div>
    </div>}
  </div>;
}
