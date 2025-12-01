# Quick Reference Guide - Training Plan API v2.0

## 🚀 Quick Start

### Start the Server
```bash
npm run dev
```
Server runs on: `http://0.0.0.0:8000`

---

## 📋 New Features Cheat Sheet

### 1. ⚡ Workout Sequencing
**What it does:** Prevents back-to-back hard workouts

**Rules:**
- ✅ Easy/Recovery between hard efforts
- ✅ 1-2 days recovery after intervals
- ✅ No tempo/intervals before long run
- ✅ Hard workouts spaced 2-3 days apart

**Example Week:**
```
Mon: Easy Run
Tue: Tempo Run
Wed: Easy Run
Thu: Easy Run
Fri: Intervals
Sat: Long Run
Sun: Rest
```

---

### 2. 🛌 Rest Day Logic
**What it does:** Intelligently schedules rest days based on experience

**Key Points:**
- Rest days are SEPARATE from training days
- 6 training days = 6 days running + 1 rest day

**Experience Requirements:**
| Experience   | Required Rest | Recommended Rest | Can Train 7 Days? |
|--------------|---------------|------------------|-------------------|
| Beginner     | 1 day         | 1 day            | ❌ No             |
| Intermediate | 0 days        | 1 day            | ⚠️ Not ideal      |
| Advanced     | 0 days        | 0-1 days         | ✅ Yes            |
| Elite        | 0 days        | 0 days           | ✅ Yes            |

**Check Rest Requirements:**
```bash
curl -X POST http://localhost:8000/validate-rest-days \
  -H "Content-Type: application/json" \
  -d '{"experience": "Beginner", "training_days": 7}'
```

---

### 3. 📉 Tapering
**What it does:** Reduces volume before race day

**Taper Schedule:**
| Week          | Volume Reduction | Notes                    |
|---------------|------------------|--------------------------|
| N-2           | 75-85% of peak   | Start reducing volume    |
| N-1           | 60-70% of peak   | Maintain some intensity  |
| N (race week) | 40-50% of peak   | Fresh for race day       |

**Automatic:** No configuration needed, happens automatically in final weeks

---

### 4. 📅 Race Date Support
**What it does:** Calculates plan duration to end on your race date

**Usage:**
```json
{
  "start_date": "2025-01-01T06:00:00.000Z",
  "race_date": "2025-04-15T09:00:00.000Z",
  "min_weeks_plan": 12,
  "max_week_plans": 16
}
```

**Calculate Duration First:**
```bash
curl -X POST http://localhost:8000/calculate-plan-duration \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2025-01-01T06:00:00.000Z",
    "race_date": "2025-04-15T09:00:00.000Z",
    "min_weeks": 12,
    "max_weeks": 16
  }'
```

---

### 5. ⏱️ Pace Recommendations
**What it does:** Provides specific pace ranges for every workout

**Pace Zones:**
| Zone      | Relative to Goal Pace | Feel                    |
|-----------|-----------------------|-------------------------|
| Recovery  | +90 to +120 sec       | Very easy               |
| Easy      | +60 to +90 sec        | Conversational          |
| Long      | +45 to +75 sec        | Comfortable, sustainable|
| Tempo     | +20 to +30 sec        | Comfortably hard        |
| Threshold | +10 to +20 sec        | Hard but controlled     |
| Goal      | 0 sec                 | Race pace               |
| Intervals | -10 to -30 sec        | Hard bursts             |

**Calculate Your Paces:**
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

**Example Response:**
```json
{
  "pace_zones": {
    "goal_pace": "6:03 min/km",
    "easy": "7:03-7:18 min/km",
    "long": "6:53-7:08 min/km",
    "tempo": "6:23-6:28 min/km",
    "intervals": "5:43-5:48 min/km"
  }
}
```

---

## 🎯 Complete Example Request

### Generate Plan with All New Features
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "height": 175,
    "weight": 70,
    "plan_name": "Marathon",
    "measurement_unit": "km",
    "start_date": "2025-01-06T06:00:00.000Z",
    "race_date": "2025-04-20T09:00:00.000Z",
    "min_weeks_plan": 12,
    "max_week_plans": 16,
    "days_per_week": "6",
    "specific_days": "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
    "long_run_day": "Saturday",
    "estimated_race_time": "4:00:00-4:30:00",
    "weekly_mileage_past_4_weeks": "45-50",
    "goal_race_time": "04:15:00",
    "longest_run_past_4_weeks": "22 km",
    "course_profile": "Rolling Hills",
    "running_experience": "Intermediate"
  }'
