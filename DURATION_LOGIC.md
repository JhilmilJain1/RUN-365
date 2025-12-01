# Plan Duration Logic - Explanation and Fix

## The Issue

User reported that a Beginner with the following input:
```json
{
  "running_experience": "Beginner",
  "min_weeks_plan": 6,
  "max_week_plans": 16
}
```

Received only **6 weeks** of training plan instead of the expected **16 weeks**.

## Expected Behavior

According to the prompt logic, plan duration should be calculated as follows:

### Duration Formula by Experience Level

#### Beginner
```
duration = max_week_plans
```
- **Rationale:** Beginners need the LONGEST preparation time to safely build up to race distance
- **Example:** min=6, max=16 → duration = 16 weeks

#### Intermediate
```
duration = round((min_weeks_plan + max_week_plans) / 2)
```
- **Rationale:** Intermediate runners need moderate preparation time
- **Example:** min=6, max=16 → duration = round((6+16)/2) = 11 weeks

#### Advanced
```
duration = max(min_weeks_plan + 1, min_weeks_plan)
```
- **Rationale:** Advanced runners can prepare faster with shorter plans
- **Example:** min=6, max=16 → duration = max(7, 6) = 7 weeks

#### Elite
```
duration = min_weeks_plan
```
- **Rationale:** Elite runners need the SHORTEST preparation time due to high fitness base
- **Example:** min=6, max=16 → duration = 6 weeks

### BMI Adjustments (Additional Weeks)

For runners with higher BMI, add extra weeks for safer progression:

- **Beginner (Obesity):** duration = max_week_plans + 2
- **Intermediate (Overweight):** duration = midpoint + 1
- **Intermediate (Obesity):** duration = midpoint + 2
- **Advanced (Obesity):** duration = (min + 1) + 2

**Note:** Duration is clamped to [min_weeks_plan, max_week_plans + 4]

## Why the Issue Occurs

The prompt instructions are correct, but the AI model may:

1. **Misinterpret the formula** - Confusing min/max values
2. **Ignore the experience level** - Not applying the correct formula
3. **Apply wrong logic** - Using min instead of max for beginners

## The Fix

### Option 1: Add Explicit Validation (Recommended)

Add a post-processing validation function to enforce duration rules:

```javascript
function validateAndFixDuration(planJson, userInput) {
  const { running_experience, min_weeks_plan, max_week_plans, height, weight } = userInput;
  
  // Calculate BMI
  const bmi = calculateBMI(height, weight);
  const bmiCategory = getBMICategory(bmi);
  
  // Calculate expected duration
  let expectedDuration;
  
  switch (running_experience) {
    case 'Beginner':
      expectedDuration = max_week_plans;
      if (bmiCategory === 'Obesity') expectedDuration += 2;
      break;
    case 'Intermediate':
      expectedDuration = Math.round((min_weeks_plan + max_week_plans) / 2);
      if (bmiCategory === 'Overweight') expectedDuration += 1;
      if (bmiCategory === 'Obesity') expectedDuration += 2;
      break;
    case 'Advanced':
      expectedDuration = Math.max(min_weeks_plan + 1, min_weeks_plan);
      if (bmiCategory === 'Obesity') expectedDuration += 2;
      break;
    case 'Elite':
      expectedDuration = min_weeks_plan;
      break;
    default:
      expectedDuration = max_week_plans;
  }
  
  // Clamp to valid range
  expectedDuration = Math.min(Math.max(expectedDuration, min_weeks_plan), max_week_plans + 4);
  
  // Check if AI-generated duration matches expected
  const actualDuration = planJson.recommended_plan?.duration || planJson.duration;
  
  if (actualDuration !== expectedDuration) {
    console.warn(`Duration mismatch: Expected ${expectedDuration} weeks, got ${actualDuration} weeks`);
    console.warn(`Regenerating plan with correct duration...`);
    return false; // Trigger regeneration
  }
  
  return true; // Duration is correct
}
```

### Option 2: Add More Explicit Examples in Prompt

Add concrete examples to the prompt:

