# Race Day Workout Type Fix

## Issue

The race day workout was showing as:
```json
{
  "workout_type": "Long Run",
  "intensity": "Long Easy",
  "description": "Race day: Half marathon (21.1 km)..."
}
```

But it should be:
```json
{
  "workout_type": "Race",
  "intensity": "Goal-pace",
  "description": "Race day: Half Marathon (21.1 km). Follow your nutrition and pacing plan. Good luck!"
}
```

## Root Cause

The AI was not following the prompt instruction:
> "Label final week long run as workout_type: 'Race' and intensity: 'Goal-pace'"

## Solution

Added post-processing fix in `generateRemainingWeeks()` function to automatically correct the race day workout:

```javascript
// Fix race day workout type (final week long run should be labeled as "Race")
if (weeklyPlans.length > 0) {
  const finalWeek = weeklyPlans[weeklyPlans.length - 1];
  const longRunDay = originalInput.long_run_day || 'Sunday';
  
  for (let workout of finalWeek.workouts) {
    // Find the long run on long_run_day in the final week
    if (workout.day === longRunDay && 
        (workout.workout_type === 'Long Run' || workout.distance >= 20)) {
      console.log(`Fixing race day: Changing workout_type from "${workout.workout_type}" to "Race"`);
      workout.workout_type = 'Race';
      workout.intensity = 'Goal-pace';
      
      // Update description to make it clear this is race day
      if (!workout.description || !workout.description.toLowerCase().includes('race')) {
        const planTypeName = planType === 'half marathon' ? 'Half Marathon' : 
                            planType === 'marathon' ? 'Marathon' : 
                            planType === '5k' ? '5K' : 
                            planType === '10k' ? '10K' : 'Race';
        workout.description = `Race day: ${planTypeName} (${workout.distance} ${unit}). Follow your nutrition and pacing plan. Good luck!`;
      }
    }
  }
}
```

## How It Works

1. **Identifies final week** - Gets the last week in the plan
2. **Finds race day** - Looks for the workout on `long_run_day` in the final week
3. **Checks if it's the race** - Verifies it's a Long Run or has race distance (≥20 km/mi)
4. **Corrects the workout** - Changes `workout_type` to "Race" and `intensity` to "Goal-pace"
5. **Updates description** - Ensures the description clearly indicates it's race day

## Expected Output

### Before Fix
```json
{
  "day": "Thursday",
  "date": "2026-03-18",
  "workout_type": "Long Run",
  "intensity": "Long Easy",
  "distance": 21.1,
  "description": "Race day: Half marathon (21.1 km)..."
}
```

### After Fix
```json
{
  "day": "Thursday",
  "date": "2026-03-18",
  "workout_type": "Race",
  "intensity": "Goal-pace",
  "distance": 21.1,
  "description": "Race day: Half Marathon (21.1 km). Follow your nutrition and pacing plan. Good luck!"
}
```

## Console Output

When the fix is applied, you'll see:
```
Fixing race day: Changing workout_type from "Long Run" to "Race"
```

## Benefits

1. **Clear distinction** - Race day is clearly labeled as "Race" not "Long Run"
2. **Correct intensity** - Shows "Goal-pace" instead of "Long Easy"
3. **Better UX** - Users can easily identify their race day in the plan
4. **Automatic** - No manual intervention needed, works for all plan types

## Testing

Test with any plan type:
- Marathon
- Half Marathon
- 5K
- 10K

The final week's long run on `long_run_day` will automatically be labeled as "Race".

## Code Location

File: `365-run-api/server.js`  
Function: `generateRemainingWeeks()`  
Line: ~2070-2095
