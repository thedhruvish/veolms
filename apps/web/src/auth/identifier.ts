import { otpSendRequestSchema } from "@veolms/contracts";

export type IdentifierMethod = "email" | "mobile";

export interface CountryOption {
  readonly id: string;
  readonly name: string;
  readonly dialCode: string;
  readonly nationalDigits: number;
}

// India only until the team confirms the full launch list.
export const SUPPORTED_COUNTRIES: readonly CountryOption[] = [
  { id: "IN", name: "India", dialCode: "+91", nationalDigits: 10 },
];

export const DEFAULT_COUNTRY_ID = "IN";

const NATIONAL_MOBILE_PREFIXES: Record<string, RegExp> = {
  IN: /^[6-9]/,
};

const DIGITS_WITH_APPROVED_COPY = 10;
const INVALID_EMAIL_MESSAGE = "Please enter a valid email address.";

export function findCountry(id: string): CountryOption | undefined {
  return SUPPORTED_COUNTRIES.find((country) => country.id === id);
}

export function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const result = otpSendRequestSchema.safeParse({ email: trimmed });

  return result.success && result.data.email
    ? result.data.email
    : trimmed.toLowerCase();
}

export function validateEmail(value: string): string | null {
  const result = otpSendRequestSchema.safeParse({ email: value.trim() });

  return result.success ? null : INVALID_EMAIL_MESSAGE;
}

export function toNationalDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function toNationalNumber(value: string, country: CountryOption): string {
  const dialDigits = toNationalDigits(country.dialCode);
  let digits = toNationalDigits(value);

  if (digits.length > country.nationalDigits && digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }

  if (digits.length > country.nationalDigits && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits;
}

function invalidMobileMessage(country: CountryOption): string {
  return country.nationalDigits === DIGITS_WITH_APPROVED_COPY
    ? `Please enter a valid ${country.nationalDigits}-digit mobile number.`
    : "Please enter a valid mobile number.";
}

export function validateMobile(
  value: string,
  country: CountryOption,
): string | null {
  const digits = toNationalNumber(value, country);

  if (digits.length !== country.nationalDigits) {
    return invalidMobileMessage(country);
  }

  const prefix = NATIONAL_MOBILE_PREFIXES[country.id];

  if (prefix && !prefix.test(digits)) {
    return invalidMobileMessage(country);
  }

  const result = otpSendRequestSchema.safeParse({
    phoneNo: `${country.dialCode}${digits}`,
  });

  return result.success ? null : invalidMobileMessage(country);
}
