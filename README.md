# RUN-365

**AI-powered personalized running training plan API**

RUN-365 is a Node.js REST API that generates customized running training plans for **5K**, **10K**, **Half Marathon**, and **Marathon** races. It uses OpenAI to build week-by-week schedules tailored to a runner's experience, goals, available training days, and race date — with built-in rules for rest days, recovery runs, tapering, and pace zones.

---

## What does this project do?

Most running apps need a backend that turns user profile data into a structured training plan. RUN-365 handles that:

1. **Collect runner details** — experience level, weekly mileage, goal race, training days, etc.
2. **Generate Week 1 quickly** — returns the first week of workouts with dates, distances, paces, and workout types.
3. **Generate the full plan** — uses the stored `plan_id` to build all remaining weeks, including progressive load and race-day taper.

The API also includes helper endpoints for pace zones, plan duration, and rest-day validation — useful for form validation in a mobile or web app before generating a plan.

---

## How it works (high level)

```
┌─────────────┐     POST /generate-plan      ┌──────────────────┐
│  Your App   │ ───────────────────────────► │   RUN-365 API    │
│ (mobile/web)│                              │  (Express.js)    │
└─────────────┘                              └────────┬─────────┘
       ▲                                              │
       │         Returns Week 1 + plan_id             │ OpenAI
       │                                              ▼
       │                                     ┌──────────────────┐
       │     POST /get-remaining-plan        │  Plan generation │
       └──────────────────────────────────── │  + post-processing│
                 Returns full plan          └──────────────────┘
```

**Two-step plan flow**

| Step | Endpoint | What you get |
|------|----------|--------------|
| 1 | `POST /generate-plan` | First week of workouts + a `plan_id` |
| 2 | `POST /get-remaining-plan` | Complete multi-week plan (uses `plan_id`) |

Plans are stored **in memory for 24 hours**. After that, the `plan_id` expires and you must generate a new plan.

---

## Supported race types

| Plan | Distance |
|------|----------|
| 5K | 5 km / 3.1 mi |
| 10K | 10 km / 6.2 mi |
| Half Marathon | 21.1 km / 13.1 mi |
| Marathon | 42.2 km / 26.2 mi |

**Experience levels:** Beginner, Intermediate, Advanced, Elite

---

## Key features

- **Personalized schedules** — training days, long run day, and weekly mileage inform each workout
- **Smart workout sequencing** — no back-to-back hard efforts; recovery runs after long runs
- **Rest day logic** — experience-based rest requirements and placement
- **Race-day taper** — automatic volume reduction in the final 1–3 weeks
- **Pace recommendations** — every workout includes target pace ranges
- **5K/10K progression** — walk → jog → run progression for beginners and intermediates
- **Utility endpoints** — pace zones, plan duration, and rest-day validation without calling OpenAI

---

## Project structure

```
RUN-365/
├── README.md                 ← You are here
├── server.js                 ← Main API server
├── package.json              ← Dependencies and scripts
├── openapi.json              ← OpenAPI 3.0 spec for all endpoints
├── .env.example              ← Environment variable template
├── comprehensive-test.js     ← Full endpoint test suite
└── endpoint-test-results/    ← Sample API responses from tests
```

---

## Prerequisites

- **Node.js** 16 or higher
- **OpenAI API key** with access to the models used by the server ([get one here](https://platform.openai.com/account/api-keys))

---

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/JhilmilJain1/RUN-365.git
cd RUN-365
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and add your OpenAI key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=8000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `PORT` | No | Server port (default: `8000`) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (default: `*`) |
| `MOCK_MODE` | No | Set to `true` for testing without OpenAI |
| `DEBUG_MODE` | No | Enable verbose logging |

### 4. Start the server

```bash
node server.js
```

The API runs at `http://localhost:8000`.

Verify it is running:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2026-05-29T12:00:00.000Z"
}
```

---

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/plan-status/:plan_id` | Check if a plan exists in memory |
| `POST` | `/generate-plan` | Generate Week 1 and receive a `plan_id` |
| `POST` | `/get-remaining-plan` | Get the full plan using `plan_id` |
| `POST` | `/calculate-pace-zones` | Compute pace zones from goal race time |
| `POST` | `/calculate-plan-duration` | Calculate weeks between start and race date |
| `POST` | `/validate-rest-days` | Validate rest-day rules for experience + training days |

OpenAPI spec: [`openapi.json`](openapi.json)

---

## Example usage

### Generate the first week

```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "running_experience": "Intermediate",
    "plan_name": "Marathon",
    "measurement_unit": "km",
    "start_date": "2026-06-01",
    "race_date": "2026-10-15",
    "days_per_week": 4,
    "specific_days": "Monday, Wednesday, Friday, Saturday",
    "long_run_day": "Saturday",
    "weekly_mileage_past_4_weeks": "30-40",
    "longest_run_past_4_weeks": "18 km",
    "goal_race_time": "04:15:00"
  }'
```

The response includes a `plan_id` — save it for the next step.

### Get the complete plan

```bash
curl -X POST http://localhost:8000/get-remaining-plan \
  -H "Content-Type: application/json" \
  -d '{"plan_id": "YOUR_PLAN_ID_HERE"}'
```

### Calculate pace zones (no OpenAI call)

```bash
curl -X POST http://localhost:8000/calculate-pace-zones \
  -H "Content-Type: application/json" \
  -d '{
    "goal_race_time": "04:15:00",
    "race_distance": 42.2,
    "experience": "Intermediate",
    "measurement_unit": "km"
  }'
```

---

## Testing

```bash
# Run the full endpoint test suite
npm test

# Quick tests for specific plan types
npm run test:5k
npm run test:marathon
```

Test output samples are saved in `endpoint-test-results/`.

---

## Tech stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js |
| Framework | Express 5 |
| AI | OpenAI API |
| Storage | In-memory (24h TTL) |
| Other | CORS, dotenv, uuid |

---

## Deployment notes

- Set `ALLOWED_ORIGINS` in production instead of allowing all origins (`*`).
- Plans are stored in memory — use Redis or a database for production persistence.
- The server forces UTC (`process.env.TZ = 'UTC'`) for consistent date handling across environments.
- Expose the API via a reverse proxy or tunnel (e.g. ngrok) for mobile app development.

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to your fork and open a Pull Request

For questions or issues, open a GitHub issue on [JhilmilJain1/RUN-365](https://github.com/JhilmilJain1/RUN-365).
