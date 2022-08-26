import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';

import { serveDirectory } from './utils.js';

const createServer = () => http.createServer(async function (req, res) {
  // parse URL
  let parsedUrl = url.parse(req.url);

  // extract URL path
  let pathname = path.join(serveDirectory(), parsedUrl.pathname);
  // based on the URL path, extract the file extension. e.g. .js, .doc, ...
  const ext = path.parse(pathname).ext;
  // maps file extension to MIME type
  const map = {
    '.html': 'text/html',
    '.json': 'application/json',
    '.png': 'image/png',
  };

  try {
    await fs.promises.stat(pathname);
  } catch (e) {
    // if the file is not found, return 404
    res.statusCode = 404;
    res.end(`File ${pathname} not found!`);
    return;
  }

  try {
    const data = await fs.promises.readFile(pathname);
    // if the file is found, set Content-type and send data
    res.setHeader('Content-type', map[ext] || 'text/plain' );
    res.end(data);
  } catch (e) {
    res.statusCode = 500;
    res.end(`Error getting the file: ${err}.`);
  }
});

export default createServer;