```

**What You Get:**
- ✅ Week 1 with intelligent workout sequencing
- ✅ Rest day on Sunday (separate from 6 training days)
- ✅ Pace recommendations for every workout
- ✅ Plan duration calculated to end on race date
- ✅ No back-to-back hard workouts

---

## 🔍 Validation Checklist

Before generating a plan, validate:

### 1. Check Pace Zones
```bash
POST /calculate-pace-zones
```
Ensures your goal time is realistic

### 2. Check Plan Duration
```bash
POST /calculate-plan-duration
```
Ensures enough time to train properly

### 3. Check Rest Requirements
```bash
POST /validate-rest-days
```
Ensures appropriate recovery for your level

---

## 📊 Response Format Changes

### Workout Object (Enhanced)
```json
{
  "day": "Tuesday",
  "date": "2025-01-07",
  "workout_type": "Tempo Run",
  "distance": 10,
  "duration": 65,
  "intensity": "Tempo",
  "pace_range": "5:30-5:45 min/km",          // ← NEW
  "description": "Tempo: 2km warmup...",      // ← NEW
  "user_distance": 0,
  "user_time": 0
}
```

### Rest Day Object
```json
{
  "day": "Sunday",
  "date": "2025-01-12",
  "workout_type": "Rest",
  "distance": 0,
  "duration": 0,
  "intensity": "Rest",
  "user_distance": 0,
  "user_time": 0
}
```

---

## 🧪 Testing

### Run Test Suite
```bash
node test-new-features.js
```

### Manual Tests

**1. Health Check:**
```bash
curl http://localhost:8000/health
```

**2. Generate Simple Plan:**
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-request.json
```

**3. Get Complete Plan:**
```bash
curl -X POST http://localhost:8000/get-remaining-plan \
  -H "Content-Type: application/json" \
  -d '{"plan_id": "YOUR_PLAN_ID"}'
```

---

## ⚠️ Common Issues

### Issue: "Beginners should include rest day"
**Solution:** Reduce training days to 6 or less for beginners
```json
{
  "days_per_week": "6",
  "specific_days": "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"
}
```

### Issue: "Duration outside range"
**Solution:** Adjust start date or race date
```bash
# Check duration first
POST /calculate-plan-duration
```

### Issue: "Invalid pace calculation"
**Solution:** Ensure goal_race_time is realistic
```bash
# Validate paces first
POST /calculate-pace-zones
```

---

## 📈 Best Practices

### 1. Always Provide Race Date
```json
{
  "race_date": "2025-04-20T09:00:00.000Z"
}
```
Ensures proper taper and plan duration

### 2. Use Realistic Goal Times
- Beginner Marathon: 4:30:00 - 6:00:00
- Intermediate Marathon: 3:45:00 - 4:30:00
- Advanced Marathon: 3:15:00 - 3:45:00
- Elite Marathon: < 3:15:00

### 3. Select Appropriate Training Days
- Beginner: 4-6 days
- Intermediate: 5-6 days
- Advanced: 6-7 days
- Elite: 6-7 days

### 4. Validate Before Generating
```bash
# 1. Check paces
POST /calculate-pace-zones

# 2. Check duration
POST /calculate-plan-duration

# 3. Check rest requirements
POST /validate-rest-days

# 4. Generate plan
POST /generate-plan
```

---

## 🔗 Quick Links

- **Full Documentation:** [README.md](README.md)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Test Suite:** [test-new-features.js](test-new-features.js)
- **API Base URL:** `http://localhost:8000`

---

## 💡 Pro Tips

1. **Use race_date** for automatic duration calculation
2. **Validate rest days** before generating plan
3. **Calculate pace zones** to ensure realistic goals
4. **Check workout sequencing** in Week 1 response
5. **Review taper weeks** in complete plan (final 1-3 weeks)

---

**Version:** 2.0.0  
**Last Updated:** December 2025
