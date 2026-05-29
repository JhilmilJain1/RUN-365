# 🏃‍♂️ Marathon Training Plan API

This project provides an AI-powered API for generating personalized running plans — including the first week or full multi-week training schedules — based on user inputs like experience, race goal, and running history.

## ✨ New Features (v2.1)

### 🏃‍♂️ 5K/10K Plan Constraints & Progressive Training
- **Distance Limits**: 
  - 5K Plans: Maximum 5.0 km (3.1 miles) for ANY workout
  - 10K Plans: Maximum 10.0 km (6.2 miles) for ANY workout
  - Minimum distance: 0.5 km (500 meters) or 0.3 miles for all workouts
- **Walking → Jogging → Running Progression** for Beginner/Intermediate 5K/10K plans:
  - Week 1-2: Walking workouts (brisk walking pace, 8-10 min/km)
  - Week 3-4: Walk-Jog intervals (alternating walking and light jogging)
  - Week 5+: Easy Jogging to Running progression
- **New Workout Types**: 'Walk', 'Walk-Jog', 'Easy Jog' for progressive training
- **Automatic Enforcement**: System automatically applies constraints and progression based on plan type and experience level

### 🎯 Intelligent Workout Sequencing
- **No back-to-back hard efforts**: System automatically spaces out Tempo, Intervals, and Long Runs with Easy/Recovery days
- **Optimal recovery patterns**: Hard workouts are separated by 2-3 days when possible
- **Smart workout placement**: Never schedules intervals the day before a long run

### 🛌 Smart Rest Day Logic
- **Experience-based rest requirements**: 
  - Beginners: Required 1 rest day per week
  - Intermediate: Recommended 1 rest day (optional)
  - Advanced/Elite: Rest days optional, can train 7 days
- **Intelligent rest placement**: Rest days scheduled after hardest workouts (intervals, tempo, or long run)
- **Separate from training days**: If you select 6 training days, you train 6 days and rest 1 day (not rest on one of the 6)

### 🔄 Recovery Runs After Long Runs
- **Automatic recovery scheduling**: Recovery runs are automatically scheduled the day after every long run
- **🚫 First day protection**: The first workout day is NEVER a recovery run - ensures proper training progression
- **Smart distance calculation**: Recovery runs are 30-50% of the long run distance (minimum 2km/1.5mi)
- **Optimal recovery pacing**: Very easy pace (7:30-8:30 min/km or 12:00-13:30 min/mi)
- **Intelligent workout conversion**: Existing hard workouts (Tempo, Intervals) are converted to recovery runs when scheduled after long runs
- **Training day awareness**: Only schedules recovery runs if the day after the long run is in your selected training days

### 📉 Tapering Before Races
- **Automatic taper implementation**: Final 1-3 weeks before race day
- **Progressive volume reduction**:
  - Week N-2: 75-85% of peak mileage
  - Week N-1: 60-70% of peak mileage
  - Week N (race week): 40-50% of peak mileage
- **Maintains sharpness**: Keeps workout frequency but reduces distance, includes short tempo/strides

### 📅 Race Date / Plan End Date
- **Set your race date**: API calculates optimal plan duration to end on race day
- **Automatic duration calculation**: Works backwards from race date to determine training weeks
- **Proper taper included**: Ensures adequate taper period before race day

### ⏱️ Workout Pacing Recommendations
- **Detailed pace zones**: Every workout includes specific pace ranges (e.g., "6:15-6:45 min/km")
- **Experience-adjusted paces**: Beginners get slower, more conservative paces
- **Effort-based guidance**: Includes perceived exertion descriptions ("conversational pace", "comfortably hard")
- **Structured workout details**: Tempo and interval workouts include warmup/cooldown structure

---

## 🚀 Getting Started

### Run the Server
To start the development server, use:

```bash
npm run dev
```

The API will be available at:
```
http://0.0.0.0:8000
```

---

## 🧩 API Endpoints

### 1. Generate Training Plan (First Week)

**Endpoint:**
```
POST http://0.0.0.0:8000/generate-plan
```

