import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as io from '@actions/io';

import * as path from 'node:path';

import Table from 'cli-table';

import {
  getMapRenderTimeByZoom
} from './src/style-render-time.js';

try {
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);

  await exec.exec('yarn');

  const style = core.getInput('style');
  const productionStyle = core.getInput('production_style');
  const center = core.getInput('center').split(',').map(v => parseFloat(v));
  const zooms = core.getInput('zooms').split(',').map(v => parseInt(v, 10));

  console.log(`style: ${style}\nproduction_style: ${productionStyle}\ncenter: ${center}\nzooms: ${zooms}`);

  const styleFilename = path.basename(style);

  await io.cp(path.join('.', 'docs'), path.join('.', 'tmp'), { recursive: true, force: true });
  await io.cp(path.join(process.env.GITHUB_WORKSPACE, style), path.join('.', 'tmp', styleFilename));

  const results = await getMapRenderTimeByZoom(
    styleFilename,
    productionStyle,
    center,
    zooms,
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
} catch (error) {
  core.setFailed(error.message);
}
