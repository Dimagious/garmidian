import type { Lang } from "../core/catalog";

/** Strings for sync, cancel, key problems and the Dashy states. */
export interface SyncUi {
  cancel: string; cancelledTitle: string; cancelledBody: string; busy: string; walkBusy: string;
  dashyMissingAction: string; dashyDisabledTitle: string; dashyDisabled: string; dashyEnable: string;
  setSyncName: string; setSyncDesc: string; syncOff: string; sync6: string; sync12: string; sync24: string;
  setSyncNowName: string; setSyncNowDesc: string; setSyncNow: string; setLastSyncAt: string;
  setKeyRejected: (date: string) => string; setReplaceKey: string;
  noticeSynced: (days: number) => string; noticeNoKey: string; noticeOffline: string; noticeRate: string; noticeFailed: string;
  noticeKeyRejected: string; noticeReplaceKey: string;
  rebuildNoNote: string; rebuildNoRegion: string; rebuildNoData: string; rebuildDone: string;
}

export const SYNC_UI: Record<Lang, SyncUi> = {
  ru: {
    cancel: "Отмена", cancelledTitle: "Загрузка отменена", cancelledBody: "Ничего не сохранено. Можно начать заново в любой момент.", busy: "Синхронизация уже идёт. Повторите через минуту.", walkBusy: "Garmy: синхронизация уже идёт",
    dashyMissingAction: "Открыть страницу Dashy", dashyDisabledTitle: "Dashy выключен", dashyDisabled: "Dashy установлен, но выключен. Включите его, и блоки отрисуются.", dashyEnable: "Включить Dashy",
    setSyncName: "Автосинхронизация", setSyncDesc: "Обновляет последние дни из Garmin при запуске Obsidian и затем раз в несколько часов.", syncOff: "Выключена", sync6: "Каждые 6 часов", sync12: "Каждые 12 часов", sync24: "Раз в сутки",
    setSyncNowName: "Обновить сейчас", setSyncNowDesc: "Загружает свежие дни из Garmin.", setSyncNow: "Обновить", setLastSyncAt: "Последнее обновление",
    setKeyRejected: (d) => `Garmin не принял ключ ${d}. Возможно, он истёк. Создайте новый.`, setReplaceKey: "Заменить ключ",
    noticeSynced: (n) => `Garmy: обновлено дней: ${n}`, noticeNoKey: "Garmy: ключа нет. Сначала пройдите мастер.", noticeOffline: "Garmy: нет связи с Garmin. Повторим позже.", noticeRate: "Garmy: Garmin просит подождать. Повторим позже.", noticeFailed: "Garmy: не удалось обновить данные. Подробности в консоли разработчика.",
    noticeKeyRejected: "Garmy: Garmin не принял ключ. Возможно, он истёк. Создайте новый ключ и вставьте его в мастере.", noticeReplaceKey: "Заменить ключ",
    rebuildNoNote: "Garmy: откройте заметку с дашбордом.", rebuildNoRegion: "Garmy: в этой заметке нет дашборда Garmy. Его создаёт мастер.", rebuildNoData: "Garmy: данных нет. Сначала загрузите историю в мастере.", rebuildDone: "Garmy: дашборд пересобран.",
  },
  en: {
    cancel: "Cancel", cancelledTitle: "Loading cancelled", cancelledBody: "Nothing was saved. You can start again any time.", busy: "A sync is already running. Try again in a minute.", walkBusy: "Garmy: a sync is already running",
    dashyMissingAction: "Open the Dashy page", dashyDisabledTitle: "Dashy is turned off", dashyDisabled: "Dashy is installed but turned off. Turn it on and the blocks will draw.", dashyEnable: "Turn on Dashy",
    setSyncName: "Automatic sync", setSyncDesc: "Refreshes the last days from Garmin when Obsidian starts and then every few hours.", syncOff: "Off", sync6: "Every 6 hours", sync12: "Every 12 hours", sync24: "Once a day",
    setSyncNowName: "Sync now", setSyncNowDesc: "Loads the latest days from Garmin.", setSyncNow: "Sync", setLastSyncAt: "Last sync",
    setKeyRejected: (d) => `Garmin rejected the key on ${d}. It may have expired. Create a new one.`, setReplaceKey: "Replace key",
    noticeSynced: (n) => `Garmy: ${n} days synced`, noticeNoKey: "Garmy: no key. Run the wizard first.", noticeOffline: "Garmy: no connection to Garmin. Will try again later.", noticeRate: "Garmy: Garmin asks to wait. Will try again later.", noticeFailed: "Garmy: sync failed. Details are in the developer console.",
    noticeKeyRejected: "Garmy: Garmin rejected the key. It may have expired. Create a new key and paste it in the wizard.", noticeReplaceKey: "Replace key",
    rebuildNoNote: "Garmy: open the note with the dashboard.", rebuildNoRegion: "Garmy: this note has no Garmy dashboard. The wizard creates one.", rebuildNoData: "Garmy: no data yet. Load your history in the wizard first.", rebuildDone: "Garmy: dashboard rebuilt.",
  },
};
