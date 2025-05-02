const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const url = require("url");
const cheerio = require("cheerio");

const app = express();

const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = ["https://frontendsplitscreen.vercel.app", "http://localhost:3000"];
    console.log(`CORS origin check - Origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS warning - Origin not allowed: ${origin}`);
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
});

app.use(corsMiddleware);

app.options("*", (req, res) => {
  res
    .status(200)
    .setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type")
    .end();
});

app.get("/api/proxy", async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  // Decode the target URL to prevent nested proxy URLs
  targetUrl = decodeURIComponent(targetUrl);

  // Prevent recursive proxy calls
  if (targetUrl.includes("/api/proxy?url=")) {
    const urlMatch = targetUrl.match(/url=([^&]+)/);
    if (urlMatch) {
      targetUrl = decodeURIComponent(urlMatch[1]);
    }
  }

  try {
    new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  console.log(`Proxy GET request for URL: ${targetUrl}`);

  const fetchHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: "https://patents.google.com/",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };

  try {
    const response = await fetch(targetUrl, { headers: fetchHeaders, redirect: "follow" });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Fetch failed: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: `Failed to fetch URL: ${response.statusText}` });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");

    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseUrl = new URL(targetUrl).origin;

      // Parse HTML with Cheerio if it's a Google Patents page
      if (targetUrl.includes("patents.google.com/patent")) {
        const $ = cheerio.load(html);

        // Extract key elements
        const patentNumber = $('h2#pubnum').text().trim() || targetUrl.split('/').pop();
        const abstract = $('abstract').text().trim();
        const inventor = $('dd[itemprop="inventor"]').map((i, el) => $(el).text().trim()).get().join(", ");
        const assignee = $('dd[itemprop="assigneeCurrent"]').text().trim();
        const applicationNumber = $('dd[itemprop="applicationNumber"]').text().trim();
        const filingDate = $('time[itemprop="filingDate"]').text().trim();
        const publicationDate = $('time[itemprop="publicationDate"]').text().trim();
        const grantDate = $('time[itemprop="publicationDate"]').next('time').text().trim();
        const status = $('span[itemprop="status"]').text().trim();
        const priorityDate = $('time[itemprop="priorityDate"]').text().trim();
        const images = $('img[itemprop="thumbnail"]').map((i, el) => $(el).attr('src')).get();

        // Build custom HTML structure to match Google Patents UI
        let customHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${patentNumber} - Google Patents</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Product+Sans:400,700&display=swap">
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: 'Roboto', Arial, sans-serif;
                color: #202124;
                line-height: 1.6;
                background: #fff;
              }
              a {
                color: #1a0dab;
                text-decoration: none;
              }
              a:hover {
                text-decoration: underline;
              }
              .container {
                display: flex;
                flex-direction: column;
                max-width: 1280px;
                margin: 0 auto;
                padding: 16px;
              }
              .header {
                font-family: 'Product Sans', 'Roboto', Arial, sans-serif;
                font-size: 24px;
                font-weight: 400;
                margin-bottom: 16px;
                color: #202124;
              }
              .layout {
                display: flex;
                flex-direction: row;
                gap: 32px;
              }
              .main-content {
                flex: 3;
                max-width: 70%;
              }
              .sidebar {
                flex: 1;
                max-width: 30%;
                padding: 16px;
                background: #f8f9fa;
                border-radius: 8px;
                font-size: 13px;
              }
              .abstract {
                margin-bottom: 24px;
                font-size: 14px;
                color: #4d5156;
              }
              .images {
                margin-bottom: 24px;
              }
              .images img {
                max-width: 100%;
                height: auto;
                margin: 10px 0;
              }
              .classifications {
                margin-bottom: 24px;
              }
              .classifications div {
                font-size: 14px;
                color: #4d5156;
              }
              .metadata {
                font-size: 13px;
                color: #4d5156;
                margin-bottom: 16px;
              }
              .metadata div {
                margin-bottom: 8px;
              }
              .metadata strong {
                font-weight: 500;
                color: #202124;
              }
              .action-buttons {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
              }
              .action-buttons button {
                background: #4285f4;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-family: 'Roboto', Arial, sans-serif;
                transition: background 0.3s ease;
              }
              .action-buttons button:hover {
                background: #3267d6;
              }
              .patent-header {
                background: #1a73e8;
                color: white;
                padding: 8px 16px;
                font-size: 16px;
                font-family: 'Product Sans', 'Roboto', Arial, sans-serif;
                margin-bottom: 8px;
              }
              .status-active {
                color: #34a853;
                font-weight: 500;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="header">Formation fluid sampling apparatus and methods</h1>
              <div class="layout">
                <div class="main-content">
                  <div class="abstract">
                    <h2>Abstract</h2>
                    <p>${abstract}</p>
                  </div>
                  <div class="images">
                    <h2>Images (${images.length})</h2>
                    ${images.map(src => `<img src="${src}" alt="Patent Image">`).join('')}
                  </div>
                  <div class="classifications">
                    <h2>Classifications</h2>
                    <div>E21B49/08 • Obtaining fluid samples or testing fluids, in boreholes or wells</div>
                    <a href="#" onclick="window.parent.postMessage({type: 'linkClick', url: '${targetUrl}'}, '*')">View 1 more classification</a>
                  </div>
                </div>
                <div class="sidebar">
                  <div class="patent-header">${patentNumber} United States</div>
                  <div class="action-buttons">
                    <button onclick="window.parent.postMessage({type: 'linkClick', url: '${targetUrl}/pdf'}, '*')">Download PDF</button>
                    <button onclick="window.parent.postMessage({type: 'linkClick', url: 'https://patents.google.com/xhr/query?url=pn%3D${patentNumber}%26priorart%3Dtrue'}, '*')">Find Prior Art</button>
                    <button onclick="window.parent.postMessage({type: 'linkClick', url: 'https://patents.google.com/xhr/query?url=pn%3D${patentNumber}%26similar%3Dtrue'}, '*')">Similar</button>
                  </div>
                  <div class="metadata">
                    <div><strong>Inventor:</strong> ${inventor}</div>
                    <div><strong>Current Assignee:</strong> ${assignee}</div>
                    <div><strong>Application:</strong> ${applicationNumber}</div>
                    <div><strong>Filing Date:</strong> ${filingDate}</div>
                    <div><strong>Priority Date:</strong> ${priorityDate}</div>
                    <div><strong>Publication Date:</strong> ${publicationDate}</div>
                    <div><strong>Grant Date:</strong> ${grantDate}</div>
                    <div><strong>Status:</strong> <span class="status-active">${status}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;
        res.send(customHtml);
      } else {
        // For non-patent URLs, use the previous proxy logic
        const proxyBaseUrl = `https://${req.get("host")}`;
        html = html.replace(/(href|src)=(["'])(\/[^"']+)/g, `$1=$2${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(baseUrl)}$3`);
        html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)/g, (match, attr, quote, url) => {
          if (url.includes(proxyBaseUrl)) {
            return match;
          }
          return `${attr}=${quote}${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(url)}`;
        });

        html = html.replace("<head>", `<head><base href="${baseUrl}/">`);

        html = html.replace(
          "<head>",
          `<head>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Product+Sans:400,700&display=swap">
          `
        );

        html = html.replace(
          "</body>",
          `
          <script>
            window.addEventListener('message', function(e) {
              if (e.data.type === 'linkClick') {
                window.parent.postMessage({ type: 'linkClick', url: e.data.url }, '*');
              }
            });

            document.addEventListener('click', function(e) {
              if (e.target.tagName === 'A' && e.target.href) {
                e.preventDefault();
                window.parent.postMessage({
                  type: 'linkClick',
                  url: e.target.href
                }, '*');
              }
            });
          </script>
          </body>
        `);

        res.send(html);
      }
    } else {
      res.setHeader("Content-Disposition", "inline");
      response.body.pipe(res);
    }
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

module.exports = app;