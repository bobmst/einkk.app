# Japanese and Korean terms

The words `src/lib/i18n.ts` uses for each concept, and where they come from. The page speaks the
players' language: what their own sites use, over the game's formal wording, as long as it is
written language and not chat shorthand.

Sources (checked 2026-11-16):
- **JP** — [ikken-border.jp](https://ikken-border.jp/) (JP players' border site), and
  [game8 ソロレイド攻略](https://game8.jp/nikke/526572), which quotes the in-game text and agrees.
- **KR** — [솔레 금서고](https://soloraidhistory.vercel.app/) (KR players' record site). The game's
  formal wording, from the press ([Inven](https://www.inven.co.kr/webzine/news/?news=321615),
  [DC 게임 갤러리](https://gall.dcinside.com/gamey/14911)), is listed for reference.

| Concept | 日本語 (use) | Source | 한국어 (use) | Source | Formal / avoid |
|---|---|---|---|---|---|
| Solo Raid | ソロレイド | ikken, game8 | 솔로 레이드 (titles), 솔레 only in names | 솔레 금서고 ("솔로 레이드 로그") | |
| The score a raid ranks by | スコア | ikken, game8 ("チャレンジモードのスコア") | 딜량; the full score in a form field 총 딜량 | 솔레 금서고 ("총 딜량", "딜량 내림차순") | ko formal 대미지; avoid 데미지, 점수 |
| Rank (number, top 200) | 順位 (`25位`) | game8 | 등수 | 솔레 금서고 ("1 → 1등") | ja ランク |
| Rank in general / percent | 順位（％）/ TOP n% | ikken ("順位2.90%〜3.10%") | 순위 / 상위 n% | 솔레 금서고 ("시즌별 순위 추이", "상위 퍼센트") | ko 랭킹 % |
| The line a reward tier starts at | ボーダー | ikken | 커트라인; 라인 as the short form ("3% 라인") | players (3퍼컷 in chat) | ja ライン (ikken never uses it); ko 보더 (Japanese loanword), 3퍼컷 (chat shorthand) |
| Season | 第n回 / 開催回 | ikken | 시즌 n | 솔레 금서고 ("시즌별") | ko "S n" |
| A player's report to us | データ提供 | einkk.app since #43 | 제보 | einkk.app | what models pick: レポート, 報告, 리포트, 보고 |
| Looking up a damage in the checker | スコア確認 | ikken ("SCORE CHECK") | 딜량 조회 | — | 確認 / 조회 alone |

Korean particles change with the word: 딜량 ends in a consonant, so 딜량을 / 딜량이 / 딜량은 /
딜량과 / 딜량으로 (not 를 / 가 / 는 / 와 / 로 as after 데미지).

## Rules for translators (people or models)

- Give a model this table as "A → B" pairs only. Explanations in the prompt end up in the
  translation (hy-mt2-30b did that on 2026-11-16).
- One word per concept on the whole page: no ボーダー/ライン or 딜량/대미지/점수 mix.
- Japanese stays in です/ます; Korean in -습니다 / -해 주세요.
