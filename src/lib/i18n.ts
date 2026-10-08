// Player-facing text: English, 中文, 日本語 (AGENTS.md). Damage is in 0.1B (1e8),
// which is 亿 / 億 in Chinese and Japanese.
import type { Element, Season, Server } from "./outbox";

export const LANGS = ["en", "zh", "ja"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { en: "EN", zh: "中文", ja: "日本語" };

const SERVER_NAMES: Record<Lang, Record<Server, string>> = {
  en: { jp: "Japan", kr: "Korea", na: "North America", sea: "Southeast Asia", tw: "TW/HK", gb: "Global" },
  zh: { jp: "日服", kr: "韩服", na: "美服", sea: "东南亚服", tw: "港澳台服", gb: "国际服" },
  ja: { jp: "日本", kr: "韓国", na: "北米", sea: "東南アジア", tw: "台湾・香港", gb: "グローバル" },
};

const ELEMENTS: Record<Lang, Record<Element, string>> = {
  en: { fire: "Fire", water: "Water", wind: "Wind", iron: "Iron", electronic: "Electric" },
  zh: { fire: "燃烧", water: "水冷", wind: "风压", iron: "铁甲", electronic: "电击" },
  ja: { fire: "灼熱", water: "水冷", wind: "風圧", iron: "鉄甲", electronic: "電撃" },
};

const STATES: Record<Lang, Record<Season["state"], string>> = {
  en: { upcoming: "Not started", live: "Live", measuring: "Ended · measuring the final border", closed: "Ended" },
  zh: { upcoming: "未开始", live: "进行中", measuring: "已结束 · 统计最终分数线", closed: "已结束" },
  ja: { upcoming: "開催前", live: "開催中", measuring: "終了 · 最終ボーダー集計中", closed: "終了" },
};

const TEXT = {
  en: {
    tagline: "NIKKE Solo Raid border forecasts",
    rehearsal: "REHEARSAL — mock season, not a real forecast",
    loading: "Loading…",
    loadFailed: "Couldn't load the latest data. Retrying every minute.",
    nothing: "Nothing published yet.",
    season: "Season",
    weakness: "weak to",
    starts: "Starts",
    ends: "Ends",
    left: "left",
    startsIn: "starts in",
    survey: "End-of-season survey",
    forecastTitle: "Top 3% border at raid close",
    range: "range",
    rangeUncertified: "range (no certified level)",
    raidDay: (day: number, known: number) => `Raid day ${day} of 5 · ${known} official day${known === 1 ? "" : "s"} in`,
    updated: "updated",
    revision: "revision",
    servers: "Every server",
    server: "Server",
    border: "3% border",
    percentiles: "Other percentiles",
    extrapolated: "~ extrapolated beyond this server's data",
    noForecast: "No forecast yet for this season.",
    history: "Track record",
    forecast: "Forecast",
    error: "Error",
    final: "Final",
    hit: "inside the range",
    miss: "outside the range",
    pending: "not graded yet",
    legacy: "old in-sample band",
    sources: { manual_collection: "hand-collected", survey: "survey", reports: "player reports" },
    report: "Report your score",
    reportHelp: "Numbers only. They feed the live forecast after checks.",
    rankBy: "Your rank is shown as",
    percent: "a percentage",
    number: "a number (top 200)",
    rank: "Rank",
    damage: "Damage (0.1B = 100M)",
    readAt: "When you read it",
    confirm: "You are sending",
    send: "Send",
    sending: "Sending…",
    sent: "Thanks! Report received.",
    reportClosed: "Reports open while the raid is live.",
    reportUnavailable: "Reporting isn't available right now.",
    errors: {
      invalid_report: "Some values look wrong. Check the rank and the damage.",
      turnstile_failed: "The anti-bot check failed. Try again.",
      rate_limited: "Too many reports from this connection. Try again in an hour.",
      intake_not_configured: "Reporting isn't available right now.",
      other: "Couldn't send. Try again.",
    },
    footerIssue: "Report a problem",
    disclaimer: "Unofficial fan project. Not affiliated with SHIFT UP, Level Infinite or enikk.app.",
  },
  zh: {
    tagline: "NIKKE 个人突袭分数线预测",
    rehearsal: "演练 — 模拟赛季，不是真实预测",
    loading: "加载中…",
    loadFailed: "暂时读不到最新数据，每分钟自动重试。",
    nothing: "还没有发布任何内容。",
    season: "赛季",
    weakness: "弱点",
    starts: "开始",
    ends: "结束",
    left: "后结束",
    startsIn: "后开始",
    survey: "赛季结束问卷",
    forecastTitle: "收盘时前 3% 分数线",
    range: "区间",
    rangeUncertified: "区间（无保证水平）",
    raidDay: (day: number, known: number) => `第 ${day}/5 天 · 已有 ${known} 天官方数据`,
    updated: "更新于",
    revision: "版本",
    servers: "各服务器",
    server: "服务器",
    border: "3% 线",
    percentiles: "其他档位",
    extrapolated: "~ 超出该服数据范围的外推值",
    noForecast: "本季还没有预测。",
    history: "历史战绩",
    forecast: "预测",
    error: "误差",
    final: "终值",
    hit: "落在区间内",
    miss: "落在区间外",
    pending: "尚未评分",
    legacy: "旧版样本内区间",
    sources: { manual_collection: "手工收集", survey: "问卷", reports: "玩家回报" },
    report: "回报你的分数",
    reportHelp: "只填数字。经过检查后用于实时预测。",
    rankBy: "游戏里你的排名显示为",
    percent: "百分比",
    number: "名次（前 200）",
    rank: "排名",
    damage: "伤害（亿）",
    readAt: "查看时间",
    confirm: "你要提交的是",
    send: "提交",
    sending: "提交中…",
    sent: "谢谢！已收到。",
    reportClosed: "赛中才开放回报。",
    reportUnavailable: "暂时无法回报。",
    errors: {
      invalid_report: "有数值不对，请检查排名和伤害。",
      turnstile_failed: "人机验证没有通过，请重试。",
      rate_limited: "这个网络提交太多了，请一小时后再试。",
      intake_not_configured: "暂时无法回报。",
      other: "提交失败，请重试。",
    },
    footerIssue: "反馈问题",
    disclaimer: "非官方粉丝项目，与 SHIFT UP、Level Infinite 及 enikk.app 无关。",
  },
  ja: {
    tagline: "NIKKE ソロレイド ボーダー予測",
    rehearsal: "リハーサル — 模擬シーズンで、実際の予測ではありません",
    loading: "読み込み中…",
    loadFailed: "最新データを読み込めません。1 分ごとに再試行します。",
    nothing: "まだ公開されていません。",
    season: "シーズン",
    weakness: "弱点",
    starts: "開始",
    ends: "終了",
    left: "で終了",
    startsIn: "で開始",
    survey: "シーズン終了アンケート",
    forecastTitle: "終了時の上位 3% ボーダー",
    range: "予測範囲",
    rangeUncertified: "予測範囲（保証水準なし）",
    raidDay: (day: number, known: number) => `${day}/5 日目 · 公式データ ${known} 日分`,
    updated: "更新",
    revision: "版",
    servers: "全サーバー",
    server: "サーバー",
    border: "3% ボーダー",
    percentiles: "他の順位帯",
    extrapolated: "~ このサーバーのデータ範囲外の外挿値",
    noForecast: "今シーズンの予測はまだありません。",
    history: "これまでの成績",
    forecast: "予測",
    error: "誤差",
    final: "確定値",
    hit: "範囲内",
    miss: "範囲外",
    pending: "未採点",
    legacy: "旧方式の範囲",
    sources: { manual_collection: "手動収集", survey: "アンケート", reports: "プレイヤー報告" },
    report: "スコアを報告",
    reportHelp: "数字のみ。チェック後にリアルタイム予測に使われます。",
    rankBy: "ゲーム内の順位表示",
    percent: "パーセント",
    number: "順位（上位 200 位）",
    rank: "順位",
    damage: "ダメージ（億）",
    readAt: "確認した時刻",
    confirm: "送信内容",
    send: "送信",
    sending: "送信中…",
    sent: "ありがとうございます。受け付けました。",
    reportClosed: "報告は開催中のみ受け付けます。",
    reportUnavailable: "現在は報告できません。",
    errors: {
      invalid_report: "値が正しくないようです。順位とダメージを確認してください。",
      turnstile_failed: "ボット確認に失敗しました。もう一度お試しください。",
      rate_limited: "この接続からの報告が多すぎます。1 時間後にお試しください。",
      intake_not_configured: "現在は報告できません。",
      other: "送信できませんでした。もう一度お試しください。",
    },
    footerIssue: "不具合の報告",
    disclaimer: "非公式のファンプロジェクトです。SHIFT UP、Level Infinite、enikk.app とは関係ありません。",
  },
} as const;

export type Text = (typeof TEXT)[Lang];

export const text = (lang: Lang): Text => TEXT[lang];
export const serverName = (lang: Lang, server: Server) => SERVER_NAMES[lang][server];
export const elementName = (lang: Lang, element: Element) => ELEMENTS[lang][element];
export const stateName = (lang: Lang, state: Season["state"]) => STATES[lang][state];

/** 0.1B units as each language reads them: "244.78 亿", "244.78億", "24.48B". */
export function damage(lang: Lang, value: number): string {
  if (lang === "zh") return `${value.toFixed(2)} 亿`;
  if (lang === "ja") return `${value.toFixed(2)}億`;
  return `${(value / 10).toFixed(2)}B`;
}

// The chosen language as an external store (React's useSyncExternalStore): the
// static export renders English, and the browser switches to the saved or
// preferred language right after hydration, without a mismatch.
let chosen: Lang | null = null;
const listeners = new Set<() => void>();

function preferred(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch {}
  const browser = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return browser.startsWith("zh") ? "zh" : browser.startsWith("ja") ? "ja" : "en";
}

export const langStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): Lang => chosen ?? preferred(),
  server: (): Lang => "en",
  set(lang: Lang) {
    chosen = lang;
    try {
      localStorage.setItem("lang", lang);
    } catch {}
    listeners.forEach((listener) => listener());
  },
};