**Description:**
Generates the first week of training plan with intelligent workout sequencing, rest day logic, and pace recommendations.

**Sample Request Body:**
```json
{
  "gender": "male",
  "height": 73,
  "weight": 132,
  "plan_name": "Marathon",
  "measurement_unit": "km",
  "start_date": "2025-10-15T06:00:00.000Z",
  "race_date": "2026-04-15T09:00:00.000Z",
  "min_weeks_plan": 10,
  "max_week_plans": 16,
  "days_per_week": "6",
  "specific_days": "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
  "long_run_day": "Saturday",
  "estimated_race_time": "4:30:00-5:00:00",
  "weekly_mileage_past_4_weeks": "40-45",
  "goal_race_time": "04:15:00",
  "longest_run_past_4_weeks": "20 km",
  "course_profile": "Rolling Hills",
  "running_experience": "Intermediate"
}
```

**New Fields for 5K/10K Plans:**
- Automatic distance constraint enforcement (no input required)
- Progressive workout types based on experience level
- Walking/jogging progression for beginners and intermediates

**Workout Types by Plan:**
- **Marathon/Half Marathon**: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'
- **5K/10K Beginner/Intermediate**: 'Walk', 'Walk-Jog', 'Easy Jog', 'Easy Run', 'Recovery Run', 'Long Run', 'Rest'
- **5K/10K Advanced/Elite**: Standard workout types (same as Marathon/Half Marathon)

**Response includes:**
- Week 1 workouts with pace ranges
- Intelligent rest day placement
- No back-to-back hard efforts
- Plan duration calculated from race date (if provided)
- **NEW**: Automatic 5K/10K distance limits and progressive workout types

---

### 2. Get Remaining Plan (Complete Plan)

**Endpoint:**
```
POST http://0.0.0.0:8000/get-remaining-plan
```

**Description:**
Retrieves the complete training plan with all remaining weeks, including tapering logic and full pace recommendations.

**Sample Request Body:**
```json
{
  "plan_id": "4d12bdda51ed40eb8917"
}
```

**Response includes:**
- All weeks with progressive training
- Automatic taper in final 1-3 weeks
- Pace recommendations for every workout
- Intelligent workout sequencing throughout
- Rest days based on experience level

---

### 3. Calculate Pace Zones (NEW)

**Endpoint:**
```
POST http://0.0.0.0:8000/calculate-pace-zones
```

**Description:**
Calculate recommended pace zones based on goal race time and experience level.

**Sample Request Body:**
```json
{
  "goal_race_time": "04:15:00",
  "race_distance": 42.2,
  "experience": "Intermediate",
  "measurement_unit": "km"
}
```

**Sample Response:**
```json
{
  "success": true,
  "pace_zones": {
    "goal_pace": "6:03 min/km",
    "easy": "7:03-7:18 min/km",
    "long": "6:53-7:08 min/km",
    "tempo": "6:23-6:28 min/km",
    "threshold": "6:13-6:23 min/km",
    "intervals": "5:43-5:48 min/km",
    "recovery": "7:33-8:03 min/km"
  },
  "notes": {
    "easy": "Conversational pace, should be able to talk in full sentences",
    "long": "Comfortable, sustainable pace for long distances",
    "tempo": "Comfortably hard, sustainable for 45-75 minutes",
    "threshold": "Hard but controlled, race pace effort",
    "intervals": "Hard effort with recovery periods between",
    "recovery": "Very easy, active recovery pace"
  }
}
```

---

### 4. Calculate Plan Duration (NEW)

**Endpoint:**
```
POST http://0.0.0.0:8000/calculate-plan-duration
```

**Description:**
Calculate optimal plan duration based on start date and race date.

**Sample Request Body:**
```json
{
  "start_date": "2025-10-15T06:00:00.000Z",
  "race_date": "2026-04-15T09:00:00.000Z",
  "min_weeks": 10,
  "max_weeks": 20
}
```

