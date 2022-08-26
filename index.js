import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as io from '@actions/io';

import { downloadBrowser } from 'puppeteer/lib/esm/puppeteer/node/install.js';

import * as path from 'node:path';
import * as process from 'node:process';

import Table from 'cli-table';

import { rootPath, serveDirectory } from './src/utils.js';
import {
  getMapRenderTimeByZoom
} from './src/style-render-time.js';

try {
  await downloadBrowser();

  const style = core.getInput('style');
  const productionStyle = core.getInput('production_style');
  const center = core.getInput('center').split(',').map(v => parseFloat(v));
  const zooms = core.getInput('zooms').split(',').map(v => parseInt(v, 10));
  const runIterations = parseInt(core.getInput('run_iterations') || 2, 10);

  console.log(`style: ${style}\nproduction_style: ${productionStyle}\ncenter: ${center}\nzooms: ${zooms}\nrun_iterations: ${runIterations}`);

  const styleFilename = path.basename(style);

  await io.cp(path.join(rootPath(), 'docs'), serveDirectory(), { recursive: true, force: true });
  await io.cp(path.join(process.env.GITHUB_WORKSPACE, style), path.join(serveDirectory(), styleFilename));

  const results = await getMapRenderTimeByZoom(
    styleFilename,
    productionStyle,
    runIterations,
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
  table.push(...results.data.map(({ zoom, diff, avg, avgProd, significancy }) => [
    zoom,
    diff,
    avg,
    avgProd,
    significancy,
  ]));
  console.log(table.toString());

  const octokit = github.getOctokit(core.getInput('token'));
  // if this is a pull request, update the PR comment with the table
  if (github.context.payload.pull_request) {
    const prNumber = github.context.payload.pull_request.number;
    const prComment = await octokit.rest.issues.createComment({
      ...github.context.repo,
      issue_number: prNumber,
      body: table.toString(),
    });
    console.log(`Created PR comment: ${prComment.data.html_url}`);
  }
} catch (error) {
  core.setFailed(error.message);
}
