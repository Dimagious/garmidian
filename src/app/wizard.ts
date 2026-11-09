import { Component, MarkdownRenderer, Modal, Notice, Setting, MarkdownView, normalizePath, setIcon, type App } from "obsidian";
import { GarminError, type CancelToken, type Progress } from "../api/client";
import { SPORTS } from "../core/catalog";
import { activeSports, compose } from "../core/compose";
import { brokenBlocks, wasNotChecked } from "../core/dashy";
import { isRaceDate } from "../core/blocks";
import { listTemplates, type TemplateOption } from "../core/templates";
import { buildProfile } from "../core/profile";
import type { DataProfile, DayRecord } from "../core/types";
import { LANGS, SYNC_UI, T, UI, pickLang, type Lang, type SyncUi, type Ui } from "../i18n";
import { addDays, isoWeek, localDate } from "../core/dates";
import { encodeMeta, splitComposed, withMeta, wrapRegion, type RegionMeta } from "../core/region";
import { dayParser, isoParser, ISO_FORMAT, type DayParser } from "../core/dayname";
import { overwriteFrom } from "../core/merge";
import { mountMediaSlot } from "./media-slot";
import keyHelp from "../../media/help-key.png";
import { convertDays, readRows, scanNotes, uniquePath, writeDays } from "./storage";
import { convertRecords } from "../core/units";
import { detectDataFolders, type FolderCandidate } from "../core/detect";
import type GarmyPlugin from "../main";

type Step = "key" | "load" | "choose" | "preview";
const ORDER: Step[] = ["key", "load", "choose", "preview"];
const PARTS: Progress["step"][] = ["daily", "sleep", "hrv", "activities"];
const GROUP_ICONS: Record<string, string> = { recovery: "heart-pulse", activity: "footprints", training: "dumbbell" };

interface Choices { groups: Set<string>; sports: Set<string>; races: string; lang: Lang; template: string }
/** Dashboards that read the sports the user ticks. The others are about one thing and choose their own. */
const USES_SPORTS = new Set(["overview", "week", "month", "year", "race"]);
type PartState = "waiting" | "loading" | "done" | "warn" | "stopped";
interface PartView { state: PartState; done: number; total: number }
interface NoticeAction { label: string; run: () => void }
interface Callout { kind: "error" | "warn"; title: string; body: string; action?: NoticeAction }

export class WizardModal extends Modal {
  private step: Step = "key";
  private rows: DayRecord[] = [];
  private profile: DataProfile = buildProfile([]);
  private choices: Choices;
  private keyDraft = "";
  private periodDays = 365;
  private loading = false;
  private checking = false;
  private notice: Callout | null = null;
  private warnings: string[] = [];
  private markdown = "";
  private parts = new Map<Progress["step"], PartView>();
  private partsEl: HTMLElement | null = null;
  private liveEl: HTMLElement | null = null;
  private advanceTimer: number | null = null;
  private keyInput: HTMLInputElement | null = null;
  private uid = 0;
  /** Owns the preview renderer, so its lifetime is the modal's and not the plugin's. */
  private readonly renderer = new Component();

  /** Names an element by another one. Unlike aria-label it does not pop an Obsidian tooltip on hover. */
  private labelBy(el: HTMLElement, source: HTMLElement): void {
    if (!source.id) source.id = `garmy-l${++this.uid}`;
    el.setAttr("aria-labelledby", source.id);
  }

  constructor(app: App, private readonly plugin: GarmyPlugin, private readonly lang: Lang) {
    super(app);
    this.choices = { groups: new Set(), sports: new Set(), races: plugin.settings.racesFolder, lang, template: "overview" };
    this.modalEl.addClass("garmy-wizard");
    this.resetParts();
  }

  private get ui(): Ui { return UI[this.lang]; }
  private get sync(): SyncUi { return SYNC_UI[this.lang]; }
  private cancelToken: CancelToken = { cancelled: false };
  /** Set when the user builds from notes they already have: the folder those notes live in. */
  private sourceFolder: string | null = null;
  private candidates: FolderCandidate[] | null = null;
  private tplGrid: HTMLElement | null = null;
  private tplChanged: (() => void) | null = null;

  onOpen(): void {
    this.renderer.load();
    const saved = readRows(this.app, this.plugin.settings.dataFolder);
    if (saved.length) {
      // Notes written before the units setting existed hold kilometers only; in miles mode they get miles added.
      this.rows = convertRecords(saved, this.plugin.settings.units);
      this.profile = buildProfile(this.rows);
      void convertDays(this.app, this.plugin.settings.dataFolder, this.plugin.settings.units);
    }
    this.render();
  }

  onClose(): void {
    this.renderer.unload();
    if (this.advanceTimer !== null) window.clearTimeout(this.advanceTimer);
    this.contentEl.empty();
  }

  private go(step: Step): void { this.step = step; this.notice = null; this.render(true); }

