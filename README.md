# Map Render Benchmark

MapLibreGL/MapboxGLを使ったWeb地図のレンダリング速度をベンチマークするためのGitHub Actionです。プルリクエストに関連付けられている場合、比較結果がコメントとして追加されます。

## GitHub Actionとしての使い方

ワークフローに以下のステップを追加することで、このアクションを利用できます。

```yaml
- uses: actions/checkout@v3

- name: Map Render Benchmark
  uses: geolonia/map-render-benchmark@v1
  with:
    production_style: 'https://geoloniamaps.github.io/basic/style.json'
    center: '[139.7671773, 35.6810755]'
    zooms: '[5, 7, 11, 14]'
```

### 入力

- `style`: (任意) ベンチマーク対象の `style.json` ファイルへのパスを、リポジトリのルートからの相対パスで指定します。デフォルトは `docs/style.json` です。
- `production_style`: (必須) 比較対象となる本番環境の `style.json` のURL。
- `center`: (必須) 地図の中心の経度・緯度。
- `zooms`: (必須) テストするズームレベルの配列。
- `run_iterations`: (任意) 各テストの実行回数。デフォルトは `5` です。
- `token`: (任意) GitHubアクセストークン。デフォルトは `${{ github.token }}` です。
