# Project Overview

## Overview
MetaML is a full‑stack AutoML and meta‑learning platform that enables users to upload CSV datasets, automatically extract meta‑features, receive algorithm recommendations, train multiple models, visualize a **Model Battle Arena**, view leaderboards, and generate AI‑written PDF reports.

The project is split into two main parts:

- **Backend** – FastAPI server written in Python (under `backend/`).
- **Frontend** – Next.js application written in JavaScript/React (under `frontend/`).

Both parts communicate via a set of REST API endpoints.

---

## Frontend Pages & Components

| Page / Component | Path | Purpose |
|------------------|------|---------|
| **Root Layout** | `frontend/src/app/layout.js` | Provides global light/dark theme toggling, injects global CSS variables, and wraps all pages with a consistent layout. |
| **Home Page** | `frontend/src/app/page.js` | Landing page that introduces MetaML, offers quick navigation to upload data and view tutorials. |
| **CSV Upload** | `frontend/src/components/CsvUpload.js` | Drag‑and‑drop UI for uploading a CSV dataset; validates file type and offers a synthetic dataset button. |
| **Data Preview** | `frontend/src/components/DataPreview.js` | Shows a paginated preview table of the uploaded dataset and lets the user select the target column. |
| **Model Battle Arena** | `frontend/src/components/ModelBattle.js` | Displays live training progress for each algorithm, animated leaderboard crowns, and a console‑style log stream. |
| **Leaderboard** | `frontend/src/components/Leaderboard.js` | Summarizes final model performance metrics and visualises feature‑attribution charts using Recharts. |
| **AI Explanation** | `frontend/src/components/AiExplanation.js` | Renders the AI‑generated markdown report, supports copy‑to‑clipboard and PDF download actions. |
| **Globals CSS** | `frontend/src/app/globals.css` | Core styling (custom CSS variables, dark mode, glass‑morphism effects) – no Tailwind dependencies. |

> All components are built with vanilla React and vanilla CSS to keep the bundle lightweight while delivering premium UI/UX (smooth gradients, hover animations, and responsive layouts).

---

## Backend API Endpoints

| Route | Method | Payload | Description |
|------|--------|---------|-------------|
| `/upload-dataset` | POST | `multipart/form-data` (CSV file) | Stores the uploaded file, creates a job ID, returns column names and a small preview. |
| `/analyze` | POST | `{ "job_id": "...", "target_column": "..." }` | Extracts statistical meta‑features, runs the rule‑based advisor and KNN meta‑learner, returns recommendations and dataset personality tags. |
| `/train-models` | POST | `{ "job_id": "...", "target_column": "..." }` | Launches asynchronous GridSearchCV training for five algorithms (Logistic Regression, Random Forest, XGBoost, SVM, KNN). |
| `/results/{job_id}` | GET | – | Polls the status of the training pipeline (PENDING, RUNNING, COMPLETED, FAILED) and returns final metrics. |
| `/results/{job_id}/pdf` | GET | – | Streams the generated PDF report (ReportLab) for download. |

The backend uses **FastAPI**, **SQLite** for persisting job metadata and historic meta‑learning models, and **scikit‑learn / XGBoost** for the ML algorithms.

---

## Overall Usage Flow
1. **Start servers** – see the "Run Instructions" section in `progress.md`.
2. Open the frontend at `http://localhost:3000` and navigate to the *Upload* page.
3. Upload a CSV (or use the synthetic dataset). The backend returns a `job_id`.
4. Choose the target column and click **Analyze** – meta‑features are computed and algorithm recommendations are displayed.
5. Click **Train Models** – the backend runs the GridSearchCV pipeline asynchronously.
6. Watch the **Model Battle Arena** for live training updates.
7. Once completed, view the **Leaderboard** for performance rankings and feature attributions.
8. Open **AI Explanation** to read the AI‑generated report and download the PDF.

---

## Repository Structure
```
automl/
├─ backend/               # FastAPI server, ML engine, DB, reports
│   ├─ ml/               # profiling, meta‑learning, training, explanation
│   ├─ reports/          # generated PDFs
│   └─ ...
├─ frontend/              # Next.js app
│   ├─ src/app/          # layout, page, globals CSS
│   └─ src/components/   # UI widgets (Upload, Preview, Battle, Leaderboard, AI Explanation)
└─ progress.md           # detailed progress and run instructions
```

This file provides a concise map of pages, their responsibilities, and how the whole system is intended to be used.