  // ---- shell: header, stepper, body, footer
  private render(focusHeading = false): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("garmy-shell");
    const head = el.createDiv({ cls: "garmy-head" });
    head.createEl("h2", { cls: "garmy-title", text: this.ui.title });
    head.createEl("p", { cls: "garmy-subtitle", text: this.ui.subtitle });
    this.renderStepper(el);
    const body = el.createDiv({ cls: "garmy-body" });
    const foot = el.createDiv({ cls: "garmy-footer" });
    let heading: HTMLElement;
    if (this.step === "key") heading = this.renderKey(body, foot);
    else if (this.step === "load") heading = this.renderLoad(body, foot);
    else if (this.step === "choose") heading = this.renderChoose(body, foot);
    else heading = this.renderPreview(body, foot);
    if (this.notice) body.appendChild(this.buildNotice(this.notice));
    if (!foot.hasChildNodes()) foot.remove();
    if (focusHeading) { heading.setAttr("tabindex", "-1"); heading.focus({ preventScroll: true }); }
  }

  private renderStepper(el: HTMLElement): void {
    const ui = this.ui;
    const cur = ORDER.indexOf(this.step);
    const nav = el.createEl("nav", { cls: "garmy-stepper" });
    this.labelBy(nav, nav.createSpan({ cls: "garmy-sr", text: ui.stepsLabel }));
    const list = nav.createEl("ol", { cls: "garmy-steps" });
    ORDER.forEach((s, i) => {
      const name = ui.stepNames[i] ?? s;
      const state = i < cur ? "is-done" : i === cur ? "is-current" : "is-todo";
      const li = list.createEl("li", { cls: `garmy-steps-item ${state}` });
      if (i === cur) li.setAttr("aria-current", "step");
      const canGo = i < cur && !this.loading && !this.checking;
      const inner = canGo ? li.createEl("button", { cls: "garmy-steps-btn", attr: { type: "button" } }) : li.createDiv({ cls: "garmy-steps-btn" });
      const dot = inner.createSpan({ cls: "garmy-steps-dot", attr: { "aria-hidden": "true" } });
      if (i < cur) setIcon(dot, "check"); else dot.setText(String(i + 1));
      inner.createSpan({ cls: "garmy-steps-label", text: name });
      const sr = canGo ? `${ui.step} ${i + 1}, ${ui.stepDone}` : i === cur ? `${ui.step} ${i + 1} / ${ORDER.length}` : `${ui.step} ${i + 1}`;
      inner.createSpan({ cls: "garmy-sr", text: `, ${sr}` });
      if (canGo) inner.addEventListener("click", () => this.go(s));
    });
  }

  private buildNotice(n: Callout): HTMLElement {
    const box = createDiv({ cls: `garmy-callout is-${n.kind} garmy-message`, attr: { role: "alert" } });
    const icon = box.createDiv({ cls: "garmy-callout-icon", attr: { "aria-hidden": "true" } });
    setIcon(icon, n.kind === "error" ? "circle-alert" : "triangle-alert");
    const txt = box.createDiv({ cls: "garmy-callout-text" });
    txt.createDiv({ cls: "garmy-callout-title", text: n.title });
    txt.createDiv({ cls: "garmy-callout-body", text: n.body });
    if (n.action) {
      const run = n.action.run;
      const b = txt.createEl("button", { cls: "garmy-callout-action", text: n.action.label, attr: { type: "button" } });
      b.addEventListener("click", run);
    }
    return box;
  }

  private stepHead(body: HTMLElement, title: string, lead: string): HTMLElement {
    const h = body.createEl("h3", { cls: "garmy-step-title", text: title });
    body.createEl("p", { cls: "garmy-lead", text: lead });
    return h;
  }

  private button(foot: HTMLElement, label: string, cls: string, run: () => void, kind: "cta" | "plain" | "ghost" = "plain"): HTMLButtonElement {
    const b = foot.createEl("button", { text: label, cls: `garmy-btn ${cls}`, attr: { type: "button" } });
    if (kind === "cta") b.addClass("mod-cta");
    if (kind === "ghost") b.addClass("garmy-btn-ghost");
    b.addEventListener("click", run);
    return b;
  }

  // ---- 1. key
  private renderKey(body: HTMLElement, foot: HTMLElement): HTMLElement {
    const ui = this.ui;
    const heading = this.stepHead(body, ui.keyTitle, ui.keyIntro);
    const cols = body.createDiv({ cls: "garmy-cols" });
    const main = cols.createDiv({ cls: "garmy-col-main" });
    const side = cols.createDiv({ cls: "garmy-col-side" });

    const safe = main.createDiv({ cls: "garmy-callout is-info", attr: { role: "note" } });
    setIcon(safe.createDiv({ cls: "garmy-callout-icon", attr: { "aria-hidden": "true" } }), "shield-check");
    const st = safe.createDiv({ cls: "garmy-callout-text" });
    st.createDiv({ cls: "garmy-callout-title", text: ui.keySafeTitle });
    st.createDiv({ cls: "garmy-callout-body", text: ui.keySafe });

    main.createEl("h4", { cls: "garmy-subhead", text: ui.keyHowTitle });
    const ol = main.createEl("ol", { cls: "garmy-howto" });
    for (const t of ui.keyHow) ol.createEl("li", { text: t });

    mountMediaSlot(side, {
      src: keyHelp, animated: false, caption: ui.mediaKeyCaption, alt: ui.mediaKeyAlt,
      playLabel: ui.mediaPlay, stopLabel: ui.mediaStop, illustration: "key",
    });

    const field = body.createDiv({ cls: "garmy-field" });
    field.createEl("label", { cls: "garmy-label", text: ui.keyLabel, attr: { for: "garmy-key-input" } });
    if (this.plugin.getKey() !== "") {
      const ok = field.createDiv({ cls: "garmy-ok garmy-status" });
      setIcon(ok.createSpan({ cls: "garmy-status-icon", attr: { "aria-hidden": "true" } }), "check");
      ok.createSpan({ text: ui.keySaved });
    }
    const row = field.createDiv({ cls: "garmy-key-row" });
    const input = row.createEl("input", { cls: "garmy-key", attr: { id: "garmy-key-input", type: "password", autocomplete: "off", spellcheck: "false", placeholder: ui.keyPlaceholder } });
    input.value = this.keyDraft;
    input.addEventListener("input", () => { this.keyDraft = input.value.trim(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void this.checkKey(); } });
    this.keyInput = input;
    const toggle = row.createEl("button", { cls: "garmy-btn garmy-key-toggle", text: ui.keyShow, attr: { type: "button", "aria-controls": "garmy-key-input", "aria-pressed": "false" } });
    toggle.addEventListener("click", () => {
      const shown = input.type === "password";
      input.type = shown ? "text" : "password";
      toggle.setText(shown ? ui.keyHide : ui.keyShow);
      toggle.setAttr("aria-pressed", String(shown));
    });

    this.renderExistingNotes(body);

    const check = this.button(foot, ui.keyCheck, "garmy-key-check", () => void this.checkKey(), "cta");
    if (this.checking) { check.disabled = true; check.setText(ui.keyChecking); }
    return heading;
  }

  /** A way past the key for people who already keep Garmin numbers in their notes. */
  private renderExistingNotes(body: HTMLElement): void {
    const t = this.sync;
    const box = body.createDiv({ cls: "garmy-alt" });
    box.createEl("h4", { cls: "garmy-subhead", text: t.useNotesTitle });
    box.createEl("p", { cls: "garmy-hint", text: t.useNotesHint });
    if (this.candidates === null) {
      this.button(box, t.findNotes, "garmy-find-notes", () => { this.candidates = detectDataFolders(scanNotes(this.app), this.dayParse()); this.render(); });
      return;
    }
    if (this.candidates.length === 0) { box.createEl("p", { cls: "garmy-hint garmy-notes-none", text: t.notesNone }); return; }
    box.createEl("p", { cls: "garmy-hint", text: t.notesFound });
    for (const c of this.candidates) this.button(box, t.notesFolder(c.folder, c.notes), "garmy-notes-folder", () => this.useFolder(c.folder));
  }

  /** ISO names always count; the user's own daily note format counts too. */
  private dayParse(): DayParser {
    const custom = dayParser(this.plugin.dailyFormat());
    return (name) => isoParser(name) ?? custom(name);
  }

  private useFolder(folder: string): void {
    this.sourceFolder = folder;
    this.rows = readRows(this.app, folder, this.dayParse());
    this.profile = buildProfile(this.rows);
    this.afterLoad();
  }


  private async checkKey(): Promise<void> {
    const ui = this.ui;
    if (this.checking) return;
    const key = this.keyDraft || this.plugin.getKey();
    if (!key) {
      this.notice = { kind: "warn", title: ui.errEmptyTitle, body: ui.keyEmpty };
      this.render();
      this.keyInput?.focus();
      return;
    }
    this.checking = true;
    this.notice = null;
    this.render();
    try {
      await this.plugin.newClient(key).verify();
      this.plugin.setKey(key);
      this.plugin.settings.keyProblem = "";
      await this.plugin.saveSettings();
      this.keyDraft = "";
      this.checking = false;
      this.go("load");
    } catch (e) {
      this.checking = false;
      const kind = e instanceof GarminError ? e.kind : "network";
      if (!(e instanceof GarminError)) console.error("Garmy: key check failed", e);
      const retry: NoticeAction = { label: ui.errRetry, run: () => void this.checkKey() };
      this.notice = kind === "auth"
        ? { kind: "error", title: ui.errBadTitle, body: ui.keyBad, action: { label: ui.errNewKey, run: () => { this.keyInput?.focus(); this.keyInput?.select(); } } }
        : kind === "rate"
          ? { kind: "warn", title: ui.errRateTitle, body: ui.keyRate, action: retry }
          : { kind: "error", title: ui.errNetTitle, body: ui.keyNet, action: retry };
      this.render();
    }
  }

  // ---- 2. load
  private resetParts(): void { for (const p of PARTS) this.parts.set(p, { state: "waiting", done: 0, total: 0 }); }

  private renderLoad(body: HTMLElement, foot: HTMLElement): HTMLElement {
    const ui = this.ui;
    const heading = this.stepHead(body, ui.loadTitle, ui.loadIntro);
    body.createEl("p", { cls: "garmy-hint", text: ui.note + this.plugin.settings.dataFolder });
    if (this.rows.length) {
      const saved = body.createDiv({ cls: "garmy-saved" });
      const txt = saved.createDiv({ cls: "garmy-saved-text" });
      setIcon(txt.createSpan({ cls: "garmy-status-icon", attr: { "aria-hidden": "true" } }), "database");
      txt.createSpan({ text: `${ui.savedInfo} ${this.profile.days}` });
      this.button(saved, ui.useSaved, "garmy-use-saved", () => this.afterLoad());
    }
    const field = body.createDiv({ cls: "garmy-field garmy-field-inline" });
    field.createEl("label", { cls: "garmy-label", text: ui.period, attr: { for: "garmy-period" } });
    const sel = field.createEl("select", { cls: "dropdown garmy-period", attr: { id: "garmy-period" } });
    for (const [v, t] of [["30", ui.days30], ["90", ui.days90], ["365", ui.days365]] as const) sel.createEl("option", { value: v, text: t });
    sel.value = String(this.periodDays);
    sel.disabled = this.loading;
    sel.addEventListener("change", () => { this.periodDays = Number(sel.value); });

    const status = body.createDiv({ cls: "garmy-progress" });
    this.partsEl = status.createEl("ul", { cls: "garmy-parts" });
    this.liveEl = status.createDiv({ cls: "garmy-sr", attr: { role: "status" } });
    this.paintParts();

    const cancel = this.button(foot, this.sync.cancel, "garmy-cancel", () => { this.cancelToken.cancelled = true; cancel.disabled = true; }, "ghost");
    cancel.hidden = !this.loading;
    const b = this.button(foot, ui.start, "garmy-load", () => void this.load(status, b), "cta");
    if (this.loading) { b.disabled = true; b.setText(ui.starting); }
    return heading;
  }

  private paintParts(): void {
    const ui = this.ui;
    const list = this.partsEl;
    if (!list) return;
    list.empty();
    for (const p of PARTS) {
      const v = this.parts.get(p) ?? { state: "waiting" as PartState, done: 0, total: 0 };
      const name = ui.progress[p] ?? p;
      const li = list.createEl("li", { cls: `garmy-part is-${v.state}` });
      const icon = li.createDiv({ cls: "garmy-part-icon", attr: { "aria-hidden": "true" } });
      setIcon(icon, v.state === "done" ? "check" : v.state === "loading" ? "loader" : v.state === "waiting" ? "circle" : "triangle-alert");
      const mid = li.createDiv({ cls: "garmy-part-main" });
      const nameEl = mid.createDiv({ cls: "garmy-part-name", text: name });
      const bar = mid.createDiv({ cls: "garmy-bar", attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(Math.max(v.total, 1)) } });
      this.labelBy(bar, nameEl);
      const pct = v.state === "done" || v.state === "warn" ? 100 : v.total > 0 ? Math.round((v.done / v.total) * 100) : 0;
      if (v.state === "waiting") bar.setAttr("aria-valuenow", "0"); else bar.setAttr("aria-valuenow", String(v.state === "done" || v.state === "warn" ? Math.max(v.total, 1) : v.done));
      bar.createDiv({ cls: "garmy-bar-fill" }).style.setProperty("--garmy-pct", `${pct}%`);
      const label = v.state === "waiting" ? ui.partWaiting : v.state === "done" ? ui.partDone : v.state === "warn" ? ui.partWarn : v.state === "stopped" ? ui.partStopped : `${v.done} / ${v.total}`;
      li.createDiv({ cls: "garmy-part-state", text: label });
    }
  }

  private async load(status: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    const ui = this.ui;
    if (this.loading) return;
    if (this.plugin.syncing) { this.notice = { kind: "warn", title: ui.errStopTitle, body: this.sync.busy }; this.render(); return; }
    this.sourceFolder = null; // a load from Garmin builds on the data folder, not on notes picked earlier
    this.loading = true;
    this.plugin.syncing = true;
    this.cancelToken = { cancelled: false };
    this.notice = null;
    this.resetParts();
    const cancelBtn = this.contentEl.querySelector<HTMLButtonElement>(".garmy-cancel");
    if (cancelBtn) { cancelBtn.hidden = false; cancelBtn.disabled = false; }
    btn.disabled = true;
    btn.setText(ui.starting);
    this.contentEl.querySelector<HTMLSelectElement>(".garmy-period")?.setAttr("disabled", "");
    this.contentEl.querySelectorAll<HTMLButtonElement>(".garmy-steps-btn").forEach((x) => x.setAttr("disabled", ""));
    this.paintParts();
    const client = this.plugin.newClient();
    const to = localDate(Date.now());
    const from = addDays(to, -(this.periodDays - 1));
    const onProgress = (p: Progress): void => {
      const state: PartState = p.done >= p.total ? "done" : "loading";
      this.parts.set(p.step, { state, done: p.done, total: p.total });
      if (state === "done" && this.liveEl) this.liveEl.setText(`${ui.progress[p.step] ?? p.step}: ${ui.partDone}`);
      this.paintParts();
    };
    try {
      const res = await client.backfill(from, to, onProgress, this.cancelToken, this.plugin.settings.units);
      this.warnings = res.warnings;
      for (const p of PARTS) if (res.warnings.some((w) => w.startsWith(p))) { const v = this.parts.get(p); if (v) this.parts.set(p, { ...v, state: "warn" }); }
      this.paintParts();
      const w = await writeDays(this.app, this.plugin.settings.dataFolder, res.records, { overwriteFrom: overwriteFrom(to) });
      this.rows = res.records;
      this.profile = buildProfile(res.records);
      await this.plugin.recordSync(to);
      this.loading = false;
      this.plugin.syncing = false;
      btn.setText(ui.start);
      this.showSummary(status, res.records.length, w.created, from, to);
    } catch (e) {
      this.loading = false;
      this.plugin.syncing = false;
      if (e instanceof GarminError && e.kind === "auth") { this.plugin.settings.keyProblem = to; await this.plugin.saveSettings(); }
      for (const p of PARTS) { const v = this.parts.get(p); if (v?.state === "loading") this.parts.set(p, { ...v, state: "stopped" }); }
      const kind = e instanceof GarminError ? e.kind : "other";
      if (kind !== "cancelled") console.error("Garmy: loading stopped", e);
      const retry: NoticeAction = { label: ui.errRetry, run: () => this.go("load") };
      this.notice = kind === "cancelled"
        ? { kind: "warn", title: this.sync.cancelledTitle, body: this.sync.cancelledBody }
        : kind === "auth"
        ? { kind: "error", title: ui.errStopTitle, body: ui.stoppedAuth, action: { label: ui.errNewKey, run: () => this.go("key") } }
        : kind === "rate" ? { kind: "warn", title: ui.errStopTitle, body: ui.stoppedRate, action: retry }
          : kind === "network" ? { kind: "error", title: ui.errStopTitle, body: ui.stoppedNet, action: retry }
            : { kind: "error", title: ui.errStopTitle, body: ui.stoppedOther, action: retry };
      this.render();
    }
  }

  private showSummary(status: HTMLElement, days: number, created: number, from: string, to: string): void {
    const ui = this.ui;
    const fmt = (d: string): string => new Date(`${d}T00:00:00`).toLocaleDateString(this.lang, { day: "numeric", month: "short", year: "numeric" });
    const box = status.createDiv({ cls: "garmy-summary" });
    setIcon(box.createDiv({ cls: "garmy-summary-icon", attr: { "aria-hidden": "true" } }), "circle-check");
    const txt = box.createDiv({ cls: "garmy-summary-text" });
    txt.createDiv({ cls: "garmy-ok garmy-loaded", text: `${ui.loaded} ${days} (+${created})` });
    txt.createDiv({ cls: "garmy-period-label", text: `${ui.summaryPeriod}: ${fmt(from)} - ${fmt(to)}` });
    if (this.warnings.length) txt.createDiv({ cls: "garmy-summary-warn", text: ui.summaryPartial });
    const next = box.createEl("button", { cls: "garmy-btn mod-cta garmy-continue", text: ui.summaryContinue, attr: { type: "button" } });
    next.addEventListener("click", () => this.afterLoad());
    next.focus({ preventScroll: true });
    this.advanceTimer = window.setTimeout(() => this.afterLoad(), this.warnings.length ? 3500 : 1800);
  }

  private afterLoad(): void {
    if (this.advanceTimer !== null) { window.clearTimeout(this.advanceTimer); this.advanceTimer = null; }
    if (this.profile.days === 0) {
      this.notice = { kind: "warn", title: this.ui.errNoDataTitle, body: this.ui.noData };
      this.render();
      return;
    }
    const sports = activeSports(this.profile);
    this.choices.sports = new Set(sports);
    this.choices.template = "overview";
    this.choices.groups = new Set(["recovery", "activity", "training"].filter((g) => this.groupAvailable(g)));
    this.go("choose");
  }

  /**
   * Mirrors a checkbox's state onto its label as classes. The CSS used `label:has(input:checked)`, which Obsidian's
   * review flags as slow (a broad selector invalidation); a class costs nothing.
   */
  private trackChecked(label: HTMLElement, input: HTMLInputElement): void {
    const sync = (): void => { label.toggleClass("is-checked", input.checked); };
    sync();
    input.addEventListener("change", sync);
    input.addEventListener("focus", () => { label.toggleClass("is-focus", input.matches(":focus-visible")); });
    input.addEventListener("blur", () => { label.removeClass("is-focus"); });
  }

  private groupAvailable(g: string): boolean {
    const c = this.profile.count;
    if (g === "recovery") return ["sleep_score", "sleep_duration", "hrv", "body_battery", "resting_hr", "stress", "training_readiness"].some((f) => (c[f] ?? 0) > 0);
    if (g === "activity") return (c.steps ?? 0) > 0 || (c.distance_km ?? 0) > 0;
    return activeSports(this.profile).length > 0;
  }

  // ---- 3. choose
  private renderChoose(body: HTMLElement, foot: HTMLElement): HTMLElement {
    const ui = this.ui;
    const heading = this.stepHead(body, ui.chooseTitle, ui.chooseIntro);
    let previewBtn: HTMLButtonElement | null = null;
    let overviewBox: HTMLElement | null = null;
    let sportsBox: HTMLElement | null = null;
    let empty: HTMLElement | null = null;
    // Training cards need at least one sport; the other groups stand on their own. Only the overview has groups.
    const nothingToShow = (): boolean => this.choices.template === "overview" && !(this.choices.groups.has("recovery") || this.choices.groups.has("activity") || (this.choices.groups.has("training") && this.choices.sports.size > 0));
    const refresh = (): void => {
      const none = nothingToShow();
      empty?.toggleClass("is-visible", none);
      if (previewBtn) previewBtn.disabled = none;
      if (overviewBox) overviewBox.hidden = this.choices.template !== "overview";
      if (sportsBox) sportsBox.hidden = !USES_SPORTS.has(this.choices.template);
    };

    this.renderTemplates(body, refresh);
    overviewBox = body.createDiv({ cls: "garmy-overview-box" });
    empty = overviewBox.createDiv({ cls: "garmy-hint garmy-empty-hint", text: ui.nothingChosen, attr: { role: "status" } });
    const cards = overviewBox.createDiv({ cls: "garmy-cards", attr: { role: "group" } });
    this.labelBy(cards, heading);
    for (const g of ["recovery", "activity", "training"]) {
      if (!this.groupAvailable(g)) continue;
      const label = cards.createEl("label", { cls: "garmy-card" });
      const input = label.createEl("input", { cls: `garmy-check garmy-group-${g}`, attr: { type: "checkbox" } });
      input.checked = this.choices.groups.has(g);
      this.trackChecked(label, input);
      input.addEventListener("change", () => { if (input.checked) this.choices.groups.add(g); else this.choices.groups.delete(g); refresh(); });
      setIcon(label.createDiv({ cls: "garmy-card-icon", attr: { "aria-hidden": "true" } }), GROUP_ICONS[g] ?? "layout-dashboard");
      const txt = label.createDiv({ cls: "garmy-card-text" });
      txt.createDiv({ cls: "garmy-card-title", text: ui.groups[g] ?? g });
      txt.createDiv({ cls: "garmy-card-desc", text: ui.groupHints[g] ?? "" });
      setIcon(label.createDiv({ cls: "garmy-mark", attr: { "aria-hidden": "true" } }), "check");
    }

    const sports = activeSports(this.profile);
    sportsBox = body.createDiv({ cls: "garmy-sports-box" });
    const sportsHead = sportsBox.createEl("h4", { cls: "garmy-subhead", text: ui.sports });
    sportsBox.createEl("p", { cls: "garmy-hint", text: sports.length ? ui.sportsHint : ui.noSports });
    const chips = sportsBox.createDiv({ cls: "garmy-chips", attr: { role: "group" } });
    this.labelBy(chips, sportsHead);
    for (const s of sports) {
      const sp = SPORTS[s];
      if (!sp) continue;
      const label = chips.createEl("label", { cls: "garmy-chip" });
      const input = label.createEl("input", { cls: `garmy-check garmy-sport-${s}`, attr: { type: "checkbox" } });
      input.checked = this.choices.sports.has(s);
      this.trackChecked(label, input);
      input.addEventListener("change", () => { if (input.checked) this.choices.sports.add(s); else this.choices.sports.delete(s); refresh(); });
      label.createSpan({ cls: "garmy-chip-emoji", text: sp.icon, attr: { "aria-hidden": "true" } });
      label.createSpan({ cls: "garmy-chip-label", text: T[this.lang][s] ?? s });
      setIcon(label.createSpan({ cls: "garmy-mark", attr: { "aria-hidden": "true" } }), "check");
    }

    const more = body.createEl("details", { cls: "garmy-options" });
    more.createEl("summary", { text: ui.options });
    const inner = more.createDiv({ cls: "garmy-options-body" });
    new Setting(inner).setName(ui.races).setDesc(ui.racesHint).addText((t) => t.setValue(this.choices.races).onChange((v) => { this.choices.races = v.trim(); this.paintTemplates(); refresh(); }));
    new Setting(inner).setName(this.sync.setUnitsName).addDropdown((d) => {
      d.addOption("metric", this.sync.unitsMetric).addOption("imperial", this.sync.unitsImperial);
      d.setValue(this.plugin.settings.units).onChange((v) => {
        const units = v === "imperial" ? "imperial" : "metric";
        this.rows = convertRecords(this.rows, units); // the data in memory follows, so the preview needs no new request
        this.profile = buildProfile(this.rows);
        void this.plugin.setUnits(units);
      });
    });
    new Setting(inner).setName(ui.language).addDropdown((d) => {
      for (const l of LANGS) d.addOption(l.code, l.native);
      d.setValue(this.choices.lang).onChange((v) => { this.choices.lang = pickLang(v); });
    });

    this.button(foot, ui.back, "garmy-back", () => this.go("load"), "ghost");
    previewBtn = this.button(foot, ui.preview, "garmy-preview-btn", () => this.go("preview"), "cta");
    refresh();
    return heading;
  }

  /** The library: one card per dashboard the data can fill; the others stay greyed with what they are waiting for. */
  private renderTemplates(body: HTMLElement, changed: () => void): void {
    const head = body.createEl("h4", { cls: "garmy-subhead", text: this.ui.tplTitle });
    body.createEl("p", { cls: "garmy-hint", text: this.ui.tplHint });
    this.tplGrid = body.createDiv({ cls: "garmy-cards garmy-tpls", attr: { role: "radiogroup" } });
    this.labelBy(this.tplGrid, head);
    this.tplChanged = changed;
    this.paintTemplates();
  }

  private templateOptions(): TemplateOption[] {
    return listTemplates(this.profile, { source: this.sourceFolder ?? this.plugin.settings.dataFolder, races: this.choices.races || null, units: this.plugin.settings.units });
  }

  /** Draws the cards again. Needed when the data or the race changes what is available, not when the choice moves. */
  private paintTemplates(): void {
    const grid = this.tplGrid;
    if (!grid) return;
    const ui = this.ui;
    const list = this.templateOptions();
    if (list.find((t) => t.id === this.choices.template)?.need) this.choices.template = "overview"; // the race was cleared, say
    grid.empty();
    const cards: Array<{ id: string; label: HTMLElement }> = [];
    for (const tpl of list) {
      const off = tpl.need !== null;
      const label = grid.createEl("label", { cls: "garmy-card garmy-tpl" });
      label.toggleClass("is-disabled", off);
      const input = label.createEl("input", { cls: `garmy-check garmy-tpl-${tpl.id.replace(":", "-")}`, attr: { type: "radio", name: "garmy-template", value: tpl.id } });
      input.checked = this.choices.template === tpl.id;
      input.disabled = off;
      this.trackChecked(label, input);
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.choices.template = tpl.id;
        for (const c of cards) c.label.toggleClass("is-checked", c.id === tpl.id);
        this.tplChanged?.();
      });
      setIcon(label.createDiv({ cls: "garmy-card-icon", attr: { "aria-hidden": "true" } }), tpl.icon);
      const txt = label.createDiv({ cls: "garmy-card-text" });
      txt.createDiv({ cls: "garmy-card-title", text: T[this.lang][tpl.name] ?? tpl.name });
      txt.createDiv({ cls: "garmy-card-desc", text: (tpl.need ? ui.tplNeed[tpl.need] : ui.tplDesc[tpl.desc]) ?? "" });
      setIcon(label.createDiv({ cls: "garmy-mark", attr: { "aria-hidden": "true" } }), "check");
      cards.push({ id: tpl.id, label });
    }
  }

  // ---- 4. preview + insert
  private meta: RegionMeta = { v: 1, source: "", groups: [], noSports: [], lang: "en", races: null };

  private build(): string {
    const tpl = this.choices.template;
    const r = this.choices.races;
    const races = r && (isRaceDate(r) || this.app.vault.getAbstractFileByPath(r)) ? r : null;
    const overview = tpl === "overview";
    this.meta = {
      v: 1, source: this.sourceFolder ?? this.plugin.settings.dataFolder, groups: overview ? [...this.choices.groups] : [],
      noSports: USES_SPORTS.has(tpl) ? activeSports(this.profile).filter((x) => !this.choices.sports.has(x)) : [],
      lang: this.choices.lang, races, ...(this.sourceFolder !== null && this.plugin.dailyFormat() !== ISO_FORMAT ? { dayFormat: this.plugin.dailyFormat() } : {}),
      ...(overview ? {} : { template: tpl }),
    };
    return compose(this.profile, { source: this.meta.source, lang: this.meta.lang, groups: this.meta.groups, sports: [...this.choices.sports], races, units: this.plugin.settings.units, template: tpl, goalUsual: this.plugin.goalUsual() }).markdown;
  }

  private renderPreview(body: HTMLElement, foot: HTMLElement): HTMLElement {
    const ui = this.ui;
    this.markdown = this.build();
    const heading = this.stepHead(body, ui.previewTitle, ui.previewIntro);
    const dashy = this.plugin.dashyState();
    if (dashy !== "ready") {
      const missing = dashy === "missing";
      const callout = this.buildNotice({
        kind: "warn",
        title: missing ? ui.noDashyTitle : this.sync.dashyDisabledTitle,
        body: missing ? ui.noDashy : this.sync.dashyDisabled,
        action: missing
          ? { label: this.sync.dashyMissingAction, run: () => { window.open("obsidian://show-plugin?id=dashsidian"); } }
          : { label: this.sync.dashyEnable, run: () => { void this.plugin.enableDashy().then(() => this.render()); } },
      });
      callout.addClass("garmy-warn");
      body.appendChild(callout);
      if (missing) {
        mountMediaSlot(callout.querySelector<HTMLElement>(".garmy-callout-text") ?? callout, {
          src: null, animated: true, caption: ui.mediaDashyCaption, alt: ui.mediaDashyAlt,
          playLabel: ui.mediaPlay, stopLabel: ui.mediaStop, illustration: "plugin", hideWhenMissing: true,
        });
      }
    }
    const frame = body.createDiv({ cls: "garmy-frame" });
    const bar = frame.createDiv({ cls: "garmy-frame-bar" });
    for (let i = 0; i < 3; i++) bar.createSpan({ cls: "garmy-frame-dot", attr: { "aria-hidden": "true" } });
    const frameTitle = bar.createSpan({ cls: "garmy-frame-title", text: ui.previewFrame });
    const box = frame.createDiv({ cls: "garmy-preview markdown-rendered is-rendering", attr: { role: "region", tabindex: "0", "aria-busy": "true" } });
    this.labelBy(box, frameTitle);
    const wait = box.createDiv({ cls: "garmy-preview-wait", text: ui.previewRendering });
    MarkdownRenderer.render(this.app, this.stripFrontmatter(this.markdown), box, `${this.plugin.settings.dataFolder}/${this.previewName()}.md`, this.renderer).then(() => {
      wait.remove(); box.removeClass("is-rendering"); box.setAttr("aria-busy", "false");
    }).catch((e: unknown) => {
      console.error("Garmy: preview render failed", e);
      wait.remove(); box.removeClass("is-rendering"); box.setAttr("aria-busy", "false");
      body.appendChild(this.buildNotice({ kind: "warn", title: ui.errRenderTitle, body: ui.previewFail }));
    });

    this.button(foot, ui.back, "garmy-back", () => this.go("choose"), "ghost");
    this.button(foot, ui.insertNote, "garmy-insert", () => void this.insertIntoActive());
    this.button(foot, ui.createNote, "garmy-create", () => void this.createNote(), "cta");
    return heading;
  }

  private stripFrontmatter(md: string): string { return md.replace(/^---\n[\s\S]*?\n---\n/, ""); }

  /** A weekly or monthly review is named for its period, because that name is how Dashy knows which days it counts. */
  private periodName(): string | null {
    const today = localDate(Date.now());
    if (this.choices.template === "week") return isoWeek(today);
    if (this.choices.template === "month") return today.slice(0, 7);
    return null;
  }

  /** The preview is drawn as if it sat in a note of its own, which for a review is the note named for the period. */
  private previewName(): string { return this.periodName() ?? "preview"; }

  private noteName(title: string): string {
    const base = this.choices.lang === "ru" ? "Дашборд Garmin" : "Garmin dashboard";
    const period = this.periodName();
    if (period) return period;
    if (this.choices.template === "overview") return base;
    return `${base} - ${title.replace(/^#\s*/, "").replace(/^[^\p{L}\p{N}]+/u, "")}`;
  }

  private async createNote(): Promise<void> {
    const parts = splitComposed(this.markdown);
    const name = this.noteName(parts.title);
    const period = this.periodName() !== null;
    if (period && this.app.vault.getAbstractFileByPath(normalizePath(`${this.plugin.settings.notesFolder}/${name}.md`))) {
      this.notice = { kind: "warn", title: this.ui.tplExistsTitle, body: this.ui.tplExists };
      this.render();
      return;
    }
    const path = await uniquePath(this.app, this.plugin.settings.notesFolder, name);
    const text = withMeta(`${parts.frontmatter}\n\n${parts.title}\n\n${wrapRegion(parts.body)}\n`, this.meta);
    const problem = await this.dashyProblem(text, path);
    const file = await this.app.vault.create(path, text);
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(this.ui.created + path);
    if (problem) new Notice(`${this.ui.blocksProblem} ${problem}`, 12000);
    this.close();
  }

  /** Asks Dashy 2.2 to draw the blocks off screen before they are written, and returns what it says about the first broken one. */
  private async dashyProblem(text: string, path: string): Promise<string | null> {
    const api = this.plugin.dashyApi();
    if (!api) return null;
    try {
      let blocks = await api.check(text, path);
      if (wasNotChecked(blocks)) blocks = await api.check(text, path);
      const bad = brokenBlocks(blocks)[0];
      if (!bad) return null;
      return bad.findings.find((f) => f.level === "error")?.message ?? bad.lang;
    } catch (e) {
      console.warn("Garmy: Dashy could not check the blocks", e);
      return null;
    }
  }

  private async insertIntoActive(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) { this.notice = { kind: "warn", title: this.ui.errNoNoteTitle, body: this.ui.noActive }; this.render(); return; }
    const body = wrapRegion(splitComposed(this.markdown).body) + "\n";
    const problem = await this.dashyProblem(body, view.file?.path ?? "");
    view.editor.replaceSelection(body);
    const target = view.file;
    if (target) void this.app.fileManager.processFrontMatter(target, (fm: Record<string, unknown>) => { fm.garmy = encodeMeta(this.meta); });
    new Notice(this.ui.inserted);
    if (problem) new Notice(`${this.ui.blocksProblem} ${problem}`, 12000);
    this.close();
  }
}
