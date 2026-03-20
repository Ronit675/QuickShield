# QuickShield

- **Team**: 3Three
- **Github**: https://github.com/Ronit675/QuickShield
- **Video Link**: https://www.loom.com/share/25bde692b6c443fba2ac546310d0743a

## Overview

QuickShield is an AI-enabled parametric insurance platform designed to protect gig workers from income loss caused by external disruptions such as heavy rain, app outages, and local zone closures.

The product is built for q-commerce riders who depend on predictable peak-hour earnings. Instead of traditional claims processing, the platform uses verified external signals to detect disruption events and trigger proportional payouts automatically.

## Problem Statement

Q-commerce riders working for platforms such as Zepto, Blinkit, and similar services operate in narrow delivery windows and highly localized service zones. Their weekly income can fall sharply when external events interrupt deliveries.

Common disruption scenarios include:

- Heavy rain or waterlogging during the monsoon season, causing order delays or zone shutdowns.
- Local curfews, civic restrictions, or market closures that instantly reduce order flow.
- Platform outages or service interruptions that temporarily prevent riders from receiving or completing orders.

A rider typically works 7 to 10 hours per day, 6 days per week. Losing 2 to 3 peak hours in a single evening can result in meaningful income loss, often without any financial safety net.

## Solution

QuickShield provides parametric income protection for gig workers.

- Coverage is limited to income loss caused by verified external disruptions.
- Premiums are aligned to weekly payout cycles to match rider cash flow.
- Claims are triggered automatically using external data, not manual claim filing.
- Payouts are proportional to affected time slots rather than being based on full-day loss assumptions.

## Core Product Principles

- Scope: Covers income interruption from external disruptions only. It does not include health, accident, vehicle repair, or medical insurance.
- Model: Uses weekly policy pricing based on expected risk, selected coverage, and rider earnings patterns.
- Mechanism: Detects trigger events through weather, platform outage, civic, and platform activity data, then initiates automated claim logic.

## Why Mobile-First?

- Riders operate on smartphones during shifts
- Real-time alerts and payouts require mobile notifications
- GPS validation is easier via mobile devices

## Tech Stack

| Layer | Choice |
| --- | --- |
| Mobile App | React Native + TypeScript |
| Backend | NestJS (Node.js + TypeScript) |
| ORM / Database | Prisma + PostgreSQL |
| Payments | Razorpay / Stripe / UPI sandbox |
| External Data | Weather APIs, app outage signals, mock q-commerce platform APIs |

## Solution Architecture

```text
React Native Mobile App <-> NestJS REST API
                               |
                               v
                    PostgreSQL via Prisma ORM
                               |
                               v
        Weather APIs | App Outage Signals | Mock Platform APIs | Payment Sandbox
```

## Coverage Selection and Premium Model

### 1. Earnings-Based Coverage Recommendation

The platform estimates average rider earnings using the last 4 to 8 weeks of platform income data.

Example:

- Average daily income: Rs 850
- Recommended protection: Rs 750 per day

The default recommendation protects roughly 80 to 90 percent of verified average earnings.

### 2. Rider-Controlled Coverage Range

The rider can adjust the recommended coverage amount within predefined guardrails.

- Minimum coverage: 60 percent of verified average income
- Maximum coverage: 120 percent of verified average income

These limits are designed to:

- Keep the product meaningful at the lower bound
- Reduce over-insurance and fraud exposure at the upper bound

Example display:

- Typical daily earnings: Rs 850
- Recommended protection: Rs 750 per day
- Allowed slider range: Rs 510 to Rs 1,020

### 3. Dynamic Weekly Premium Formula

Weekly premium is determined at policy creation and renewal using the formula below:

```text
Weekly Premium = Base Premium x Risk Factor x Coverage Factor
```

Example for a rider in Bengaluru:

- Base premium: Rs 35 per week at Rs 600 per day reference coverage
- Coverage factor: 750 / 600 = 1.25
- Risk factor: 1.2 for a high-risk weather week
- Weekly premium: Rs 35 x 1.25 x 1.2 = Rs 52.50, rounded to Rs 53

