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

  const head = [
    'Zoom',
    'Diff',
    'Average ± Standard Deviation (number of samples)',
    'Average ± Standard Deviation (number of samples) (Production)',
    'Significant Difference',
  ];
  const table = new Table({
    head,
  });
  table.push(...results.data.map(({ zoom, diff, avg, avgProd, statistics, statisticsProd, significantDifference }) => [
    zoom,
    diff,
    statistics,
    statisticsProd,
    significantDifference,
  ]));
  console.log(table.toString());

  // if this is a pull request, update the PR comment with the table
  if (github.context.payload.pull_request) {
    const octokit = github.getOctokit(core.getInput('token'));

    let comment = '<h3><span aria-hidden="true">✅&nbsp;</span>Style Rendering Time</h3>';
    comment += `<table><tr>${head.map(title => `<th>${title}</th>`).join('')}</tr>`;
    comment += results.data.map(({ zoom, diff, statistics, statisticsProd, significantDifference }) => `<tr>
      <td>${zoom}</td>
      <td>${diff}</td>
      <td>${statistics}</td>
      <td>${statisticsProd}</td>
      <td>${significantDifference}</td>
    </tr>`).join('');
    comment += '</table>';
    comment += `<p>The P value represents the probability that the difference in means between the two groups is not caused by chance due to sampling error, and a significance level of 5% is used here.</p>`;
    comment += `<p><small>**: p&lt0.01</small>, <small>*: p&lt0.05</small></p>`

    const prNumber = github.context.payload.pull_request.number;
    const prComment = await octokit.rest.issues.createComment({
      ...github.context.repo,
      issue_number: prNumber,
      body: comment,
    });
    console.log(`Created PR comment: ${prComment.data.html_url}`);
  }
} catch (error) {
  core.setFailed(error.message);
}
