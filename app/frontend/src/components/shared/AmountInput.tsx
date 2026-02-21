"use client";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  currency?: string;
  max?: string;
  disabled?: boolean;
  error?: string;
}

export function AmountInput({
  value,
  onChange,
  label,
  currency,
  max,
  disabled,
  error,
}: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) {
      onChange(v);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm text-gray-400">{label}</label>
        {max && (
          <button
            type="button"
            onClick={() => onChange(max)}
            className="text-xs font-medium text-accent-blue hover:underline"
            disabled={disabled}
          >
            Max: {max}
          </button>
        )}
      </div>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder="0.00"
          className={`input-field pr-16 ${error ? "!border-accent-red" : ""}`}
        />
        {currency && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            {currency}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-accent-red">{error}</p>}
    </div>
  );
}
