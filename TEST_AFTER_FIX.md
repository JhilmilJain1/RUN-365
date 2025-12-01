# Testing Guide After Fixes

## What Was Fixed

1. **Rest Day Logic** - Beginners selecting 7 days now get 6 training + 1 rest (not 2 rest)
2. **Duration Validation** - System now automatically corrects duration if AI returns wrong value

## Test Case: Beginner with 7 Days

This is the exact scenario from your logs.

### Request

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
    "first_week_only": false,
    "days_per_week": "7",
    "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
    "long_run_day": "Thursday",
    "estimated_race_time": "2:00:00-3:00:00",
    "weekly_mileage_past_4_weeks": "0",
    "longest_run_past_4_weeks": "0 KM",
    "course_profile": "Flat",
    "previous_marathon_time_false": "First Half Marathon",
    "running_experience": "Beginner"
  }'
```

### Expected Results

#### 1. Duration Check
```
✓ Duration should be 16 weeks (not 6 or 8)
✓ Console should show: "Correcting duration to 16 weeks..."
```

#### 2. Rest Day Check
```
✓ Each week should have 6 training days (not 7)
✓ Each week should have 1 rest day (not 0 or 2)
✓ Rest day should NOT be on Thursday (long_run_day)
```

#### 3. Console Output to Look For

```
Rest day requirements: {
  total_days_in_week: 7,
  training_days_selected: 7,
  actual_training_days: 6,    ← Should be 6, not 7
  natural_rest_days: 0,
  minimum_rest_days: 1,
  recommended_rest_days: 1,    ← Should be 1, not 2
  can_train_all_days: false,
  rest_day_enforced: true
}

⚠️ Duration mismatch: AI returned 8 weeks, expected 16 weeks for Beginner
Correcting duration to 16 weeks...
```

#### 4. Response Structure

```json
{
  "success": true,
  "recommended_plan": {
    "duration": 16,              ← Must be 16, not 8
    "total_weeks": 16,           ← Must be 16
    "remaining_weeks": 15,       ← Must be 15
    "weekly_plans": [
      {
        "week_number": 1,
        "workouts": [
          // Should have 6 workouts with distance > 0
          // Should have 1 workout with workout_type: "Rest", distance: 0
          // Rest day should NOT be Thursday
        ]
      },
      // ... weeks 2-16
    ]
  }
}
```

## What to Check in Logs

### Before the Fix (OLD BEHAVIOR)
```
Rest day requirements: {
  actual_training_days: 5,     ← WRONG: Was forcing to 5
  recommended_rest_days: 2,    ← WRONG: Was giving 2 rest days
}

Successfully generated complete plan with 8 weeks  ← WRONG: Only 8 weeks
```

### After the Fix (NEW BEHAVIOR)
```
Rest day requirements: {
  actual_training_days: 6,     ← CORRECT: Now 6 training days
  recommended_rest_days: 1,    ← CORRECT: Now 1 rest day
}

⚠️ Duration mismatch: AI returned 8 weeks, expected 16 weeks for Beginner
Correcting duration to 16 weeks...

Successfully generated complete plan with 16 weeks  ← CORRECT: Now 16 weeks
```

## Validation Checklist

Run the test and verify:

- [ ] Console shows "actual_training_days: 6" (not 5 or 7)
- [ ] Console shows "recommended_rest_days: 1" (not 2)
- [ ] Console shows "Correcting duration to 16 weeks" (if AI returns wrong value)
- [ ] Response has "duration": 16 (not 8)
- [ ] Response has "total_weeks": 16
- [ ] Response has "remaining_weeks": 15
- [ ] Each week has 6 workouts with distance > 0
- [ ] Each week has 1 workout with workout_type: "Rest"
- [ ] Rest day is never on Thursday (long_run_day)
- [ ] Total of 16 weeks in weekly_plans array

## Additional Test Cases

### Test 2: Beginner with 6 Days
```json
{
  "running_experience": "Beginner",
  "days_per_week": "6",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

**Expected:**
- Duration: 16 weeks
- Training days: 6 (as selected)
- Rest days: 1 (Sunday - the day NOT selected)
- No override needed

### Test 3: Intermediate with 7 Days
```json
{
  "running_experience": "Intermediate",
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

**Expected:**
- Duration: 11 weeks (midpoint of 6 and 16)
- Training days: 6 (override from 7)
- Rest days: 1
- Console shows override message

### Test 4: Advanced with 7 Days
```json
{
  "running_experience": "Advanced",
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

**Expected:**
- Duration: 7 weeks (min + 1)
- Training days: 7 (no override - Advanced can train all 7 days)
- Rest days: 0
- No override message

## Troubleshooting

### If duration is still wrong:
1. Check console for "Correcting duration to X weeks" message
2. Verify calculateExpectedDuration() function is being called
3. Check if AI is returning duration in the response
4. Verify min_weeks_plan and max_week_plans are being passed correctly

### If rest days are still wrong:
1. Check console for "Rest day requirements" output
2. Verify actual_training_days matches expected value
3. Check if calculateRestDayRequirements() is being called
4. Verify the prompt is using the updated REST DAY LOGIC

## Success Criteria

The fix is successful if:

1. ✅ Beginner + 7 days → Gets 6 training + 1 rest
2. ✅ Beginner + min=6, max=16 → Gets 16 weeks duration
3. ✅ Console shows duration correction if AI returns wrong value
4. ✅ Rest day is never on long_run_day
5. ✅ All weeks have correct number of training/rest days

## Next Steps After Testing

1. If tests pass → Deploy to production
2. If tests fail → Check console logs and verify function calls
3. Monitor production logs for duration correction messages
4. Collect metrics on how often AI returns wrong duration
