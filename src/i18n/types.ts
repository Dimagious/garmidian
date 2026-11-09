// Types shared by every language file. A language file is a `Locale`: the compiler refuses a missing key.

export type Lang = "en" | "ru" | "es" | "de" | "fr" | "pt" | "ja";

/** Languages in the order they are offered. `native` is how each language names itself. */
export const LANGS: ReadonlyArray<{ code: Lang; native: string }> = [
  { code: "en", native: "English" },
  { code: "ru", native: "Русский" },
  { code: "es", native: "Español" },
  { code: "de", native: "Deutsch" },
  { code: "fr", native: "Français" },
  { code: "pt", native: "Português" },
  { code: "ja", native: "日本語" },
];

export interface Ui {
  title: string; subtitle: string; step: string; stepsLabel: string; stepNames: string[]; stepDone: string;
  keyTitle: string; keyIntro: string; keySafeTitle: string; keySafe: string; keyHowTitle: string; keyHow: string[];
  keyLabel: string; keyPlaceholder: string; keySaved: string; keyCheck: string; keyChecking: string; keyShow: string; keyHide: string;
  keyBad: string; keyNet: string; keyRate: string; keyEmpty: string;
  mediaKeyCaption: string; mediaKeyAlt: string; mediaDashyCaption: string; mediaDashyAlt: string; mediaPlay: string; mediaStop: string;
  blocksProblem: string;
  errBadTitle: string; errNetTitle: string; errRateTitle: string; errEmptyTitle: string; errStopTitle: string; errNoDataTitle: string; errNoNoteTitle: string; errRenderTitle: string;
  errNewKey: string; errRetry: string;
  loadTitle: string; loadIntro: string; loadWait: string; period: string; days30: string; days90: string; days365: string; start: string; starting: string; useSaved: string; savedInfo: string;
  progress: Record<string, string>; partWaiting: string; partDone: string; partWarn: string; partStopped: string;
  loaded: string; summaryPeriod: string; summaryPartial: string; summaryContinue: string;
  stoppedAuth: string; stoppedRate: string; stoppedNet: string; stoppedOther: string;
  chooseTitle: string; chooseIntro: string; groups: Record<string, string>; groupHints: Record<string, string>;
  sports: string; sportsHint: string; noSports: string; options: string; races: string; racesHint: string; language: string; preview: string; nothingChosen: string;
  previewTitle: string; previewIntro: string; previewFrame: string; previewRendering: string; previewFail: string;
  tplTitle: string; tplHint: string; tplExistsTitle: string; tplExists: string; tplDesc: Record<string, string>; tplNeed: Record<string, string>;
  noDashyTitle: string; noDashy: string; createNote: string; insertNote: string; back: string; next: string; close: string;
  created: string; inserted: string; noActive: string; note: string; noData: string;
  ribbon: string; setAccount: string; setKeyName: string; setKeySaved: string; setKeyNone: string; setForget: string; setLastSync: string; setNever: string;
  setFolders: string; setDataName: string; setDataDesc: string; setNotesName: string; setNotesDesc: string; setWizard: string; setWizardName: string; setWizardDesc: string; setOpen: string;
}

export interface SyncUi {
  cancel: string; cancelledTitle: string; cancelledBody: string; busy: string; walkBusy: string;
  dashyMissingAction: string; dashyDisabledTitle: string; dashyDisabled: string; dashyEnable: string;
  setLangName: string; setLangDesc: string; setLangAuto: string;
  setSyncName: string; setSyncDesc: string; syncOff: string; sync6: string; sync12: string; sync24: string;
  setUnitsName: string; setUnitsDesc: string; unitsMetric: string; unitsImperial: string; noticeUnitsChanged: string;
  setSyncNowName: string; setSyncNowDesc: string; setSyncNow: string; setLastSyncAt: string;
  setKeyRejected: (date: string) => string; setReplaceKey: string;
  noticeSynced: (days: number) => string; noticeNoKey: string; noticeOffline: string; noticeRate: string; noticeFailed: string;
  noticeKeyRejected: string; noticeReplaceKey: string;
  useNotesTitle: string; useNotesHint: string; findNotes: string; notesNone: string; notesFound: string; notesFolder: (folder: string, n: number) => string;
  rebuildNoNote: string; rebuildNoRegion: string; rebuildNoData: string; rebuildDone: string;
}

/** Words used inside the generated dashboard notes. */
export const LABEL_KEYS = ["sleep_score", "sleep_duration", "hrv", "resting_hr", "training_readiness", "body_battery", "stress", "steps", "distance_km", "run", "bike", "swim", "strength", "latestNight", "latest", "days", "now", "weekVsUsual", "week", "trends", "activity", "training", "races", "recovery", "stepsPerDay", "stepsStreak", "km7", "chartSteps", "chartMinutes", "yearBySport", "monthByDay", "goals", "nextRace", "waitWeek", "waitMonth", "sum7", "monthCard", "title", "month", "madeBy", "dataSource", "tplOverview", "tplGlance", "tplSleep", "tplRecovery", "tplSteps", "tplTriathlon", "tplRace", "tplWeek", "tplYear", "tplEmpty", "avg7", "best30", "bestDay", "bestStreak", "brick", "buildUp", "byMonth", "calmDays", "chargedDays", "chartSessions", "chartVolume", "days10k", "last4", "longest", "nights7h", "nights80", "sessions", "stepsMonth", "streakNow", "thisMonth", "thisYear", "time", "weeklyAvgSteps", "yearAverages", "yearTotals"] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];

export interface Locale {
  ui: Ui;
  sync: SyncUi;
  /** Dashboard labels, keyed by LabelKey and by metric and sport ids. */
  labels: Record<LabelKey, string>;
  /** Unit suffixes with their leading space: ms, bpm, km, mi, yd, min. */
  units: { ms: string; bpm: string; km: string; mi: string; yd: string; min: string };
}
