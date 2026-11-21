# WeatherGPT

A responsive Tamil Nadu weather dashboard built with React, Vite, Tailwind CSS, and FastAPI.

## Run locally

Start the existing FastAPI service in one terminal:

```powershell
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload
```

Start the frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (by default, http://localhost:5173). The development server proxies `/api/weather` and `/api/districts` to FastAPI on `http://127.0.0.1:8000`.

For a separately hosted API, set `VITE_API_BASE_URL` to its origin in the frontend environment. Configure a same-origin reverse proxy or an explicit backend CORS allowlist for production deployments.

## Live data

- `GET /weather?district=Coimbatore` preserves the original response fields and adds current measurements, forecast data, observation time, and source attribution.
- `GET /districts` returns all 38 Tamil Nadu districts with representative coordinates.
- Weather observations and forecasts are retrieved from Open-Meteo. District coordinates identify representative locations, not administrative boundaries.
- Analytics currently visualize forecast data, not a historical archive or ML model output.

## Historical weather and PostgreSQL

The History page uses Open-Meteo's Historical Weather API with ERA5 daily reanalysis, which includes precipitation and weather codes. These are modeled grid-cell estimates for representative district coordinates, not direct weather-station observations. Archive data is saved in PostgreSQL so repeated syncs update existing district/date records instead of duplicating them.

Start the local PostgreSQL service from the repository root:

```powershell
docker compose up -d db
```

Set this connection string in `backend/.env` (add it without replacing any existing API settings):

```env
DATABASE_URL=postgresql://weathergpt:weathergpt_dev@localhost:5432/weathergpt
```

Install backend dependencies with the virtual environment active:

```powershell
cd backend
pip install -r requirements.txt
```

In the History page, choose a date range and sync the selected district or all 38 districts. The page provides monthly temperature/rainfall/humidity trends, yearly and seasonal summaries, district comparisons, statistical anomaly candidates, a next-day training-data CSV, and forecast evaluation. It also trains an experimental per-district Random Forest from stored daily lags to predict temperature and rainfall for the day after the latest complete observation. Accuracy is reported as chronological holdout MAE and compared with a persistence baseline; it is not an official forecast or a long-term benchmark. Because the ERA5 archive is delayed, the target date can be several days ahead of the latest input observation.

## Real AI setup

To enable the assistant to use a real LLM, copy the backend example environment file and choose one of the supported paths:

```powershell
cd backend
copy .env.example .env
```

Then edit `.env`:

- For a paid hosted LLM, set `OPENAI_API_KEY`
- For a zero-cost local option, install Ollama and leave `OPENAI_API_KEY` empty while setting `OLLAMA_BASE_URL` and `OLLAMA_MODEL`

The backend checks for OpenAI first, then Ollama, and finally falls back to the built-in local weather logic if no external model is available.

## Remaining limitations

PostgreSQL requires Docker Desktop with WSL2/Virtual Machine Platform enabled, or another PostgreSQL server configured through `DATABASE_URL`. ERA5 is reanalysis rather than station data; the Random Forest is an experimental baseline and can underperform the persistence baseline, especially for rainfall. No RAG pipeline or verified IMD alert feed is included.