```
DURATION SELECTION EXAMPLES:

Example 1: Beginner, Healthy BMI
- Input: min_weeks_plan=6, max_week_plans=16, running_experience="Beginner", BMI=22
- Calculation: duration = max_week_plans = 16
- Output: 16 weeks

Example 2: Intermediate, Healthy BMI
- Input: min_weeks_plan=6, max_week_plans=16, running_experience="Intermediate", BMI=23
- Calculation: duration = round((6+16)/2) = 11
- Output: 11 weeks

Example 3: Advanced, Healthy BMI
- Input: min_weeks_plan=6, max_week_plans=16, running_experience="Advanced", BMI=24
- Calculation: duration = max(6+1, 6) = 7
- Output: 7 weeks

Example 4: Elite, Healthy BMI
- Input: min_weeks_plan=6, max_week_plans=16, running_experience="Elite", BMI=21
- Calculation: duration = min_weeks_plan = 6
- Output: 6 weeks

Example 5: Beginner, Obesity
- Input: min_weeks_plan=6, max_week_plans=16, running_experience="Beginner", BMI=32
- Calculation: duration = max_week_plans + 2 = 16 + 2 = 18
- Output: 18 weeks (clamped to max_week_plans + 4 = 20)
```

### Option 3: Use Structured Output (Best Solution)

Force the AI to use structured output with validation:

```javascript
const durationSchema = {
  type: "object",
  properties: {
    duration: {
      type: "integer",
      minimum: userInput.min_weeks_plan,
      maximum: userInput.max_week_plans + 4,
      description: "Plan duration in weeks, calculated based on experience level"
    }
  },
  required: ["duration"]
};

// Use OpenAI's structured output feature
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "training_plan",
      schema: durationSchema
    }
  }
});
```

## Testing Matrix

| Experience | Min | Max | BMI Category | Expected Duration | Notes |
|------------|-----|-----|--------------|-------------------|-------|
| Beginner | 6 | 16 | Healthy | 16 | max_week_plans |
| Beginner | 6 | 16 | Overweight | 16 | max_week_plans |
| Beginner | 6 | 16 | Obesity | 18 | max_week_plans + 2 |
| Intermediate | 6 | 16 | Healthy | 11 | round((6+16)/2) |
| Intermediate | 6 | 16 | Overweight | 12 | round((6+16)/2) + 1 |
| Intermediate | 6 | 16 | Obesity | 13 | round((6+16)/2) + 2 |
| Advanced | 6 | 16 | Healthy | 7 | max(6+1, 6) |
| Advanced | 6 | 16 | Obesity | 9 | max(6+1, 6) + 2 |
| Elite | 6 | 16 | Any | 6 | min_weeks_plan |

## Recommended Implementation

1. **Immediate Fix:** Add validation function to check duration after AI generation
2. **Short-term:** Add explicit examples to the prompt
3. **Long-term:** Implement structured output with schema validation

## Code Example: Complete Validation

```javascript
async function generateTrainingPlan(userInput) {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    // Generate plan with AI
    const planJson = await callOpenAI(userInput);
    
    // Validate duration
    const isValid = validateAndFixDuration(planJson, userInput);
    
    if (isValid) {
      return planJson; // Success
    }
    
    attempts++;
    console.log(`Attempt ${attempts}: Duration validation failed, regenerating...`);
  }
  
  // If all attempts fail, manually fix the duration
  console.warn('All attempts failed, applying manual duration fix');
  return applyManualDurationFix(planJson, userInput);
}

function applyManualDurationFix(planJson, userInput) {
  const correctDuration = calculateExpectedDuration(userInput);
  
  // Update plan duration
  if (planJson.recommended_plan) {
    planJson.recommended_plan.duration = correctDuration;
    planJson.total_weeks = correctDuration;
  }
  
  // Regenerate weeks if needed
  // ... (implementation depends on your needs)
  
  return planJson;
}
```

## Summary

The duration logic in the prompt is **correct**, but the AI may not always follow it. The best solution is to:

1. Add validation after AI generation
2. Regenerate if duration doesn't match expected value
3. Apply manual fix as fallback

This ensures users always get the correct plan duration based on their experience level and BMI.
