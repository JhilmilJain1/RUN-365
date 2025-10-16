# 🏃‍♂️ Marathon Training Plan API

This project provides an AI-powered API for generating personalized running plans — including the first week or full multi-week training schedules — based on user inputs like experience, race goal, and running history.

---

## 🚀 Getting Started

### Run the Server
To start the development server, use:

```bash
npm run dev
The API will be available at:
http://0.0.0.0:8000

🧩 API Endpoints
1. Generate Training Plan

Endpoint:
POST http://0.0.0.0:8000/generate-plan

Description:
Generates the first week (or complete) training plan based on the provided input parameters.

Sample Request Body:
{
  "gender": "male",
  "height": 73,
  "weight": 132,
  "plan_name": "Marathon",
  "measurement_unit": "km",
  "start_date": "2025-10-15T06:00:00.000Z",
  "min_weeks_plan": 10,
  "max_week_plans": 16,
  "first_week_only": true,
  "plan_id": null,
  "generatedPlanData": null,
  "days_per_week": "7",
  "specific_days": "Tuesday,Monday,Wednesday",
  "long_run_day": "Monday",
  "estimated_race_time": "0-5mins",
  "weekly_mileage_past_4_weeks": "0",
  "goal_race_time": "04:49",
  "longest_run_past_4_weeks": "1 km",
  "course_profile": "Track",
  "previous_marathon_time_false": "First Marathon",
  "running_experience": "Beginner"
}
2. Get Remaining Plan

Endpoint:

POST http://0.0.0.0:8000/get-remaining-plan


Description:
Retrieves the remaining weeks of the training plan using the plan ID generated from the first API.

Sample Request Body:
{
  "plan_id": "4d12bdda51ed40eb8917"
}
