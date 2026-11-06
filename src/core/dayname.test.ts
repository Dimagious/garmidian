import { describe, expect, it } from "vitest";
import { dayParser, isoParser } from "./dayname";

describe("dayParser", () => {
  it("reads ISO names", () => {
    expect(isoParser("2026-11-06")).toBe("2026-11-06");
    expect(isoParser("2026-11-06 notes")).toBeNull();
    expect(isoParser("note")).toBeNull();
  });
  it("reads European and American numeric formats into ISO", () => {
    expect(dayParser("DD.MM.YYYY")("06.11.2026")).toBe("2026-11-06");
    expect(dayParser("MM-DD-YYYY")("11-06-2026")).toBe("2026-11-06");
    expect(dayParser("DD/MM/YYYY")("06/11/2026")).toBe("2026-11-06");
    expect(dayParser("YYYYMMDD")("20261106")).toBe("2026-11-06");
  });
  it("reads short tokens and two digit years", () => {
    expect(dayParser("D.M.YYYY")("6.11.2026")).toBe("2026-11-06");
    expect(dayParser("D.M.YY")("6.1.26")).toBe("2026-01-06");
  });
  it("treats square brackets as literal text", () => {
    expect(dayParser("[Day] YYYY-MM-DD")("Day 2026-11-06")).toBe("2026-11-06");
  });
  it("rejects impossible dates instead of rolling them over", () => {
    expect(isoParser("2026-02-30")).toBeNull();
    expect(isoParser("2026-13-01")).toBeNull();
    expect(dayParser("DD.MM.YYYY")("31.04.2026")).toBeNull();
    expect(isoParser("2028-02-29")).toBe("2028-02-29");
    expect(isoParser("2027-02-29")).toBeNull();
  });
  it("yields no dates for formats it cannot read, never wrong ones", () => {
    expect(dayParser("dddd, MMMM D, YYYY")("Friday, November 6, 2026")).toBeNull();
    expect(dayParser("YYYY-[W]ww")("2026-W45")).toBeNull();
    expect(dayParser("YYYY-MM")("2026-11")).toBeNull(); // no day
    expect(dayParser("")("2026-11-06")).toBeNull();
  });
  it("is anchored: extra text before or after does not match", () => {
    expect(dayParser("DD.MM.YYYY")("x06.11.2026")).toBeNull();
    expect(dayParser("DD.MM.YYYY")("06.11.2026x")).toBeNull();
  });
});
