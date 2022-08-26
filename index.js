import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as io from '@actions/io';

import { downloadBrowser } from 'puppeteer/lib/esm/puppeteer/node/install.js';

import * as path from 'node:path';

import Table from 'cli-table';

import {
  getMapRenderTimeByZoom
} from './src/style-render-time.js';

try {
  await downloadBrowser();

  const style = core.getInput('style');
  const productionStyle = core.getInput('production_style');
  const center = core.getInput('center').split(',').map(v => parseFloat(v));
  const zooms = core.getInput('zooms').split(',').map(v => parseInt(v, 10));

  console.log(`style: ${style}\nproduction_style: ${productionStyle}\ncenter: ${center}\nzooms: ${zooms}`);

  const styleFilename = path.basename(style);

  await io.cp(path.join(process.env.GITHUB_ACTION_PATH, 'docs'), path.join(process.env.GITHUB_ACTION_PATH, 'tmp'), { recursive: true, force: true });
  await io.cp(path.join(process.env.GITHUB_WORKSPACE, style), path.join(process.env.GITHUB_ACTION_PATH, 'tmp', styleFilename));

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

  // if this is a pull request, update the PR comment with the table
  if (github.context.payload.pull_request) {
    const prNumber = github.context.payload.pull_request.number;
    const prComment = await github.issues.createComment({
      ...github.context.repo,
      issue_number: prNumber,
      body: table.toString(),
    });
    console.log(`Created PR comment: ${prComment.data.html_url}`);
  }
} catch (error) {
  core.setFailed(error.message);
}
