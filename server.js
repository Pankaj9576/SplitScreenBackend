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
    new URL(targetUrl); // Validate URL
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

    // Handle HTML content and rewrite URLs for all resources
    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseUrl = new URL(targetUrl).origin;

      // Rewrite all href and src attributes to go through the proxy
      html = html.replace(/(href|src)=(["'])(?!https?:\/\/)(\/[^"']+)/g, `$1=$2${req.protocol}://${req.get("host")}/api/proxy?url=${encodeURIComponent(baseUrl)}$3`);
      html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)/g, `$1=$2${req.protocol}://${req.get("host")}/api/proxy?url=$3`);

      res.send(html);
    } else {
      // Stream non-HTML content (images, CSS, JS, PDFs, etc.)
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