# einkk.app

Unofficial forecasts of the **NIKKE: Goddess of Victory Solo Raid** ranking borders: the score you
need to finish inside the top 1%, 3%, 5% … on each server, with honest uncertainty bands.

> **Early stage.** This repository holds the website and its public data contract. The forecasting
> engine lives in a separate, private repository.

## What it will do

- Border forecasts per server (JP, KR, NA, SEA, TW-HK, Global) and per percentile, updated as the raid goes on.
- In-raid score reports from players (numbers only, no screenshots), which sharpen the forecast near the end
  of the raid. The end-of-season survey stays a separate form, linked here once the raid ends.
- A score checker: how likely is your score to stay inside a given percentile?
- A track record: every season's forecast graded against the final border.

## How it fits together

```
private engine (Python) ── writes ──> outbox: versioned prediction JSON ── read by ──> this site
this site ── writes ──> inbox: validated player reports ── read by ──> private engine
```

The boundary is a JSON Schema contract in [`contracts/`](contracts/). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck  # generates Next's route types first, then runs tsc
npm run build
```

## Reporting a problem

Open an issue using one of the templates: a site bug, a feature idea, or a wrong number. A feedback form
that needs no GitHub account is planned. Please never post your in-game name or union name.

## Disclaimer

This is an unofficial fan project. It is not affiliated with, endorsed by, or connected to SHIFT UP,
Level Infinite / Proxima Beta, or enikk.app; the similar name is a nod, not an affiliation. Game names
and assets belong to their respective owners. Forecasts are estimates and guarantee nothing about
rankings or rewards.

## License

[MIT](LICENSE)

---

## 中文

einkk.app 是《胜利女神：NIKKE》个人突袭（Solo Raid）分数线的非官方预测网站。它会告诉你在每个服务器上，进前 1%、3%、5% 等档位各需要多少分，并给出如实的置信区间，赛中持续更新。

本仓库只包含网站和公开的数据契约，预测引擎在另一个私有仓库里。

这是非官方的粉丝项目，与 SHIFT UP、Level Infinite、enikk.app 均无关联。预测仅供参考，不保证任何排名或奖励。

## 日本語

einkk.app は『勝利の女神：NIKKE』ソロレイドのボーダー予測サイト（非公式）です。各サーバー・各順位帯に必要なスコアを、不確かさの幅とあわせて表示し、開催中も随時更新します。

このリポジトリにはサイト本体と公開データ契約だけが含まれ、予測エンジンは別の非公開リポジトリにあります。

非公式のファンプロジェクトであり、SHIFT UP、Level Infinite、enikk.app とは関係ありません。予測は目安であり、順位や報酬を保証するものではありません。
