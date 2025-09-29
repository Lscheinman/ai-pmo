// components/DateField.jsx
import React from "react";
import DatePicker from "./DatePicker"; // the one we built (portal-based)
import { CalendarIcon } from "../icons"; 

const toISO = (d) => {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const parseISO = (s) => {
  if (!s) return null;
  // Accept YYYY-MM-DD (native date input style)
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

export default function DateField({
  label,
  name,
  value,                  // string "YYYY-MM-DD" | "" | null
  onChange,               // (e) => void  (your existing handleChange)
  min,                    // string "YYYY-MM-DD"
  max,                    // string "YYYY-MM-DD"
  weekStartsOn = 1,
  locale = "en-US",
  style,
  className
}) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);

  const selectedDate = React.useMemo(() => parseISO(value), [value]);
  const minDate = React.useMemo(() => parseISO(min), [min]);
  const maxDate = React.useMemo(() => parseISO(max), [max]);

  // Call parent with a synthetic event (so existing handleChange keeps working)
  const emit = (iso) => {
    const e = {
      target: { name, value: iso },
      currentTarget: { name, value: iso },
      type: "change",
    };
    onChange?.(e);
  };

  return (
    <div className={`field-date ${className || ""}`} style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && <div className="field-date__label">{label}</div>}

      <div ref={anchorRef} className="field-date__control" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
        {/* Read-only text input that mirrors your form value */}
        <input
          type="text"
          name={name}
          value={value || ""}
          onChange={(e) => emit(e.target.value)}  // still allows manual typing if you want
          onFocus={() => setOpen(true)}
          placeholder="YYYY-MM-DD"
          className="field-date__input"
          readOnly      // toggle to false if you want manual typing
        />

        <button
          type="button"
          className="field-date__btn"
          aria-label="Pick date"
          onMouseDown={(e) => e.preventDefault()} // prevent focus-loss flicker
          onClick={() => setOpen((v) => !v)}
          title="Pick date"
        >
          <CalendarIcon />
        </button>

        <DatePicker
          open={open}
          anchorRef={anchorRef}
          value={selectedDate}
          minDate={minDate}
          maxDate={maxDate}
          weekStartsOn={weekStartsOn}
          locale={locale}
          onChange={(d) => {
            emit(toISO(d));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
