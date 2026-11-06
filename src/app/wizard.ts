import { MarkdownRenderer, Modal, Notice, Setting, MarkdownView, type App } from "obsidian";
import { GarminClient, GarminError, iso, type Progress } from "../api/client";
import { SPORTS, T, type Lang } from "../core/catalog";
import { activeSports, compose } from "../core/compose";
import { buildProfile } from "../core/profile";
import type { DataProfile, DayRecord } from "../core/types";
import { UI, type Ui } from "./i18n";
import { readRows, uniquePath, writeDays } from "./storage";
import type GarmyPlugin from "../main";

type Step = "key" | "load" | "choose" | "preview";
const ORDER: Step[] = ["key", "load", "choose", "preview"];

interface Choices { groups: Set<string>; sports: Set<string>; races: string; lang: Lang }

export class WizardModal extends Modal {
  private step: Step = "key";
  private rows: DayRecord[] = [];
  private profile: DataProfile = buildProfile([]);
  private choices: Choices;
  private keyDraft = "";
  private periodDays = 365;
  private loading = false;
  private message = "";
  private warnings: string[] = [];
  private markdown = "";

  constructor(app: App, private readonly plugin: GarmyPlugin, private readonly lang: Lang) {
    super(app);
    this.choices = { groups: new Set(), sports: new Set(), races: plugin.settings.racesFolder, lang };
    this.modalEl.addClass("garmy-wizard");
  }

  private get ui(): Ui { return UI[this.lang]; }

  onOpen(): void {
    const saved = readRows(this.app, this.plugin.settings.dataFolder);
    if (saved.length) { this.rows = saved; this.profile = buildProfile(saved); }
    this.render();
  }

  onClose(): void { this.contentEl.empty(); }

