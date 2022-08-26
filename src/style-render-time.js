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
import { rejectZeroAverageHypothesis } from './t-dist.js'

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
    data: mapRenderedTimes,
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
    sd: mapRenderedTime.sd,
    averageProd: mapRenderedTimeProd.average,
    sdProd: mapRenderedTimeProd.sd,
    sampleLength: mapRenderedTime.data.length,
    sampleLengthProd: mapRenderedTimeProd.data.length,
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

    const statisticsProd = `${mapRenderedTime.averageProd/1000}±${mapRenderedTime.sdProd/1000} (n=${mapRenderedTime.sampleLengthProd})`
    const statistics = `${mapRenderedTime.average/1000}±${mapRenderedTime.sd/1000} (n=${mapRenderedTime.sampleLength})`

    out.data.push({
      zoom: zoom,
      diff: `${plusMinus}${mapRenderedTime.diff/1000}`,
      avgProd: `${mapRenderedTime.averageProd/1000}`,
      avg: `${mapRenderedTime.average/1000}`,
      statisticsProd,
      statistics,
      significantDifference,
    });
  }

  await httpTerminator.terminate();

  return out;
}
