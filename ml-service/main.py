"""
main.py — QuickShield ML Risk Prediction Service

Endpoints:
  POST /predict/risk   — predict F, Z, A and composite for a rider's context
  GET  /health         — liveness check (used by NestJS before calling)
  GET  /model/info     — training metrics and feature list (for demo dashboard)

Run:
  python train.py          # first time only
  uvicorn main:app --reload --port 5001
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import numpy as np
import joblib, json, os
from datetime import datetime

app = FastAPI(title="QuickShield Risk Model", version="1.0.0")

# ---------- Load artifacts on startup ----------
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'model')

try:
    model_F      = joblib.load(f'{MODEL_DIR}/model_F.pkl')
    model_Z      = joblib.load(f'{MODEL_DIR}/model_Z.pkl')
    model_A      = joblib.load(f'{MODEL_DIR}/model_A.pkl')
    le_zone      = joblib.load(f'{MODEL_DIR}/le_zone.pkl')
    le_platform  = joblib.load(f'{MODEL_DIR}/le_platform.pkl')
    with open(f'{MODEL_DIR}/meta.json') as f:
        META = json.load(f)
    LOADED = True
    print("Models loaded successfully.")
except Exception as e:
    LOADED = False
    print(f"WARNING: Could not load models: {e}. Run train.py first.")


# ---------- Static fallbacks (used if model not loaded or unknown zone) ----------
ZONE_RISK_MAP     = META.get('zone_risk_map', {}) if LOADED else {}
PLATFORM_APP_RISK = META.get('platform_app_risk', {}) if LOADED else {}


# ---------- Request / Response schemas ----------
class RiskRequest(BaseModel):
    zone_id: str                        = Field(..., example="bengaluru-koramangala")
    platform: str                       = Field(..., example="zepto")
    rainfall_forecast_mm: float         = Field(0.0,  ge=0, le=200)
    historical_disruption_rate: float   = Field(0.3,  ge=0, le=1)
    civic_flag: int                     = Field(0,    ge=0, le=1)
    # Optional — inferred from current date if not supplied
    month: int | None                   = Field(None, ge=1, le=12)
    day_of_week: int | None             = Field(None, ge=0, le=6)

class RiskResponse(BaseModel):
    F: float          # forecast risk    0–1
    Z: float          # zone risk        0–1
    A: float          # app crash risk   0–1
    composite: float  # 0.4F + 0.4Z + 0.2A
    risk_multiplier: float  # 0.8 + 0.7 × composite^1.5
    source: str       # "ml_model" | "static_fallback"
    model_version: str


def compute_risk_multiplier(composite: float) -> float:
    return round(0.8 + 0.7 * (composite ** 1.5), 4)

def monsoon_intensity(month: int) -> float:
    return max(0.0, float(np.sin((month - 3) * np.pi / 6)))

def static_fallback(req: RiskRequest, month: int) -> RiskResponse:
    """Used when zone/platform is unknown or models not loaded."""
    Z = ZONE_RISK_MAP.get(req.zone_id, 0.35)
    A = PLATFORM_APP_RISK.get(req.platform, 0.12)
    mi = monsoon_intensity(month)
    F  = round(0.15 + 0.55 * (req.rainfall_forecast_mm / 120.0) + 0.20 * mi, 4)
    F  = min(1.0, max(0.0, F))
    composite = round(0.4 * F + 0.4 * Z + 0.2 * A, 4)
    return RiskResponse(
        F=round(F, 4), Z=round(Z, 4), A=round(A, 4),
        composite=composite,
        risk_multiplier=compute_risk_multiplier(composite),
        source="static_fallback",
        model_version="n/a",
    )


# ---------- Routes ----------
@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": LOADED}


@app.get("/model/info")
def model_info():
    if not LOADED:
        raise HTTPException(503, "Models not loaded. Run train.py first.")
    return META


@app.post("/predict/risk", response_model=RiskResponse)
def predict_risk(req: RiskRequest):
    now = datetime.now()
    month       = req.month       or now.month
    day_of_week = req.day_of_week or now.weekday()

    # Fallback if unknown zone or platform
    if req.zone_id not in (META.get('zones', []) if LOADED else []):
        return static_fallback(req, month)

    if not LOADED:
        return static_fallback(req, month)

    # Encode categoricals safely
    try:
        zone_enc     = int(le_zone.transform([req.zone_id])[0])
        platform_enc = int(le_platform.transform([req.platform])[0])
    except ValueError:
        return static_fallback(req, month)

    mi = monsoon_intensity(month)
    X  = np.array([[
        zone_enc,
        platform_enc,
        month,
        day_of_week,
        min(req.rainfall_forecast_mm, 120.0),
        req.historical_disruption_rate,
        int(req.zone_id in [z for z in META['zones'] if 'btm' in z or 'andheri' in z or 'bandra' in z or 'koramangala' in z]),
        req.civic_flag,
        mi,
    ]])

    F = float(np.clip(model_F.predict(X)[0], 0.0, 1.0))
    Z = float(np.clip(model_Z.predict(X)[0], 0.0, 1.0))
    A = float(np.clip(model_A.predict(X)[0], 0.0, 1.0))
    composite = round(0.4 * F + 0.4 * Z + 0.2 * A, 4)

    return RiskResponse(
        F=round(F, 4), Z=round(Z, 4), A=round(A, 4),
        composite=composite,
        risk_multiplier=compute_risk_multiplier(composite),
        source="ml_model",
        model_version="gbm-v1",
    )