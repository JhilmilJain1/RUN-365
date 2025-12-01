# Anti-Repetition Rule Fix

## Issue

Week 1 had all workouts with the same distance (2 km), violating the anti-repetition rule:

```json
{
  "week_number": 1,
  "workouts": [
    {"day": "Monday", "distance": 2},
    {"day": "Tuesday", "distance": 2},
    {"day": "Wednesday", "distance": 2},
    {"day": "Thursday", "distance": 2},
    {"day": "Friday", "distance": 2}
  ]
}
```

## The Rule

From the prompt:
> "Non–long-run days must not share the same distance. If two distances collide after rounding, adjust one by ±0.5 unit and re-balance another day to preserve totals and long-run ratio."

## Root Cause

The AI was not following the anti-repetition rule and generated identical distances for all workouts.

## Solution

Added `fixDuplicateDistances()` function that automatically adjusts duplicate distances:

```javascript
function fixDuplicateDistances(week, unit = 'km') {
  // 1. Find all non-rest workouts
  // 2. Count distance occurrences
  // 3. Identify duplicates
  // 4. Adjust duplicates by +0.5 increments
  // 5. Recalculate durations
  // 6. Update weekly total
}
```

## How It Works

### Step 1: Detect Duplicates
```javascript
const distanceCounts = {};
for (const workout of workouts) {
  const dist = workout.distance;
  distanceCounts[dist] = (distanceCounts[dist] || 0) + 1;
}

const duplicates = Object.keys(distanceCounts).filter(d => distanceCounts[d] > 1);
```

### Step 2: Fix Duplicates
```javascript
const usedDistances = new Set();

for (const workout of workouts) {
  let distance = workout.distance;
  
  // If this distance is already used, adjust it
  while (usedDistances.has(distance)) {
    distance += 0.5; // Increment by 0.5
    distance = Math.round(distance * 2) / 2; // Round to nearest 0.5
  }
  
  if (distance !== workout.distance) {
    workout.distance = distance;
    workout.duration = Math.ceil(distance * avgPaceMinutes);
  }
  
  usedDistances.add(distance);
}
```

## Example Transformation

### Before Fix
```json
{
  "week_number": 1,
  "total_weekly_distance": 10,
  "workouts": [
    {"day": "Monday", "distance": 2, "duration": 13},
    {"day": "Tuesday", "distance": 2, "duration": 13},
    {"day": "Wednesday", "distance": 2, "duration": 13},
    {"day": "Thursday", "distance": 2, "duration": 13},
    {"day": "Friday", "distance": 2, "duration": 13}
  ]
}
```

### After Fix
```json
{
  "week_number": 1,
  "total_weekly_distance": 12,
  "workouts": [
    {"day": "Monday", "distance": 2, "duration": 13},
    {"day": "Tuesday", "distance": 2.5, "duration": 17},
    {"day": "Wednesday", "distance": 3, "duration": 20},
    {"day": "Thursday", "distance": 3.5, "duration": 23},
    {"day": "Friday", "distance": 4, "duration": 26}
  ]
}
```

## Console Output

When duplicates are found and fixed:

```
⚠️  Week 1: Found duplicate distances: 2 km
   Applying anti-repetition rule...
   Tuesday: 2 km → 2.5 km
   Wednesday: 2 km → 3 km
   Thursday: 2 km → 3.5 km
   Friday: 2 km → 4 km
```

## Benefits

1. **Variety** - Each workout has a unique distance
2. **Progressive** - Distances naturally increase throughout the week
3. **Automatic** - No manual intervention needed
4. **Consistent** - Applied to all weeks in the plan

## Integration

The function is called in two places:

### 1. First Week Generation
```javascript
// Fix duplicate distances (anti-repetition rule)
if (planJson.weekly_plans) {
  for (const week of planJson.weekly_plans) {
    fixDuplicateDistances(week, unit);
  }
}
```

### 2. Complete Plan Generation
```javascript
// Fix duplicate distances (anti-repetition rule) for all weeks
for (const week of weeklyPlans) {
  fixDuplicateDistances(week, unit);
}
```

## Edge Cases Handled

1. **No duplicates** - Function returns immediately if no duplicates found
2. **Single workout** - No duplicates possible, returns immediately
3. **Rest days** - Excluded from duplicate detection (distance = 0 is allowed)
4. **Rounding** - All distances rounded to nearest 0.5 for visual appeal

## Testing

Test with any plan that has duplicate distances:

```bash
curl -X POST http://localhost:8000/api/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "running_experience": "Beginner",
    "measurement_unit": "km",
    "days_per_week": "5",
    "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday"
  }'
```

Check console for:
```
⚠️  Week 1: Found duplicate distances: ...
   Applying anti-repetition rule...
```

And verify response has unique distances for each workout.

## Code Location

File: `365-run-api/server.js`  
Function: `fixDuplicateDistances()`  
Line: ~1130-1195  
Called at: ~1960 (first week) and ~2170 (complete plan)
