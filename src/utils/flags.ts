// src/utils/flags.ts
/**
 * Flag + country helpers for React Native.
 *
 * We store flags as ISO-3166 alpha-2 codes (e.g. "GB", "BG").
 * We render the *emoji* flag at runtime so the UI stays simple.
 */

export type CountryOption = {
    code: string;  // ISO-3166 alpha-2
    name: string;  // "United Kingdom", "Bulgaria", ...
    emoji: string; // "🇬🇧", "🇧🇬"
};

/**
 * Common aliases users might type.
 * Example: many people type "UK" but ISO code is "GB".
 */
const ALIASES: Record<string, string> = {
    UK: 'GB',
    EL: 'GR', // sometimes used for Greece
};

/**
 * Normalizes input into a valid ISO2 code if possible.
 * - trims
 * - uppercases
 * - applies aliases
 * - validates it is exactly A-Z A-Z
 */
export function normalizeCountryCode(code?: string): string | undefined {
    if (!code) return undefined;

    const raw = code.trim().toUpperCase();
    if (!raw) return undefined;

    const mapped = ALIASES[raw] ?? raw;

    // ISO2 must be exactly 2 letters.
    if (mapped.length !== 2) return undefined;

    const a = mapped.charCodeAt(0);
    const b = mapped.charCodeAt(1);
    const isAZ = (x: number) => x >= 65 && x <= 90;

    if (!isAZ(a) || !isAZ(b)) return undefined;
    return mapped;
}

/**
 * Convert ISO2 to emoji flag using "regional indicator symbols".
 * Example:
 * - "G" becomes 🇬 (regional indicator G)
 * - "B" becomes 🇧
 * - Together: 🇬🇧
 */
export function countryCodeToFlagEmoji(code?: string): string {
    const c = normalizeCountryCode(code);
    if (!c) return '';

    const REGIONAL_INDICATOR_A = 0x1f1e6;
    const first = REGIONAL_INDICATOR_A + (c.charCodeAt(0) - 65);
    const second = REGIONAL_INDICATOR_A + (c.charCodeAt(1) - 65);

    return String.fromCodePoint(first, second);
}

/**
 * world-countries package export shape:
 * each item has `cca2` and `name.common`.
 *
 * Using `require` avoids TS/ESM interop headaches in RN/Expo projects.
 */
const RAW: any[] = require('world-countries');

/**
 * Build a stable, sorted list of country options for your picker.
 */
export const COUNTRY_OPTIONS: CountryOption[] = RAW
    .filter((c) => c && typeof c.cca2 === 'string' && c.cca2.length === 2 && c?.name?.common)
    .map((c) => {
        const code = String(c.cca2).toUpperCase();
        const name = String(c.name.common);
        return { code, name, emoji: countryCodeToFlagEmoji(code) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Fast lookup map: "GB" -> {code,name,emoji}
 */
const BY_CODE = new Map<string, CountryOption>(COUNTRY_OPTIONS.map((c) => [c.code, c]));

/**
 * Convenience: get emoji from ISO2.
 */
export function getFlagEmoji(code?: string): string {
    return countryCodeToFlagEmoji(code);
}

/**
 * Convenience: get country name from ISO2 (if known).
 */
export function getCountryName(code?: string): string | undefined {
    const norm = normalizeCountryCode(code);
    if (!norm) return undefined;
    return BY_CODE.get(norm)?.name;
}

/**
 * Useful label for UI: "🇬🇧 United Kingdom (GB)"
 */
export function getCountryLabel(code?: string): string {
    const norm = normalizeCountryCode(code);
    if (!norm) return '—';
    const name = BY_CODE.get(norm)?.name ?? norm;
    const emoji = countryCodeToFlagEmoji(norm);
    return `${emoji} ${name} (${norm})`;
}
