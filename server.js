const cors = require("cors")
const fetch = require("node-fetch")
const url = require("url")

const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = ["https://projectbayslope.vercel.app", "http://localhost:3000"]
    console.log(`CORS origin check - Origin: ${origin}`)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`CORS warning - Origin not allowed: ${origin}`)
      callback(null, false)
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
})

module.exports = (req, res) => {
  console.log(`Received request: ${req.method} ${req.url}`)

  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request")
    corsMiddleware(req, res, () => {
      res
        .status(200)
        .setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
        .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .setHeader("Access-Control-Allow-Headers", "Content-Type")
      console.log("OPTIONS response sent")
      res.end()
    })
    return
  }

  corsMiddleware(req, res, async () => {
    try {
      const path = req.url.split("?")[0]

      if (req.method === "GET" && path === "/api/proxy") {
        let { url: targetUrl } = req.query

        if (!targetUrl) {
          console.log("Missing URL parameter")
          res.status(400).json({ error: "URL parameter is required" })
          return
        }

        try {
          // Don't force the URL to be from patents.google.com
          targetUrl = new URL(targetUrl).toString()
        } catch (e) {
          console.log(`Invalid URL: ${targetUrl}`)
          res.status(400).json({ error: "Invalid URL" })
          return
        }

        console.log(`Proxy GET request for URL: ${targetUrl}`)

        const fetchHeaders = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          Referer: "https://patents.google.com/",
          Connection: "keep-alive",
        }
        console.log("Fetch headers:", fetchHeaders)

        // Check if it's a patent URL and try to get the PDF directly
        if (targetUrl.includes("patents.google.com/patent/")) {
          const patentNumberMatch = targetUrl.match(/patent\/([A-Z0-9]+)/i)
          if (patentNumberMatch) {
            const patentNumber = patentNumberMatch[1]
            const pdfUrl = `https://patentimages.storage.googleapis.com/pdfs/${patentNumber}.pdf`

            try {
              console.log(`Trying direct PDF for patent: ${pdfUrl}`)
              const pdfResponse = await fetch(pdfUrl, { method: "HEAD" })

              if (pdfResponse.ok) {
                console.log(`PDF found, redirecting to: ${pdfUrl}`)
                res.redirect(pdfUrl)
                return
              }
            } catch (err) {
              console.log(`PDF check failed: ${err.message}, continuing with normal fetch`)
            }
          }
        }

        let response = await fetch(targetUrl, { headers: fetchHeaders })

        console.log(`Fetch response status: ${response.status}`)
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Fetch failed: ${response.status} - ${errorText}`)
          res.status(response.status).json({ error: `Failed to fetch URL: ${response.statusText}` })
          return
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream"
        res.setHeader("Content-Type", contentType)
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")

        if (contentType.includes("text/html")) {
          let html = await response.text()

          // Check if it's a Google Patents search page and try PDF fallback
          if (html.includes("Google Patents") && html.includes("Search and read the full text of patents")) {
            console.log("Detected Google Patents search page, attempting PDF fallback")
            const patentNumberMatch = targetUrl.match(/patent\/([A-Z0-9]+)/i)
            if (patentNumberMatch) {
              const patentNumber = patentNumberMatch[1]
              const pdfUrl = `https://patentimages.storage.googleapis.com/pdfs/${patentNumber}.pdf`
              console.log(`Fetching PDF fallback: ${pdfUrl}`)

              try {
                response = await fetch(pdfUrl, { headers: fetchHeaders })
                if (response.ok) {
                  res.setHeader("Content-Type", "application/pdf")
                  res.setHeader("Content-Disposition", "inline")
                  response.body.pipe(res)
                  return
                }
              } catch (pdfError) {
                console.error(`PDF fetch failed: ${pdfError.message}`)
              }
            }
          }

          // Extract base URL for fixing relative links
          const parsedUrl = new URL(targetUrl)
          const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`

          // Fix relative URLs
          html = html.replace(/(href|src)="\/([^"]*)"/g, `$1="${baseUrl}/$2"`)

          res.setHeader("Content-Type", "text/html")
          res.send(html)
          return
        }

        // Check if the URL is a blob or local file and handle with Google Docs viewer
        const fileExt = targetUrl.split(".").pop().toLowerCase()
        if (["xlsx", "doc", "docx"].includes(fileExt)) {
          const googleDocsUrl = `https://docs.google.com/gview?url=${encodeURIComponent(targetUrl)}&embedded=true`
          res.redirect(googleDocsUrl)
          return
        }

        res.setHeader("Content-Disposition", "inline")
        response.body.pipe(res)
        return
      }

      console.log(`Route not found: ${req.method} ${path}`)
      res.status(404).json({ error: "Endpoint not found" })
    } catch (error) {
      console.error("Server error:", error.message)
      res.status(500).json({ error: `Server error: ${error.message}` })
    }
  })
}