  private go(step: Step): void { this.step = step; this.message = ""; this.render(); }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: this.ui.title });
    el.createEl("div", { cls: "garmy-step", text: `${this.ui.step} ${ORDER.indexOf(this.step) + 1} / ${ORDER.length}` });
    if (this.step === "key") this.renderKey(el);
    else if (this.step === "load") this.renderLoad(el);
    else if (this.step === "choose") this.renderChoose(el);
    else this.renderPreview(el);
    if (this.message) el.createEl("p", { cls: "garmy-message", text: this.message });
  }

  // ---- 1. key
  private renderKey(el: HTMLElement): void {
    const ui = this.ui;
    el.createEl("p", { text: ui.keyIntro });
    el.createEl("p", { text: ui.keyHow });
    const hasKey = this.plugin.getKey() !== "";
    if (hasKey) el.createEl("p", { cls: "garmy-ok", text: ui.keySaved });
    new Setting(el).setName(ui.keyLabel).addText((t) => {
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
      t.inputEl.addClass("garmy-key");
      t.setPlaceholder(ui.keyPlaceholder).onChange((v) => { this.keyDraft = v.trim(); });
    });
    new Setting(el).addButton((b) => b.setButtonText(ui.keyCheck).setCta().onClick(() => void this.checkKey()));
  }

  private async checkKey(): Promise<void> {
    const ui = this.ui;
    const key = this.keyDraft || this.plugin.getKey();
    if (!key) { this.message = ui.keyEmpty; this.render(); return; }
    try {
      await new GarminClient(this.plugin.http, key).verify();
      this.plugin.setKey(key);
      this.keyDraft = "";
      this.go("load");
    } catch (e) {
      this.message = e instanceof GarminError ? (e.kind === "auth" ? ui.keyBad : e.kind === "rate" ? ui.keyRate : ui.keyNet) : ui.keyNet;
      this.render();
    }
  }

  // ---- 2. load
  private renderLoad(el: HTMLElement): void {
    const ui = this.ui;
    el.createEl("p", { text: ui.loadIntro });
    el.createEl("p", { cls: "garmy-hint", text: ui.note + this.plugin.settings.dataFolder });
    if (this.rows.length) {
      el.createEl("p", { cls: "garmy-ok", text: `${ui.savedInfo} ${this.profile.days}` });
      new Setting(el).addButton((b) => b.setButtonText(ui.useSaved).onClick(() => this.afterLoad()));
    }
    new Setting(el).setName(ui.period).addDropdown((d) => {
      d.addOption("30", ui.days30).addOption("90", ui.days90).addOption("365", ui.days365).setValue(String(this.periodDays)).onChange((v) => { this.periodDays = Number(v); });
      d.selectEl.addClass("garmy-period");
    });
    const status = el.createEl("div", { cls: "garmy-progress" });
    new Setting(el).addButton((b) => {
      b.setButtonText(ui.start).setCta().onClick(() => void this.load(status));
      b.buttonEl.addClass("garmy-load");
      if (this.loading) b.setDisabled(true);
    });
  }

  private async load(status: HTMLElement): Promise<void> {
    const ui = this.ui;
    if (this.loading) return;
    this.loading = true;
    const client = new GarminClient(this.plugin.http, this.plugin.getKey());
    const to = iso(Date.now());
    const from = iso(Date.now() - (this.periodDays - 1) * 864e5);
    const lines = new Map<string, HTMLElement>();
    const onProgress = (p: Progress): void => {
      let line = lines.get(p.step);
      if (!line) { line = status.createEl("div"); lines.set(p.step, line); }
      line.setText(`${ui.progress[p.step] ?? p.step}: ${p.done} / ${p.total}`);
    };
    try {
      const res = await client.backfill(from, to, onProgress);
      this.warnings = res.warnings;
      const w = await writeDays(this.app, this.plugin.settings.dataFolder, res.records);
      this.rows = res.records;
      this.profile = buildProfile(res.records);
      this.plugin.settings.lastSync = to;
      await this.plugin.saveSettings();
      status.createEl("div", { cls: "garmy-ok garmy-loaded", text: `${ui.loaded} ${res.records.length} (+${w.created})` });
      this.loading = false;
      window.setTimeout(() => this.afterLoad(), 600);
    } catch (e) {
      this.loading = false;
      this.message = `${ui.stopped} ${e instanceof Error ? e.message : String(e)}`;
      this.render();
    }
  }

  private afterLoad(): void {
    if (this.profile.days === 0) { this.message = this.ui.noData; this.render(); return; }
    const sports = activeSports(this.profile);
    this.choices.sports = new Set(sports);
    this.choices.groups = new Set(["recovery", "activity", "training"].filter((g) => this.groupAvailable(g)));
    this.go("choose");
  }

  private groupAvailable(g: string): boolean {
    const c = this.profile.count;
    if (g === "recovery") return ["sleep_score", "sleep_duration", "hrv", "resting_hr", "stress", "training_readiness"].some((f) => (c[f] ?? 0) > 0);
    if (g === "activity") return (c.steps ?? 0) > 0 || (c.distance_km ?? 0) > 0;
    return activeSports(this.profile).length > 0;
  }

  // ---- 3. choose
  private renderChoose(el: HTMLElement): void {
    const ui = this.ui;
    el.createEl("p", { text: ui.chooseIntro });
    for (const g of ["recovery", "activity", "training"]) {
      if (!this.groupAvailable(g)) continue;
      new Setting(el).setName(ui.groups[g] ?? g).addToggle((t) => {
        t.setValue(this.choices.groups.has(g)).onChange((v) => { if (v) this.choices.groups.add(g); else this.choices.groups.delete(g); });
        t.toggleEl.addClass(`garmy-group-${g}`);
      });
    }
    const sports = activeSports(this.profile);
    el.createEl("h4", { text: ui.sports });
    if (!sports.length) el.createEl("p", { cls: "garmy-hint", text: ui.noSports });
    for (const s of sports) {
      const sp = SPORTS[s];
      if (!sp) continue;
      new Setting(el).setName(`${sp.icon} ${T[this.lang][s] ?? s}`).addToggle((t) => {
        t.setValue(this.choices.sports.has(s)).onChange((v) => { if (v) this.choices.sports.add(s); else this.choices.sports.delete(s); });
        t.toggleEl.addClass(`garmy-sport-${s}`);
      });
    }
    new Setting(el).setName(ui.races).setDesc(ui.racesHint).addText((t) => t.setValue(this.choices.races).onChange((v) => { this.choices.races = v.trim(); }));
    new Setting(el).setName(ui.language).addDropdown((d) => d.addOption("ru", "Русский").addOption("en", "English").setValue(this.choices.lang).onChange((v) => { this.choices.lang = v === "ru" ? "ru" : "en"; }));
    new Setting(el)
      .addButton((b) => b.setButtonText(ui.back).onClick(() => this.go("load")))
      .addButton((b) => { b.setButtonText(ui.preview).setCta().onClick(() => this.go("preview")); b.buttonEl.addClass("garmy-preview-btn"); });
  }

  // ---- 4. preview + insert
  private build(): string {
    const races = this.choices.races && this.app.vault.getAbstractFileByPath(this.choices.races) ? this.choices.races : null;
    return compose(this.profile, {
      source: this.plugin.settings.dataFolder, lang: this.choices.lang,
      groups: [...this.choices.groups], sports: [...this.choices.sports], races,
    }).markdown;
  }

  private renderPreview(el: HTMLElement): void {
    const ui = this.ui;
    this.markdown = this.build();
    el.createEl("p", { text: ui.previewIntro });
    if (!this.plugin.hasDashy()) el.createEl("p", { cls: "garmy-warn", text: ui.noDashy });
    const box = el.createEl("div", { cls: "garmy-preview markdown-rendered" });
    void MarkdownRenderer.render(this.app, this.stripFrontmatter(this.markdown), box, this.plugin.settings.dataFolder + "/preview.md", this.plugin);
    new Setting(el)
      .addButton((b) => b.setButtonText(ui.back).onClick(() => this.go("choose")))
      .addButton((b) => { b.setButtonText(ui.insertNote).onClick(() => this.insertIntoActive()); b.buttonEl.addClass("garmy-insert"); })
      .addButton((b) => { b.setButtonText(ui.createNote).setCta().onClick(() => void this.createNote()); b.buttonEl.addClass("garmy-create"); });
  }

  private stripFrontmatter(md: string): string { return md.replace(/^---\n[\s\S]*?\n---\n/, ""); }

  private async createNote(): Promise<void> {
    const name = this.choices.lang === "ru" ? "Дашборд Garmin" : "Garmin dashboard";
    const path = await uniquePath(this.app, this.plugin.settings.notesFolder, name);
    const file = await this.app.vault.create(path, this.markdown);
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(this.ui.created + path);
    this.close();
  }

  private insertIntoActive(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) { this.message = this.ui.noActive; this.render(); return; }
    view.editor.replaceSelection(this.stripFrontmatter(this.markdown));
    new Notice(this.ui.inserted);
    this.close();
  }
}
