# Rest Day Logic - Corrected Implementation

## Overview
This document explains the corrected rest day logic for different experience levels.

## Core Principle
**Rest days are calculated as: 7 - (training days selected)**

The system does NOT add extra rest days beyond what's naturally implied by the user's selection, EXCEPT when safety overrides are needed for beginners and intermediates.

## Experience-Based Rules

### Beginner
- **Maximum training days:** 6 days per week
- **Minimum rest days:** 1 day per week
- **Override logic:**
  - If user selects 7 days → OVERRIDE to 6 training days + 1 rest day
  - If user selects 6 days → Keep 6 training days + 1 rest day (the 7th day)
  - If user selects 5 days → Keep 5 training days + 2 rest days (the other 2 days)
  - If user selects 4 or fewer → Keep as selected + remaining days as rest

### Intermediate
- **Maximum training days:** 6 days per week
- **Minimum rest days:** 1 day per week
- **Override logic:**
  - If user selects 7 days → OVERRIDE to 6 training days + 1 rest day
  - If user selects 6 days → Keep 6 training days + 1 rest day (the 7th day)
  - If user selects 5 or fewer → Keep as selected + remaining days as rest

### Advanced
- **Maximum training days:** 7 days per week (but 6 recommended)
- **Minimum rest days:** 0 days (but 1 recommended)
- **Override logic:**
  - If user selects 7 days → Allow all 7 training days (no override)
  - If user selects 6 or fewer → Keep as selected + remaining days as rest

### Elite
- **Maximum training days:** 7 days per week
- **Minimum rest days:** 0 days
- **Override logic:**
  - No overrides - allow whatever user selects
  - If user selects 7 days → Allow all 7 training days
  - If user selects fewer → Keep as selected + remaining days as rest

## Examples

### Example 1: Beginner Selects 7 Days
**Input:**
```json
{
  "running_experience": "Beginner",
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday"
}
```

**Output:**
- Training days: 6 (system removes 1 day for safety)
- Rest days: 1 (automatically added)
- Rest day placement: Strategic (not on long_run_day, preferably after hard efforts)

### Example 2: Beginner Selects 6 Days
**Input:**
```json
{
  "running_experience": "Beginner",
  "days_per_week": "6",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday"
}
```

**Output:**
- Training days: 6 (as selected)
- Rest days: 1 (Sunday - the day NOT in specific_days)
- No override needed

### Example 3: Beginner Selects 5 Days
**Input:**
```json
{
  "running_experience": "Beginner",
  "days_per_week": "5",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday"
}
```

**Output:**
- Training days: 5 (as selected)
- Rest days: 2 (Saturday and Sunday - the days NOT in specific_days)
- No override needed

### Example 4: Advanced Selects 7 Days
**Input:**
```json
{
  "running_experience": "Advanced",
  "days_per_week": "7",
  "specific_days": "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday"
}
```

**Output:**
- Training days: 7 (as selected - no override)
- Rest days: 0
- Advanced runners can handle this volume

## Rest Day Placement Rules

1. **NEVER on long_run_day** - The long run day must always have a workout
2. **After hard efforts** - Prefer placing rest days after:
   - Long runs
   - Interval sessions
   - Tempo runs
3. **Between hard efforts** - Ensure at least 1 easy day between any two hard workouts
4. **Strategic spacing** - Distribute rest days to maximize recovery

## Implementation in Code

### calculateRestDayRequirements() Function
```javascript
function calculateRestDayRequirements(experience, trainingDays) {
  const totalDaysInWeek = 7;
  const naturalRestDays = totalDaysInWeek - trainingDays;
  let minimumRestDays = 0;
  let recommendedRestDays = naturalRestDays;
  let actualTrainingDays = trainingDays;

  switch (experience) {
    case 'Beginner':
      minimumRestDays = 1;
      if (trainingDays === 7) {
        actualTrainingDays = 6;
        recommendedRestDays = 1;
      } else if (trainingDays === 6) {
        recommendedRestDays = 1;
      } else if (trainingDays === 5) {
        recommendedRestDays = 2;
      } else {
        recommendedRestDays = Math.max(naturalRestDays, 1);
      }
      break;
    case 'Intermediate':
      minimumRestDays = 1;
      if (trainingDays === 7) {
        actualTrainingDays = 6;
        recommendedRestDays = 1;
      } else {
        recommendedRestDays = Math.max(naturalRestDays, 1);
      }
      break;
    case 'Advanced':
      minimumRestDays = 0;
      recommendedRestDays = naturalRestDays;
      break;
    case 'Elite':
      minimumRestDays = 0;
      recommendedRestDays = naturalRestDays;
      break;
    default:
      minimumRestDays = 1;
      recommendedRestDays = Math.max(naturalRestDays, 1);
  }

  return {
    total_days_in_week: totalDaysInWeek,
    training_days_selected: trainingDays,
    actual_training_days: actualTrainingDays,
    natural_rest_days: naturalRestDays,
    minimum_rest_days: minimumRestDays,
    recommended_rest_days: recommendedRestDays,
    can_train_all_days: (experience === 'Advanced' || experience === 'Elite'),
    rest_day_enforced: (experience === 'Beginner' || experience === 'Intermediate') && trainingDays === 7
  };
}
```

## Common Mistakes to Avoid

1. **Don't add extra rest days** - If user selects 6 days, give them 1 rest day (not 2)
2. **Don't place rest on long_run_day** - This is a critical workout day
3. **Don't allow back-to-back hard efforts** - Always have easy days between hard sessions
4. **Don't override for Advanced/Elite** - They can handle 7 training days

## Validation Checklist

- [ ] Beginner with 7 days selected → Gets 6 training + 1 rest
- [ ] Beginner with 6 days selected → Gets 6 training + 1 rest
- [ ] Beginner with 5 days selected → Gets 5 training + 2 rest
- [ ] Intermediate with 7 days selected → Gets 6 training + 1 rest
- [ ] Advanced with 7 days selected → Gets 7 training + 0 rest
- [ ] Elite with 7 days selected → Gets 7 training + 0 rest
- [ ] Rest day never on long_run_day
- [ ] No back-to-back hard efforts
- [ ] Rest days placed strategically for recovery
