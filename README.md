# QuantumCatalyst AI - End-to-End Prototype

This is a runnable full-stack prototype inspired by your concept:

- Industrial reaction targeting (`ethanol-to-jet`, `co2-to-methanol`, `syngas-to-ethanol`)
- Retrieval from a catalyst database (seeded local data)
- VQE-like quantum energy profiling module for transition-metal candidates
- Generative catalyst proposal step (novel candidates from top performers)
- Multi-objective ranking (activity, selectivity, stability)
- Interactive browser UI + 3D molecular viewer
- Feedback loop that ingests experimental results and updates prediction biases
- Synthetic biology module (pathway hints, flux risk, suggested gene edits)
- AI copilot integration with deterministic fallback for reliability
- Use-case-specific decision logic (cost-sensitive, stability-focused, high-selectivity, pilot speed)

## Tech Stack

- Backend: Node.js + Express
- Frontend: Vanilla HTML/CSS/JS
- 3D Viewer: 3Dmol.js

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start server:
   ```bash
   npm start
   ```
   If port `4000` is occupied, the server now auto-retries on `4001`, `4002`, etc.

3. Open in browser:
   - Usually: [http://localhost:4000](http://localhost:4000)
   - If occupied: check terminal for the selected fallback port

### Optional: Enable LLM Mode

By default, the system uses deterministic fallback insights.

Set these environment variables to enable OpenAI-backed AI insights:

```bash
export OPENAI_API_KEY="your_api_key"
export OPENAI_MODEL="gpt-4o-mini"
npm start
```

## API Endpoints

- `GET /api/reactions`
  - Available target reactions
- `POST /api/pipeline/run`
  - Body:
    ```json
    {
      "reactionKey": "ethanol-to-jet",
      "useCase": "Cost-sensitive pilot with high selectivity"
    }
    ```
  - Runs full pipeline and returns:
    - ranked candidates
    - deterministic use-case decision output
    - AI insights (`openai` if configured, otherwise `manual-fallback`)
- `POST /api/feedback`
  - Body:
    ```json
    {
      "reactionKey": "ethanol-to-jet",
      "candidateId": "GEN-ethanol-to-jet-1",
      "measuredYield": 0.84,
      "measuredSelectivity": 0.78,
      "measuredStability": 0.81
    }
    ```
  - Stores experiment log and updates lightweight model state
- `GET /api/feedback/logs`
  - Returns recent logs
- `GET /api/health`
  - Simple health check

## Project Structure

- `server.js` - backend pipeline + APIs + static hosting
- `public/index.html` - UI layout
- `public/styles.css` - styling
- `public/app.js` - frontend logic and API integration
- `data/catalysts.json` - seeded catalyst database
- `data/experiment_logs.json` - created automatically at runtime

## Notes

- The VQE component is a realistic abstraction for demo/prototyping. It is structured to be replaceable by real quantum backends (Qiskit/PennyLane/Amazon Braket) without changing the UI contract.
- The feedback loop currently uses online bias updates. You can later replace this with full retraining jobs.
- The AI copilot is fail-safe by design: if API key/network/model fails, the system automatically falls back to local rule-based guidance.
