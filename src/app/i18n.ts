import type { Lang } from "../core/catalog";

export interface Ui {
  title: string; subtitle: string; step: string; stepsLabel: string; stepNames: string[]; stepDone: string;
  keyTitle: string; keyIntro: string; keySafeTitle: string; keySafe: string; keyHowTitle: string; keyHow: string[];
  keyLabel: string; keyPlaceholder: string; keySaved: string; keyCheck: string; keyChecking: string; keyShow: string; keyHide: string;
  keyBad: string; keyNet: string; keyRate: string; keyEmpty: string;
  mediaKeyCaption: string; mediaKeyAlt: string; mediaDashyCaption: string; mediaDashyAlt: string; mediaPlay: string; mediaStop: string;
  errBadTitle: string; errNetTitle: string; errRateTitle: string; errEmptyTitle: string; errStopTitle: string; errNoDataTitle: string; errNoNoteTitle: string; errRenderTitle: string;
  errNewKey: string; errRetry: string;
  loadTitle: string; loadIntro: string; loadWait: string; period: string; days30: string; days90: string; days365: string; start: string; starting: string; useSaved: string; savedInfo: string;
  progress: Record<string, string>; partWaiting: string; partDone: string; partWarn: string; partStopped: string;
  loaded: string; summaryPeriod: string; summaryPartial: string; summaryContinue: string;
  stoppedAuth: string; stoppedRate: string; stoppedNet: string; stoppedOther: string;
  chooseTitle: string; chooseIntro: string; groups: Record<string, string>; groupHints: Record<string, string>;
  sports: string; sportsHint: string; noSports: string; options: string; races: string; racesHint: string; language: string; preview: string; nothingChosen: string;
  previewTitle: string; previewIntro: string; previewFrame: string; previewRendering: string; previewFail: string;
  noDashyTitle: string; noDashy: string; createNote: string; insertNote: string; back: string; next: string; close: string;
  created: string; inserted: string; noActive: string; note: string; noData: string;
  ribbon: string; setAccount: string; setKeyName: string; setKeySaved: string; setKeyNone: string; setForget: string; setLastSync: string; setNever: string;
  setFolders: string; setDataName: string; setDataDesc: string; setNotesName: string; setNotesDesc: string; setWizard: string; setWizardName: string; setWizardDesc: string; setOpen: string;
}

