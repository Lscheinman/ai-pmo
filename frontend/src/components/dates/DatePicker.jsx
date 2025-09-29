// components/DatePicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* --- tiny utils --- */
const startOfDay = d => (d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null);
const isSameDay = (a, b) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addYears  = (d, n) => new Date(d.getFullYear() + n, d.getMonth(), 1);

const inRange = (d, min, max) => (!min || d >= min) && (!max || d <= max);
const monthStart = (y, m) => new Date(y, m, 1);
const monthEnd   = (y, m) => new Date(y, m + 1, 0, 23, 59, 59, 999);
const yearStart  = (y) => new Date(y, 0, 1);
const yearEnd    = (y) => new Date(y, 11, 31, 23, 59, 59, 999);

/* fixed 6×7 day grid (42 cells), supports weekStartsOn (1 = Monday) */
function getMonthMatrix(year, month, weekStartsOn = 1) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 7 - weekStartsOn) % 7; // 0..6
  const startDay = 1 - offset;
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, startDay + i));
  return cells;
}

/** Build a 4×3 month grid: [0..11] */
function getMonthGrid() {
  const out = [];
  for (let i = 0; i < 12; i++) out.push(i);
  return out;
}

/** Build a 4×3 year grid (12-year page) centered on view year page */
function getYearPage(baseYear) {
  const pageStart = Math.floor(baseYear / 12) * 12; // group by 12s
  const years = [];
  for (let i = 0; i < 12; i++) years.push(pageStart + i);
  return { years, pageStart, pageEnd: pageStart + 11 };
}

