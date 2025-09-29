import React from "react";
import DateField from "./DateField";

const ymd = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export default function DateRange({
  // names match your form keys so existing handleChange works
  startName = "start_date",
  endName   = "end_date",
  startValue = "",          // "YYYY-MM-DD" | ""
  endValue   = "",          // "YYYY-MM-DD" | ""
  onChange,                 // your existing handleChange(e)
  min,                      // optional global min (YYYY-MM-DD)
  max,                      // optional global max (YYYY-MM-DD)
  weekStartsOn = 1,
  locale = "en-US",
  labels = { start: "Start Date", end: "End Date" },
  style,
  className,
  layout = { gap: 16 }      // small layout hook
}) {
  const emit = (name, value) => {
    const e = {
      target: { name, value },
      currentTarget: { name, value },
      type: "change",
    };
    onChange?.(e);
  };

  const onStartChange = (e) => {
    const nextStart = e.target.value || "";
    emit(startName, nextStart);

    // If current end is before the new start, snap end up to start
    if (endValue && nextStart && ymd(endValue) < ymd(nextStart)) {
      emit(endName, nextStart);
    }
  };

  const onEndChange = (e) => {
    let nextEnd = e.target.value || "";
    // Enforce end ≥ start if start exists
    if (startValue && nextEnd && ymd(nextEnd) < ymd(startValue)) {
      nextEnd = startValue;
    }
    emit(endName, nextEnd);
  };

  return (
    <div
      className={className}
      style={{ display: "flex", gap: layout.gap, margin: "12px 0", ...style }}
    >
      <label style={{ flex: 1 }}>
        <DateField
          label={labels.start}
          name={startName}
          value={startValue || ""}
          onChange={onStartChange}
          min={min}
          max={endValue || max}      // optional: keep start ≤ end
          weekStartsOn={weekStartsOn}
          locale={locale}
        />
      </label>

      <label style={{ flex: 1 }}>
        <DateField
          label={labels.end}
          name={endName}
          value={endValue || ""}
          onChange={onEndChange}
          min={startValue || min}     // key: end can’t be before start
          max={max}
          weekStartsOn={weekStartsOn}
          locale={locale}
        />
      </label>
    </div>
  );
}
