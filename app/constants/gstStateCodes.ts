/**
 * GST State Codes Mapping
 * Maps Indian state/UT names to their 2-digit GST state codes
 * As per GST regulations
 */

export const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01",
  "Himachal Pradesh": "02",
  "Punjab": "03",
  "Chandigarh": "04",
  "Uttarakhand": "05",
  "Haryana": "06",
  "Delhi": "07",
  "Rajasthan": "08",
  "Uttar Pradesh": "09",
  "Bihar": "10",
  "Sikkim": "11",
  "Arunachal Pradesh": "12",
  "Nagaland": "13",
  "Manipur": "14",
  "Mizoram": "15",
  "Tripura": "16",
  "Meghalaya": "17",
  "Assam": "18",
  "West Bengal": "19",
  "Jharkhand": "20",
  "Odisha": "21",
  "Chhattisgarh": "22",
  "Madhya Pradesh": "23",
  "Gujarat": "24",
  "Dadra and Nagar Haveli and Daman and Diu": "26",
  "Maharashtra": "27",
  "Andhra Pradesh": "28", // Old code, now split
  "Karnataka": "29",
  "Goa": "30",
  "Lakshadweep": "31",
  "Kerala": "32",
  "Tamil Nadu": "33",
  "Puducherry": "34",
  "Andaman and Nicobar Islands": "35",
  "Telangana": "36",
  "Andhra Pradesh (New)": "37",
  "Ladakh": "38",
};

/**
 * Reverse mapping: GST state code to state name
 */
export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(GST_STATE_CODES).map(([k, v]) => [v, k])
);

/**
 * Get GST state code from state name (case-insensitive, handles common variations)
 * @param stateName - The state name to lookup
 * @returns The 2-digit state code, or null if not found
 */
export function getStateCode(stateName: string): string | null {
  if (!stateName) return null;
  
  const normalized = stateName.trim();
  
  // Direct match
  if (GST_STATE_CODES[normalized]) {
    return GST_STATE_CODES[normalized];
  }
  
  // Case-insensitive match
  const found = Object.entries(GST_STATE_CODES).find(
    ([key]) => key.toLowerCase() === normalized.toLowerCase()
  );
  
  return found ? found[1] : null;
}

/**
 * Get state name from GST state code
 * @param stateCode - The 2-digit state code
 * @returns The state name, or null if not found
 */
export function getStateName(stateCode: string): string | null {
  if (!stateCode) return null;
  return STATE_CODE_TO_NAME[stateCode] || null;
}

/**
 * Validate if a state code is valid
 * @param stateCode - The state code to validate
 * @returns true if valid, false otherwise
 */
export function isValidStateCode(stateCode: string): boolean {
  return stateCode in STATE_CODE_TO_NAME;
}

/**
 * Validate if a state name is valid
 * @param stateName - The state name to validate
 * @returns true if valid, false otherwise
 */
export function isValidStateName(stateName: string): boolean {
  return getStateCode(stateName) !== null;
}
