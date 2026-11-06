import type { Lang } from "../core/catalog";

export interface Ui {
  title: string; step: string;
  keyIntro: string; keyHow: string; keyLabel: string; keyPlaceholder: string; keySaved: string; keyCheck: string; keyOk: string;
  keyBad: string; keyNet: string; keyRate: string; keyEmpty: string;
  loadIntro: string; period: string; days30: string; days90: string; days365: string; start: string; useSaved: string; savedInfo: string;
  progress: Record<string, string>; loaded: string; warnings: string; stopped: string;
  chooseIntro: string; groups: Record<string, string>; sports: string; noSports: string; races: string; racesHint: string; language: string; preview: string;
  previewIntro: string; noDashy: string; createNote: string; insertNote: string; back: string; next: string; close: string;
  created: string; inserted: string; noActive: string; note: string; noData: string;
}

export const UI: Record<Lang, Ui> = {
  ru: {
    title: "Garmy: дашборд из данных Garmin", step: "Шаг",
    keyIntro: "Garmy берёт данные из официального Personal API Garmin. Ключ нужен только вам: он хранится в защищённом хранилище Obsidian и уходит только в Garmin.",
    keyHow: "Создайте Personal API key в Garmin Connect (раздел Personal API в настройках аккаунта), выберите срок жизни и вставьте ключ ниже.",
    keyLabel: "Personal API key", keyPlaceholder: "Вставьте ключ", keySaved: "Ключ уже сохранён. Можно продолжить или вставить другой.", keyCheck: "Проверить и продолжить", keyOk: "Ключ принят.",
    keyBad: "Garmin не принял ключ. Проверьте, что он скопирован целиком и не истёк.", keyNet: "Нет связи с Garmin. Проверьте интернет и повторите.", keyRate: "Garmin просит подождать. Повторите через минуту.", keyEmpty: "Вставьте ключ.",
    loadIntro: "Загрузим историю и сохраним её заметками по дням, чтобы дашборды работали без сети.", period: "За какой период", days30: "30 дней", days90: "90 дней", days365: "Год", start: "Загрузить", useSaved: "Использовать уже сохранённое", savedInfo: "Уже сохранено дней:",
    progress: { daily: "Шаги, пульс, стресс", sleep: "Сон", hrv: "HRV", activities: "Тренировки" }, loaded: "Загружено дней:", warnings: "Не всё удалось загрузить:", stopped: "Загрузка остановлена:",
    chooseIntro: "Что показывать. Предложено только то, что нашлось в ваших данных.", groups: { recovery: "Восстановление: сон, HRV, пульс покоя, стресс", activity: "Движение: шаги", training: "Тренировки" }, sports: "Виды спорта", noSports: "Тренировок в этом периоде нет.", races: "Папка с гонками (необязательно)", racesHint: "Заметки с полем date, например Races", language: "Язык подписей", preview: "Показать дашборд",
    previewIntro: "Так будет выглядеть дашборд на ваших данных.", noDashy: "Плагин Dashy не найден. Установите и включите его (Параметры, Сторонние плагины), иначе блоки не отрисуются.", createNote: "Создать заметку", insertNote: "Вставить в текущую заметку", back: "Назад", next: "Далее", close: "Закрыть",
    created: "Создана заметка: ", inserted: "Дашборд вставлен в текущую заметку.", noActive: "Нет открытой заметки для вставки.", note: "Заметки по дням лежат в папке: ", noData: "Данных пока нет.",
  },
  en: {
    title: "Garmy: a dashboard from your Garmin data", step: "Step",
    keyIntro: "Garmy reads your data through Garmin's official Personal API. The key is yours alone: it is kept in Obsidian's secure storage and only ever sent to Garmin.",
    keyHow: "Create a Personal API key in Garmin Connect (the Personal API section of your account settings), pick a lifetime and paste the key below.",
    keyLabel: "Personal API key", keyPlaceholder: "Paste the key", keySaved: "A key is already saved. Continue, or paste a different one.", keyCheck: "Check and continue", keyOk: "Key accepted.",
    keyBad: "Garmin did not accept the key. Check that it was copied whole and has not expired.", keyNet: "Cannot reach Garmin. Check your connection and try again.", keyRate: "Garmin asks to wait. Try again in a minute.", keyEmpty: "Paste the key.",
    loadIntro: "We load your history and save it as one note per day, so dashboards work offline.", period: "Period", days30: "30 days", days90: "90 days", days365: "One year", start: "Load", useSaved: "Use what is already saved", savedInfo: "Days already saved:",
    progress: { daily: "Steps, heart rate, stress", sleep: "Sleep", hrv: "HRV", activities: "Workouts" }, loaded: "Days loaded:", warnings: "Not everything loaded:", stopped: "Loading stopped:",
    chooseIntro: "What to show. Only what exists in your data is offered.", groups: { recovery: "Recovery: sleep, HRV, resting heart rate, stress", activity: "Movement: steps", training: "Training" }, sports: "Sports", noSports: "No workouts in this period.", races: "Races folder (optional)", racesHint: "Notes with a date field, for example Races", language: "Label language", preview: "Show the dashboard",
    previewIntro: "This is how the dashboard looks on your data.", noDashy: "The Dashy plugin is not installed or enabled. Install it (Settings, Community plugins) or the blocks will not render.", createNote: "Create a note", insertNote: "Insert into the current note", back: "Back", next: "Next", close: "Close",
    created: "Note created: ", inserted: "Dashboard inserted into the current note.", noActive: "There is no open note to insert into.", note: "Daily notes live in: ", noData: "No data yet.",
  },
};
