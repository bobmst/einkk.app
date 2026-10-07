const REPO = "https://github.com/bobmst/einkk.app";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-24 font-sans">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">einkk.app</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          NIKKE Solo Raid border forecasts. Coming soon.
        </p>
      </header>

      <section className="flex flex-col gap-4 leading-7 text-zinc-700 dark:text-zinc-300">
        <p>
          Forecasts of the Solo Raid ranking borders for every server and percentile, with honest
          uncertainty, updated as the raid goes on.
        </p>
        <p lang="zh-CN">个人突袭各服务器、各档位分数线的预测，附带如实的置信区间，赛中持续更新。即将上线。</p>
        <p lang="ja">ソロレイドの各サーバー・各順位帯のボーダー予測。開催中も随時更新予定です。</p>
      </section>

      <footer className="mt-auto flex flex-col gap-2 text-sm text-zinc-500">
        <a className="underline underline-offset-4" href={`${REPO}/issues/new/choose`}>
          Report a problem / 反馈问题 / 不具合の報告
        </a>
        <p>
          Unofficial fan project. Not affiliated with SHIFT UP, Level Infinite or enikk.app.
        </p>
      </footer>
    </main>
  );
}