export const UI: Record<Lang, Ui> = {
  ru: {
    title: "Дашборд из данных Garmin", subtitle: "Garmy собирает его из ваших данных за четыре шага.", step: "Шаг", stepsLabel: "Ход настройки",
    stepNames: ["Ключ", "Загрузка", "Выбор", "Просмотр"], stepDone: "пройден, вернуться",
    keyTitle: "Подключите аккаунт Garmin",
    keyIntro: "Personal API key - это длинный пароль, который даёт приложению читать ваши данные Garmin. Срок его жизни вы задаёте сами.",
    keySafeTitle: "Почему это безопасно", keySafe: "Ключ хранится в защищённом хранилище Obsidian и уходит только в Garmin. В заметки и файлы он не попадает.",
    keyHowTitle: "Как получить ключ",
    keyHow: ["Откройте Garmin Connect в браузере и зайдите в настройки аккаунта.", "Найдите раздел Personal API и создайте ключ. Выберите срок жизни.", "Скопируйте ключ и вставьте его ниже."],
    keyLabel: "Personal API key", keyPlaceholder: "Вставьте ключ", keySaved: "Ключ уже сохранён. Можно продолжить или вставить другой.", keyCheck: "Проверить и продолжить", keyChecking: "Проверяем...", keyShow: "Показать", keyHide: "Скрыть",
    keyBad: "Garmin не принял ключ. Проверьте, что он скопирован целиком и не истёк.", keyNet: "Нет связи с Garmin. Проверьте интернет и повторите.", keyRate: "Garmin просит подождать. Повторите через минуту.", keyEmpty: "Вставьте ключ в поле выше.",
    mediaKeyCaption: "Где создать ключ: Garmin Connect, настройки аккаунта, Personal API.", mediaKeyAlt: "Короткий ролик: где в Garmin Connect создать ключ", mediaDashyCaption: "Как установить Dashy", mediaDashyAlt: "Короткий ролик: установка плагина Dashy", mediaPlay: "Показать ролик", mediaStop: "Остановить ролик",
    errBadTitle: "Ключ не подошёл", errNetTitle: "Нет связи с Garmin", errRateTitle: "Garmin просит подождать", errEmptyTitle: "Ключа пока нет", errStopTitle: "Загрузка остановилась", errNoDataTitle: "Данных пока нет", errNoNoteTitle: "Нет открытой заметки", errRenderTitle: "Просмотр не отрисовался",
    errNewKey: "Вставить другой ключ", errRetry: "Повторить",
    loadTitle: "Загрузите историю", loadIntro: "Загрузим историю и сохраним её заметками по дням, чтобы дашборды работали без сети.", loadWait: "Не закрывайте окно, пока загрузка не закончится.", period: "За какой период", days30: "30 дней", days90: "90 дней", days365: "Год", start: "Загрузить", starting: "Загружаем...", useSaved: "Использовать уже сохранённое", savedInfo: "Уже сохранено дней:",
    progress: { daily: "Шаги, пульс, стресс", sleep: "Сон", hrv: "HRV", activities: "Тренировки" }, partWaiting: "Ждёт", partDone: "Готово", partWarn: "Загружено не всё", partStopped: "Остановлено",
    loaded: "Загружено дней:", summaryPeriod: "Период", summaryPartial: "Часть данных не пришла. Дашборд построится из того, что есть.", summaryContinue: "Продолжить",
    stoppedAuth: "Во время загрузки Garmin перестал принимать ключ. Вернитесь на шаг «Ключ» и вставьте другой.", stoppedRate: "Garmin просит притормозить. Подождите минуту и начните снова.", stoppedNet: "Пропала связь. Уже сохранённые заметки не тронуты, можно начать снова.", stoppedOther: "Garmin ответил неожиданно. Попробуйте ещё раз, а если повторится, выберите период короче.",
    chooseTitle: "Что показать", chooseIntro: "Предложено только то, что нашлось в ваших данных.", groups: { recovery: "Восстановление", activity: "Движение", training: "Тренировки" },
    groupHints: { recovery: "Сон, HRV, пульс покоя и стресс: карточки, графики и сравнение недели с вашей нормой.", activity: "Шаги по дням, серия 10 000 шагов, график и годовая карта.", training: "Минуты и километры по неделям, годовые карты по видам спорта и цели на месяц." },
    sports: "Виды спорта", sportsHint: "Отметьте, какие тренировки включить. Показаны только те, что есть в данных.", noSports: "Тренировок в этом периоде нет.", options: "Дополнительно", races: "Папка с гонками (необязательно)", racesHint: "Заметки с полем date, например Races", language: "Язык подписей", preview: "Показать дашборд", nothingChosen: "Ничего не выбрано, дашборд получится почти пустым.",
    previewTitle: "Так выглядит дашборд", previewIntro: "Это ваши данные. Прокрутите окно просмотра, чтобы увидеть всё.", previewFrame: "Просмотр дашборда", previewRendering: "Рисуем дашборд...", previewFail: "Не удалось отрисовать просмотр. Заметка при этом создастся нормально.",
    noDashyTitle: "Не найден плагин Dashy", noDashy: "Dashy рисует блоки дашборда. Установите его в разделе «Параметры, Сторонние плагины», включите и откройте это окно заново. Без него в заметке будет видна только разметка.", createNote: "Создать заметку", insertNote: "Вставить в текущую заметку", back: "Назад", next: "Далее", close: "Закрыть",
    created: "Создана заметка: ", inserted: "Дашборд вставлен в текущую заметку.", noActive: "Откройте заметку и попробуйте снова или создайте новую.", note: "Заметки по дням лежат в папке: ", noData: "За этот период данных нет. Попробуйте период длиннее.",
    ribbon: "Собрать дашборд Garmin", setAccount: "Аккаунт", setKeyName: "Personal API key", setKeySaved: "Ключ сохранён в защищённом хранилище Obsidian.", setKeyNone: "Ключа нет. Его добавляет мастер настройки.", setForget: "Забыть ключ", setLastSync: "Последняя загрузка", setNever: "ещё не было",
    setFolders: "Папки", setDataName: "Заметки по дням", setDataDesc: "Одна заметка на день, числа Garmin лежат в её свойствах.", setNotesName: "Дашборды", setNotesDesc: "Сюда мастер кладёт новые заметки с дашбордом.", setWizard: "Мастер настройки", setWizardName: "Собрать дашборд", setWizardDesc: "Ключ, загрузка, выбор и просмотр за четыре шага.", setOpen: "Открыть",
  },
  en: {
    title: "Garmin dashboard", subtitle: "Garmy builds it from your own data in four steps.", step: "Step", stepsLabel: "Setup progress",
    stepNames: ["Key", "Load", "Choose", "Preview"], stepDone: "done, go back",
    keyTitle: "Connect your Garmin account",
    keyIntro: "A Personal API key is a long password that lets an app read your own Garmin data. You choose how long it lives.",
    keySafeTitle: "Why it is safe here", keySafe: "The key is kept in Obsidian's secure storage and is sent only to Garmin. It is never written to a note or a file.",
    keyHowTitle: "How to get a key",
    keyHow: ["Open Garmin Connect in your browser and go to your account settings.", "Find the Personal API section and create a key. Pick how long it should live.", "Copy the key and paste it below."],
    keyLabel: "Personal API key", keyPlaceholder: "Paste the key", keySaved: "A key is already saved. Continue, or paste a different one.", keyCheck: "Check and continue", keyChecking: "Checking...", keyShow: "Show", keyHide: "Hide",
    keyBad: "Garmin did not accept the key. Check that it was copied whole and has not expired.", keyNet: "Cannot reach Garmin. Check your connection and try again.", keyRate: "Garmin asks to wait. Try again in a minute.", keyEmpty: "Paste the key into the field above.",
    mediaKeyCaption: "Where to create it: Garmin Connect, account settings, Personal API.", mediaKeyAlt: "Short clip: where to create the key in Garmin Connect", mediaDashyCaption: "How to install Dashy", mediaDashyAlt: "Short clip: installing the Dashy plugin", mediaPlay: "Play the clip", mediaStop: "Stop the clip",
    errBadTitle: "Key not accepted", errNetTitle: "No connection to Garmin", errRateTitle: "Garmin asks to wait", errEmptyTitle: "No key yet", errStopTitle: "Loading stopped", errNoDataTitle: "No data yet", errNoNoteTitle: "No open note", errRenderTitle: "Preview did not render",
    errNewKey: "Paste another key", errRetry: "Try again",
    loadTitle: "Load your history", loadIntro: "We load your history and save it as one note per day, so dashboards work offline.", loadWait: "Keep this window open until loading finishes.", period: "Period", days30: "30 days", days90: "90 days", days365: "One year", start: "Load", starting: "Loading...", useSaved: "Use what is already saved", savedInfo: "Days already saved:",
    progress: { daily: "Steps, heart rate, stress", sleep: "Sleep", hrv: "HRV", activities: "Workouts" }, partWaiting: "Waiting", partDone: "Done", partWarn: "Partly loaded", partStopped: "Stopped",
    loaded: "Days loaded:", summaryPeriod: "Period", summaryPartial: "Some data did not arrive. The dashboard will use what we have.", summaryContinue: "Continue",
    stoppedAuth: "Garmin stopped accepting the key during loading. Go back to the Key step and paste another one.", stoppedRate: "Garmin asked us to slow down. Wait a minute and start again.", stoppedNet: "The connection dropped. Notes that were already saved are untouched, so you can start again.", stoppedOther: "Garmin answered in a way we did not expect. Try again, and if it repeats, pick a shorter period.",
    chooseTitle: "What to show", chooseIntro: "Only what exists in your data is offered.", groups: { recovery: "Recovery", activity: "Movement", training: "Training" },
    groupHints: { recovery: "Sleep, HRV, resting heart rate and stress: cards, charts and a comparison of this week with your usual.", activity: "Steps per day, a 10,000-step streak, a chart and a year map.", training: "Minutes and kilometres per week, a year map per sport and monthly goals." },
    sports: "Sports", sportsHint: "Pick which workouts to include. Only the ones in your data are listed.", noSports: "No workouts in this period.", options: "Options", races: "Races folder (optional)", racesHint: "Notes with a date field, for example Races", language: "Label language", preview: "Show the dashboard", nothingChosen: "Nothing is selected, so the dashboard will be almost empty.",
    previewTitle: "Your dashboard", previewIntro: "This is your own data. Scroll the frame to see all of it.", previewFrame: "Dashboard preview", previewRendering: "Drawing the dashboard...", previewFail: "The preview could not be drawn. Creating the note will still work.",
    noDashyTitle: "Dashy is not installed", noDashy: "Dashy draws the dashboard blocks. Install it in Settings, Community plugins, enable it and open this window again. Without it the note shows only the markup.", createNote: "Create a note", insertNote: "Insert into the current note", back: "Back", next: "Next", close: "Close",
    created: "Note created: ", inserted: "Dashboard inserted into the current note.", noActive: "Open a note and try again, or create a new one.", note: "Daily notes live in: ", noData: "No data for this period. Try a longer one.",
    ribbon: "Build a Garmin dashboard", setAccount: "Account", setKeyName: "Personal API key", setKeySaved: "A key is saved in Obsidian's secure storage.", setKeyNone: "No key saved. The wizard adds one.", setForget: "Forget key", setLastSync: "Last sync", setNever: "never",
    setFolders: "Folders", setDataName: "Daily notes", setDataDesc: "One note per day with Garmin numbers in its properties.", setNotesName: "Dashboards", setNotesDesc: "Where the wizard creates dashboard notes.", setWizard: "Wizard", setWizardName: "Build a dashboard", setWizardDesc: "Key, load, choose and preview in four steps.", setOpen: "Open",
  },
};
