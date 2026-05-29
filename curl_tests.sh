#!/bin/bash

# Curl Test Script for Intra-Week Duplicate Distance Fix
# Run this script to test the API endpoints with curl

BASE_URL="http://localhost:8000"

echo "🧪 Curl Tests for Intra-Week Duplicate Distance Fix"
echo "=================================================="

# Check server health
echo ""
echo "🔍 Checking server health..."
curl -s "$BASE_URL/health" | jq '.' || echo "❌ Server not responding or jq not installed"

# Test 1: Marathon - Beginner - 7 Days
echo ""
echo "🔬 Test 1: Marathon - Beginner - 7 Days"
echo "----------------------------------------"

PAYLOAD1='{
  "plan_name": "Marathon",
  "plan_type": "marathon",
  "measurement_unit": "km",
  "running_experience": "Beginner",
  "start_date": "2025-02-01T09:00:00Z",
  "specific_days": "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday",
  "long_run_day": "Sunday",
  "days_per_week": 7,
  "min_weeks_plan": 12,
  "max_week_plans": 16,
  "estimated_race_time": "4:30:00",
  "weekly_mileage_past_4_weeks": "30-40",
  "longest_run_past_4_weeks": "12",
  "course_profile": "Flat",
  "age": 30,
  "gender": "male",
  "height": "175",
  "weight": "70"
}'

echo "📤 Generating first week..."
RESPONSE1=$(curl -s -X POST "$BASE_URL/generate-plan" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD1")

PLAN_ID1=$(echo "$RESPONSE1" | jq -r '.plan_id // empty')

if [ -n "$PLAN_ID1" ]; then
  echo "✅ First week generated (Plan ID: $PLAN_ID1)"
  
  echo "📤 Generating complete plan..."
  COMPLETE_PLAN1=$(curl -s -X POST "$BASE_URL/get-remaining-plan" \
    -H "Content-Type: application/json" \
    -d "{\"plan_id\": \"$PLAN_ID1\"}")
  
  echo "✅ Complete plan generated"
  echo "📊 Plan summary:"
  echo "$COMPLETE_PLAN1" | jq '.recommended_plan | {plan_type, duration: .weekly_plans | length}'
  
  echo "🔍 Checking for duplicate distances in Week 1..."
  echo "$RESPONSE1" | jq '.weekly_plans[0].workouts[] | select(.workout_type != "Rest") | {day, workout_type, distance}' | jq -s 'group_by(.distance) | map(select(length > 1)) | if length > 0 then "❌ Duplicates found" else "✅ No duplicates" end'
  
else
  echo "❌ First week generation failed"
  echo "$RESPONSE1" | jq '.'
fi

# Test 2: 5K - Advanced - 6 Days (Distance Limits Test)
echo ""
echo "🔬 Test 2: 5K - Advanced - 6 Days (Distance Limits)"
echo "---------------------------------------------------"

PAYLOAD2='{
  "plan_name": "5k",
  "plan_type": "5k",
  "measurement_unit": "km",
  "running_experience": "Advanced",
  "start_date": "2025-02-01T09:00:00Z",
  "specific_days": "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
  "long_run_day": "Saturday",
  "days_per_week": 6,
  "min_weeks_plan": 8,
  "max_week_plans": 12,
  "estimated_race_time": "20:00",
  "weekly_mileage_past_4_weeks": "25-30",
  "longest_run_past_4_weeks": "5",
  "course_profile": "Flat",
  "age": 29,
  "gender": "male",
  "height": "175",
  "weight": "68"
}'

echo "📤 Generating first week..."
RESPONSE2=$(curl -s -X POST "$BASE_URL/generate-plan" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD2")

PLAN_ID2=$(echo "$RESPONSE2" | jq -r '.plan_id // empty')

if [ -n "$PLAN_ID2" ]; then
  echo "✅ First week generated (Plan ID: $PLAN_ID2)"
  
  echo "📤 Generating complete plan..."
  COMPLETE_PLAN2=$(curl -s -X POST "$BASE_URL/get-remaining-plan" \
    -H "Content-Type: application/json" \
    -d "{\"plan_id\": \"$PLAN_ID2\"}")
  
  echo "✅ Complete plan generated"
  
  echo "🔍 Checking 5K distance limits (max 5.0 km)..."
  VIOLATIONS=$(echo "$COMPLETE_PLAN2" | jq '.recommended_plan.weekly_plans[].workouts[] | select(.distance > 5.0) | {week: .week_number, day, workout_type, distance}')
  
  if [ -z "$VIOLATIONS" ]; then
    echo "✅ No distance limit violations found"
  else
    echo "❌ Distance limit violations found:"
    echo "$VIOLATIONS"
  fi
  
else
  echo "❌ First week generation failed"
  echo "$RESPONSE2" | jq '.'
fi

# Test 3: Half Marathon - Miles Unit
echo ""
echo "🔬 Test 3: Half Marathon - Miles Unit"
echo "-------------------------------------"

PAYLOAD3='{
  "plan_name": "Half Marathon",
  "plan_type": "half marathon",
  "measurement_unit": "miles",
  "running_experience": "Intermediate",
  "start_date": "2025-02-01T09:00:00Z",
  "specific_days": "Monday,Wednesday,Thursday,Friday,Saturday,Sunday",
  "long_run_day": "Sunday",
  "days_per_week": 6,
  "min_weeks_plan": 10,
  "max_week_plans": 14,
  "estimated_race_time": "1:45:00",
  "weekly_mileage_past_4_weeks": "25-30",
  "longest_run_past_4_weeks": "10",
  "course_profile": "Rolling Hills",
  "age": 32,
  "gender": "female",
  "height": "66",
  "weight": "130"
}'

echo "📤 Generating first week..."
RESPONSE3=$(curl -s -X POST "$BASE_URL/generate-plan" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD3")

PLAN_ID3=$(echo "$RESPONSE3" | jq -r '.plan_id // empty')

if [ -n "$PLAN_ID3" ]; then
  echo "✅ First week generated (Plan ID: $PLAN_ID3)"
  
  echo "📤 Generating complete plan..."
  COMPLETE_PLAN3=$(curl -s -X POST "$BASE_URL/get-remaining-plan" \
    -H "Content-Type: application/json" \
    -d "{\"plan_id\": \"$PLAN_ID3\"}")
  
  echo "✅ Complete plan generated"
  echo "📊 Plan summary:"
  echo "$COMPLETE_PLAN3" | jq '.recommended_plan | {plan_type, duration: .weekly_plans | length, unit: "miles"}'
  
else
  echo "❌ First week generation failed"
  echo "$RESPONSE3" | jq '.'
fi

echo ""
echo "=================================================="
echo "🏁 Curl tests completed!"
echo ""
echo "💡 To manually check for duplicate distances:"
echo "   1. Look at the workout distances in each week"
echo "   2. Ensure no two workouts have the same distance"
echo "   3. Verify Long Run is always the longest workout"
echo ""
echo "📝 Example check command:"
echo "   echo '\$RESPONSE1' | jq '.weekly_plans[0].workouts[] | select(.workout_type != \"Rest\") | {day, workout_type, distance}'"