### Premium Inputs

- Risk score: A value in the range `[0,1]` mapped into a risk factor range of approximately `[0.8,1.5]`
- Coverage factor: Selected protection rate divided by reference rate
- Zone risk: Historical weather, closure, and disruption frequency for a rider's service zone
- Forecast risk: Predicted rain, or disruption probability in the next 7 days
- Exposure: Declared weekly work pattern, such as 8 hours per day for 6 days

## Parametric Trigger Design

The platform models disruptions at the time-slot level because q-commerce income is highly sensitive to peak delivery windows.

### Daily Time Slots

| Slot | Time | Sensitivity |
| --- | --- | --- |
| S1 | 6 AM to 10 AM | Morning rush |
| S2 | 10 AM to 4 PM | Off-peak |
| S3 | 4 PM to 8 PM | Evening peak |
| S4 | 8 PM to 12 AM | Late night |

### Automated Triggers

| Trigger | Data Source | Threshold | Payout Logic |
| --- | --- | --- | --- |
| Heavy Rain | OpenWeatherMap | Greater than 25 mm/hr in zone | Affected slots |
| App Outage | Platform status or order-flow signal | Order flow drops to zero during outage window | Affected slots |
| Zone Closure | Mock civic or traffic API | Orders drop by more than 70 percent | Dark-zone payout |

Example:

If S3 is disrupted from 6 PM to 7 PM due to heavy rain, the rider receives a partial payout for 1 disrupted hour rather than a full-day payout.

## Example Persona Scenario

Ravi is a Zepto delivery partner in Bengaluru earning Rs 850 per day. On a rainy evening during the 6 PM to 8 PM peak slot, heavy rain greater than 25 mm per hour stops deliveries for 1 hour.

QuickShield detects:

- Rain trigger activated
- Ravi active in zone

The system then auto-triggers the payout:

- Rs 750 per day coverage
- Rs 93.75 per hour payout rate
- Ravi gets Rs 93.75 instantly

## AI Flow in Workflow

- Rider earnings, zone history, and forecast data are collected
- AI model calculates risk score -> feeds premium engine
- Premium engine computes the weekly premium and coverage recommendation
- Trigger services monitor live disruption signals
- Claims workflow validates eligibility and simulates or initiates payout

## AI and ML Roadmap

### Dynamic Pricing

Phase 2 introduces machine learning for more accurate pricing.

- Model candidate: XGBoost
- Inputs: zone history, weather forecast, and slot-level disruption patterns
- Output: expected loss for the next policy week, used to refine the risk factor

### Fraud Detection

Phase 3 introduces automated fraud screening.

- Anomaly detection for claim patterns that diverge significantly from peer behavior
- GPS validation to confirm rider presence in the affected micro-zone
- Cohort-based risk checks for abnormal frequency or payout size

## Key User Flows

### 1. Onboarding

- Rider connects a delivery platform account
- The system pulls recent earnings data
- Recommended daily protection is pre-filled
- The rider adjusts coverage within allowed limits
- Weekly premium is calculated and paid through UPI

### 2. Zero-Touch Claims

- A disruption event is detected automatically
- The claim engine validates trigger conditions
- GPS and event data confirm rider eligibility
- A proportional payout is initiated without manual claim submission

### 3. Weekly Renewal

- The rider receives an updated protection and premium estimate for the next week
- Forecasted risk affects the renewal price
- Auto-renew can be enabled for continuous coverage

## Phase 1 Prototype Scope

- Static premium calculator
- Mock trigger simulation
- UI wireframes for mobile
- No real-time payouts yet, only simulated payout flows

## Roadmap

## Development Plan (Phase 1 -> Phase 2)

Week 1-2:

- Define schema
- Setup backend APIs
- Mock trigger services

Week 3-4:

- Implement policy engine
- Integrate APIs
- Build claims system

### Phase 1: Foundation

