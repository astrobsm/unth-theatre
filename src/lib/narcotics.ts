// Controlled / narcotic medications for accountability tracking.
// Includes WHO/Nigeria-listed controlled substances commonly used in anaesthesia
// and post-operative pain management. Matching is case-insensitive and uses
// substring/word-boundary matching against drug names.

const NARCOTIC_KEYWORDS = [
  // Opioids
  "morphine",
  "fentanyl",
  "remifentanil",
  "sufentanil",
  "alfentanil",
  "pethidine",
  "meperidine",
  "tramadol",
  "pentazocine",
  "buprenorphine",
  "oxycodone",
  "hydromorphone",
  "methadone",
  "codeine",
  "dihydrocodeine",
  "tapentadol",
  "papaveretum",
  "diamorphine",
  // Other controlled substances
  "ketamine",
  "midazolam",
  "diazepam",
  "lorazepam",
  "temazepam",
  "flunitrazepam",
  "nitrazepam",
  "phenobarbital",
  "phenobarbitone",
  "thiopentone",
  "thiopental",
  "pentobarbital",
  "secobarbital",
  // Stimulants (rare in theatre but listed for completeness)
  "methylphenidate",
  "dexamfetamine",
  "amfetamine",
];

export function isNarcotic(drugName: string | null | undefined): boolean {
  if (!drugName) return false;
  const n = drugName.toLowerCase();
  return NARCOTIC_KEYWORDS.some((kw) => n.includes(kw));
}

/** Returns the matched narcotic keyword, useful for display. */
export function narcoticMatch(drugName: string | null | undefined): string | null {
  if (!drugName) return null;
  const n = drugName.toLowerCase();
  for (const kw of NARCOTIC_KEYWORDS) {
    if (n.includes(kw)) return kw;
  }
  return null;
}

export const NARCOTIC_LIST = NARCOTIC_KEYWORDS.slice();
