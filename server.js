const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createApiRouter, ensureExperimentLogFile } = require("./lib/backend.cjs");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

ensureExperimentLogFile();

// REST API shared with Vercel serverless (see /api/*.js)
app.use("/api", createApiRouter(express));

// Vanilla platform UI — lives in public/app/ so Next static export copies it to out/app/ (Vercel)
app.use("/app", express.static(path.join(__dirname, "public", "app")));

// Marketing page — Next.js static export served at /
// Built by `npm run build` into the `out/` directory
const outDir = path.join(__dirname, "out");
if (fs.existsSync(outDir)) {
  app.use(express.static(outDir));
}

// Root fallback: redirect to /app if no Next.js build exists yet
app.get("/", (req, res) => {
  if (fs.existsSync(path.join(outDir, "index.html"))) {
    res.sendFile(path.join(outDir, "index.html"));
  } else {
    res.redirect("/app");
  }
});

function startServerWithPortRetry(initialPort, maxAttempts = 10) {
  let currentPort = Number(initialPort);
  let attempts = 0;

  function tryListen() {
    const server = app
      .listen(currentPort, () => {
        console.log(`QuantumCatalyst AI prototype running at http://localhost:${currentPort}`);
      })
      .on("error", (err) => {
        if (err.code === "EADDRINUSE" && attempts < maxAttempts) {
          attempts += 1;
          currentPort += 1;
          console.log(`Port in use. Retrying on ${currentPort}...`);
          return tryListen();
        }
        throw err;
      });

    return server;
  }

  return tryListen();
}

startServerWithPortRetry(PORT);
