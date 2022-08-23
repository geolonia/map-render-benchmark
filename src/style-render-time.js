import * as puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import {
  createHttpTerminator,
} from 'http-terminator';


import * as fs from 'node:fs';
import { promisify } from 'node:util';

import createServer from './dev-server.js';

const AVERAGE_RUN_ITERATIONS = 5;
const SERVER_PORT = 9999;

const fetchLatestStyle = async () => {
  const out = 'docs/style-prod.json';
  if (fs.existsSync(out)) {
    return;
  }
  const response = await fetch('https://geoloniamaps.github.io/basic/style.json');
  const text = await response.text();
  await fs.promises.writeFile('docs/style-prod.json', text);
}

const getMapRenderTime = async (zoom, center, style) => {

  const browser = await puppeteer.launch({
    // uncomment to debug in-browser failures
    // headless: false,
  });
  const page = await browser.newPage();

  const lng = center[0];
  const lat = center[1];

  await page.evaluateOnNewDocument((style) => {
    window._geoloniaPerfStyle = `./${style}`;
  }, style);
  await page.goto(`http://localhost:${SERVER_PORT}/index.html#${zoom}/${lat}/${lng}`);
  await page.waitForSelector('.loading-geolonia-map', { hidden: true });

  const mapRenderTime = await page.evaluate(() => {
    return window._geoloniaPerf;
  });

  await browser.close();

  return mapRenderTime;
}

const getAverageMapRenderTime = async (zoom, center, loadStyle = 'style.json') => {

  const mapRenderedTimes = [];

  // 5回のレンダリング時間の平均を取得
  for (let i = 0; i < AVERAGE_RUN_ITERATIONS; i++) {
    const {
      map_init,
      map_load,
      style,
    } = await getMapRenderTime(zoom, center, loadStyle);
    console.log(`Run ${i + 1}: map_init=${Math.round(map_init)}ms map_load=${Math.round(map_load)}ms zoom=${zoom} style=${style}`);
    mapRenderedTimes.push(map_load);
  }

  // get average map render time
  const average = mapRenderedTimes.reduce((a, b) => a + b, 0) / mapRenderedTimes.length;
  // get min max map render time
  const min = Math.min(...mapRenderedTimes);
  const max = Math.max(...mapRenderedTimes);

  return {
    average: Math.round(average),
    min: Math.round(min),
    max: Math.round(max),
  }
};

const getMapRenderTimeDiff = async (styleFilename, compareStyleUrl, zoom, center) => {
  const mapRenderedTime = await getAverageMapRenderTime(zoom, center, styleFilename);

  // fetch style.json at master branch
  await fetchLatestStyle(compareStyleUrl);
  const mapRenderedTimeProd = await getAverageMapRenderTime(zoom, center, 'style-prod.json');

  return {
    diff: mapRenderedTime.average - mapRenderedTimeProd.average,
    average: mapRenderedTime.average,
    averageProd: mapRenderedTimeProd.average,
  }
}

export const getMapRenderTimeByZoom = async (
  styleFilename,
  compareStyleUrl,
  center,
  zoomList
) => {
  const server = createServer();
  const httpTerminator = createHttpTerminator({
    server,
  });
  const serverListen = promisify(server.listen).bind(server);
  await serverListen(SERVER_PORT);

  // const center = [139.7671773, 35.6810755];
  // const zoomList = [ 5, 7, 11, 14 ];

  // let comment = '<h3><span aria-hidden="true">✅</span> 地図レンダリング時間</h3>';
  // comment += `<p><code>master</code> ブランチのスタイルと、現在のブランチのスタイルのレンダリング時間を比較した結果を表示します。（レンダリング時間が${threshold/1000}秒以上増加した場合テストが失敗します）</p>`;
  // comment += '<table><tr><th>ズームレベル</th><th>最新リリースとの差分</th><th>最新リリース</th><th>現在のブランチ</th></tr>';

  const out = {
    data: [],
  };
  for (let i = 0; i < zoomList.length; i++) {

    const zoom = zoomList[i];
    const mapRenderedTime = await getMapRenderTimeDiff(styleFilename, compareStyleUrl, zoom, center);
    const plusMinus = mapRenderedTime.diff > 0 ? '+' : '';
    // comment += `<tr><td>${zoom}</td><td>${plusMinus}${mapRenderedTime.diff/1000}秒</td><td>${mapRenderedTime.averageProd/1000}秒</td><td>${mapRenderedTime.average/1000}秒</td></tr>`;

    out.data.push({
      zoom: zoom,
      diff: `${plusMinus}${mapRenderedTime.diff/1000}`,
      avgProd: `${mapRenderedTime.averageProd/1000}`,
      avg: `${mapRenderedTime.average/1000}`,
    });
  }

  // comment += '</table>';

  // process.stdout.write(comment);

  await httpTerminator.terminate();

  return out;
}
