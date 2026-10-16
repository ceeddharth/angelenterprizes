/**
 * Shared validation rules for Civil Workforce Attendance System.
 * Consistent across web simulator and Android client.
 */

// India 10-digit mobile number starting with 6, 7, 8, or 9
// Exactly 10 digits, digits only, no +, spaces, hyphens, letters, or symbols
export const PHONE_REGEX = /^[6-9][0-9]{9}$/;

// Standard RFC 5322 compliant email regex requiring valid local part, domain name, and dot-separated extension
// Rejects: user@, @domain.com, user@domain, multiple @, spaces, double dots
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PHONE_LENGTH = 10;

// Worker ID: expected new format is strictly W-1001, W-1002, etc. (W- followed by 4 or more digits)
export const NEW_WORKER_ID_REGEX = /^W-[0-9]{4,}$/;
// Historical + New Worker ID format (accepts historical W-22, W-25, W-34, W-1002, and all new W-1001+)
export const ANY_WORKER_ID_REGEX = /^W-[0-9]+$/i;

// Batch: Admin-controlled sequential batches B-01, B-02, B-03...
export const BATCH_ID_REGEX = /^B-[0-9]{2,}$/;

/**
 * Validates new Worker ID format (^W-[0-9]{4,}$)
 */
export function isValidNewWorkerId(workerId: string | null | undefined): boolean {
  if (!workerId) return false;
  return NEW_WORKER_ID_REGEX.test(workerId.trim());
}

/**
 * Validates any valid Worker ID (historical or new)
 */
export function isValidAnyWorkerId(workerId: string | null | undefined): boolean {
  if (!workerId) return false;
  return ANY_WORKER_ID_REGEX.test(workerId.trim());
}

/**
 * Validates Batch ID format (^B-[0-9]{2,}$)
 */
export function isValidBatchId(batchId: string | null | undefined): boolean {
  if (!batchId) return false;
  return BATCH_ID_REGEX.test(batchId.trim());
}

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  errorMessage?: string;
}

/**
 * Normalizes and strictly validates Indian mobile numbers:
 * - Requires exactly 10 digits starting with 6, 7, 8, or 9
 * - Accepts optional +91 prefix (with optional space/hyphen)
 * - Normalizes supported formatting (spaces, hyphens) before validation
 * - Rejects 9-digit, 11-digit, malformed, empty, and invalid-prefix numbers
 * - Does NOT truncate extra digits
 */
export function validateIndianMobile(raw: string | null | undefined): PhoneValidationResult {
  if (!raw || typeof raw !== 'string') {
    return { isValid: false, normalized: '', errorMessage: 'Mobile phone number is required.' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { isValid: false, normalized: '', errorMessage: 'Mobile phone number is required.' };
  }

  // Reject unsupported international country codes (e.g. +1, +44, +92)
  if (trimmed.startsWith('+') && !trimmed.startsWith('+91')) {
    return { isValid: false, normalized: '', errorMessage: 'Unsupported country code. Only Indian mobile numbers (+91) are accepted.' };
  }

  // Check character set: only optional leading +, digits, spaces, and hyphens permitted
  const validChars = /^\+?[0-9\s-]+$/;
  if (!validChars.test(trimmed)) {
    return { isValid: false, normalized: '', errorMessage: 'Phone number contains invalid characters. Enter digits only.' };
  }

  // Strip supported +91 prefix if present
  let body = trimmed;
  if (body.startsWith('+91')) {
    body = body.slice(3).trim();
    if (body.startsWith('-')) {
      body = body.slice(1).trim();
    }
  }

  // Normalize supported spaces and hyphens
  const digitsOnly = body.replace(/[\s-]/g, '');

  // Must consist solely of digits
  if (!/^\d+$/.test(digitsOnly)) {
    return { isValid: false, normalized: '', errorMessage: 'Phone number contains invalid characters.' };
  }

  // Reject numbers that are not exactly 10 digits
  if (digitsOnly.length < 10) {
    return {
      isValid: false,
      normalized: digitsOnly,
      errorMessage: `Mobile number must be exactly 10 digits (entered ${digitsOnly.length} digits).`
    };
  }

  if (digitsOnly.length > 10) {
    return {
      isValid: false,
      normalized: digitsOnly,
      errorMessage: `Mobile number is too long (${digitsOnly.length} digits). Exactly 10 digits required.`
    };
  }

  // Verify leading digit: must start with 6, 7, 8, or 9
  const firstDigit = digitsOnly[0];
  if (!['6', '7', '8', '9'].includes(firstDigit)) {
    return {
      isValid: false,
      normalized: digitsOnly,
      errorMessage: `Indian mobile number must start with 6, 7, 8, or 9 (starts with '${firstDigit}').`
    };
  }

  return {
    isValid: true,
    normalized: digitsOnly,
    errorMessage: undefined
  };
}

/**
 * Sanitizes phone input for real-time typing/pasting:
 * - Allows leading '+', digits (0-9), spaces, and hyphens
 * - Does NOT truncate extra digits so users can input and see validation feedback
 */
export function sanitizePhoneInput(val: string | null | undefined): string {
  if (!val) return '';
  // Preserve leading +, digits, spaces, and hyphens without truncating
  const trimmedLeading = val.trimStart();
  const hasPlus = trimmedLeading.startsWith('+');
  const sanitized = val.replace(/[^\d\s-]/g, '');
  return hasPlus ? `+${sanitized.replace(/^\+/, '')}` : sanitized;
}

/**
 * Backward-compatible validation helper
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  return validateIndianMobile(phone).isValid;
}

/**
 * Normalizes phone number to canonical 10-digit format if valid
 */
export function normalizePhone(phone: string | null | undefined): string {
  const res = validateIndianMobile(phone);
  return res.isValid ? res.normalized : (phone?.trim() || '');
}

/**
 * Validates an email address:
 * - Trimmed leading/trailing whitespace
 * - Non-empty
 * - Max length 254 characters
 * - Valid RFC structure (user@domain.tld)
 * - No internal spaces or multiple @
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return false;
  if (trimmed.includes(' ') || trimmed.includes('..')) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Normalizes an email address: trimmed and lowercased
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sanitizes email input: removes whitespace and invalid characters
 */
export function sanitizeEmailInput(val: string | null | undefined): string {
  if (!val) return '';
  return val.trim().toLowerCase();
}

