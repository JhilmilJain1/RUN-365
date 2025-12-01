# Payload Issue Explanation

## Your Current Payload

```json
{
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Thursday, Wednesday, Friday"
}
```

## The Problem

You have a **mismatch** between `days_per_week` and `specific_days`:

- `days_per_week: "7"` - Says you want to train 7 days per week
- `specific_days: "Monday, Tuesday, Thursday, Wednesday, Friday"` - Only lists 5 days

This causes confusion in the system.

## What's Happening

1. The system counts `specific_days` and finds 5 days
2. But `days_per_week` says 7
3. The system uses the actual count from `specific_days` (5 days)
4. For a Beginner with 5 days selected → Gets 5 training + 2 rest days

## The Fix

You have two options:

### Option 1: Train 7 Days (All Days)

If you want to train all 7 days, include all days in `specific_days`:

```json
{
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday"
}
```

**Result for Beginner:**
- System will override to 6 training days + 1 rest day (safety)
- Rest day will be automatically placed (not on Thursday/long_run_day)

### Option 2: Train 5 Days (Your Current Selection)

If you want to train only 5 days, update `days_per_week` to match:

```json
{
  "days_per_week": "5",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday"
}
```

**Result for Beginner:**
- 5 training days (Mon-Fri)
- 2 rest days (Saturday and Sunday)
- No override needed

## Recommendation

For a **Beginner**, I recommend:

```json
{
  "days_per_week": "6",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday"
}
```

**Why?**
- 6 training days is optimal for beginners
- 1 rest day (Sunday) for recovery
- Matches the system's safety guidelines
- No override needed

## How the System Works

The system follows this logic:

1. **Count specific_days** - This is the actual number of training days
2. **Ignore days_per_week** - It's informational only
3. **Apply experience-based rules:**
   - Beginner: Max 6 training days (override if 7 selected)
   - Intermediate: Max 6 training days (override if 7 selected)
   - Advanced: Can train all 7 days
   - Elite: Can train all 7 days

## Your Corrected Payload

Based on your original intent (7 days), here's the corrected payload:

```json
{
  "gender": "male",
  "height": 80,
  "weight": 90,
  "plan_name": "Half Marathon",
  "measurement_unit": "km",
  "start_date": "2025-12-01T06:00:00.000Z",
  "min_weeks_plan": 6,
  "max_week_plans": 16,
  "first_week_only": false,
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
  "long_run_day": "Thursday",
  "estimated_race_time": "2:00:00-3:00:00",
  "weekly_mileage_past_4_weeks": "20",
  "longest_run_past_4_weeks": "8 km",
  "course_profile": "Flat",
  "running_experience": "Beginner"
}
```

**Changes made:**
1. ✅ Added Saturday and Sunday to `specific_days`
2. ✅ Changed `longest_run_past_4_weeks` from "0 KM" to "8 km" (beginners need a base)
3. ✅ Removed unnecessary fields

**Expected Result:**
- Duration: 16 weeks
- Training days: 6 per week (system override from 7)
- Rest days: 1 per week (automatically placed, not on Thursday)
- Race day: Labeled as "Race" (not "Long Run")

## Summary

Always ensure `specific_days` lists the actual days you want to train. The system will:
1. Count the days in `specific_days`
2. Apply safety overrides if needed (Beginner/Intermediate max 6 days)
3. Place rest days on the remaining days of the week
