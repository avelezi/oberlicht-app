export type ClassValue = string | number | false | null | undefined | ClassValue[];
/** Une clases condicionales sin dependencias. */
export function cn(...xs: ClassValue[]): string {
  const out: string[] = [];
  for (const x of xs) {
    if (!x) continue;
    if (Array.isArray(x)) out.push(cn(...x));
    else out.push(String(x));
  }
  return out.filter(Boolean).join(' ');
}
