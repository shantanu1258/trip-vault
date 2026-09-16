import type { SelectHTMLAttributes } from "react";

const preferredCurrencies = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "MYR",
  "IDR",
  "THB",
  "AUD",
  "JPY"
] as const;

const fallbackCurrencies = [
  ...preferredCurrencies,
  "BHD",
  "BRL",
  "CAD",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CZK",
  "DKK",
  "EGP",
  "GHS",
  "HKD",
  "HUF",
  "ILS",
  "ISK",
  "JOD",
  "KES",
  "KRW",
  "KWD",
  "MAD",
  "MXN",
  "NGN",
  "NOK",
  "NZD",
  "OMR",
  "PEN",
  "PHP",
  "PLN",
  "QAR",
  "RON",
  "SAR",
  "SEK",
  "TRY",
  "TZS",
  "UGX",
  "VND",
  "ZAR"
];

function supportedCurrencies() {
  const currencyIntl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    return currencyIntl.supportedValuesOf?.("currency") ?? fallbackCurrencies;
  } catch {
    return fallbackCurrencies;
  }
}

const allCurrencies = [...new Set([...preferredCurrencies, ...supportedCurrencies()])].filter(
  (code) => /^[A-Z]{3}$/.test(code)
);
const preferredSet = new Set<string>(preferredCurrencies);
const remainingCurrencies = allCurrencies.filter((code) => !preferredSet.has(code)).sort();

export function currencyLabel(code: string) {
  try {
    const name = new Intl.DisplayNames(undefined, { type: "currency" }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}

export function CurrencySelect({
  className = "form-input",
  defaultValue,
  value,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  const selectedCode =
    typeof value === "string"
      ? value.toUpperCase()
      : typeof defaultValue === "string"
        ? defaultValue.toUpperCase()
        : "";
  const customValue = selectedCode && !allCurrencies.includes(selectedCode) ? selectedCode : null;
  const normalizedValue = typeof value === "string" ? value.toUpperCase() : value;
  const normalizedDefaultValue =
    typeof defaultValue === "string" ? defaultValue.toUpperCase() : defaultValue;
  return (
    <select
      {...props}
      className={className}
      value={normalizedValue}
      defaultValue={normalizedDefaultValue}
    >
      {customValue && <option value={customValue}>{currencyLabel(customValue)}</option>}
      <optgroup label="Common currencies">
        {preferredCurrencies.map((code) => (
          <option key={code} value={code}>
            {currencyLabel(code)}
          </option>
        ))}
      </optgroup>
      <optgroup label="All currencies">
        {remainingCurrencies.map((code) => (
          <option key={code} value={code}>
            {currencyLabel(code)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
