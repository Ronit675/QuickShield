"""
train.py — QuickShield ML risk model trainer

Trains three GradientBoostingRegressor models (one per risk component F, Z, A)
on synthetically generated data that reflects real-world patterns:
  - India monsoon seasonality (June–September peak)
  - Zone-level historical flood/disruption rates
  - Platform-level app crash baselines
  - Civic/traffic events on weekends

Run:  python train.py
Output: model/ directory with .pkl files and meta.json
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib, json, os

np.random.seed(42)
N = 6000

ZONES = {
    'bengaluru-btm':         {'base_z': 0.65, 'flood_prone': True,  'city': 'bengaluru'},
    'bengaluru-koramangala': {'base_z': 0.45, 'flood_prone': True,  'city': 'bengaluru'},
    'bengaluru-indiranagar': {'base_z': 0.25, 'flood_prone': False, 'city': 'bengaluru'},
    'bengaluru-whitefield':  {'base_z': 0.20, 'flood_prone': False, 'city': 'bengaluru'},
    'mumbai-andheri':        {'base_z': 0.70, 'flood_prone': True,  'city': 'mumbai'},
    'mumbai-bandra':         {'base_z': 0.50, 'flood_prone': True,  'city': 'mumbai'},
    'delhi-connaught':       {'base_z': 0.40, 'flood_prone': False, 'city': 'delhi'},
    'delhi-lajpat':          {'base_z': 0.30, 'flood_prone': False, 'city': 'delhi'},
    'hyderabad-hitech':      {'base_z': 0.35, 'flood_prone': False, 'city': 'hyderabad'},
    'pune-koregaon':         {'base_z': 0.28, 'flood_prone': False, 'city': 'pune'},
}

PLATFORMS = ['zepto', 'blinkit', 'swiggy', 'jio_mart']
PLATFORM_APP_RISK = {'zepto': 0.15, 'blinkit': 0.08, 'swiggy': 0.12, 'jio_mart': 0.10}

def generate_data(n: int) -> pd.DataFrame:
    rows = []
    for _ in range(n):
        zone_id     = np.random.choice(list(ZONES.keys()))
        z_info      = ZONES[zone_id]
        platform    = np.random.choice(PLATFORMS)
        month       = np.random.randint(1, 13)
        day_of_week = np.random.randint(0, 7)

        # Monsoon peaks at month 9 (September)
        monsoon_intensity = max(0.0, np.sin((month - 3) * np.pi / 6))

        base_rain_prob = 0.05 + 0.60 * monsoon_intensity
        if z_info['flood_prone']:
            base_rain_prob = min(1.0, base_rain_prob * 1.35)
        rainfall_forecast_mm = min(np.random.exponential(scale=base_rain_prob * 40), 120.0)

        hist_base = z_info['base_z'] * 0.6 + monsoon_intensity * 0.3
        historical_disruption_rate = float(np.clip(
            np.random.beta(a=hist_base * 4 + 0.5, b=(1 - hist_base) * 4 + 0.5), 0.01, 0.99
        ))

        civic_flag = int(np.random.random() < (0.05 + (0.12 if day_of_week >= 5 else 0.0)))

        # Ground truth targets
        F = float(np.clip(
            0.15 + 0.55 * (rainfall_forecast_mm / 120.0)
            + 0.20 * monsoon_intensity + 0.10 * civic_flag
            + np.random.normal(0, 0.04), 0.0, 1.0
        ))
        Z = float(np.clip(
            z_info['base_z'] * 0.50 + historical_disruption_rate * 0.35
            + (0.10 if z_info['flood_prone'] else 0.0) + civic_flag * 0.05
            + np.random.normal(0, 0.03), 0.0, 1.0
        ))
        A = float(np.clip(
            PLATFORM_APP_RISK[platform]
            + 0.12 * (rainfall_forecast_mm / 120.0) + 0.05 * monsoon_intensity
            + np.random.normal(0, 0.02), 0.0, 1.0
        ))

        rows.append({
            'zone_id': zone_id, 'platform': platform,
            'month': month, 'day_of_week': day_of_week,
            'rainfall_forecast_mm': round(rainfall_forecast_mm, 2),
            'historical_disruption_rate': round(historical_disruption_rate, 4),
            'flood_prone': int(z_info['flood_prone']),
            'civic_flag': civic_flag,
            'monsoon_intensity': round(monsoon_intensity, 4),
            'F': round(F, 4), 'Z': round(Z, 4), 'A': round(A, 4),
        })
    return pd.DataFrame(rows)


def train():
    print(f"Generating {N} synthetic training samples...")
    df = generate_data(N)

    le_zone     = LabelEncoder().fit(df['zone_id'])
    le_platform = LabelEncoder().fit(df['platform'])
    df['zone_enc']     = le_zone.transform(df['zone_id'])
    df['platform_enc'] = le_platform.transform(df['platform'])

    FEATURES = [
        'zone_enc', 'platform_enc', 'month', 'day_of_week',
        'rainfall_forecast_mm', 'historical_disruption_rate',
        'flood_prone', 'civic_flag', 'monsoon_intensity',
    ]
    X = df[FEATURES].values

    os.makedirs('model', exist_ok=True)
    metrics = {}

    for target in ['F', 'Z', 'A']:
        y = df[target].values
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

        model = GradientBoostingRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, min_samples_leaf=10, random_state=42,
        )
        model.fit(X_tr, y_tr)
        preds = model.predict(X_te)
        mae = mean_absolute_error(y_te, preds)
        r2  = r2_score(y_te, preds)
        metrics[target] = {'mae': round(mae, 4), 'r2': round(r2, 4)}
        joblib.dump(model, f'model/model_{target}.pkl')
        print(f"  {target}: MAE={mae:.4f}  R²={r2:.4f}")

    joblib.dump(le_zone,     'model/le_zone.pkl')
    joblib.dump(le_platform, 'model/le_platform.pkl')

    meta = {
        'features': FEATURES,
        'zones': list(ZONES.keys()),
        'platforms': PLATFORMS,
        'zone_risk_map': {k: v['base_z'] for k, v in ZONES.items()},
        'platform_app_risk': PLATFORM_APP_RISK,
        'train_samples': N,
        'metrics': metrics,
    }
    with open('model/meta.json', 'w') as f:
        json.dump(meta, f, indent=2)

    print("\nAll models saved to model/")
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    train()