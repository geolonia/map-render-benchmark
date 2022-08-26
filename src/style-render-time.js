import * as puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import {
  createHttpTerminator,
} from 'http-terminator';


import * as fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import createServer from './dev-server.js';
import { serveDirectory } from './utils.js';

import * as ss from 'simple-statistics'
import { rejectZeroAverageHypothesis } from './t-dist'

const SERVER_PORT = 9999;

const fetchLatestStyle = async (url) => {
  const out = path.join(serveDirectory(), 'style-prod.json');
  if (fs.existsSync(out)) {
    return;
  }
  const response = await fetch(url);
  const text = await response.text();
  await fs.promises.writeFile(out, text);
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

const getAverageMapRenderTime = async (zoom, center, runIterations, loadStyle = 'style.json') => {

  const mapRenderedTimes = [];

  // 5回のレンダリング時間の平均を取得
  for (let i = 0; i < runIterations; i++) {
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
  // get standard deviation map render time
  const sd = ss.standardDeviation(mapRenderedTimes).toFixed(2);
  // get min max map render time
  const min = Math.min(...mapRenderedTimes);
  const max = Math.max(...mapRenderedTimes);

  return {
    average: Math.round(average),
    min: Math.round(min),
    max: Math.round(max),
    sd,
    data,
  }
};

const getMapRenderTimeDiff = async (styleFilename, compareStyleUrl, runIterations, zoom, center) => {
  const mapRenderedTime = await getAverageMapRenderTime(
    zoom, center, runIterations, styleFilename
  );

  // fetch style.json at master branch
  await fetchLatestStyle(compareStyleUrl);
  const mapRenderedTimeProd = await getAverageMapRenderTime(
    zoom, center, runIterations, 'style-prod.json'
  );

  const tValue = ss.tTestTwoSample(mapRenderedTime.data, mapRenderedTimeProd.data, 0)
  const df = mapRenderedTime.data.length + mapRenderedTimeProd.data.length - 2

  const significantDifference = rejectZeroAverageHypothesis(df, 0.01, tValue) ? 0.01 : rejectZeroAverageHypothesis(df, 0.05, tValue) ? 0.05 : null

  return {
    diff: mapRenderedTime.average - mapRenderedTimeProd.average,
    significantDifference,
    average: mapRenderedTime.average,
    averageProd: mapRenderedTimeProd.average,
  }
}

export const getMapRenderTimeByZoom = async (
  styleFilename,
  compareStyleUrl,
  runIterations,
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
    const mapRenderedTime = await getMapRenderTimeDiff(
      styleFilename,
      compareStyleUrl,
      runIterations,
      zoom,
      center
    );
    const plusMinus = mapRenderedTime.diff > 0 ? '+' : '';
    // comment += `<tr><td>${zoom}</td><td>${plusMinus}${mapRenderedTime.diff/1000}秒</td><td>${mapRenderedTime.averageProd/1000}秒</td><td>${mapRenderedTime.average/1000}秒</td></tr>`;

    out.data.push({
      zoom: zoom,
      diff: `${plusMinus}${mapRenderedTime.diff/1000}`,
      avgProd: `${mapRenderedTime.averageProd/1000}`,
      avg: `${mapRenderedTime.average/1000}`,
      significantDifference,
    });
  }

  // comment += '</table>';

  // process.stdout.write(comment);

  await httpTerminator.terminate();

  return out;
}
