export interface PhoneResult {
  phone: string | null;
  error?: string;
}

const E164 = /^\+[1-9]\d{6,14}$/;

/** Most mobile numbering plans (India, US, UK mobile …) use 10 national digits. */
const NATIONAL_NUMBER_LENGTH = 10;

export function isE164(phone: string): boolean {
  return E164.test(phone);
}

/**
 * Normalise a raw phone number to E.164 (`+<country code><number>`).
 *
 * Bare local numbers get `defaultCountryCode` prepended. The country code is
 * only treated as already present when the remaining national part is a
 * plausible length — a 10-digit Indian mobile such as "9157014353" starts with
 * "91" but must still become "+919157014353", not "+9157014353".
 */
export function normalizePhone(rawPhone: string | null | undefined, defaultCountryCode: string): PhoneResult {
  if (!rawPhone || rawPhone.trim() === "") {
    return { phone: null, error: "Empty phone number" };
  }

  let cleaned = rawPhone.trim();

  // Spreadsheets mangle long numbers into scientific notation ("9.19157E+11").
  // Expand it instead of stripping non-digits, which would silently corrupt it.
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(cleaned)) {
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isSafeInteger(Math.round(numeric))) {
      return { phone: null, error: `Unparseable phone number: ${rawPhone}` };
    }
    cleaned = Math.round(numeric).toString();
  }

  if (cleaned.startsWith("+")) {
    return finish(cleaned.replace(/\D/g, ""), rawPhone);
  }

  const compact = cleaned.replace(/[\s\-().[\]/\\,]/g, "");

  // International "00" prefix is the same as "+".
  if (compact.startsWith("00")) {
    return finish(compact.slice(2).replace(/\D/g, ""), rawPhone);
  }

  let digits = compact.replace(/\D/g, "");
  if (digits.length === 0) {
    return { phone: null, error: `No digits found in phone number: ${rawPhone}` };
  }

  // Drop a national trunk "0" ("09157014353" -> "9157014353").
  if (digits.length > NATIONAL_NUMBER_LENGTH && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  const countryCode = defaultCountryCode.replace(/\D/g, "");
  if (!countryCode) {
    return { phone: null, error: "Number has no country code and no default country code is set" };
  }

  const nationalLeftover = digits.length - countryCode.length;
  const alreadyHasCountryCode =
    digits.startsWith(countryCode) && nationalLeftover >= NATIONAL_NUMBER_LENGTH - 1;

  return finish(alreadyHasCountryCode ? digits : `${countryCode}${digits}`, rawPhone);
}

function finish(digits: string, rawPhone: string): PhoneResult {
  if (digits.length < 8) return { phone: null, error: `Phone number too short: ${rawPhone}` };
  if (digits.length > 15) return { phone: null, error: `Phone number too long: ${rawPhone}` };
  const phone = `+${digits}`;
  if (!isE164(phone)) return { phone: null, error: `Invalid phone number: ${rawPhone}` };
  return { phone };
}
