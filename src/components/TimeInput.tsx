import React, { useEffect } from "react";

// Generate time options in 30-minute intervals
const generateTimeOptions = () => {
  const options: string[] = [];

  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = String(h).padStart(2, "0");
      const minute = String(m).padStart(2, "0");

      options.push(`${hour}:${minute}`);
    }
  }

  return options;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

const TimeInput = ({ value, onChange, disabled }: Props) => {
  const timeOptions = generateTimeOptions();

  // Custom dropdown to control max height and placement
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = React.useState<"bottom" | "top">("bottom");

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", onDocClick);

    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = () => {
    if (disabled) return; // prevent opening when disabled
    if (!ref.current) return setOpen(!open);
    const rect = ref.current.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom;
    const availableAbove = rect.top;
    // estimate dropdown height (max 200px)
    const desired = 200;

    setPlacement(
      availableBelow < desired && availableAbove > availableBelow
        ? "top"
        : "bottom",
    );
    setOpen((v) => !v);
  };

  const handleSelect = (time: string) => {
    onChange(time);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        className={`w-full text-left border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between ${disabled ? "bg-muted/30 border-border text-muted-foreground cursor-not-allowed" : "bg-card border-border cursor-pointer"}`}
        disabled={disabled}
        type="button"
        onClick={toggle}
      >
        <span>{value}</span>
        <span className="ml-2 text-muted-foreground">▾</span>
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 bg-card border border-border rounded shadow-lg overflow-auto z-50"
          style={{
            maxHeight: 200,
            top: placement === "bottom" ? "100%" : "auto",
            bottom: placement === "top" ? "100%" : "auto",
            marginTop: placement === "bottom" ? 6 : 0,
            marginBottom: placement === "top" ? 6 : 0,
          }}
        >
          {timeOptions.map((time) => (
            <div
              key={time}
              className={`px-3 py-2 text-sm ${!disabled ? "hover:bg-muted cursor-pointer" : ""} ${time === value ? "bg-muted font-semibold" : ""}`}
              onClick={() => !disabled && handleSelect(time)}
            >
              {time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimeInput;
