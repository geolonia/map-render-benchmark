import {
  getMapRenderTimeByZoom
} from './style-render-time.js';
import Table from 'cli-table';

const main = async () => {
  const results = await getMapRenderTimeByZoom(
    './docs/style.json',
    'https://geoloniamaps.github.io/basic/style.json',
    [139.7671773, 35.6810755],
    [ 5, 7, 11, 14 ],
  );
  const table = new Table({
    head: [
      'Zoom',
      'Diff',
      'Average',
      'Average (Production)',
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
