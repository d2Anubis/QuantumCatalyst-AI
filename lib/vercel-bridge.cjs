"use strict";

const express = require("express");
const { createApiRouter, ensureExperimentLogFile } = require("./backend.cjs");

/**
 * Bridges Vercel's Node request/response to the same Express /api router as server.js,
 * mounting routes at `/api`.
 */
function qcaiApiBridge(req, res) {
  ensureExperimentLogFile();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use("/api", createApiRouter(express));
  app(req, res);
}

module.exports = qcaiApiBridge;
