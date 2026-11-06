// Turns a note name into a date, for the day notes people already have. The format is the one of their daily
// notes (Obsidian's Daily notes or Periodic Notes), written the way those plugins write it: YYYY-MM-DD, DD.MM.YYYY...
// Only the numeric tokens are understood; a format with month names or weekdays yields no dates, never wrong ones.

export type DayParser = (basename: string) => string | null;
export const ISO_FORMAT = "YYYY-MM-DD";

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const pad = (n: number): string => String(n).padStart(2, "0");

export function dayParser(format: string = ISO_FORMAT): DayParser {
  const order: Array<"y" | "yy" | "m" | "d"> = [];
  let source = "";
  let supported = true;
  const token = /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|./g;
  for (const m of format.matchAll(token)) {
    const t = m[0];
    if (m[1] !== undefined) source += escape(m[1]);
    else if (t === "YYYY") { order.push("y"); source += "(\\d{4})"; }
    else if (t === "YY") { order.push("yy"); source += "(\\d{2})"; }
    else if (t === "MM") { order.push("m"); source += "(\\d{2})"; }
    else if (t === "M") { order.push("m"); source += "(\\d{1,2})"; }
    else if (t === "DD") { order.push("d"); source += "(\\d{2})"; }
    else if (t === "D") { order.push("d"); source += "(\\d{1,2})"; }
    else if (/[A-Za-z]/.test(t)) supported = false; // month names, weekdays, hours and so on
    else source += escape(t);
  }
  const hasAll = order.includes("m") && order.includes("d") && (order.includes("y") || order.includes("yy"));
  if (!supported || !hasAll) return () => null;
  const re = new RegExp(`^${source}$`);
  return (basename) => {
    const hit = re.exec(basename);
    if (!hit) return null;
    let y = 0, mo = 0, d = 0;
    order.forEach((kind, i) => {
      const v = Number(hit[i + 1]);
      if (kind === "y") y = v; else if (kind === "yy") y = 2000 + v; else if (kind === "m") mo = v; else d = v;
    });
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  };
}

export const isoParser: DayParser = dayParser(ISO_FORMAT);
