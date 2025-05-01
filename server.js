const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const url = require("url");

const app = express();

const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = ["https://projectbayslope.vercel.app", "http://localhost:3000"];
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
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: "URL parameter is required" });
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

      // Force proxy URLs to use http
      const proxyBaseUrl = `http://${req.get("host")}`;
      html = html.replace(/(href|src)=(["'])(\/[^"']+)/g, `$1=$2${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(baseUrl)}$3`);
      html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)/g, `$1=$2${proxyBaseUrl}/api/proxy?url=$3`);

      // Add base tag to ensure relative URLs resolve correctly
      html = html.replace("<head>", `<head><base href="${baseUrl}/">`);

      // Inject Google Fonts (Roboto and Product Sans) used by Google Patents
      html = html.replace(
        "<head>",
        `<head>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Product+Sans:400,700&display=swap">
        `
      );

      // Inject CSS to match Google Patents' layout and styling
      html = html.replace(
        "</head>",
        `
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
          .style-scope.patent-result {
            display: flex;
            flex-direction: column;
            max-width: 1280px;
            margin: 0 auto;
            padding: 16px;
          }
          .header.style-scope.patent-result {
            font-family: 'Product Sans', 'Roboto', Arial, sans-serif;
            font-size: 24px;
            font-weight: 400;
            margin-bottom: 16px;
            color: #202124;
          }
          .layout.horizontal {
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
          .abstract.style-scope.patent-result {
            margin-bottom: 24px;
            font-size: 14px;
            color: #4d5156;
          }
          .images.style-scope.patent-result img {
            max-width: 100%;
            height: auto;
            margin: 10px 0;
          }
          button.style-scope.patent-result {
            background: #4285f4;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-family: 'Roboto', Arial, sans-serif;
            margin-right: 8px;
          }
          button.style-scope.patent-result:hover {
            background: #3267d6;
          }
          .metadata.style-scope.patent-result {
            font-size: 13px;
            color: #4d5156;
            margin-bottom: 16px;
          }
          .metadata.style-scope.patent-result div {
            margin-bottom: 8px;
          }
          .metadata.style-scope.patent-result strong {
            font-weight: 500;
            color: #202124;
          }
        </style>
        </head>
      `);

      // Inject script to handle dynamic interactions and ensure layout
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

          // Ensure sidebar and main content layout
          document.addEventListener('DOMContentLoaded', function() {
            const patentResult = document.querySelector('patent-result');
            if (patentResult) {
              const mainContent = patentResult.querySelector('section');
              const sidebar = patentResult.querySelector('#meta');
              if (mainContent && sidebar) {
                mainContent.classList.add('main-content');
                sidebar.classList.add('sidebar');
                const layoutDiv = document.createElement('div');
                layoutDiv.className = 'layout horizontal';
                layoutDiv.appendChild(mainContent);
                layoutDiv.appendChild(sidebar);
                patentResult.insertBefore(layoutDiv, patentResult.firstChild);
              }
            }
          });
        </script>
        </body>
      `);

      res.send(html);
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