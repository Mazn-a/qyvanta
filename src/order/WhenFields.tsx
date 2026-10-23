import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDate, readCalendar, writeCalendar, type CalendarKind } from "../format";
import { useLang } from "../i18n";

const hijriPartsFormat = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function hijriParts(date: Date) {
  const bag = Object.fromEntries(hijriPartsFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(bag.year), month: Number(bag.month), day: Number(bag.day) };
}

function startOfHijriMonth(date: Date) {
  const { day } = hijriParts(date);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - (day - 1));
}

function shiftHijriMonth(date: Date, delta: number) {
  const start = startOfHijriMonth(date);
  const probe = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (delta > 0 ? 32 : -1));
  return startOfHijriMonth(probe);
}

function parseISO(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toISO(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function DateField({
  value,
  min,
  onChange,
}: {
  value: string;
  min: string;
  onChange: (value: string) => void;
}) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const faceRef = useRef<HTMLButtonElement>(null);
  const [calendar, setCalendar] = useState<CalendarKind>(() => readCalendar());
  const root = useRef<HTMLDivElement>(null);
  const selected = parseISO(value);
  const minimum = parseISO(min) ?? new Date();
  const [cursor, setCursor] = useState(() => selected ?? minimum);
  const language = lang === "en" ? "en" : "ar-SA";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const days = useMemo(() => {
    if (calendar === "islamic-umalqura") {
      const start = startOfHijriMonth(cursor);
      const origin = hijriParts(start);
      const cells: Array<Date | null> = Array.from({ length: start.getDay() }, () => null);
      for (let index = 0; index < 30; index += 1) {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const parts = hijriParts(day);
        if (parts.year !== origin.year || parts.month !== origin.month) break;
        cells.push(day);
      }
      return cells;
    }
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const count = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
    for (let day = 1; day <= count; day += 1) cells.push(new Date(year, month, day));
    return cells;
  }, [calendar, cursor]);

  const weekdays = useMemo(() => {
    const start = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(`${language}-u-nu-latn`, { weekday: "narrow" }).format(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)),
    );
  }, [language]);

  const monthLabel = new Intl.DateTimeFormat(`${language}-u-ca-${calendar}-nu-latn`, { month: "long", year: "numeric" }).format(
    calendar === "islamic-umalqura" ? startOfHijriMonth(cursor) : cursor,
  );

  function chooseCalendar(next: CalendarKind) {
    writeCalendar(next);
    setCalendar(next);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      faceRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function moveMonth(delta: number) {
    setCursor(calendar === "islamic-umalqura" ? shiftHijriMonth(cursor, delta) : new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  return (
    <div className="picker" ref={root}>
      <button
        ref={faceRef}
        type="button"
        className="picker-face"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setCursor(selected ?? minimum);
          setOpen((current) => !current);
        }}
      >
        <span className={value ? "picker-text" : "picker-text is-empty"}>{value ? formatDate(value, calendar) : t("details.datePh")}</span>
      </button>
      {open ? (
        <div className="picker-pop" role="dialog" aria-label={t("details.date")}>
          <div className="cal-mode" role="group" aria-label="نوع التقويم">
            <button type="button" className={calendar === "gregory" ? "on" : ""} aria-pressed={calendar === "gregory"} onClick={() => chooseCalendar("gregory")}>
              ميلادي
            </button>
            <button type="button" className={calendar === "islamic-umalqura" ? "on" : ""} aria-pressed={calendar === "islamic-umalqura"} onClick={() => chooseCalendar("islamic-umalqura")}>
              هجري
            </button>
          </div>
          <div className="cal-head">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="الشهر السابق">
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="الشهر التالي">
              ›
            </button>
          </div>
          <div className="cal-grid">
            {weekdays.map((day) => (
              <span key={day} className="cal-weekday">
                {day}
              </span>
            ))}
            {days.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} />;
              const iso = toISO(day);
              const disabled = iso < min;
              return (
                <button
                  key={iso}
                  type="button"
                  className={iso === value ? "on" : ""}
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {calendar === "islamic-umalqura" ? String(hijriParts(day).day) : String(day.getDate())}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function splitClock(value: string, fallback = "12:00") {
  const rawValue = /^\d{2}:\d{2}$/.test(value) ? value : fallback;
  const raw = Number(rawValue.slice(0, 2));
  const minute = Number(rawValue.slice(3));
  const period = raw >= 12 ? ("pm" as const) : ("am" as const);
  const hour = raw % 12 || 12;
  return { hour, minute, period };
}

function joinClock(hour: number, minute: number, period: "am" | "pm") {
  let next = hour % 12;
  if (period === "pm") next += 12;
  return `${String(next).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutesOf(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3));
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function inWindow(value: string, min: string, max: string) {
  const point = minutesOf(value);
  const start = minutesOf(min);
  const end = minutesOf(max);
  return point != null && start != null && end != null && point >= start && point <= end;
}

function windowAllows(
  min: string,
  max: string,
  test: (hour: number, minute: number, period: "am" | "pm") => boolean,
) {
  for (const period of ["am", "pm"] as const) {
    for (let hour = 1; hour <= 12; hour += 1) {
      for (const minute of [0, 30]) {
        if (test(hour, minute, period) && inWindow(joinClock(hour, minute, period), min, max)) return true;
      }
    }
  }
  return false;
}

export function TimeField({
  value,
  onChange,
  min = "00:00",
  max = "23:30",
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLButtonElement>(null);
  const clock = splitClock(value, min);
  const minute = clock.minute === 30 ? 30 : clock.minute === 0 && value ? 0 : value ? (clock.minute >= 30 ? 30 : 0) : clock.minute;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      faceRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function setPart(part: Partial<typeof clock>) {
    const next = { ...clock, minute: value ? minute : 0, ...part };
    const candidates = [
      joinClock(next.hour, next.minute, next.period),
      joinClock(next.hour, next.minute === 0 ? 30 : 0, next.period),
      joinClock(next.hour, next.minute, next.period === "am" ? "pm" : "am"),
      joinClock(next.hour, next.minute === 0 ? 30 : 0, next.period === "am" ? "pm" : "am"),
    ];
    const allowed = candidates.find((item) => inWindow(item, min, max));
    if (allowed) onChange(allowed);
  }

  return (
    <div className="picker" ref={root}>
      <button ref={faceRef} type="button" className="picker-face" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)}>
        <span className={value ? "picker-text" : "picker-text is-empty"}>{value ? formatClock(value) : t("details.timePh")}</span>
      </button>
      {open ? (
        <div className="picker-pop time-pop" role="dialog" aria-label={t("details.time")}>
          <div>
            <span className="time-label">{lang === "en" ? "Hour" : "الساعة"}</span>
            <div className="hour-grid" role="group" aria-label={lang === "en" ? "Hour" : "الساعة"}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => {
                const enabled = windowAllows(min, max, (nextHour) => nextHour === hour);
                return (
                  <button
                    key={hour}
                    type="button"
                    className={value && clock.hour === hour ? "on" : ""}
                    aria-pressed={Boolean(value) && clock.hour === hour}
                    disabled={!enabled}
                    onClick={() => setPart({ hour, minute: value ? minute : 0 })}
                  >
                    {hour}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="time-label">{lang === "en" ? "Minute" : "الدقيقة"}</span>
            <div className="minute-choice" role="group" aria-label={lang === "en" ? "Minute" : "الدقيقة"}>
              {[0, 30].map((option) => {
                const enabled = inWindow(joinClock(clock.hour, option, clock.period), min, max);
                return (
                  <button
                    key={option}
                    type="button"
                    className={value && minute === option ? "on" : ""}
                    aria-pressed={Boolean(value) && minute === option}
                    disabled={!enabled}
                    onClick={() => setPart({ minute: option })}
                  >
                    {String(option).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="period" role="group" aria-label={lang === "en" ? "Period" : "صباحًا أو مساءً"}>
            {(["am", "pm"] as const).map((period) => {
              const enabled = windowAllows(min, max, (_hour, _minute, nextPeriod) => nextPeriod === period);
              return (
                <button
                  key={period}
                  type="button"
                  className={value && clock.period === period ? "on" : ""}
                  aria-pressed={Boolean(value) && clock.period === period}
                  disabled={!enabled}
                  onClick={() => setPart({ period, minute: value ? minute : 0 })}
                >
                  {lang === "en" ? period.toUpperCase() : period === "am" ? "ص" : "م"}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