Completed deliverables:

- Product strategy and concept definition
- Repository setup and documentation
- Initial demo planning

### Phase 2: Core Product

Planned deliverables:

- Registration and authentication
- Earnings import and rider profile creation
- Policy creation and premium calculation
- Trigger detection services
- Basic automated claims flow

### Phase 3: Production Readiness

Planned deliverables:

- Fraud detection services
- Instant payout workflows
- Admin and rider dashboards
- ML-assisted pricing refinement

## Target Project Structure

The structure below represents the intended implementation layout for the full product:

```text
quickshield/
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── policy/
│   │   ├── triggers/
│   │   ├── claims/
│   │   └── prisma/
│   │       └── schema.prisma
├── mobile/
│   ├── src/
│   │   ├── screens/
│   │   ├── services/
│   │   └── components/
├── docs/
└── README.md
```

## Success Metrics

### Rider App

- Weekly income protected
- Number of disrupted hours covered
- Active protection rate and daily cap
- Timeline of rain, app outage, and closure events

### Admin Dashboard

- Loss ratio by zone
- Trigger type distribution
- Rider segment performance
- Fraud and anomaly alerts

## Adversarial Defense and Anti-Spoofing Strategy

### Threat Model

Some malicious riders may use GPS-spoofing tools to fake presence inside an affected zone during a disruption window. If the system trusts location data blindly, it could approve false payouts and weaken the sustainability of the pool.

### Core Defense Principle

No payout decision should rely on a single signal. QuickShield should validate claims using multiple independent signals across location, activity, device behavior, and service-zone consistency.

### Validation Layers

- GPS validation: Confirm the rider device was present inside the impacted micro-zone during the disruption window.
- Platform activity correlation: Match pickup, drop, or order-assignment logs against the same zone and time range.
- Operating-area consistency: Compare the impacted zone against the rider's registered service area and historical working zone.
- Behavioral consistency: Detect impossible jumps, static spoof patterns, or unrealistic speeds.
- Device and network checks: Review location drift, sensor consistency, and abrupt cross-zone changes that suggest manipulation.

### Advanced Differentiation Logic

QuickShield differentiates between genuine riders and spoofers using behavioral and contextual validation.

- Movement consistency: Real riders show continuous movement across delivery routes, while spoofers often show static positions or unrealistic jumps.
- Order activity correlation: Genuine riders usually have matching pickup or drop activity during the disruption window. Missing or contradictory activity increases fraud risk.

### Multi-Signal Data Validation

Beyond GPS, the system should analyze:

- Platform order logs (pickup/drop timestamps)
- Historical rider activity patterns
- Device-level signals (speed, location drift)
- Network consistency (sudden jumps across distant zones)

This multi-signal approach reduces reliance on spoofable GPS data.

### Fair UX for Flagged Claims

To avoid penalizing honest riders, the review flow should remain user-safe and explainable.

- Soft flagging: Suspicious claims are held for review instead of being rejected immediately.
- Manual review: Flagged cases are checked using additional evidence and rule-based audit trails.
- User transparency: Riders are informed that the claim is under verification because of unusual activity.
- Retry mechanism: Riders can revalidate by sharing additional supporting data or activity evidence.

### Decision Outcomes

- Approve automatically when signals are consistent across zone, time, and rider activity.
- Hold for review when one or more signals conflict but fraud is not yet certain.
- Reject when evidence strongly indicates spoofing, impossible movement, or zone mismatch.

## Why This Product Matters

Gig workers face income volatility from events they cannot control. Traditional insurance models are poorly aligned with short-term, hourly income interruptions. QuickShield addresses that gap with a product that is:

- Fast to activate
- Easy to price weekly
- Automated in claims handling
- Grounded in verifiable external data

The long-term goal is to create a reliable financial safety net for high-frequency, low-margin workers who are currently underserved by mainstream insurance products.

## One-Line Summary

AI-powered parametric insurance that automatically compensates gig workers for hourly income loss using real-time disruption triggers.
