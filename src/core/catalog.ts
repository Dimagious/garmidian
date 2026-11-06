// What Garmy knows about: health metrics and sports, with labels per language.
// Fields are the names written to the note frontmatter (same as Garmin Health Sync / garmin-repair).

export interface MetricDef { icon: string; color: string; better: "up" | "down"; group: "recovery" | "activity"; unit: "" | "ms" | "bpm" | "km" }
export interface SportDef { icon: string; color: string; km: string | null; min: string; precision: number }
export type Lang = "ru" | "en";

export const METRICS: Record<string, MetricDef> = {
  sleep_score:        { icon: "💤", color: "purple", better: "up",   group: "recovery", unit: "" },
  sleep_duration:     { icon: "🛏", color: "blue",   better: "up",   group: "recovery", unit: "" },
  hrv:                { icon: "💓", color: "green",  better: "up",   group: "recovery", unit: "ms" },
  resting_hr:         { icon: "❤️", color: "red",    better: "down", group: "recovery", unit: "bpm" },
  body_battery:       { icon: "⚡", color: "cyan",   better: "up",   group: "recovery", unit: "" },
  training_readiness: { icon: "🔋", color: "blue",   better: "up",   group: "recovery", unit: "" },
  stress:             { icon: "😰", color: "orange", better: "down", group: "recovery", unit: "" },
  steps:              { icon: "🚶", color: "blue",   better: "up",   group: "activity", unit: "" },
  distance_km:        { icon: "📏", color: "cyan",   better: "up",   group: "activity", unit: "km" },
};

export const SPORTS: Record<string, SportDef> = {
  run:      { icon: "🏃", color: "green",  km: "run_km",  min: "run_min",  precision: 1 },
  bike:     { icon: "🚴", color: "blue",   km: "bike_km", min: "bike_min", precision: 0 },
  swim:     { icon: "🏊", color: "cyan",   km: "swim_km", min: "swim_min", precision: 1 },
  strength: { icon: "🏋️", color: "orange", km: null,      min: "strength_min", precision: 0 },
};

export const UNITS: Record<Lang, Record<string, string>> = {
  ru: { ms: " мс", bpm: " уд/мин", km: " км" },
  en: { ms: " ms", bpm: " bpm", km: " km" },
};

export const T: Record<Lang, Record<string, string>> = {
  ru: {
    sleep_score: "Сон", sleep_duration: "Длительность сна", hrv: "HRV", resting_hr: "Пульс покоя",
    training_readiness: "Готовность", body_battery: "Body Battery", stress: "Стресс", steps: "Шаги", distance_km: "Дистанция",
    run: "Бег", bike: "Вело", swim: "Плавание", strength: "Силовые",
    latestNight: "последняя ночь", latest: "последний замер", days: " дн.",
    now: "Сейчас", weekVsUsual: "7 дней к моей норме", week: "7 дней", trends: "Динамика",
    activity: "Движение", training: "Тренировки", races: "Старт", recovery: "Восстановление",
    stepsPerDay: "Шагов в день", stepsStreak: "Серия 10 000", km7: "Км за 7 дней",
    chartRecovery: "Сон и готовность", chartHr: "HRV и пульс покоя", chartSteps: "Шаги по дням",
    chartMinutes: "Минуты тренировок", yearBySport: "Год по видам спорта", monthByDay: "Месяц по дням",
    goals: "Цели на месяц (из твоих последних 28 дней)", nextRace: "Ближайший старт",
    waitWeek: "Графики и сравнения появятся, когда накопится неделя данных. Сейчас дней с данными:",
    waitMonth: "Годовые карты и цели появятся, когда накопится месяц данных.",
    sum7: "Сумма за 7 дней", monthCard: "Месяц", sleepHrv: "Сон, HRV и пульс покоя",
    title: "Мой дашборд Garmin", month: "Месячный обзор",
    madeBy: "Собрано Garmy из твоих данных. Пересобрать можно в любой момент.",
  },
  en: {
    sleep_score: "Sleep", sleep_duration: "Sleep duration", hrv: "HRV", resting_hr: "Resting HR",
    training_readiness: "Readiness", body_battery: "Body Battery", stress: "Stress", steps: "Steps", distance_km: "Distance",
    run: "Run", bike: "Bike", swim: "Swim", strength: "Strength",
    latestNight: "last night", latest: "last reading", days: " d",
    now: "Now", weekVsUsual: "7 days vs my usual", week: "7 days", trends: "Trends",
    activity: "Movement", training: "Training", races: "Race", recovery: "Recovery",
    stepsPerDay: "Steps per day", stepsStreak: "10,000 streak", km7: "Km in 7 days",
    chartRecovery: "Sleep and readiness", chartHr: "HRV and resting HR", chartSteps: "Steps per day",
    chartMinutes: "Training minutes", yearBySport: "Year by sport", monthByDay: "Month by day",
    goals: "Monthly goals (from your last 28 days)", nextRace: "Next race",
    waitWeek: "Charts and comparisons appear once a week of data has accumulated. Days with data so far:",
    waitMonth: "Year maps and goals appear once a month of data has accumulated.",
    sum7: "Total for 7 days", monthCard: "Month", sleepHrv: "Sleep, HRV and resting HR",
    title: "My Garmin dashboard", month: "Monthly review",
    madeBy: "Built by Garmy from your data. Rebuild it any time.",
  },
};
