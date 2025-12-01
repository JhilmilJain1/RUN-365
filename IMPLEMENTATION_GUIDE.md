# Implementation Guide - Training Plan API Fixes

## Quick Summary

Fixed two critical issues in the training plan generation:

1. **Rest Day Logic:** Beginners selecting 7 days now correctly get 6 training days + 1 rest day (not 2 rest days)
2. **Duration Logic:** Documented why beginners should get max_week_plans duration (not min_weeks_plan)

## Changes Made

### 1. Updated `server.js` - REMAINING_WEEKS_PROMPT

**Location:** Line ~665-675

**Change:** Updated rest day requirements for all experience levels

**Before:**
```
- Beginner: MUST have at least 2 rest days per week (max 5 training days)
  • If user selects 6+ days, OVERRIDE to 5 training days + 2 rest days
  • If user selects 7 days, OVERRIDE to 5 training days + 2 rest days
```

**After:**
```
- Beginner: MUST have at least 1 rest day per week (max 6 training days)
  • If user selects 7 days, OVERRIDE to 6 training days + 1 rest day
  • If user selects 6 days, provide 1 rest day (the 7th day not selected)
  • If user selects 5 days, provide 2 rest days (the other 2 days not selected)
```

### 2. Updated `calculateRestDayRequirements()` Function

**Location:** Line ~1170-1210

**Change:** Updated logic to match the corrected prompt

**Key Changes:**
- Beginner with 7 days → Force to 6 training days + 1 rest day
- Beginner with 5 days → Explicitly set 2 rest days
- Intermediate with 7 days → Force to 6 training days + 1 rest day
- Advanced/Elite → Allow 7 training days (no override)

## How to Test

### Test 1: Beginner with 7 Days

**Request:**
```bash
curl -X POST http://localhost:8000/api/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "height": 80,
    "weight": 90,
    "plan_name": "Half Marathon",
    "measurement_unit": "km",
    "start_date": "2025-11-28T06:00:00.000Z",
    "min_weeks_plan": 6,
    "max_week_plans": 16,
    "days_per_week": "7",
    "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
    "long_run_day": "Thursday",
    "running_experience": "Beginner"
  }'
```

**Expected Result:**
- Duration: 16 weeks (not 6)
- Each week should have:
  - 6 training days with distance > 0
  - 1 rest day with distance = 0
  - Rest day should NOT be Thursday (long_run_day)

### Test 2: Beginner with 6 Days

**Request:**
```bash
curl -X POST http://localhost:8000/api/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "height": 80,
    "weight": 90,
    "plan_name": "Half Marathon",
    "measurement_unit": "km",
    "start_date": "2025-11-28T06:00:00.000Z",
    "min_weeks_plan": 6,
    "max_week_plans": 16,
    "days_per_week": "6",
    "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday",
    "long_run_day": "Thursday",
    "running_experience": "Beginner"
  }'
```

**Expected Result:**
- Duration: 16 weeks
- Each week should have:
  - 6 training days (Mon-Sat) with distance > 0
  - 1 rest day (Sunday) - the day NOT in specific_days

### Test 3: Advanced with 7 Days

**Request:**
```bash
curl -X POST http://localhost:8000/api/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "height": 80,
    "weight": 90,
    "plan_name": "Half Marathon",
    "measurement_unit": "km",
    "start_date": "2025-11-28T06:00:00.000Z",
    "min_weeks_plan": 6,
    "max_week_plans": 16,
    "days_per_week": "7",
    "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
    "long_run_day": "Thursday",
    "running_experience": "Advanced"
  }'
```

**Expected Result:**
- Duration: 7 weeks (min + 1)
- Each week should have:
  - 7 training days with distance > 0
  - 0 rest days (Advanced can train all 7 days)

## Validation Checklist

After deploying, verify:

- [ ] Beginner + 7 days → 6 training + 1 rest
- [ ] Beginner + 6 days → 6 training + 1 rest (Sunday)
- [ ] Beginner + 5 days → 5 training + 2 rest (Sat, Sun)
- [ ] Intermediate + 7 days → 6 training + 1 rest
- [ ] Advanced + 7 days → 7 training + 0 rest
- [ ] Elite + 7 days → 7 training + 0 rest
- [ ] Beginner duration = max_week_plans
- [ ] Intermediate duration = midpoint
- [ ] Advanced duration = min + 1
- [ ] Elite duration = min
- [ ] Rest day never on long_run_day
- [ ] No back-to-back hard efforts

## Known Limitations

### Duration Issue
The prompt logic for duration is **correct**, but the AI may not always follow it. If you continue to see incorrect durations:

1. **Add validation:** Check duration after AI generation
2. **Regenerate if wrong:** Retry with explicit duration instruction
3. **Manual fix:** Apply correct duration as fallback

See `DURATION_LOGIC.md` for detailed implementation guide.

## Files Created

1. `FIXES_SUMMARY.md` - Detailed explanation of issues and fixes
2. `REST_DAY_LOGIC.md` - Complete rest day logic documentation
3. `DURATION_LOGIC.md` - Duration calculation explanation and fixes
4. `IMPLEMENTATION_GUIDE.md` - This file

## Next Steps

1. **Deploy the changes** to your server
2. **Test with the provided test cases** above
3. **Monitor AI responses** for duration accuracy
4. **Implement validation** if duration issues persist (see DURATION_LOGIC.md)

## Support

If you encounter issues:

1. Check the validation warnings in the API response
2. Review the `FIXES_SUMMARY.md` for detailed explanations
3. Verify the prompt is being used correctly by the AI
4. Add logging to track duration calculations

## Example Response Structure

After the fix, a beginner with 7 days selected should receive:

```json
{
  "success": true,
  "recommended_plan": {
    "duration": 16,
    "weekly_plans": [
      {
        "week_number": 1,
        "workouts": [
          {"day": "Monday", "distance": 5, "workout_type": "Easy Run"},
          {"day": "Tuesday", "distance": 4, "workout_type": "Easy Run"},
          {"day": "Wednesday", "distance": 3, "workout_type": "Easy Run"},
          {"day": "Thursday", "distance": 10, "workout_type": "Long Run"},
          {"day": "Friday", "distance": 0, "workout_type": "Rest"},
          {"day": "Saturday", "distance": 3, "workout_type": "Easy Run"}
        ]
      }
    ]
  }
}
```

Note:
- Only 6 training days (not 7)
- 1 rest day (Friday in this example)
- Rest day is NOT on Thursday (long_run_day)
- Duration is 16 weeks (max_week_plans)
