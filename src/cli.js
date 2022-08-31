import {
  getMapRenderTimeByZoom
} from './style-render-time.js';
import path from 'node:path';
import * as io from '@actions/io';
import Table from 'cli-table';

import { downloadBrowser } from 'puppeteer/lib/esm/puppeteer/node/install.js';
import { rootPath, serveDirectory } from './utils.js';

const main = async () => {
  await downloadBrowser();

  await io.cp(path.join(rootPath(), 'docs'), serveDirectory(), { recursive: true, force: true });

  const results = await getMapRenderTimeByZoom(
    'style.json',
    'https://geoloniamaps.github.io/basic/style.json',
    [139.7671773, 35.6810755],
    [ 5, 7, 11, 14 ],
  );
  const table = new Table({
    head: [
      'Zoom',
      'Diff',
      'Mean',
      'Mean (Production)',
    ],
  });
  table.push(...results.data.map(({ zoom, diff, avg, avgProd }) => [
    zoom,
    diff,
    avg,
    avgProd,
  ]));
  console.log(table.toString());
};

main(...process.argv.slice(2)).catch(e => {
  console.error(e);
  process.exit(1);
});
