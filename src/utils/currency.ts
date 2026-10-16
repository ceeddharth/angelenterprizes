/**
 * Centralized Indian Rupee (INR) currency formatting utility for Civil Workforce app.
 * Formats all monetary values with proper Indian number grouping (Lakhs/Crores)
 * and the ₹ symbol.
 *
 * Examples:
 * formatINR(0) -> "₹0"
 * formatINR(1250) -> "₹1,250"
 * formatINR(12500.5) -> "₹12,500.50"
 * formatINR(25000, { forceDecimals: true }) -> "₹25,000.00"
 * formatINR(-250) -> "-₹250"
 */

export interface FormatINROptions {
  forceDecimals?: boolean;
  includeSymbol?: boolean;
}

export function formatINR(
  amount: number | string | null | undefined,
  options: FormatINROptions = {}
): string {
  const { forceDecimals = false, includeSymbol = true } = options;

  if (amount === null || amount === undefined || amount === '') {
    return includeSymbol ? '₹0' : '0';
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    return includeSymbol ? '₹0' : '0';
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const hasDecimals = absNum % 1 !== 0;
  const minFractionDigits = forceDecimals ? 2 : hasDecimals ? 2 : 0;
  const maxFractionDigits = 2;

  const formattedNumber = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits
  });

  const prefix = isNegative ? '-' : '';
  const symbol = includeSymbol ? '₹' : '';

  return `${prefix}${symbol}${formattedNumber}`;
}

export function formatINR2(amount: number | string | null | undefined): string {
  return formatINR(amount, { forceDecimals: true });
}