export default function DatePicker({
  open,
  anchorRef,          // ref to a wrapper element near your button
  value,              // Date | null
  onChange,           // (Date) => void
  onClose,            // () => void
  minDate = null,     // Date | null
  maxDate = null,     // Date | null
  weekStartsOn = 1,   // 1 = Monday
  locale = "en-US",
  style = {},
  className = ""
}) {
  const panelRef = useRef(null);
  const openedAtRef = useRef(0);

  // view state
  const [viewDate, setViewDate] = useState(() => startOfDay(value) || startOfDay(new Date()));
  const [mode, setMode] = useState("day"); // 'day' | 'month' | 'year'

  useEffect(() => {
    if (value) {
      const d = startOfDay(new Date(value));
      setViewDate(d);
    }
  }, [value]);

    // reset when it closes
  useEffect(() => {
    if (!open) {
      setViewDate(startOfDay(value) || startOfDay(new Date()));
      setMode("day");
    }
  }, [open, value]);

  // position near anchor (clamped to viewport)
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 260 });
  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef?.current;
    const update = () => {
      const r = anchor?.getBoundingClientRect?.();
      if (!r) return;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const minWidth = Math.max(260, r.width);
      const leftRaw = r.left + scrollX;
      const left = Math.max(8, Math.min(leftRaw, (scrollX + window.innerWidth) - minWidth - 8));
      setPos({ top: r.bottom + scrollY + 6, left, minWidth });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  // outside click / Esc — use 'click' (capture) and ignore the opening click
  useEffect(() => { if (open) openedAtRef.current = Date.now(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (Date.now() - openedAtRef.current < 120) return; // ignore opening click
      const panelEl = panelRef.current;
      const anchorEl = anchorRef?.current;
      const t = e.target;
      if (!panelEl) return;
      if (panelEl.contains(t)) return;
      if (anchorEl && anchorEl.contains?.(t)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  // compute view data
  const today = useMemo(() => startOfDay(new Date()), []);
  const sel = useMemo(() => (value ? startOfDay(new Date(value)) : null), [value]);

  const monthCells = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    return getMonthMatrix(y, m, weekStartsOn);
  }, [viewDate, weekStartsOn]);

  const monthGrid = useMemo(() => getMonthGrid(), []);
  const yearPage = useMemo(() => getYearPage(viewDate.getFullYear()), [viewDate]);

  const weekLabels = useMemo(() => {
    const base = new Date(2023, 0, 1); // Sunday baseline
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + ((i + weekStartsOn) % 7));
      arr.push(d.toLocaleDateString(locale, { weekday: "short" }).slice(0, 2).toUpperCase());
    }
    return arr;
  }, [locale, weekStartsOn]);

  const monthName = viewDate.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const monthOnly = viewDate.toLocaleDateString(locale, { month: "long" });
  const yearOnly = viewDate.getFullYear();

  // header title clicks: climb modes
  const onTitleClick = () => {
    if (mode === "day") setMode("month");
    else if (mode === "month") setMode("year");
  };

  // header nav
  const prev = () => {
    if (mode === "day") setViewDate(addMonths(viewDate, -1));
    else if (mode === "month") setViewDate(addYears(viewDate, -1));
    else if (mode === "year") setViewDate(addYears(viewDate, -12));
  };
  const next = () => {
    if (mode === "day") setViewDate(addMonths(viewDate, +1));
    else if (mode === "month") setViewDate(addYears(viewDate, +1));
    else if (mode === "year") setViewDate(addYears(viewDate, +12));
  };

  // commit selection at any level
  const commitDay = (d) => {
    if (!d) return;
    if (!inRange(d, minDate, maxDate)) return;
    onChange?.(d);
    onClose?.();
  };
  const commitMonth = (mIdx) => {
    const y = viewDate.getFullYear();
    // If entire month out of range, block selection
    const ms = monthStart(y, mIdx);
    const me = monthEnd(y, mIdx);
    if (!inRange(ms, minDate, maxDate) && !inRange(me, minDate, maxDate)) return;
    // Jump into day mode on that month
    setViewDate(new Date(y, mIdx, 1));
    setMode("day");
  };
  const commitYear = (y) => {
    // If entire year out of range, block selection
    const ys = yearStart(y);
    const ye = yearEnd(y);
    if (!inRange(ys, minDate, maxDate) && !inRange(ye, minDate, maxDate)) return;
    // Jump into month mode on that year
    setViewDate(new Date(y, viewDate.getMonth(), 1));
    setMode("month");
  };

  if (!open) return null;

  // header title per mode
  const titleText =
    mode === "day"   ? monthName :
    mode === "month" ? String(yearOnly) :
                       `${yearPage.pageStart} – ${yearPage.pageEnd}`;

  const content = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose date"
      tabIndex={-1}
      className={`dark-date-picker ${className}`}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        minWidth: pos.minWidth,
        zIndex: 4000,
        pointerEvents: "auto",
        ...style
      }}
    >
      {/* Header */}
      <div className="dp-header">
        <button className="dp-nav" onClick={prev} aria-label="Previous">‹</button>
        <button className="dp-title as-button" onClick={onTitleClick} title="Change view">
          {titleText}
        </button>
        <button className="dp-nav" onClick={next} aria-label="Next">›</button>
      </div>

      {/* Body */}
      {mode === "day" && (
        <>
          <div className="dp-week">
            {weekLabels.map((w, i) => <div key={i} className="dp-weekday">{w}</div>)}
          </div>
          <div className="dp-grid" role="grid" aria-label={monthName}>
            {monthCells.map((d, i) => {
              const disabled = !inRange(d, minDate, maxDate);
              const selected = sel && isSameDay(d, sel);
              const todayFlag = isSameDay(d, today);
              const inThisMonth = d.getMonth() === viewDate.getMonth();
              return (
                <button
                  key={i}
                  role="gridcell"
                  className={[
                    "dp-cell",
                    inThisMonth ? "" : "muted",
                    disabled ? "disabled" : "",
                    selected ? "selected" : "",
                    todayFlag ? "today" : ""
                  ].join(" ").trim()}
                  onClick={() => !disabled && commitDay(d)}
                  disabled={disabled}
                  tabIndex={-1}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="dp-footer">
            <button className="dp-action" onClick={() => commitDay(today)}>Today</button>
            <button className="dp-action subtle" onClick={onClose}>Close</button>
          </div>
        </>
      )}

      {mode === "month" && (
        <>
          <div className="dp-grid months" role="grid" aria-label={`Months of ${yearOnly}`}>
            {monthGrid.map((mIdx) => {
              const y = viewDate.getFullYear();
              const ms = monthStart(y, mIdx);
              const me = monthEnd(y, mIdx);
              const disabled = !(
                inRange(ms, minDate, maxDate) || inRange(me, minDate, maxDate)
              );
              const isSel = sel && sel.getFullYear() === y && sel.getMonth() === mIdx;
              const label = new Date(y, mIdx, 1).toLocaleDateString(locale, { month: "short" });
              return (
                <button
                  key={mIdx}
                  className={[
                    "dp-cell",
                    "month-cell",
                    disabled ? "disabled" : "",
                    isSel ? "selected" : ""
                  ].join(" ").trim()}
                  onClick={() => !disabled && commitMonth(mIdx)}
                  disabled={disabled}
                  tabIndex={-1}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="dp-footer">
            <div className="dp-title-ghost">{monthOnly} {yearOnly}</div>
            <button className="dp-action subtle" onClick={() => setMode("day")}>Back</button>
          </div>
        </>
      )}

      {mode === "year" && (
        <>
          <div className="dp-grid years" role="grid" aria-label={`Years ${yearPage.pageStart}–${yearPage.pageEnd}`}>
            {yearPage.years.map((y) => {
              const disabled = !(
                inRange(yearStart(y), minDate, maxDate) || inRange(yearEnd(y), minDate, maxDate)
              );
              const isSel = sel && sel.getFullYear() === y;
              return (
                <button
                  key={y}
                  className={[
                    "dp-cell",
                    "year-cell",
                    disabled ? "disabled" : "",
                    isSel ? "selected" : ""
                  ].join(" ").trim()}
                  onClick={() => !disabled && commitYear(y)}
                  disabled={disabled}
                  tabIndex={-1}
                >
                  {y}
                </button>
              );
            })}
          </div>
          <div className="dp-footer">
            <div className="dp-title-ghost">{yearPage.pageStart} – {yearPage.pageEnd}</div>
            <button className="dp-action subtle" onClick={() => setMode("month")}>Back</button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
