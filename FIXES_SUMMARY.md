# Training Plan API Fixes - December 1, 2025

## Issues Identified and Fixed

### Issue 1: Incorrect Rest Day Logic for Beginners Selecting 7 Days

**Problem:**
- User selected all 7 days for training
- System was providing 2 rest days per week instead of 1
- For beginners, when they select 7 days, the system should OVERRIDE to 6 training days + 1 rest day (not 2 rest days)

**Root Cause:**
The prompt had conflicting logic:
- It said "Beginner: MUST have at least 2 rest days per week (max 5 training days)"
- But the user selected 7 days, which should be overridden to 6 training days + 1 rest day

**Fix Applied:**
Updated both `REMAINING_WEEKS_PROMPT` and `calculateRestDayRequirements()` function:

```
EXPERIENCE-BASED REST DAY REQUIREMENTS (OVERRIDE USER SELECTION IF NEEDED):
- Beginner: MUST have at least 1 rest day per week (max 6 training days)
  • If user selects 7 days, OVERRIDE to 6 training days + 1 rest day
  • If user selects 6 days, provide 1 rest day (the 7th day not selected)
  • If user selects 5 days, provide 2 rest days (the other 2 days not selected)
- Intermediate: MUST have at least 1 rest day per week (max 6 training days)
  • If user selects 7 days, OVERRIDE to 6 training days + 1 rest day
- Advanced: Can train 6-7 days (1 rest day recommended but not mandatory)
  • If user selects 7 days, allow all 7 training days
- Elite: Can train all 7 days with no mandatory rest
  • If user selects 7 days, allow all 7 training days
```

**Expected Behavior After Fix:**
- Beginner selects 7 days → Gets 6 training days + 1 rest day
- Beginner selects 6 days → Gets 6 training days + 1 rest day
- Beginner selects 5 days → Gets 5 training days + 2 rest days

### Issue 2: Incorrect Plan Duration for Beginners

**Problem:**
- User requested: `min_weeks_plan: 6`, `max_week_plans: 16`
- User is a Beginner
- System generated only 6 weeks instead of 16 weeks

**Root Cause:**
The prompt logic states:
```
DURATION SELECTION (BMI-AWARE FOR SAFETY):
- Beginner (Healthy BMI): duration = max_week_plans
```

This means beginners should get `max_week_plans = 16` weeks, not `min_weeks_plan = 6` weeks.

**Why This Happens:**
The AI model may not be following the prompt instructions correctly, or there's a misunderstanding in how the duration is calculated.

**Expected Behavior:**
- Beginner with min=6, max=16 → Should get 16 weeks
- Intermediate with min=6, max=16 → Should get ~11 weeks (midpoint)
- Advanced with min=6, max=16 → Should get 7 weeks (min + 1)
- Elite with min=6, max=16 → Should get 6 weeks (min)

**Recommendation:**
The prompt logic is already correct. The issue is likely in how the AI interprets the instructions. Consider:
1. Adding more explicit examples in the prompt
2. Adding validation logic in the backend to enforce duration rules
3. Adding a post-processing step to verify duration matches experience level

## Testing Recommendations

### Test Case 1: Beginner with 7 Days Selected
```json
{
  "running_experience": "Beginner",
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

**Expected Result:**
- Duration: 16 weeks
- Training days per week: 6 days
- Rest days per week: 1 day
- Rest day should NOT be on long_run_day

### Test Case 2: Beginner with 6 Days Selected
```json
{
  "running_experience": "Beginner",
  "days_per_week": "6",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

**Expected Result:**
- Duration: 16 weeks
- Training days per week: 6 days
- Rest days per week: 1 day (Sunday, the day not selected)

### Test Case 3: Beginner with 5 Days Selected
```json
{
  "running_experience": "Beginner",
  "days_per_week": "5",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

**Expected Result:**
- Duration: 16 weeks
- Training days per week: 5 days
- Rest days per week: 2 days (Saturday and Sunday, the days not selected)

## Files Modified

1. `365-run-api/server.js`
   - Updated `REMAINING_WEEKS_PROMPT` - REST DAY REQUIREMENTS section
   - Updated `calculateRestDayRequirements()` function logic

## Additional Notes

The duration issue requires the AI model to strictly follow the prompt instructions. If the issue persists, consider:

1. **Add Backend Validation:**
```javascript
function validateDuration(experience, minWeeks, maxWeeks, bmi) {
  let duration;
  const bmiCategory = getBMICategory(bmi);
  
  switch (experience) {
    case 'Beginner':
      duration = maxWeeks;
      if (bmiCategory === 'Obesity') duration += 2;
      break;
    case 'Intermediate':
      duration = Math.round((minWeeks + maxWeeks) / 2);
      if (bmiCategory === 'Overweight') duration += 1;
      if (bmiCategory === 'Obesity') duration += 2;
      break;
    case 'Advanced':
      duration = Math.max(minWeeks + 1, minWeeks);
      if (bmiCategory === 'Obesity') duration += 2;
      break;
    case 'Elite':
      duration = minWeeks;
      break;
    default:
      duration = maxWeeks;
  }
  
  return Math.min(Math.max(duration, minWeeks), maxWeeks + 4);
}
```

2. **Add Post-Processing Check:**
After receiving the AI response, validate that the duration matches the expected value and regenerate if needed.

3. **Add Explicit Examples in Prompt:**
Include concrete examples showing the exact duration calculation for different scenarios.
