import { useState, useRef, useEffect, type ReactNode } from 'react';
import { IconChevronDown } from './Icons';

interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number;
}

export function CustomSelect({ options, value, onChange, placeholder, width = 150 }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="custom-select" ref={ref} style={{ width }}>
      <button
        className="custom-select-trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="custom-select-label">
          {selected?.icon}
          {selected?.label || placeholder || 'Select...'}
        </span>
        <IconChevronDown
          size={12}
          className={`custom-select-chevron ${open ? 'custom-select-chevron-open' : ''}`}
        />
      </button>

      {open && (
        <div className="custom-select-dropdown">
          {options.map((opt) => (
            <button
              key={opt.value}
              className="custom-select-option"
              data-selected={opt.value === value ? 'true' : undefined}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.icon && <span className="custom-select-opt-icon">{opt.icon}</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