**Sample Response:**
```json
{
  "success": true,
  "start_date": "2025-10-15T06:00:00.000Z",
  "race_date": "2026-04-15T09:00:00.000Z",
  "calculated_duration_weeks": 16,
  "total_days": 182,
  "min_weeks_allowed": 10,
  "max_weeks_allowed": 20,
  "notes": "Duration is within recommended range."
}
```

---

### 5. Validate Rest Days (NEW)

**Endpoint:**
```
POST http://0.0.0.0:8000/validate-rest-days
```

**Description:**
Validate rest day requirements based on experience level and training days.

**Sample Request Body:**
```json
{
  "experience": "Beginner",
  "training_days": 7
}
```

**Sample Response:**
```json
{
  "success": true,
  "experience": "Beginner",
  "training_days": 7,
  "rest_day_requirements": {
    "required_rest_days": 1,
    "recommended_rest_days": 1,
    "allow_all_seven_days": false,
    "warning": "Beginners should include at least 1 rest day per week to prevent injury and allow recovery."
  },
  "recommendation": "Beginners should include at least 1 rest day per week to prevent injury and allow recovery."
}
```

---

### 6. Health Check

**Endpoint:**
```
GET http://0.0.0.0:8000/health
```

**Description:**
Check API health status.

---

### 7. Plan Status

**Endpoint:**
```
GET http://0.0.0.0:8000/plan-status/:plan_id
```

**Description:**
Check if a plan ID exists and get basic information.

---

### 8. Test Recovery Runs (NEW)

**Endpoint:**
```
POST http://0.0.0.0:8000/test-recovery-runs
```

**Description:**
Test endpoint to demonstrate the recovery run functionality. Shows how recovery runs are automatically added after long runs.

**Sample Request Body:**
```json
{
  "plan_data": {
    "weekly_plans": [
      {
        "week_number": 1,
        "workouts": [
          {
            "day": "Saturday",
            "workout_type": "Long Run",
            "distance": 10,
            "duration": 70,
            "intensity": "Long Easy"
          }
        ]
      }
    ]
  },
  "specific_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  "measurement_unit": "km"
}
```

**Sample Response:**
```json
{
  "success": true,
  "message": "Recovery runs added successfully",
  "original_plan": { ... },
  "updated_plan": { ... },
  "changes_made": {
    "recovery_runs_added": true,
    "specific_days": ["Monday", "Tuesday", ...],
    "measurement_unit": "km"
  }
}
```

---

## 📊 Key Features

### 5K/10K Plan Constraints (NEW)
- ✅ Absolute maximum distance limits (5K: 5.0km max, 10K: 10.0km max)
- ✅ Minimum distance enforcement (0.5km/0.3mi minimum)
- ✅ Walking → Jogging → Running progression for beginners
- ✅ Progressive workout types: Walk, Walk-Jog, Easy Jog, Easy Run
- ✅ Experience-based progression timing

### Workout Sequencing Rules
- ✅ Easy/Recovery runs between hard efforts
- ✅ Minimum 1 day recovery after intervals
- ✅ Minimum 1 day recovery after long run
- ✅ No tempo/intervals day before long run
- ✅ Hard workouts spaced 2-3 days apart

### Rest Day Intelligence
- ✅ Experience-based requirements
- ✅ Automatic rest day calculation (7 days - training days)
- ✅ Smart placement after hard workouts
- ✅ Never on long run day

### Tapering Strategy
- ✅ 1-3 week taper before race
- ✅ Progressive volume reduction
- ✅ Maintains workout frequency
- ✅ Includes sharpness work (strides/short tempo)

### Pace Recommendations
- ✅ Specific pace ranges for every workout
- ✅ Experience-adjusted paces
- ✅ Effort-based descriptions
- ✅ Structured workout details (warmup/cooldown)

---

## 🔧 Technical Details

**Dependencies:**
- Express.js - API framework
- OpenAI - AI-powered plan generation
- CORS - Cross-origin support
- dotenv - Environment configuration
- uuid - Unique plan IDs

**Storage:**
- In-memory plan storage with 24-hour TTL
- Automatic cleanup of expired plans

**AI Models:**
- gpt-5-nano - Fast first week generation
- gpt-5-mini - Complete plan generation with detailed analysis
