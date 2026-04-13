# QuickShield — ML Risk Service

A FastAPI microservice that predicts the three risk components used in QuickShield's weekly premium formula. NestJS calls this service on every `POST /premium/calculate` request. If the service is unreachable it degrades silently to static fallback values — the backend never crashes.

---

## How it fits in the stack

```
React Native app
      │  POST /premium/calculate  { coveragePerDay }
      ▼
NestJS Backend  (premium.service.ts)
      │  POST /predict/risk  { zone_id, platform, rainfall_mm, ... }
      ▼
ML Service  ← you are here
      │
      ▼
GBM models → F, Z, A → composite → risk_multiplier
      │
      ▼
NestJS applies formula:
  clip(max(20, 30×income/900) × risk_multiplier × cov_factor, 20, 50)
```

---

## Prerequisites

- Python **3.11 or higher**
- pip

The dependency pins in `requirements.txt` are selected to work with current Python releases, including Python 3.14. If you previously created a virtual environment with older pins, recreate it before reinstalling.

Verify your version:

```bash
python3 --version
```

---

## Project structure

```
ml-service/
├── train.py          # generates synthetic data and trains the 3 GBM models
├── main.py           # FastAPI app — serves predictions
├── requirements.txt  # pinned dependencies
├── README.md         # this file
└── model/            # created by train.py — do not edit manually
    ├── model_F.pkl
    ├── model_Z.pkl
    ├── model_A.pkl
    ├── le_zone.pkl
    ├── le_platform.pkl
    └── meta.json
```

---

## Setup and first run

### Step 1 — Create a virtual environment

```bash
cd ml-service
python3 -m venv venv
```

If you are replacing an older environment, delete `venv/` first and then recreate it.

Activate it:

```bash
# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### Step 2 — Install dependencies

```bash
pip install -r requirements.txt
```

### Step 3 — Train the models

Run this once. It generates 6,000 synthetic training samples, trains three Gradient Boosting models (one each for F, Z, and A), and saves all artifacts into the `model/` folder.

```bash
python train.py
```

Expected output:

```
Generating 6000 synthetic training samples...
  F: MAE=0.0324  R²=0.9326
  Z: MAE=0.0248  R²=0.9684
  A: MAE=0.0167  R²=0.8092

All models saved to model/
```

You only need to re-run `train.py` if you add new zones or change the training logic.

### Step 4 — Start the service

```bash
uvicorn main:app --reload --port 5001
```

The `--reload` flag restarts the server automatically when you edit `main.py`. Remove it in production.

You should see:

```
Models loaded successfully.
INFO:     Uvicorn running on http://127.0.0.1:5001
```

---

## Verifying it works

### Health check

```bash
curl http://localhost:5001/health
```

Expected:

```json
{ "status": "ok", "models_loaded": true }
```

### Predict risk

```bash
curl -X POST http://localhost:5001/predict/risk \
  -H "Content-Type: application/json" \
  -d '{
    "zone_id": "bengaluru-koramangala",
    "platform": "zepto",
    "rainfall_forecast_mm": 30.0,
    "historical_disruption_rate": 0.45,
    "civic_flag": 0,
    "month": 8,
    "day_of_week": 2
  }'
```

Expected response shape:

```json
{
  "F": 0.4812,
  "Z": 0.3954,
  "A": 0.1731,
  "composite": 0.4696,
  "risk_multiplier": 1.0242,
  "source": "ml_model",
  "model_version": "gbm-v1"
}
```

### Model metadata

```bash
curl http://localhost:5001/model/info
```

Returns the full training config — zones, platforms, features, and metrics.

### Interactive docs

FastAPI auto-generates a UI at:

```
http://localhost:5001/docs
```

You can test all endpoints directly from the browser without curl.

---

## Request reference — `POST /predict/risk`

| Field | Type | Required | Description |
|---|---|---|---|
| `zone_id` | string | Yes | Rider's service zone. See supported zones below. |
| `platform` | string | Yes | `zepto` · `blinkit` · `swiggy` · `jio_mart` |
| `rainfall_forecast_mm` | float | No (default 0) | Hourly rainfall in mm from OpenWeatherMap |
| `historical_disruption_rate` | float | No (default 0.3) | Zone's past 8-week disruption rate (0–1). Stored in `RiderProfile.zoneRiskScore`. |
| `civic_flag` | int | No (default 0) | `1` if a curfew or strike is active today |
| `month` | int | No | 1–12. Derived from `new Date()` in NestJS if omitted. |
| `day_of_week` | int | No | 0 (Sun) – 6 (Sat). Derived from `new Date()` in NestJS if omitted. |

---

## Response reference

| Field | Description |
|---|---|
| `F` | Forecast risk (0–1). Driven by rainfall, monsoon season, civic events. |
| `Z` | Zone risk (0–1). Driven by historical disruption rate and flood-prone flag. |
| `A` | App crash risk (0–1). Driven by platform baseline and rain-related load spikes. |
| `composite` | `0.4×F + 0.4×Z + 0.2×A` — the weighted risk index. |
| `risk_multiplier` | `0.8 + 0.7 × composite^1.5` — plugged directly into the premium formula. |
| `source` | `ml_model` when GBM ran, `static_fallback` when zone is unknown. |
| `model_version` | `gbm-v1` — use this to track which model version priced a policy. |

---

## Supported zones

| Zone ID | City | Base risk |
|---|---|---|
| `bengaluru-btm` | Bengaluru | High (0.65) |
| `bengaluru-koramangala` | Bengaluru | Medium (0.45) |
| `bengaluru-indiranagar` | Bengaluru | Low (0.25) |
| `bengaluru-whitefield` | Bengaluru | Low (0.20) |
| `mumbai-andheri` | Mumbai | High (0.70) |
| `mumbai-bandra` | Mumbai | Medium (0.50) |
| `delhi-connaught` | Delhi | Medium (0.40) |
| `delhi-lajpat` | Delhi | Low (0.30) |
| `hyderabad-hitech` | Hyderabad | Low (0.35) |
| `pune-koregaon` | Pune | Low (0.28) |

If an unknown zone is sent, the service returns a `static_fallback` response using the average risk value (0.35) instead of raising an error.

---

## Model metrics

Trained on 6,000 synthetic samples with an 80/20 train/test split.

| Model | Target | MAE | R² |
|---|---|---|---|
| GBM | F — Forecast risk | 0.0324 | 0.9326 |
| GBM | Z — Zone risk | 0.0248 | 0.9684 |
| GBM | A — App crash risk | 0.0167 | 0.8092 |

MAE is on a 0–1 scale, so 0.03 means the model is off by ±3 percentage points on average.

---

## NestJS integration

The NestJS backend connects via `ML_SERVICE_URL` in your `.env`:

```
ML_SERVICE_URL=http://localhost:5001
```

The call is made in `ml.service.ts` with a 3-second timeout. If the service is down or too slow, NestJS logs a warning and uses static fallback values — the rider still gets a premium, just without ML adjustment.

---

## Retraining

To add a new zone, open `train.py` and add an entry to the `ZONES` dict:

```python
ZONES = {
    ...
    'chennai-adyar': {'base_z': 0.42, 'flood_prone': True, 'city': 'chennai'},
}
```

Then retrain:

```bash
python train.py
```

And restart the service:

```bash
uvicorn main:app --reload --port 5001
```

No changes needed in NestJS — the new zone will be picked up automatically.

---

## Stopping the service

Press `Ctrl + C` in the terminal where uvicorn is running.

To deactivate the virtual environment when you're done:

```bash
deactivate
```
