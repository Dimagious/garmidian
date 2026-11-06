// Just enough of the obsidian module for unit tests of code that only needs TFile and normalizePath.
export class TFile {
  path = "";
  get name(): string { return this.path.split("/").pop() ?? this.path; }
}
export const normalizePath = (p: string): string => p.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
