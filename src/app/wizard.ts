import { MarkdownRenderer, Modal, Notice, Setting, MarkdownView, setIcon, type App } from "obsidian";
import { GarminClient, GarminError, iso, type Progress } from "../api/client";
import { SPORTS, T, type Lang } from "../core/catalog";
import { activeSports, compose } from "../core/compose";
import { buildProfile } from "../core/profile";
import type { DataProfile, DayRecord } from "../core/types";
import { UI, type Ui } from "./i18n";
import { mountMediaSlot } from "./media-slot";
import { readRows, uniquePath, writeDays } from "./storage";
import type GarmyPlugin from "../main";

type Step = "key" | "load" | "choose" | "preview";
const ORDER: Step[] = ["key", "load", "choose", "preview"];
const PARTS: Progress["step"][] = ["daily", "sleep", "hrv", "activities"];
const GROUP_ICONS: Record<string, string> = { recovery: "heart-pulse", activity: "footprints", training: "dumbbell" };

interface Choices { groups: Set<string>; sports: Set<string>; races: string; lang: Lang }
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

  /** Names an element by another one. Unlike aria-label it does not pop an Obsidian tooltip on hover. */
  private labelBy(el: HTMLElement, source: HTMLElement): void {
    if (!source.id) source.id = `garmy-l${++this.uid}`;
    el.setAttr("aria-labelledby", source.id);
  }

  constructor(app: App, private readonly plugin: GarmyPlugin, private readonly lang: Lang) {
    super(app);
    this.choices = { groups: new Set(), sports: new Set(), races: plugin.settings.racesFolder, lang };
    this.modalEl.addClass("garmy-wizard");
    this.resetParts();
  }

  private get ui(): Ui { return UI[this.lang]; }

  onOpen(): void {
    const saved = readRows(this.app, this.plugin.settings.dataFolder);
    if (saved.length) { this.rows = saved; this.profile = buildProfile(saved); }
    this.render();
  }

  onClose(): void {
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

    mountMediaSlot(this.app, side, {
      file: "media/help-key.gif", pluginDir: this.pluginDir(), caption: ui.mediaKeyCaption, alt: ui.mediaKeyAlt,
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

    const check = this.button(foot, ui.keyCheck, "garmy-key-check", () => void this.checkKey(), "cta");
    if (this.checking) { check.disabled = true; check.setText(ui.keyChecking); }
    return heading;
  }

  private pluginDir(): string { return this.plugin.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`; }

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
      await new GarminClient(this.plugin.http, key).verify();
      this.plugin.setKey(key);
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
    this.loading = true;
    this.notice = null;
    this.resetParts();
    btn.disabled = true;
    btn.setText(ui.starting);
    this.contentEl.querySelector<HTMLSelectElement>(".garmy-period")?.setAttr("disabled", "");
    this.contentEl.querySelectorAll<HTMLButtonElement>(".garmy-steps-btn").forEach((x) => x.setAttr("disabled", ""));
    this.paintParts();
    const client = new GarminClient(this.plugin.http, this.plugin.getKey());
    const to = iso(Date.now());
    const from = iso(Date.now() - (this.periodDays - 1) * 864e5);
    const onProgress = (p: Progress): void => {
      const state: PartState = p.done >= p.total ? "done" : "loading";
      this.parts.set(p.step, { state, done: p.done, total: p.total });
      if (state === "done" && this.liveEl) this.liveEl.setText(`${ui.progress[p.step] ?? p.step}: ${ui.partDone}`);
      this.paintParts();
    };
    try {
      const res = await client.backfill(from, to, onProgress);
      this.warnings = res.warnings;
      for (const p of PARTS) if (res.warnings.some((w) => w.startsWith(p))) { const v = this.parts.get(p); if (v) this.parts.set(p, { ...v, state: "warn" }); }
      this.paintParts();
      const w = await writeDays(this.app, this.plugin.settings.dataFolder, res.records);
      this.rows = res.records;
      this.profile = buildProfile(res.records);
      this.plugin.settings.lastSync = to;
      await this.plugin.saveSettings();
      this.loading = false;
      btn.setText(ui.start);
      this.showSummary(status, res.records.length, w.created, from, to);
    } catch (e) {
      this.loading = false;
      for (const p of PARTS) { const v = this.parts.get(p); if (v?.state === "loading") this.parts.set(p, { ...v, state: "stopped" }); }
      console.error("Garmy: loading stopped", e);
      const kind = e instanceof GarminError ? e.kind : "other";
      const retry: NoticeAction = { label: ui.errRetry, run: () => this.go("load") };
      this.notice = kind === "auth"
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
  private renderChoose(body: HTMLElement, foot: HTMLElement): HTMLElement {
    const ui = this.ui;
    const heading = this.stepHead(body, ui.chooseTitle, ui.chooseIntro);
    const empty = body.createDiv({ cls: "garmy-hint garmy-empty-hint", text: ui.nothingChosen, attr: { role: "status" } });
    const refresh = (): void => { empty.toggleClass("is-visible", this.choices.groups.size === 0 && this.choices.sports.size === 0); };

    const cards = body.createEl("div", { cls: "garmy-cards", attr: { role: "group" } });
    this.labelBy(cards, heading);
    for (const g of ["recovery", "activity", "training"]) {
      if (!this.groupAvailable(g)) continue;
      const label = cards.createEl("label", { cls: "garmy-card" });
      const input = label.createEl("input", { cls: `garmy-check garmy-group-${g}`, attr: { type: "checkbox" } });
      input.checked = this.choices.groups.has(g);
      input.addEventListener("change", () => { if (input.checked) this.choices.groups.add(g); else this.choices.groups.delete(g); refresh(); });
      setIcon(label.createDiv({ cls: "garmy-card-icon", attr: { "aria-hidden": "true" } }), GROUP_ICONS[g] ?? "layout-dashboard");
      const txt = label.createDiv({ cls: "garmy-card-text" });
      txt.createDiv({ cls: "garmy-card-title", text: ui.groups[g] ?? g });
      txt.createDiv({ cls: "garmy-card-desc", text: ui.groupHints[g] ?? "" });
      setIcon(label.createDiv({ cls: "garmy-mark", attr: { "aria-hidden": "true" } }), "check");
    }

    const sports = activeSports(this.profile);
    const sportsHead = body.createEl("h4", { cls: "garmy-subhead", text: ui.sports });
    body.createEl("p", { cls: "garmy-hint", text: sports.length ? ui.sportsHint : ui.noSports });
    const chips = body.createEl("div", { cls: "garmy-chips", attr: { role: "group" } });
    this.labelBy(chips, sportsHead);
    for (const s of sports) {
      const sp = SPORTS[s];
      if (!sp) continue;
      const label = chips.createEl("label", { cls: "garmy-chip" });
      const input = label.createEl("input", { cls: `garmy-check garmy-sport-${s}`, attr: { type: "checkbox" } });
      input.checked = this.choices.sports.has(s);
      input.addEventListener("change", () => { if (input.checked) this.choices.sports.add(s); else this.choices.sports.delete(s); refresh(); });
      label.createSpan({ cls: "garmy-chip-emoji", text: sp.icon, attr: { "aria-hidden": "true" } });
      label.createSpan({ cls: "garmy-chip-label", text: T[this.lang][s] ?? s });
      setIcon(label.createSpan({ cls: "garmy-mark", attr: { "aria-hidden": "true" } }), "check");
    }

    const more = body.createEl("details", { cls: "garmy-options" });
    more.createEl("summary", { text: ui.options });
    const inner = more.createDiv({ cls: "garmy-options-body" });
    new Setting(inner).setName(ui.races).setDesc(ui.racesHint).addText((t) => t.setValue(this.choices.races).onChange((v) => { this.choices.races = v.trim(); }));
    new Setting(inner).setName(ui.language).addDropdown((d) => d.addOption("ru", "Русский").addOption("en", "English").setValue(this.choices.lang).onChange((v) => { this.choices.lang = v === "ru" ? "ru" : "en"; }));
    refresh();

    this.button(foot, ui.back, "garmy-back", () => this.go("load"), "ghost");
    this.button(foot, ui.preview, "garmy-preview-btn", () => this.go("preview"), "cta");
    return heading;
  }

  // ---- 4. preview + insert
  private build(): string {
    const races = this.choices.races && this.app.vault.getAbstractFileByPath(this.choices.races) ? this.choices.races : null;
    return compose(this.profile, {
      source: this.plugin.settings.dataFolder, lang: this.choices.lang,
      groups: [...this.choices.groups], sports: [...this.choices.sports], races,
    }).markdown;
  }

  private renderPreview(body: HTMLElement, foot: HTMLElement): HTMLElement {
    const ui = this.ui;
    this.markdown = this.build();
    const heading = this.stepHead(body, ui.previewTitle, ui.previewIntro);
    if (!this.plugin.hasDashy()) {
      const warn = body.createDiv({ cls: "garmy-callout is-warn garmy-warn", attr: { role: "note" } });
      setIcon(warn.createDiv({ cls: "garmy-callout-icon", attr: { "aria-hidden": "true" } }), "triangle-alert");
      const t = warn.createDiv({ cls: "garmy-callout-text" });
      t.createDiv({ cls: "garmy-callout-title", text: ui.noDashyTitle });
      t.createDiv({ cls: "garmy-callout-body", text: ui.noDashy });
      mountMediaSlot(this.app, t, {
        file: "media/help-dashy.gif", pluginDir: this.pluginDir(), caption: ui.mediaDashyCaption, alt: ui.mediaDashyAlt,
        playLabel: ui.mediaPlay, stopLabel: ui.mediaStop, illustration: "plugin", hideWhenMissing: true,
      });
    }
    const frame = body.createDiv({ cls: "garmy-frame" });
    const bar = frame.createDiv({ cls: "garmy-frame-bar" });
    for (let i = 0; i < 3; i++) bar.createSpan({ cls: "garmy-frame-dot", attr: { "aria-hidden": "true" } });
    const frameTitle = bar.createSpan({ cls: "garmy-frame-title", text: ui.previewFrame });
    const box = frame.createDiv({ cls: "garmy-preview markdown-rendered is-rendering", attr: { role: "region", tabindex: "0", "aria-busy": "true" } });
    this.labelBy(box, frameTitle);
    const wait = box.createDiv({ cls: "garmy-preview-wait", text: ui.previewRendering });
    MarkdownRenderer.render(this.app, this.stripFrontmatter(this.markdown), box, this.plugin.settings.dataFolder + "/preview.md", this.plugin).then(() => {
      wait.remove(); box.removeClass("is-rendering"); box.setAttr("aria-busy", "false");
    }).catch((e: unknown) => {
      console.error("Garmy: preview render failed", e);
      wait.remove(); box.removeClass("is-rendering"); box.setAttr("aria-busy", "false");
      body.appendChild(this.buildNotice({ kind: "warn", title: ui.errRenderTitle, body: ui.previewFail }));
    });

    this.button(foot, ui.back, "garmy-back", () => this.go("choose"), "ghost");
    this.button(foot, ui.insertNote, "garmy-insert", () => this.insertIntoActive());
    this.button(foot, ui.createNote, "garmy-create", () => void this.createNote(), "cta");
    return heading;
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
    if (!view) { this.notice = { kind: "warn", title: this.ui.errNoNoteTitle, body: this.ui.noActive }; this.render(); return; }
    view.editor.replaceSelection(this.stripFrontmatter(this.markdown));
    new Notice(this.ui.inserted);
    this.close();
  }
}
