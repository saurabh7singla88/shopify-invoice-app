/**
 * Unit Quantity Codes (UQC) for GST Compliance
 * Standard units as defined by GST regulations for reporting
 */

export const UQC_CODES = {
  NOS: "Numbers",
  KGS: "Kilograms",
  GMS: "Grams",
  MTR: "Meters",
  LTR: "Liters",
  PCS: "Pieces",
  SQM: "Square Meters",
  CBM: "Cubic Meters",
  SET: "Sets",
  PAC: "Packs",
  DOZ: "Dozens",
  BOX: "Box",
  BTL: "Bottles",
  BDL: "Bundles",
  ROL: "Rolls",
  PAR: "Pairs",
  MLS: "Milliliters",
  TBS: "Tablets",
  CPS: "Capsules",
  UNT: "Units",
} as const;

/**
 * Type for UQC code keys
 */
export type UQCCode = keyof typeof UQC_CODES;

/**
 * Default UQC for most retail products
 */
export const DEFAULT_UQC: UQCCode = "NOS";

/**
 * Get UQC description from code
 * @param code - The UQC code
 * @returns The description, or null if not found
 */
export function getUQCDescription(code: string): string | null {
  return UQC_CODES[code as UQCCode] || null;
}

/**
 * Validate if a UQC code is valid
 * @param code - The UQC code to validate
 * @returns true if valid, false otherwise
 */
export function isValidUQC(code: string): boolean {
  return code in UQC_CODES;
}

/**
 * Get all UQC codes as an array of {code, description}
 * @returns Array of UQC code objects
 */
export function getAllUQCCodes(): Array<{ code: UQCCode; description: string }> {
  return Object.entries(UQC_CODES).map(([code, description]) => ({
    code: code as UQCCode,
    description,
  }));
}
