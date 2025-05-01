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
    Accept: "*/*",
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

      // Rewrite all URLs to route through the proxy
      html = html.replace(/(href|src)=(["'])(\/[^"']+)/g, `$1=$2${req.protocol}://${req.get("host")}/api/proxy?url=${encodeURIComponent(baseUrl)}$3`);
      html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)/g, `$1=$2${req.protocol}://${req.get("host")}/api/proxy?url=$3`);

      // Add base tag to ensure relative URLs resolve correctly
      html = html.replace("<head>", `<head><base href="${baseUrl}/">`);

      // Inject Google Fonts (Roboto) used by Google Patents
      html = html.replace(
        "<head>",
        `<head>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap">
        `
      );

      // Inject CSS to ensure consistent styling
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
          }
          a {
            color: #1a0dab;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .patent-header {
            font-size: 24px;
            font-weight: 400;
            margin-bottom: 10px;
          }
          .patent-info {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #dadce0;
            padding-bottom: 10px;
            margin-bottom: 20px;
            font-size: 14px;
          }
          .patent-abstract {
            margin-bottom: 20px;
            font-size: 14px;
          }
          .patent-images img {
            max-width: 100%;
            height: auto;
            margin: 10px 0;
          }
          button {
            background: #4285f4;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          button:hover {
            background: #3267d6;
          }
        </style>
        </head>
      `);

      // Inject script to handle dynamic interactions
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