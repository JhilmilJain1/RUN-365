# Sample Request Files

This directory contains sample request JSON files for testing the Training Plan API.

## 📋 Available Samples

### 1. Beginner Marathon (`beginner-marathon.json`)
**Profile:**
- Female, 165cm, 60kg
- 5 training days per week
- Recent mileage: 25-30 km/week
- Goal time: 5:15:00
- Flat course
- 17-week plan (Jan 6 → May 4)

**Features Demonstrated:**
- ✅ Beginner-appropriate pacing
- ✅ 5 training days + 2 rest days
- ✅ Conservative progression
- ✅ Race date support

**Usage:**
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/beginner-marathon.json
```

---

### 2. Intermediate Marathon (`intermediate-marathon.json`)
**Profile:**
- Male, 175cm, 70kg
- 6 training days per week
- Recent mileage: 45-50 km/week
- Goal time: 4:15:00
- Rolling hills course
- 15-week plan (Jan 6 → Apr 20)

**Features Demonstrated:**
- ✅ Moderate pacing
- ✅ 6 training days + 1 rest day
- ✅ Balanced progression
- ✅ Course profile adjustments
- ✅ Race date support

**Usage:**
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/intermediate-marathon.json
```

---

### 3. Advanced Half Marathon (`advanced-half-marathon.json`)
**Profile:**
- Male, 180cm, 75kg
- 6 training days per week
- Recent mileage: 55-60 km/week
- Goal time: 1:40:00
- Hilly course
- 11-week plan (Jan 13 → Mar 30)

**Features Demonstrated:**
- ✅ Fast pacing
- ✅ 6 training days + 1 rest day
- ✅ Aggressive progression
- ✅ Hilly course adjustments
- ✅ Half marathon distance

**Usage:**
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/advanced-half-marathon.json
```

---

### 4. Elite Marathon (`elite-marathon.json`)
**Profile:**
- Male, 178cm, 68kg
- 7 training days per week
- Recent mileage: 110-120 km/week
- Goal time: 2:50:00
- Flat course
- 12-week plan (Feb 3 → Apr 27)

**Features Demonstrated:**
- ✅ Elite-level pacing
- ✅ 7 training days (no rest days)
- ✅ High volume progression
- ✅ Competitive goal time
- ✅ Maximum training load

**Usage:**
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/elite-marathon.json
```

---

## 🧪 Testing Workflow

### Step 1: Start Server
```bash
npm run dev
```

### Step 2: Test Each Sample
```bash
# Beginner
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/beginner-marathon.json > output-beginner.json

# Intermediate
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/intermediate-marathon.json > output-intermediate.json

# Advanced
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/advanced-half-marathon.json > output-advanced.json

# Elite
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/elite-marathon.json > output-elite.json
```

### Step 3: Verify Responses
Check each output file for:
- ✅ `plan_id` present
- ✅ `duration` calculated from race_date
- ✅ Week 1 workouts included
- ✅ Each workout has `pace_range`
- ✅ Each workout has `description`
- ✅ No back-to-back hard workouts
- ✅ Rest days appropriate for experience level

---

## 🔍 What to Look For

### Beginner Plan Should Have:
- Slower paces (e.g., 7:30-8:00 min/km for easy runs)
- More rest days (2 per week)
- Conservative weekly increases (4-6%)
- Predominantly easy running
- Longer plan duration (17+ weeks)

### Intermediate Plan Should Have:
- Moderate paces (e.g., 6:30-7:00 min/km for easy runs)
- 1 rest day per week
- Moderate weekly increases (7-10%)
- Mix of easy and quality work
- Medium plan duration (14-16 weeks)

### Advanced Plan Should Have:
- Faster paces (e.g., 5:30-6:00 min/km for easy runs)
- 1 rest day per week (optional)
- Aggressive weekly increases (8-10%)
- Regular quality sessions
- Shorter plan duration (10-12 weeks)

### Elite Plan Should Have:
- Very fast paces (e.g., 4:30-5:00 min/km for easy runs)
- No rest days (or active recovery only)
- High volume (100+ km/week)
- Frequent quality work
- Shortest plan duration (10-12 weeks)

---

## 📊 Comparison Table

| Feature              | Beginner | Intermediate | Advanced | Elite |
|---------------------|----------|--------------|----------|-------|
| Training Days       | 5        | 6            | 6        | 7     |
| Rest Days           | 2        | 1            | 1        | 0     |
| Weekly Mileage      | 25-30 km | 45-50 km     | 55-60 km | 110-120 km |
| Goal Time (Marathon)| 5:15:00  | 4:15:00      | -        | 2:50:00 |
| Plan Duration       | 17 weeks | 15 weeks     | 11 weeks | 12 weeks |
| Easy Pace (approx)  | 7:30-8:00| 6:30-7:00    | 5:30-6:00| 4:30-5:00 |
| Quality Work        | Minimal  | Moderate     | Regular  | Frequent |

---

## 💡 Tips

### Modifying Samples
To create your own test case:
1. Copy one of the sample files
2. Modify the parameters
3. Ensure `race_date` is in the future
4. Adjust `weekly_mileage_past_4_weeks` to be realistic
5. Set `goal_race_time` appropriate for experience level

### Common Modifications
```json
{
  "measurement_unit": "miles",  // Change to miles
  "course_profile": "Hilly",    // Change terrain
  "days_per_week": "5",         // Reduce training days
  "race_date": "2025-06-01T09:00:00.000Z"  // Different race date
}
```

### Validation
Before testing, validate your JSON:
```bash
# Check JSON syntax
cat sample-requests/your-file.json | python -m json.tool

# Or use jq
cat sample-requests/your-file.json | jq .
```

---

## 🚀 Quick Test All Samples

Run this script to test all samples at once:

```bash
#!/bin/bash
# test-all-samples.sh

echo "Testing all sample requests..."

for file in sample-requests/*.json; do
  if [ "$file" != "sample-requests/README.md" ]; then
    echo "Testing: $file"
    curl -X POST http://localhost:8000/generate-plan \
      -H "Content-Type: application/json" \
      -d @"$file" \
      -o "output-$(basename $file)" \
      -w "\nStatus: %{http_code}\n\n"
  fi
done

echo "All tests complete! Check output-*.json files."
```

Make executable and run:
```bash
chmod +x test-all-samples.sh
./test-all-samples.sh
```

---

**Last Updated:** December 2025
