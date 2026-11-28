/**
 * Safe Indonesian currency & decimal helpers.
 * Never strips decimal points naively (prevents the 100x bug when backend returns "50000000.00").
 */

/**
 * Convert a backend Decimal string/number (e.g. "50000000.00" or 125.25) into an
 * Indonesian editable string (e.g. "50000000" or "125,25") without multiplying by 100.
 */
export function decimalToEditableString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  const num = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isFinite(num)) return ""
  const fixed = num.toFixed(2)
  const [intPart, decPart] = fixed.split(".")
  if (decPart === "00") return intPart
  return `${intPart},${decPart.replace(/0+$/, "")}`
}

/**
 * Sanitize live user input (Indonesian format: "." thousands separator, "," decimal separator)
 * into a clean internal editable string ("digits" or "digits,upTo2Decimals").
 */
export function sanitizeCurrencyInput(input: string): string {
  const cleaned = input.replace(/[^\d,]/g, "")
  if (!cleaned) return ""
  const commaIdx = cleaned.indexOf(",")
  if (commaIdx === -1) {
    return cleaned.replace(/^0+(?=\d)/, "")
  }
  const intPart = cleaned.slice(0, commaIdx).replace(/^0+(?=\d)/, "") || "0"
  const decPart = cleaned.slice(commaIdx + 1).replace(/,/g, "").slice(0, 2)
  return `${intPart},${decPart}`
}

/**
 * Format an internal editable string ("50000000" or "125,25") or backend value ("50000000.00")
 * with Indonesian thousands separators for display inside an <input>.
 */
export function formatCurrencyInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  let editable: string
  if (typeof value === "number") {
    editable = decimalToEditableString(value)
  } else {
    const trimmed = value.trim()
    // Backend ISO decimal string like "50000000.00" or "125.5"
    if (/^\d+\.\d{1,2}$/.test(trimmed)) {
      editable = decimalToEditableString(trimmed)
    } else {
      editable = sanitizeCurrencyInput(trimmed)
    }
  }
  if (!editable) return ""
  const hasComma = editable.includes(",")
  const [intPart, decPart = ""] = editable.split(",")
  const formattedInt = intPart ? new Intl.NumberFormat("id-ID").format(Number(intPart)) : "0"
  return hasComma ? `${formattedInt},${decPart}` : formattedInt
}

/**
 * Parse either a backend Decimal string ("50000000.00"), an Indonesian formatted input
 * ("50.000.000,25"), or an internal editable string ("50000000,25") into an exact number (2dp).
 */
export function parseCurrencyValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const trimmed = value.trim()
  if (!trimmed) return 0
  // Pure ISO decimal string from backend (e.g. "50000000.00" or "125.25")
  if (/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : 0
  }
  // Indonesian formatted string: remove "." thousands separators, turn "," into "."
  const normalized = trimmed.replace(/\./g, "").replace(",", ".")
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

export function formatRupiah(value: number | string | null | undefined): string {
  const num = parseCurrencyValue(value)
  const hasDecimals = Math.abs(num - Math.trunc(num)) > 1e-6
  return `Rp ${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(num)}`
}

export function formatCompactRupiah(value: number | string | null | undefined): string {
  const num = parseCurrencyValue(value)
  const abs = Math.abs(num)
  if (abs >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(2)} M`
  if (abs >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(2)} Jt`
  if (abs >= 1_000) return `Rp ${(num / 1_000).toFixed(1)} Rb`
  return formatRupiah(num)
}

export function derivePeriodeFromDate(isoDate: string | null | undefined): string {
  if (!isoDate) return new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })
  const parts = isoDate.split("-").map(Number)
  if (parts.length >= 2 && parts[0] > 1900 && parts[1] >= 1 && parts[1] <= 12) {
    return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
  }
  return new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })
}
