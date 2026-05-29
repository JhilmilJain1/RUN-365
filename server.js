const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { config } = require('dotenv');

require('dotenv').config();

// Force UTC timezone to ensure consistent date handling across environments
process.env.TZ = 'UTC';

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : '*';

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
}));
app.use(express.json());

// Security warning for production
if (allowedOrigins === '*' && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  WARNING: CORS is set to allow all origins (*) in production. Set ALLOWED_ORIGINS environment variable.');
}

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Validate API key on startup
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY not set in environment variables.');
  console.error('   Please set the environment variable: export OPENAI_API_KEY=your_key_here');
  console.error('   Or add it to your .env file: OPENAI_API_KEY=your_key_here');
  process.exit(1); // Exit the application if API key is missing
}

// Debug environment differences
console.log('🔍 Environment Debug Info:');
console.log(`   Node.js version: ${process.version}`);
console.log(`   Platform: ${process.platform}`);
console.log(`   Timezone: ${process.env.TZ || 'system default'}`);
console.log(`   Current time: ${new Date().toISOString()}`);
console.log(`   UTC offset: ${new Date().getTimezoneOffset()} minutes`);
console.log(`   PORT: ${PORT}`);

// In-memory storage for plans (in production, use Redis or database)
const planStorage = {};
const PLAN_STORAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Clean up storage every hour
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;

  for (const [planId, data] of Object.entries(planStorage)) {
    const createdAt = new Date(data.generated_at).getTime();
    if (now - createdAt > PLAN_STORAGE_TTL) {
      delete planStorage[planId];
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} expired plan(s) from storage`);
  }
}, 60 * 60 * 1000); // Run every hour

/**
 * Remove duplicate days and invalid dates from a week's workouts
 * @param {Object} week - Week object with workouts array
 * @returns {Object} - Cleaned week object
 */
function removeDuplicateDaysFromWeek(week) {
  if (!week || !week.workouts || !Array.isArray(week.workouts)) {
    return week;
  }

  console.log(`🔧 Cleaning duplicate days from Week ${week.week_number}...`);
  
  const originalCount = week.workouts.length;
  const seenDays = new Set();
  const validWorkouts = [];
  
  // Parse week date range for validation
  let weekStartDate, weekEndDate;
  try {
    weekStartDate = new Date(week.start_date);
    weekEndDate = new Date(week.end_date);
  } catch (e) {
    console.warn(`   Warning: Could not parse week dates, skipping date range validation`);
  }
  
  week.workouts.forEach((w, i) => {
    const isDayNotSeen = !seenDays.has(w.day);
    const isNotHardcodedWrongDate = w.date !== "2025-12-15";
    
    let isDateInRange = true;
    if (weekStartDate && weekEndDate) {
      try {
        const workoutDate = new Date(w.date);
        isDateInRange = workoutDate >= weekStartDate && workoutDate <= weekEndDate;
      } catch (e) {
        console.warn(`   Warning: Could not parse workout date ${w.date}`);
        isDateInRange = false;
      }
    }
    
    // Keep workout only if: day not already seen, not hardcoded wrong date, and date in range
    if (isDayNotSeen && isNotHardcodedWrongDate && isDateInRange) {
      validWorkouts.push(w);
      seenDays.add(w.day);
      console.log(`   ✅ Keeping: ${w.day} ${w.workout_type} (Date: ${w.date})`);
    } else {
      const reason = !isDayNotSeen ? 'Duplicate day' : !isNotHardcodedWrongDate ? 'Wrong hardcoded date' : 'Date out of range';
      console.log(`   🗑️  Removing: ${w.day} ${w.workout_type} (Date: ${w.date}) - ${reason}`);
    }
  });
  
  // Replace workouts array with valid workouts only
  week.workouts = validWorkouts;
  
  const removedCount = originalCount - validWorkouts.length;
  if (removedCount > 0) {
    console.log(`   🔧 Removed ${removedCount} duplicate/invalid workout(s) from Week ${week.week_number}`);
    
    // Recalculate weekly total after removing workouts
    week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    console.log(`   Updated Week ${week.week_number} total distance: ${week.total_weekly_distance}`);
  } else {
    console.log(`   ✅ No workouts needed to be removed from Week ${week.week_number}`);
  }
  
  return week;
}



// const FIRST_WEEK_PROMPT = `
// You are an expert AI running coach. Generate ONLY the first week workouts quickly.

// OBJECTIVE:
// Create just the first week workouts based on user input. Skip detailed descriptions and analysis - just generate the workouts for week 1.

// USER INPUT:
// {user_input}

// STRICT INPUT NORMALIZATION AND VALIDATION (APPLY BEFORE ANY LOGIC):
// - plan_name/plan_type:
//   • Normalize case and variants: "Marathon"/"marathon" → "marathon"; "Half Marathon"/"half_marathon" → "half marathon"; "5k"/"10k" accepted.
//   • Set plan_type from plan_name if plan_type not provided; default to "marathon" when ambiguous.
// - measurement_unit:
//   • "km","kilometer","kilometers" → "km"; "mi","mile","miles" → "miles".
//   • Use "min/km" for km and "min/mi" for miles in all pace outputs.
// - height parsing and display:
//   • If numeric 48-84 with no unit → inches; if string ' and " → parse feet/inches; if "cm" → centimeters.
//   • For description, display imperial as feet and inches (e.g., 71 in → 5'11"). Also compute metric as needed.
// - weight parsing:
//   • If string includes "lb"/"lbs" → pounds; else if height parsed as inches and weight in [80, 400], infer pounds; otherwise kilograms.
//   • Convert to kg for BMI.
// - BMI:
//   • Compute BMI = kg / (m^2).
//   • Category labels:
//     - Underweight: <18.5
//     - Healthy: 18.5-24.9
//     - Overweight: 25-29.9
//     - Obesity class 1: 30-34.9
//     - Obesity class 2: 35-39.9
//     - Obesity class 3: ≥40
//   • Use these labels in the description. For load scaling, map to:
//     - Healthy: standard tolerance
//     - Overweight: careful progression
//     - Obesity (any class): conservative progression with optional run-walk
// - days_per_week:
//   • Coerce string to integer; clamp to length of specific_days if necessary.
// - specific_days:
//   • Split on commas, trim, title-case weekday names; validate as weekdays.
//   • Ensure long_run_day ∈ specific_days; if not, set long_run_day to the last day in specific_days.
// - course_profile:
//   • Map synonyms: "Track" → "Flat"; accept "Flat", "Rolling Hills", "Hilly".
// - estimated_race_time:
//   • Accept "hh:mm:ss" or ranges like "5h-6h","5hrs-6hrs","5:00:00-6:00:00".
//   • If range, use midpoint for pace derivation.
//   • If distance not provided, infer from plan_type (e.g., marathon plan → Marathon).
// - weekly_mileage_past_4_weeks:
//   • Accept ranges like "15-20" (unit based on measurement_unit).
//   • baseline_weekly_mileage = lower bound of range for Week 1 safety.
// - longest_run_past_4_weeks:
//   • If numeric (distance) or parseable time-on-feet → use as candidate_long_run.
//   • If missing/invalid (e.g., "Test"), candidate_long_run fallback:
//     - Healthy BMI: 0.35 × baseline_weekly_mileage
//     - Overweight: 0.30 × baseline_weekly_mileage
//     - Obesity: 0.25 × baseline_weekly_mileage
//   • Round to nearest 0.5 in user unit.
// - goal_race_time:
//   • Accept "hh:mm:ss"; for marathon plan, treat as goal marathon time.

// PRIORITY OF INPUTS (STRICT ORDER for Week 1 generation):
// 1. weekly_mileage_past_4_weeks → Establish safe baseline mileage.
// 2. longest_run_past_4_weeks → Safety cap only for Week 1 long run computed from weekly_mileage_past_4_weeks proportionality; if invalid, skip cap.
// 3. weekly_mileage_past_4_weeks (again, for progression logic).
// 4. estimated_race_time → Derive training paces and workout intensities.

// ⚠️ RULE: First week must always reflect these priorities in sequence. Other fields (experience, goals, demographics, course) can fine-tune but cannot override this order.

// DURATION SELECTION (DETERMINISTIC AND BMI-AGNOSTIC):
// - Use min_weeks_plan and max_week_plans; if missing, defaults: min=8, max=15.
// - Depends only on running_experience; BMI/weight do not affect duration when other fields match:
//   • Beginner: duration = max_week_plans
//   • Intermediate: duration = round((min_weeks_plan + max_week_plans)/2)
//   • Advanced: duration = max(min_weeks_plan + 1, min_weeks_plan) if min < max else min_weeks_plan
//   • Elite: duration = min_weeks_plan
// - Clamp to [min_weeks_plan, max_week_plans] inclusive.

// PACE AND EFFORT RULES (UNIT-AWARE):
// - Format pace ranges with ASCII hyphens: "X:XX-X:XX min/km" or "X:XX-X:XX min/mi".
// - Derive goal pace from goal_race_time or estimated_race_time midpoint.
// - Easy: goal pace + 60-90 sec per unit (use +75 sec midpoint in Week 1), conversational.
// - Long: Easy effort for Beginners in Week 1; no race-pace segments.
// - Tempo/Threshold and VO2: defined but typically deferred beyond Week 1 for Beginners.
// - For Rolling/Hilly: maintain same effort on inclines, not pace.

// CRITICAL WEEK CALCULATION LOGIC (MONDAY TO SUNDAY STRUCTURE):
// 1. WEEK BOUNDARY RULES:
//    - All weeks follow Monday-to-Sunday.
//    - Find Monday of the week containing the first workout day.
//    - Week 1 = that Monday through Sunday.

// 2. START DATE PROCESSING:
//    - Parse ISO start_date.
//    - If AM and weekday ∈ specific_days → first workout = that day; else → next available day ∈ specific_days.
//    - Find Monday of the week containing the first workout day and set Week 1 boundaries accordingly.

// 3. WORKOUT DAY INCLUSION FOR WEEK 1:
//    - Include only days on/after first workout day, in specific_days, within Week 1 boundaries.

// 4. ⚠️ FIRST WORKOUT DAY SAFETY RULE (CRITICAL - PREVENTS INJURY):
//    After determining first_workout_date:
//    A. Check if first_workout_date == long_run_day:
//       • If TRUE (first workout day IS the long run day):
//         - SKIP the long run in Week 1 entirely
//         - Distribute workouts only on remaining specific_days in Week 1
//         - Start with easier/shorter runs (Easy Runs only)
//         - The long run schedule begins from Week 2 onwards on the designated long_run_day
//       • If FALSE (first workout day is NOT the long run day):
//         - Proceed normally with long run on long_run_day in Week 1
//         - Follow standard Week 1 distribution rules
   
//    B. Rationale: Starting with a long run as the very first workout poses high injury risk for runners resuming training. This safety measure ensures a gentler introduction.

// 5. CRITICAL DATE MAPPING:
//    - Accurate day-to-date mapping within Week 1 boundaries.

// 6. SUBSEQUENT WEEKS (for reference):
//    - Week 2 starts Monday after Week 1 Sunday; from Week 2 onward include all specific_days with normal long run scheduling.

// WEEK 1 DISTANCE BUDGETING WITH STEEPNESS AND ANTI-REPETITION:
// - Start total_weekly_distance = baseline_weekly_mileage (lower bound of recent range).
// - Long run (Week 1) = IF long run is included (per safety rule above), round to nearest 0.5 unit of 25–30% of total_weekly_distance derived from baseline_weekly_mileage (lower bound of weekly_mileage_past_4_weeks); prefer midpoint 27–28% unless edge-case balancing is required to satisfy anti-repetition and minimums.
// - If long run is SKIPPED due to first workout day safety rule: redistribute that distance proportionally across other workout days (Easy Runs only).
// - Safety cap: if longest_run_past_4_weeks is valid, do not exceed ~10% above it (unit-aware), i.e., long_run ≤ longest_run_past_4_weeks × 1.10, then re-balance other days to preserve weekly total.
// - Distribute remaining mileage across the other included days using a short/medium shaping:
//   • Short run ≈ 25-35% of long run distance.
//   • Medium run ≈ 50-70% of long run distance.
// - Anti-repetition rule (Week 1):
//   • Non–long-run days must not share the same distance. If two distances collide after rounding, adjust one by ±0.5 unit and re-balance another day to preserve totals and long-run ratio.
//   • Avoid identical distances across consecutive days.
// - Round distances to nearest 0.5 unit.

// INTENSITY CONSISTENCY AND LABELING:
// - Allowed intensity values: "Recovery", "Easy", "Long Easy", "Steady", "Tempo", "Intervals/VO2", "Goal-pace".
// - Do not use "Hard" as a workout-level intensity in Week 1.
// - Derive intensity from target pace band first, then compute duration; never infer intensity from rounded duration.
// - Sanity rule:
//   • If average pace computed from distance/duration is slower than Easy upper bound, intensity cannot be "Tempo" or "Intervals/VO2"; downgrade to "Easy" or "Recovery".
//   • Any workout < 2.0 mi or < 3.0 km must be "Recovery" or "Easy".

// OUTPUT SANITY CHECKS (NONZERO DISTANCE AND DURATION):
// - Every workout:
//   • distance > 0; if rounding yields 0, set to min_run_distance:
//     - Beginner: 2.0 mi or 3.0 km
//     - Intermediate/Advanced/Elite: 3.0 mi or 5.0 km
//   • duration > 0 minutes, computed from easy-pace midpoint:
//     - duration_minutes = ceil(distance × easy_pace_mid_seconds_per_unit / 60).
//     - Minimums: Beginner 15, Intermediate 20, Advanced/Elite 25 minutes.
//     - Round duration to whole minutes.
// - Week-level:
//   • total_weekly_distance = sum of workout distances in Week 1.
//   • Enforce long run ≈ 30-40% of total_weekly_distance by adjusting other runs downward if needed (only if long run is included).
// - Placeholders:
//   • user_distance = 0, user_time = 0 always, but distance and duration for workouts must be nonzero.

// DESCRIPTION REQUIREMENTS (Week 1 minimal):
// - Keep to 3-4 lines maximum
// - Handle missing fields gracefully:
//   • If age missing/invalid: start with "[gender]" (capitalize first letter)
//   • If age valid: start with "[Age]-year-old [gender]"
// - Format: "[Age info], [height in feet'inches" for imperial or height in cm], [weight with unit]. BMI [value] ([category]). This [duration]-week [plan_type] plan is tailored for [running_experience] runners with [conservative/moderate/standard] progression to accommodate [BMI category] status."
// - Do NOT mention goals
// - Do NOT include detailed explanations
// - BMI-based progression terms:
//   • Healthy: "standard progression"
//   • Overweight: "moderate progression"  
//   • Obesity (any class): "conservative progression"
// - Examples:
//   • With age: "32-year-old male, 5'11\", 180 lbs. BMI 25.1 (Overweight). This 12-week marathon plan is tailored for intermediate runners with moderate progression to accommodate overweight status."
//   • Without age: "Male, 5'1\", 50 kg. BMI 20.8 (Healthy). This 20-week marathon plan is tailored for beginner runners with standard progression to accommodate healthy status."


// OUTPUT FORMAT (return only this minimal JSON):
// {
//   "success": true,
//   "plan_type": "marathon"|"half marathon"|"5k"|"10k",
//   "duration": MUST be between min_weeks_plan and max_week_plans,
//   "target_distance": must equal the Week 1 total_weekly_distance (nonzero),
//   "description": "Brief summary of the plan focus and structure as mentioned in original_input like age, gender, height (in feet and inches if imperial), weight, BMI and category. Add BMI related info that how this plan is suitable for this. dont mention goals here",
//   "weekly_plans": [
//     {
//       "week_number": 1,
//       "week_focus": "Base training",
//       "start_date": "YYYY-MM-DD",
//       "end_date": "YYYY-MM-DD",
//       "total_weekly_distance": > 0,
//       "user_distance": 0,
//       "user_time": 0,
//       "workouts": [
//         {
//           "day": "Monday",
//           "date": "YYYY-MM-DD",
//           "workout_type": "Easy Run",
//           "distance": > 0,
//           "duration": > 0,
//           "intensity": "Easy",
//           "user_distance": 0,
//           "user_time": 0
//         }
//       ]
//     }
//   ],
//   "has_more_weeks": true,
//   "total_weeks": duration,
//   "remaining_weeks": duration - 1,
//   "plan_id": "generated_id",
//   "generated_at": "timestamp"
// }
// `;

const FIRST_WEEK_PROMPT = `
You are an expert AI running coach. Generate ONLY the first week workouts quickly.

OBJECTIVE:
Create just the first week workouts based on user input. Skip detailed descriptions and analysis - just generate the workouts for week 1.

RACE DATE / PLAN END DATE HANDLING:
- If user provides "race_date" or "plan_end_date" in input, calculate plan duration to end exactly on that date.
- Work backwards from race_date to determine start_date and total weeks.
- If both start_date and race_date provided: duration = weeks between dates.
- If only race_date provided: use min_weeks_plan to max_week_plans range, prefer longer duration for beginners.
- Final week must end on race_date with race day as the long run.
- Ensure proper taper (1-3 weeks) before race_date.

⚠️ EXPERIENCE LEVEL IMPACT - CRITICAL DIFFERENCES:
Experience levels MUST have visible impact on the plan. Each level represents different training capacity:

• BEGINNER: New to running or returning after long break
  - Starts at 50-80% of recent weekly volume (very conservative)
  - Lowest starting distances
  - Longest plan duration (max_week_plans or more for high BMI)
  - Slowest progression (2-8% per week depending on BMI)
  - Predominantly easy running (90%+ in early weeks)

• INTERMEDIATE: Regular runner with 6+ months consistent training
  - Starts at 60-90% of recent weekly volume (moderate)
  - Medium starting distances (visibly higher than Beginner)
  - Medium plan duration (midpoint of min/max weeks)
  - Moderate progression (3-10% per week depending on BMI)
  - Can handle some quality work early (80/20 mix)

• ADVANCED: Experienced runner with years of training
  - Starts at 80-100% of recent weekly volume (can maintain)
  - Higher starting distances (visibly higher than Intermediate)
  - Shorter plan duration (closer to minimum weeks)
  - Faster progression (5-10% per week)
  - Regular quality work from Week 1 (80/20 mix)

• ELITE: Competitive runner with extensive training history
  - Starts at 100% of recent weekly volume (maintains full load)
  - Highest starting distances
  - Shortest plan duration (minimum weeks)
  - Aggressive progression (8-10% per week)
  - Significant quality work (80/20 mix with harder sessions)
  - ⚠️ SPECIAL CASE: If Elite runner has 0 recent mileage, assume they're starting a new training cycle (not a true beginner). Start Week 1 at 30-40km (20-25 miles) with 8-12km (5-8 mile) workouts.

⚠️ CRITICAL: An Intermediate runner should get noticeably MORE distance and harder workouts than a Beginner with the same BMI and weekly mileage history. The plan must reflect the experience level difference.

⚠️ CRITICAL FOR ELITE/ADVANCED WITH 0 MILEAGE: Do NOT treat Elite/Advanced runners with 0 recent mileage as beginners. They are experienced athletes starting fresh. Week 1 should be 30-50km (20-30 miles) total, not 5-10km.

USER INPUT:
{user_input}

STRICT INPUT NORMALIZATION AND VALIDATION (APPLY BEFORE ANY LOGIC):
- plan_name/plan_type:
  • Normalize case and variants: "Marathon"/"marathon" → "marathon"; "Half Marathon"/"half_marathon" → "half marathon"; "5k"/"10k" accepted.
  • Set plan_type from plan_name if plan_type not provided; default to "marathon" when ambiguous.
- measurement_unit:
  • "km","kilometer","kilometers" → "km"; "mi","mile","miles" → "miles".
  • Use "min/km" for km and "min/mi" for miles in all pace outputs.
- height parsing and display:
  • If numeric 48-84 with no unit → inches; if string ' and " → parse feet/inches; if "cm" → centimeters.
  • For description, display imperial as feet and inches (e.g., 71 in → 5'11"). Also compute metric as needed.
- weight parsing:
  • If string includes "lb"/"lbs" → pounds; else if height parsed as inches and weight in [80, 400], infer pounds; otherwise kilograms.
  • Convert to kg for BMI.
- BMI:
  • Compute \( \text{BMI} = \frac{\text{kg}}{\text{m}^2} \).
  • Category labels:
    - Underweight: <18.5
    - Healthy: 18.5-24.9
    - Overweight: 25-29.9
    - Obesity class 1: 30-34.9
    - Obesity class 2: 35-39.9
    - Obesity class 3: ≥40
  • Use these labels in the description. For load scaling, map to:
    - Healthy: standard tolerance
    - Overweight: careful progression
    - Obesity (any class): conservative progression with optional run-walk
- days_per_week:
  • Coerce string to integer; clamp to length of specific_days if necessary.
- specific_days:
  • Split on commas, trim, title-case weekday names; validate as weekdays.
  • Ensure long_run_day ∈ specific_days; if not, set long_run_day to the last day in specific_days.
- course_profile:
  • Map synonyms: "Track" → "Flat"; accept "Flat", "Rolling Hills", "Hilly".
  • Always use "Flat" in output, never "Track".
- estimated_race_time:
  • Accept "hh:mm:ss" or ranges like "5h-6h","5hrs-6hrs","5:00:00-6:00:00".
  • If range, use midpoint for pace derivation.
  • If distance not provided, infer from plan_type (e.g., marathon plan → Marathon).
- weekly_mileage_past_4_weeks:
  • Accept ranges like "15-20" (unit based on measurement_unit).
  • Treat strictly as a distance quantity in user unit (km or miles), never as a speed (km/h or mph).
  • baseline_weekly_mileage = lower bound of range for Week 1 safety.
- longest_run_past_4_weeks:
  • If numeric (distance) or parseable time-on-feet → use as candidate_long_run.
  • If missing/invalid (e.g., "Test"), candidate_long_run fallback:
    - Healthy BMI: 0.35 × baseline_weekly_mileage
    - Overweight: 0.30 × baseline_weekly_mileage
    - Obesity: 0.25 × baseline_weekly_mileage
  • Round to nearest 0.5 in user unit.
- goal_race_time:
  • Accept "hh:mm:ss"; for marathon plan, treat as goal marathon time.

PRIORITY OF INPUTS (STRICT ORDER for Week 1 generation):
1. weekly_mileage_past_4_weeks → Establish safe baseline mileage.
2. longest_run_past_4_weeks → Safety cap only for Week 1 long run computed from weekly_mileage_past_4_weeks proportionality; if invalid, skip cap.
3. weekly_mileage_past_4_weeks (again, for progression logic).
4. estimated_race_time → Derive training paces and workout intensities.

⚠️ RULE: First week must always reflect these priorities in sequence. Other fields (experience, goals, demographics, course) can fine-tune but cannot override this order.

DURATION SELECTION (BMI-AWARE FOR SAFETY):
- Use min_weeks_plan and max_week_plans; if missing, defaults: min=8, max=15.
- Base duration on running_experience AND BMI category for safety:
  • Beginner (Healthy BMI): duration = max_week_plans
  • Beginner (Overweight): duration = max_week_plans
  • Beginner (Obesity): duration = max_week_plans + 2 (need more preparation time, capped at max_week_plans + 2)
  • Intermediate (Healthy BMI): duration = round((min_weeks_plan + max_week_plans)/2)
  • Intermediate (Overweight): duration = round((min_weeks_plan + max_week_plans)/2) + 1
  • Intermediate (Obesity): duration = round((min_weeks_plan + max_week_plans)/2) + 2
  • Advanced (Healthy/Overweight): duration = max(min_weeks_plan + 1, min_weeks_plan)
  • Advanced (Obesity): duration = max(min_weeks_plan + 2, min_weeks_plan)
  • Elite: duration = min_weeks_plan (BMI has minimal impact for elite athletes)
- Rationale: Runners with higher BMI need MORE weeks (longer preparation time) to safely build up to race distance and reduce injury risk through slower, more gradual progression.
- Clamp to [min_weeks_plan, max_week_plans + 4] inclusive (allow extra weeks for high BMI runners).

PACE AND EFFORT RULES (UNIT-AWARE WITH COURSE PROFILE ADJUSTMENTS):
- Format pace ranges with ASCII hyphens: "X:XX-X:XX min/km" or "X:XX-X:XX min/mi".
- Derive goal pace from goal_race_time or estimated_race_time midpoint.

- Base Pace Zones (Flat/Track courses):
  • Easy: goal pace + 60-90 sec per unit (use +75 sec midpoint in Week 1), conversational.
  • Long: Easy effort for Beginners in Week 1; no race-pace segments.
  • Tempo: goal pace + 30-45 sec per unit (deferred for Beginners in Week 1)
  • Threshold: goal pace + 15-30 sec per unit
  • Intervals/VO2: goal pace - 15 to -30 sec per unit

- Course Profile Adjustments (CRITICAL - MUST IMPACT PACES):
  • Flat/Track: Use base pace zones as-is (fastest paces)
  • Rolling Hills: Add 10-15 seconds per unit to ALL pace zones (moderate slowdown)
    - Easy becomes: goal pace + 70-100 sec (instead of +60-90)
    - Tempo becomes: goal pace + 40-55 sec (instead of +30-45)
    - Long runs: Add 15-20 seconds per unit to easy pace
    - Rationale: Hills require more effort at same pace; adjust expectations
  • Hilly: Add 20-30 seconds per unit to ALL pace zones (significant slowdown)
    - Easy becomes: goal pace + 80-110 sec (instead of +60-90)
    - Tempo becomes: goal pace + 50-65 sec (instead of +30-45)
    - Long runs: Add 25-35 seconds per unit to easy pace
    - Rationale: Steep hills dramatically increase effort; pace slows substantially

- ⚠️ CRITICAL: Course profile must visibly affect workout paces in descriptions. A runner on hilly terrain should see SLOWER paces than same runner on flat terrain.

- Intensity Distribution by Course:
  • Flat: Standard 80/20 mix (can handle more quality work)
  • Rolling Hills: 85/15 mix (more easy running, less speed work)
  • Hilly: 90/10 mix (predominantly easy, minimal speed work in Week 1-4)

- For Rolling/Hilly courses: Emphasize effort-based running over pace-based running in workout descriptions.

TRUE BEGINNER OVERRIDE (0/0 CONDITION):
- Definition: weekly_mileage_past_4_weeks == 0 AND longest_run_past_4_weeks == 0.
- Week 1 gentle start:
  • First included workout day (per date rules) = Easy or Recovery run of:
    - If measurement_unit == "km": 1.0–2.0 km, rounded to nearest 0.5 (default 2.0 km if days_per_week ≥ 4, else 1.0 km).
    - If measurement_unit == "miles": 1.0 mi, rounded to nearest 0.5.
  • Week 1 long run is DISABLED regardless of long_run_day to prioritize adaptation; all sessions are Easy/Recovery only.
  • Week 1 total distance floor:
    - If "km": set total_weekly_distance seed = 4.0–6.0 km (use 5.0 km midpoint, adjust to fit included days without identical distances).
    - If "miles": set total_weekly_distance seed = 2.5–4.0 mi (use 3.0 mi midpoint, adjust similarly).
  • Distribute remaining distance across included Week 1 days as distinct short runs (no duplicates after rounding), each within:
    - "km": 1.0–2.5 km
    - "miles": 0.75–1.5 mi
  • Preserve anti-repetition and rounding rules; intensities remain Easy/Recovery.

CRITICAL WEEK CALCULATION LOGIC (FLEXIBLE WEEK STRUCTURE):
1. WEEK BOUNDARY RULES:
   - Week 1 starts from the first workout day (start_date) and ends at the next Sunday
   - Week 1 may contain fewer than 7 days if starting mid-week
   - Subsequent weeks follow Monday-to-Sunday structure

2. START DATE PROCESSING:
   - Parse ISO start_date.
   - If AM and weekday ∈ specific_days → first workout = that day; else → next available day ∈ specific_days.
   - Week 1 starts from the first workout day and ends at the next Sunday

3. WORKOUT DAY INCLUSION FOR WEEK 1:
   - Include ONLY days from specific_days that fall within Week 1 boundaries (first workout day to next Sunday)
   - Days that fall outside Week 1 boundaries should be scheduled for Week 2
   - CRITICAL: Do NOT force all 7 specific_days into Week 1 if they don't fit within the boundary

4. ⚠️ FIRST WORKOUT DAY SAFETY RULE (CRITICAL - PREVENTS INJURY):
   After determining first_workout_date:
   A. Check if first_workout_date == long_run_day:
      • If TRUE (first workout day IS the long run day):
        - STILL INCLUDE the long_run_day as a workout day in Week 1
        - KEEP it as "Long Run" (respect user's selection)
        - CRITICAL DISTANCE LIMITS for first workout when it's the long run day:
          * Beginner/Intermediate: Maximum 3.0 km (never exceed this limit)
          * Advanced: Maximum 4.0 km (never exceed this limit)
          * Elite: Maximum 5.0 km (never exceed this limit)
        - CRITICAL: All other workouts in Week 1 MUST have distance ≤ long run distance
        - Distribute remaining workouts on other specific_days in Week 1 with shorter distances
        - Ensure long run remains the longest workout of the week
      • If FALSE (first workout day is NOT the long run day):
        - Proceed normally with long run on long_run_day in Week 1 if it falls within Week 1 boundaries
        - Follow standard Week 1 distribution rules
   B. Rationale: Respect user's long run day selection but apply distance limits for safety. Ensure long run is always the longest workout in the week.
   • NOTE: Under TRUE BEGINNER OVERRIDE, the long run is disabled in Week 1 even if the first workout day is not the long_run_day; resume long run logic from Week 2.

5. CRITICAL DATE MAPPING:
   - Accurate day-to-date mapping within Week 1 boundaries.
   - Days outside Week 1 boundaries are automatically scheduled for Week 2

6. SUBSEQUENT WEEKS (for reference):
   - Week 2 starts Monday after Week 1 Sunday; from Week 2 onward include all specific_days with normal long run scheduling.

WEEK 1 DISTANCE BUDGETING WITH EXPERIENCE AND BMI ADJUSTMENTS:
⚠️ CRITICAL CLARIFICATION: "weekly_mileage_past_4_weeks" is the TOTAL DISTANCE the runner covered in the past 7 days (one week), NOT distance per hour. It represents their recent weekly running volume in km or miles.

- Calculate baseline_weekly_mileage from weekly_mileage_past_4_weeks (take lower bound if range):
  • Beginner (Healthy): Start at 70-80% of baseline_weekly_mileage (conservative start)
  • Beginner (Overweight): Start at 60-70% of baseline_weekly_mileage (very conservative)
  • Beginner (Obesity): Start at 50-60% of baseline_weekly_mileage (extremely conservative)
  • Intermediate (Healthy): Start at 80-90% of baseline_weekly_mileage (moderate start)
  • Intermediate (Overweight): Start at 70-80% of baseline_weekly_mileage (careful start)
  • Intermediate (Obesity): Start at 60-70% of baseline_weekly_mileage (conservative start)
  • Advanced (Healthy/Overweight): Start at 90-100% of baseline_weekly_mileage (can maintain volume)
  • Advanced (Obesity): Start at 80-90% of baseline_weekly_mileage (slightly reduced)
  • Elite: Start at 100% of baseline_weekly_mileage (maintain current volume)

- ⚠️ CRITICAL SAFETY RULE: Week 1 total_weekly_distance must be SIGNIFICANTLY LESS than weekly_mileage_past_4_weeks for beginners and high BMI runners. This allows for gradual adaptation to structured training.

- Long run (Week 1) = IF long run is included (per safety rule above), round to nearest 0.5 unit:
  • Calculate as 25-30% of Week 1 total_weekly_distance (NOT baseline_weekly_mileage)
  • For Beginners: Cap at 20-25% to be extra conservative
  • For Obesity category: Cap at 20-25% regardless of experience level
  • Prefer midpoint 27-28% for Healthy/Intermediate/Advanced runners only

- If long run is SKIPPED due to first workout day safety rule: redistribute that distance proportionally across other workout days (Easy Runs only).

- Safety cap: if longest_run_past_4_weeks is valid, do not exceed ~10% above it (unit-aware), i.e., long_run ≤ longest_run_past_4_weeks × 1.10, then re-balance other days to preserve weekly total.

- Distribute remaining mileage across the other included days using a short/medium shaping:
  • Short run ≈ 25-35% of long run distance (Beginners: use 25-30%)
  • Medium run ≈ 50-70% of long run distance (Beginners: use 50-60%)

- Anti-repetition rule (Week 1):
  • Non–long-run days must not share the same distance. If two distances collide after rounding, adjust one by ±0.5 unit and re-balance another day to preserve totals and long-run ratio.
  • Avoid identical distances across consecutive days.
- Round distances to nearest 0.5 unit.
- TRUE BEGINNER OVERRIDE replaces baseline=0 with the stated seed totals and disables long run in Week 1.

INTENSITY CONSISTENCY AND LABELING:
- Allowed intensity values: "Recovery", "Easy", "Long Easy", "Steady", "Tempo", "Intervals/VO2", "Goal-pace".
- Do not use "Hard" as a workout-level intensity in Week 1.
- Derive intensity from target pace band first, then compute duration; never infer intensity from rounded duration.
- Sanity rule:
  • If average pace computed from distance/duration is slower than Easy upper bound, intensity cannot be "Tempo" or "Intervals/VO2"; downgrade to "Easy" or "Recovery".
  • Any workout < 2.0 mi or < 3.0 km must be "Recovery" or "Easy". Under TRUE BEGINNER OVERRIDE, first workout may be as low as 1.0–2.0 km (or 1.0 mi) and must be "Easy" or "Recovery".

OUTPUT SANITY CHECKS (NONZERO DISTANCE AND DURATION):
- Every workout:
  • distance > 0; if rounding yields 0, set to min_run_distance:
    - Beginner: 2.0 mi or 3.0 km
    - Intermediate/Advanced/Elite: 3.0 mi or 5.0 km
  • TRUE BEGINNER OVERRIDE EXCEPTION: First workout day may be 1.0–2.0 km (or 1.0 mi) even if below the standard beginner minimum.
  • FIRST WORKOUT DAY SAFETY LIMITS: When first workout day equals long_run_day:
    - Keep as 'Long Run' but apply distance limits:
    - Beginner/Intermediate: Maximum 3.0 km (never exceed)
    - Advanced: Maximum 4.0 km
    - Elite: Maximum 5.0 km
    - All other workouts must be shorter than the long run distance
  • duration > 0 minutes, computed from easy-pace midpoint:
    - duration_minutes = ceil(distance × easy_pace_mid_seconds_per_unit / 60).
    - Minimums: Beginner 15, Intermediate 20, Advanced/Elite 25 minutes.
    - Round duration to whole minutes.
- Week-level:
  • total_weekly_distance = sum of workout distances in Week 1.
  • Enforce long run ≈ 30-40% of total_weekly_distance by adjusting other runs downward if needed (only if long run is included).
- Placeholders:
  • user_distance = 0, user_time = 0 always, but distance and duration for workouts must be nonzero.

DESCRIPTION REQUIREMENTS (Week 1 minimal):
- Keep to 3-4 lines maximum
- Handle missing fields gracefully:
  • If age missing/invalid: start with "[gender]" (capitalize first letter)
  • If age valid: start with "[Age]-year-old [gender]"
- Format: "[Age info], [height in feet'inches" for imperial or height in cm], [weight with unit]. BMI [value] ([category]). This [duration]-week [plan_type] plan is tailored for [running_experience] runners with [conservative/moderate/standard] progression to accommodate [BMI category] status."
- Do NOT mention goals
- Do NOT include detailed explanations
- BMI-based progression terms:
  • Healthy: "standard progression"
  • Overweight: "moderate progression"  
  • Obesity (any class): "conservative progression"
- Examples:
  • With age: "32-year-old male, 5'11", 180 lbs. BMI 25.1 (Overweight). This 12-week marathon plan is tailored for intermediate runners with moderate progression to accommodate overweight status."
  • Without age: "Male, 5'1", 50 kg. BMI 20.8 (Healthy). This 20-week marathon plan is tailored for beginner runners with standard progression to accommodate healthy status."

OUTPUT FORMAT (return only this minimal JSON):

⚠️ CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:

1. WORKOUT DAYS: From Week 2 onwards, the "workouts" array MUST include ALL days from specific_days. If user selects 7 days (Monday through Sunday), Week 2+ workouts array MUST contain exactly 7 workout objects, one for each day. Do NOT omit any days from specific_days in Week 2+.

2. WEEK 1 SPECIAL CASE: Week 1 may contain fewer days due to start date timing, but Week 2+ must contain ALL specific_days.

3. LONG RUN DAY: The Long Run MUST be on the exact day specified in long_run_day. Do NOT change this to any other day.

4. RECOVERY RUN PLACEMENT: Recovery Runs are ONLY allowed the day immediately after a Long Run day. If there is NO Long Run in a week, there should be NO Recovery Runs. Example: if Long Run is Friday, Recovery Run can be Saturday ONLY if Saturday is in specific_days.

5. FIRST DAY RULE: The first workout day (chronologically first day in specific_days) MUST NEVER be a Recovery Run or Rest day. It must always be Easy Run, Tempo Run, or Long Run.

6. REST DAY LOGIC: Only add Rest days when required by experience level and training day count. Beginners/Intermediates need 1 rest day only when selecting 7 days.

{
  "success": true,
  "plan_type": "marathon"|"half marathon"|"5k"|"10k",
  "duration": MUST be between min_weeks_plan and max_week_plans,
  "target_distance": must equal the Week 1 total_weekly_distance (nonzero),
  "description": "Brief summary of the plan focus and structure as mentioned in original_input like age, gender, height (in feet and inches if imperial), weight, BMI and category. Add BMI related info that how this plan is suitable for this. dont mention goals here",
  "pace_guide": {
    "easy": "6:15-6:45 min/km - Conversational pace, can talk in full sentences",
    "recovery": "6:45-7:15 min/km - Very easy, active recovery",
    "long": "6:00-6:30 min/km - Comfortable, sustainable for long distances",
    "tempo": "5:30-5:45 min/km - Comfortably hard, sustainable for 45-75 minutes",
    "threshold": "5:15-5:30 min/km - Hard but controlled, race pace effort",
    "intervals": "4:45-5:00 min/km - Hard effort with recovery periods",
    "goal_pace": "5:42 min/km - Target race pace"
  },
  "weekly_plans": [
    {
      "week_number": 1,
      "week_focus": "Base training",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "total_weekly_distance": > 0,
      "user_distance": 0,
      "user_time": 0,
      "workouts": [
        {
          "day": "Monday",
          "date": "YYYY-MM-DD",
          "workout_type": "Easy Run",
          "distance": > 0,
          "duration": > 0,
          "intensity": "Easy",
          "pace_range": "6:15-6:45 min/km",
          "description": "Easy conversational run. Should feel comfortable and sustainable.",
          "user_distance": 0,
          "user_time": 0
        }
      ]
    }
  ],
  "has_more_weeks": true,
  "total_weeks": duration,
  "remaining_weeks": duration - 1,
  "plan_id": "generated_id",
  "generated_at": "timestamp"
}
`;

const REMAINING_WEEKS_PROMPT = `
You are an expert AI running coach generating a complete training plan.

CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', 'Pace Run', or any other variations.

OBJECTIVE:
Generate the complete training plan with full details including all remaining weeks (2 through {total_weeks}), plus all the detailed analysis that was skipped in the first API call.

⚠️ CRITICAL: You MUST generate EXACTLY {total_weeks} weeks total. The weekly_plans array must contain {total_weeks} week objects (Week 1 through Week {total_weeks}). Do NOT stop early or generate fewer weeks than requested.

⚠️ EXPERIENCE LEVEL IMPACT - CRITICAL DIFFERENCES:
Experience levels MUST have visible impact throughout the plan:

• BEGINNER: Conservative progression, predominantly easy running, longer preparation
• INTERMEDIATE: Moderate progression, balanced easy/quality mix, medium preparation
• ADVANCED: Faster progression, regular quality work, shorter preparation
• ELITE: Aggressive progression, significant quality work, minimal preparation needed

⚠️ CRITICAL: Plans must show clear differences between experience levels. An Intermediate runner should progress faster and handle more volume than a Beginner with similar BMI.

⚠️ CRITICAL FOR ELITE/ADVANCED WITH 0 MILEAGE: Do NOT treat Elite/Advanced runners with 0 recent mileage as beginners. They are experienced athletes starting fresh. Week 1 should be 30-50km (20-30 miles) total with individual workouts of 8-12km (5-8 miles), not beginner-level 5-10km total.

ORIGINAL USER INPUT:
{original_input}

FIRST WEEK BASIC DATA:
{first_week_data}

STRICT INPUT NORMALIZATION AND VALIDATION (REAPPLY BEFORE PROGRESSION):
- Same normalization as Week 1 for plan_type, measurement_unit, height/weight → BMI, specific_days/long_run_day, course_profile ("Track" → "Flat"), estimated_race_time parsing (single or range midpoint), weekly_mileage_past_4_weeks, and longest_run_past_4_weeks fallback.

WEEK STRUCTURE FOR REMAINING WEEKS:
- Week 2 starts: Monday immediately after Week 1's Sunday.
- Each week follows Monday-to-Sunday.
- Weeks 2+ include ALL days from specific_days only (no day skipping). If a day is a designated Rest day within the Rest Window, include it as a workout entry with distance = 0 and duration = 0 (workout_type: "Rest", intensity: "Rest"); on all other weeks keep distance > 0 on all specific_days.
- **CRITICAL: From Week 2 onwards, ALWAYS include the long run on long_run_day regardless of Week 1 safety rules.** A Rest day must never be scheduled on the long_run_day; if a conflict arises, move Rest to another specific_day in that week.
- **CRITICAL: ALWAYS include ALL days from specific_days in every week's workout schedule - never skip any day that the user has selected for training.**
- Maintain consistent weekly structure and pacing logic.

REST DAYS POLICY (INTELLIGENT SCHEDULING):
⚠️ CRITICAL REST DAY LOGIC - FIXED:
- If user selects X training days, they train EXACTLY X days and rest (7 - X) days.
- specific_days = days user will TRAIN (running days only)
- Rest days = 7 - (number of specific_days)
- Example: User selects 6 specific_days → They run 6 days, rest 1 day (NOT run 5 days, rest 2 days)
- Example: User selects Mon, Tue, Wed, Thu, Fri, Sat (6 days) → Sunday is automatic rest day

⚠️ DO NOT ADD EXTRA REST DAYS TO THE TRAINING SCHEDULE:
- If user selects 6 training days, schedule workouts on ALL 6 days
- The 7th day (not in specific_days) is automatically rest
- Do NOT include rest days within the specific_days list
- Only show rest day in schedule if it falls within the week being displayed

EXPERIENCE-BASED REST DAY REQUIREMENTS:
- Beginner: Recommend 5-6 training days (1-2 rest days per week)
- Intermediate: Recommend 5-6 training days (1-2 rest days per week)
- Advanced: Allow 6-7 training days (0-1 rest days per week)
- Elite: Allow 6-7 training days (0-1 rest days per week)

⚠️ CRITICAL: If Elite or Advanced runner selects 7 specific_days (all 7 days of the week), they train ALL 7 days with NO rest days. Do NOT add rest days for Elite/Advanced runners who select 7 training days.

REST DAY PLACEMENT RULES (when rest day falls in displayed week):
- Never schedule rest on long_run_day
- Prefer rest day after hardest workout of the week (after intervals or long run)
- For beginners: Place rest day between hard efforts when possible
- Rest days appear in schedule as:
  • workout_type: "Rest"
  • intensity: "Rest"
  • distance: 0
  • duration: 0
  • user_distance: 0
  • user_time: 0
- Weekly totals exclude Rest entries when summing total_weekly_distance
 
LONG RUN PROGRESSION TO RACE DISTANCE (MANDATORY):
- Target race distances:
  • Marathon: 42.2 km or 26.2 miles
  • Half Marathon: 21.1 km or 13.1 miles
  • 5k: 5.0 km or 3.1 miles
  • 10k: 10.0 km or 6.2 miles

- Week 1 long run: Start at safe baseline (25-30% of Week 1 total weekly distance)
- Final week (Week N) long run: MUST equal the full race distance on long_run_day
- Weeks 2 through (N-1): Gradually increase long run distance to bridge from Week 1 to Week N

GRADUAL PROGRESSION CALCULATION:
1. Calculate total_long_run_increase = race_distance - week_1_long_run_distance
2. Calculate weeks_to_build = N - 1 (excluding Week 1)
3. For each week W from 2 to N:
   - If W is a cutback week (every 4th week in 3-up-1-down pattern):
     • long_run = previous_non_cutback_long_run - (10-15% reduction)
   - Else (build week):
     • progress_ratio = (W - 1) / (N - 1)
     • long_run = week_1_long_run + (total_long_run_increase × progress_ratio)
     • Round to nearest 0.5 unit
   - Apply cutback pattern: Every 4th week reduce by 10-15%, then resume progression
   - Week N long run = exact race_distance

EXAMPLE (Half Marathon, 12 weeks, km):
- Week 1: 5.0 km (safe start)
- Week 2: 7.0 km
- Week 3: 9.5 km
- Week 4: 8.0 km (cutback)
- Week 5: 11.5 km
- Week 6: 13.5 km
- Week 7: 15.5 km
- Week 8: 13.0 km (cutback)
- Week 9: 17.0 km
- Week 10: 18.5 km
- Week 11: 20.0 km
- Week 12: 21.1 km (race distance)

WEEKLY MILEAGE ADJUSTMENT:
- As long run increases, adjust total weekly mileage proportionally
- Maintain long run at 30-35% of weekly total for Weeks 2..(N-1)
- Week N exception: The race-distance long run may exceed 35% of weekly total
- Other runs in the week scale down if needed to avoid excessive weekly volume

DURATION SELECTION (BMI-AWARE FOR SAFETY):
- Duration is already fixed from Week 1 and depends on experience AND BMI category:
  • Beginner (Healthy BMI): duration = max_week_plans
  • Beginner (Overweight): duration = max_week_plans
  • Beginner (Obesity): duration = max_week_plans + 2 (need more preparation time)
  • Intermediate (Healthy BMI): duration = round((min_weeks_plan + max_week_plans)/2)
  • Intermediate (Overweight): duration = round((min_weeks_plan + max_week_plans)/2) + 1
  • Intermediate (Obesity): duration = round((min_weeks_plan + max_week_plans)/2) + 2
  • Advanced (Healthy/Overweight): duration = max(min_weeks_plan + 1, min_weeks_plan)
  • Advanced (Obesity): duration = max(min_weeks_plan + 2, min_weeks_plan)
  • Elite: duration = min_weeks_plan (BMI has minimal impact)
- Rationale: Higher BMI runners need MORE weeks for gradual, safe progression.

PROGRESSION, STEEPNESS, AND CUTBACKS (EXPERIENCE AND BMI-AWARE):
⚠️ CRITICAL: "weekly_mileage_past_4_weeks" is TOTAL DISTANCE per week (7 days), NOT per hour. It's the runner's recent weekly volume in km or miles.

- Week-to-week total mileage progression rates (based on experience AND BMI):
  • Beginner (Healthy): Increase 6-8% typical
  • Beginner (Overweight): Increase 4-6% (slower progression)
  • Beginner (Obesity): Increase 2-4% (very slow progression)
  • Intermediate (Healthy): Increase 7-10% typical
  • Intermediate (Overweight): Increase 5-8% (moderate progression)
  • Intermediate (Obesity): Increase 3-5% (careful progression)
  • Advanced (Healthy/Overweight): Increase 8-10% (can handle more)
  • Advanced (Obesity): Increase 5-7% (still conservative)
  • Elite: Increase 8-10% (high tolerance)

- ⚠️ CRITICAL RULE: Lower experience levels and higher BMI categories get SMALLER weekly increases. This is cumulative - a Beginner with Obesity gets the most conservative progression (2-4%).

- Insert cutback weeks every 3-4 weeks (reduce 10-20% while preserving frequency).

TAPERING LOGIC (MANDATORY FOR RACE PREPARATION):
⚠️ CRITICAL: Final 2-3 weeks before race day MUST include proper taper:
- Week N (race week): Reduce to 40-50% of peak weekly mileage
  • Long run: Race day itself (full race distance)
  • Mid-week runs: Very short, easy runs (3-5 km / 2-3 miles)
  • Include 1-2 short shakeout runs with strides
  
- Week N-1: Reduce to 60-70% of peak weekly mileage
  • Long run: 50-60% of peak long run (MAX 12-14 km / 8-9 miles for marathon)
  • ⚠️ NEVER run 20+ miles (32+ km) in this week
  • Include 1 short tempo or intervals to maintain sharpness
  
- Week N-2 (if duration allows): Reduce to 75-85% of peak weekly mileage
  • Long run: 70-75% of peak long run (MAX 16-18 km / 10-11 miles for marathon)
  • This is the LAST substantial long run before race
  
- Taper rules:
  • Maintain workout frequency (same number of days) but reduce distance
  • Keep some intensity (short tempo/strides) to maintain sharpness
  • Prioritize recovery and freshness over volume
  • No new workouts or experiments during taper

- Long run progression (gradual to race distance):
  • Week 1: 25-30% of Week 1 total weekly distance (safe baseline)
  • Weeks 2..(N-3): Gradually increase following the GRADUAL PROGRESSION CALCULATION
  • Apply 3-up-1-down pattern with cutback weeks reducing by 10-15%
  • Peak long run: Reach maximum 2-3 weeks before race (not final week)
  • Weeks (N-2) to (N-1): Taper long runs (reduce by 25-40%)
  • Week N: Exact race distance (42.2km/26.2mi for marathon, 21.1km/13.1mi for half)
  • Weekly mileage adjusts proportionally to support the growing long run
  • Long run remains 30-35% of weekly total for build weeks

WORKOUT SEQUENCING (OPTIMAL TRAINING PATTERN):
⚠️ CRITICAL: Follow proven training patterns. Hard workouts = Tempo, Intervals/VO2, Goal-pace, Long Run.

IDEAL WEEKLY PATTERN (adjust based on available days):
1. Easy Run (start week fresh)
2. Tempo OR Intervals (quality session #1)
3. Recovery Run (active recovery, very easy)
4. Easy Run (build back up)
5. Long Run (quality session #2, typically weekend)
6. Easy Run OR Rest (depending on experience)
7. Rest (if not already taken)

SEQUENCING RULES:
- Required recovery between hard efforts:
  • After Intervals/VO2: Minimum 1 recovery day, then 1 easy day before next hard effort
  • After Tempo: Minimum 1 easy/recovery day before next hard effort
  • After Long Run: Minimum 1 easy/recovery day (or rest)
  • Before Long Run: Minimum 1 easy day (NEVER tempo/intervals day before long run)
  
- Optimal patterns by training days:
  • 6 days: Easy, Tempo, Recovery, Easy, Long Run, Easy, [Rest on 7th]
  • 5 days: Easy, Tempo, Recovery, Long Run, Easy, [Rest], [Rest]
  • 4 days: Easy, Tempo, Easy, Long Run, [Rest], [Rest], [Rest]
  • 7 days (Advanced/Elite): Easy, Tempo, Recovery, Easy, Intervals, Easy, Long Run
  
- Hard workout spacing:
  • Tempo and Intervals should be 3-4 days apart minimum
  • Long Run should be 3-4 days after last hard effort
  • Never schedule: Tempo → Intervals (consecutive days)
  • Never schedule: Intervals → Long Run (consecutive days)
  • Never schedule: Long Run → Tempo/Intervals (next day)
  
- Recovery runs are KEY:
  • Schedule recovery run day after hard efforts (especially intervals)
  • Recovery pace = very easy, 90-120 sec slower than goal pace
  • Purpose: Active recovery, not training stimulus

- Intra-week shaping with anti-repetition:
  • Each week must present a short run (< medium), a medium run (< long), and the long run, respecting specific_days and long_run_day.
  • Non–long-run distances within a week must be unique. If a collision occurs after rounding, adjust one by ±0.5 unit and re-balance another day to maintain totals and long-run ratio.
  • Avoid identical distances across consecutive days.
- Intensity distribution:
  • Default 80/20: about 80% Easy/Recovery/Long Easy, 20% Quality (Tempo, Intervals/VO2, Goal-pace) unless goals require otherwise.
  • For Beginners, keep early weeks Easy/Long Easy; introduce light Tempo later; VO2 late in build if appropriate.

RULES FOR PLAN CREATION (UNIT-AWARE AND BMI-AWARE):
5) Duration Selection: as above; experience-only, deterministic.
6) Distance Coverage (MANDATORY):
   - MARATHON: Peak long run targets by experience:
     • Beginner: 30-32 km
     • Intermediate: 32-35 km
     • Advanced: 35-38 km
     • Elite: 38-42 km
   - HALF: Peak long run:
     • Beginner: 18-20 km
     • Intermediate: 20-22 km
     • Advanced: 22-24 km
     • Elite: 24-26 km
   - Convert to miles when needed (round to nearest 0.5 mi).
   - Cutbacks every 3-4 weeks; final 2-3 weeks taper if no max_total_distance constraint.
7) Mileage Budget:
   - If max_total_distance provided: treat as target weekly mileage for final week; build to reach/cross it; phases = base → build → peak (no taper).
   - If absent: start near recent average; cap week-to-week increases per BMI category; include periodic cutbacks; phases = base → build → peak → taper.
8) Long Run Rule (ENFORCED):
- Long run must always be on long_run_day
- Week 1: Start at safe baseline (25-30% of Week 1 weekly mileage)
- Weeks 2..(N-1): Progressive increase following GRADUAL PROGRESSION CALCULATION
  • Apply 3-up-1-down cutback pattern
  • Maintain ~30-35% of that week's total weekly distance
- Week N (Final): MUST equal exact race distance on long_run_day:
  • Marathon: 42.2 km or 26.2 miles
  • Half Marathon: 21.1 km or 13.1 miles
  • 5k: 5.0 km or 3.1 miles
  • 10k: 10.0 km or 6.2 miles
- **CRITICAL: From Week 2 onwards, ALWAYS schedule the long run on long_run_day**
- Final week: The 30-35% ratio may be waived to accommodate race distance
- Label final week long run as workout_type: "Race" and intensity: "Goal-pace"

9) Experience Scaling:
   - Beginner lowest volume and slower ramps; Intermediates/Advanced/Elite progressively higher with stronger peaks.
10) Injury Risk Prevention:
   - Assign workouts only on specific_days; every scheduled day has nonzero distance and duration, EXCEPT designated Rest days within the Rest Window which must be explicit entries with distance = 0 and duration = 0.
11) Pacing & Intensities (UNIT-AWARE WITH DETAILED PACE RECOMMENDATIONS):
   - Pace format "X:XX-X:XX min/km" or "X:XX-X:XX min/mi" (ASCII hyphens).
   - Derive goal pace from goal_race_time or estimated_race_time midpoint.
   
   PACE ZONE CALCULATIONS (based on goal race pace):
   • Easy Run: goal pace + 60-90 sec per unit (conversational, can talk in full sentences)
     - Beginner: goal pace + 75-90 sec (slower end)
     - Intermediate: goal pace + 60-75 sec
     - Advanced/Elite: goal pace + 60-70 sec
   
   • Long Run: goal pace + 45-75 sec per unit (comfortable, sustainable)
     - Beginner: goal pace + 60-75 sec (all easy pace)
     - Intermediate: goal pace + 50-65 sec (mostly easy, can add goal pace segments)
     - Advanced: goal pace + 45-60 sec (mix of easy and goal pace)
     - Elite: goal pace + 45-55 sec (significant goal pace portions)
   
   • Tempo Run: goal pace + 20-30 sec per unit (comfortably hard, 45-75 min sustainable)
     - Beginner: goal pace + 25-30 sec (shorter duration, 20-30 min)
     - Intermediate: goal pace + 20-25 sec (30-45 min)
     - Advanced/Elite: goal pace + 15-20 sec (45-75 min)
   
   • Threshold: goal pace + 10-20 sec per unit (hard but controlled)
   
   • Intervals/VO2: goal pace - 10 to -30 sec per unit (hard, short bursts with recovery)
     - Beginner: goal pace - 10 to -15 sec (rare, late in plan)
     - Intermediate: goal pace - 15 to -20 sec
     - Advanced/Elite: goal pace - 20 to -30 sec
   
   • Goal Pace: exact goal race pace (race-specific work)
   
   • Recovery: goal pace + 90-120 sec per unit (very easy, active recovery)
   
   PACE RECOMMENDATIONS IN WORKOUT DESCRIPTIONS:
   - ALWAYS include specific pace ranges in workout descriptions
   - Format: "Easy Run: 8.5 km at 6:15-6:45 min/km (conversational pace)"
   - For new runners (Beginner), emphasize effort over exact pace
   - Include perceived exertion guidance: "Should feel comfortable, able to hold conversation"
   - For tempo/intervals, include structure: "Tempo: 2km warmup, 6km at 5:30-5:45 min/km, 2km cooldown"
   
   - Hills: maintain effort (not pace) on inclines for Rolling/Hilly.
   - Intensity labeling rules:
     • Allowed: "Rest","Recovery","Easy","Long Easy","Steady","Tempo","Intervals/VO2","Goal-pace".
     • Do not label a whole run as "Hard"; if segments are hard, use "Intervals/VO2".
     • Sanity rule: if average pace slower than Easy upper bound, intensity cannot be "Tempo" or "Intervals/VO2"; downgrade to "Easy" or "Recovery".
     • Any workout < 2.0 mi or < 3.0 km must be "Recovery" or "Easy".
12) Course Profile Impacts:
   - Flat (includes "Track"): steady pace control, smooth splits, longer goal-pace segments later.
   - Rolling Hills: effort-based pacing; gentle hill strides.
   - Hilly: dedicated hill repeats and controlled downhill; reinforce strength.
13) Demographic Adjustments (Gender, Height, Weight, BMI, Age):
   - Use BMI category labels as defined; apply caps: Healthy 6-10%, Overweight 4-8%, Obesity 2-5%.
   - Favor tempo/steady and race-pace over frequent VO2 for older athletes.
   - Include 2× weekly strength and mobility guidance.

GOAL-BASED PERSONALIZATION:
- goals: array from ["Lifestyle","Weight Loss","Endurance building","Mental health","Event training","Marathoner","Beginner fitness","Maintaining fitness","Advanced fitness","Mental toughness"].
- Apply GOAL IMPACT rules to volume, intensity mix, and structure.

DESCRIPTION REQUIREMENTS:
- Keep to 3-4 lines maximum in "description" field
- Handle missing fields gracefully:
  • If age missing/invalid: start with "[gender]" (capitalize first letter)
  • If age valid: start with "[Age]-year-old [gender]"
- Format: "[Age info], [height in feet'inches" for imperial or height in cm], [weight with unit]. BMI [value] ([category]). This [duration]-week [plan_type] plan is tailored for [running_experience] runners with [conservative/moderate/standard] progression to accommodate [BMI category] status."
- Do NOT mention goals in "description"
- BMI-based progression terms:
  • Healthy: "standard progression"
  • Overweight: "moderate progression"
  • Obesity (any class): "conservative progression"
- Examples:
  • With age: "45-year-old female, 165 cm, 65 kg. BMI 23.9 (Healthy). This 16-week half marathon plan is tailored for intermediate runners with standard progression to accommodate healthy status."
  • Without age: "Female, 5'4\", 140 lbs. BMI 24.0 (Healthy). This 12-week marathon plan is tailored for advanced runners with standard progression to accommodate healthy status."

OUTPUT FORMAT:
{
  "success": true,
  "recommended_plan": {
    "plan_name": "Marathon (42.2 km)" | "Half Marathon (21.1 km)" | "5k" | "10k",
    "plan_type": "{plan_type}",
    "duration": {total_weeks},
    "target_distance": sum of weekly totals (nonzero),
    "description": "...",
    "why_recommended": "...",
    "weekly_plans": [
      {first_week_data},
      {
        "week_number": 2,
        "week_focus": "Base building",
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "total_weekly_distance": >= 0,
        "user_distance": 0,
        "user_time": 0,
        "workouts": [
          {
            "day": "Monday",
            "date": "YYYY-MM-DD",
            "workout_type": "Easy Run" | "Tempo Run" | "Interval Run" | "Long Run" | "Rest",
            "distance": >= 0, // distance = 0 ONLY when workout_type = "Rest" within the Rest Window
            "duration": >= 0, // duration = 0 ONLY when workout_type = "Rest" within the Rest Window
            "intensity": "Easy" | "Tempo" | "Intervals/VO2" | "Long Easy" | "Goal-pace" | "Rest",
            "user_distance": 0,
            "user_time": 0
          }
          // ... include all specific_days with unique non–long-run distances, long run 30-40% of total ON long_run_day
        ]
      }
      // ... continue for ALL remaining weeks (Week 2 through Week {total_weeks}) with progression, cutbacks, Rest policy, and anti-repetition applied
      // CRITICAL: Generate EXACTLY {total_weeks} weeks total. Do NOT stop early. The weekly_plans array must contain {total_weeks} week objects.
    ]
  },
  "has_more_weeks": false,
  "total_weeks": {total_weeks},
  "remaining_weeks": 0,
  "plan_id": "{plan_id}",
  "completed_at": "{timestamp}",
  "api_version": "6.13 - Complete Plan with First Day Safety Rule + Rest Days Window"
}
`;

const CHUNKED_PLAN_PROMPT = `
You are an expert AI running coach generating a training plan chunk for weeks {chunk_start_week} through {chunk_end_week}.

CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', or any other variations.

OBJECTIVE:
Generate weeks {chunk_start_week} through {chunk_end_week} of a complete {total_weeks}-week {plan_type} training plan. This is chunk {chunk_start_week}-{chunk_end_week} of {total_weeks} total weeks.

⚠️ CRITICAL: You MUST generate EXACTLY {chunk_size} weeks for this chunk. The weekly_plans array must contain {chunk_size} week objects (Week {chunk_start_week} through Week {chunk_end_week}). Do NOT stop early or generate fewer weeks than requested.

⚠️ EXPERIENCE LEVEL IMPACT - CRITICAL DIFFERENCES:
Experience levels MUST have visible impact throughout the plan:

• BEGINNER: Conservative progression, predominantly easy running, longer preparation
• INTERMEDIATE: Moderate progression, balanced easy/quality mix, medium preparation
• ADVANCED: Faster progression, regular quality work, shorter preparation
• ELITE: Aggressive progression, significant quality work, minimal preparation needed

⚠️ CRITICAL: Plans must show clear differences between experience levels. An Intermediate runner should progress faster and handle more volume than a Beginner with similar BMI.

ORIGINAL USER INPUT:
{original_input}

FIRST WEEK BASIC DATA (for reference):
{first_week_data}

CHUNK SPECIFICATIONS:
- Generate weeks {chunk_start_week} through {chunk_end_week} only
- Maintain consistency with previous weeks' progression
- Ensure smooth transition to next chunk
- Follow all validation rules from the complete plan generation

WEEK STRUCTURE FOR THIS CHUNK:
- Each week follows Monday-to-Sunday structure
- Include ALL days from specific_days only (no day skipping)
- **CRITICAL: ALWAYS include the long run on long_run_day**
- A Rest day must never be scheduled on the long_run_day

REST DAYS POLICY (INTELLIGENT SCHEDULING):
⚠️ CRITICAL REST DAY LOGIC - FIXED:
- If user selects X training days, they train EXACTLY X days and rest (7 - X) days.
- specific_days = days user will TRAIN (running days only)
- Rest days = 7 - (number of specific_days)
- Example: User selects 6 specific_days → They run 6 days, rest 1 day (NOT run 5 days, rest 2 days)

⚠️ CRITICAL REST DAY WINDOW RULE:
- Elite/Advanced runners: NEVER get rest days regardless of training days selected
- Beginner/Intermediate runners: ONLY get 1 rest day if they select ALL 7 days, otherwise NO rest days
- Rest days must be scheduled within the Rest Window (Monday-Friday only, never on weekends)
- If no Rest Window days are available in specific_days, then NO rest days should be scheduled

PROGRESSION RULES FOR THIS CHUNK:
- Continue progression from previous weeks
- Apply 3-up-1-down pattern with cutback weeks reducing by 10-15%
- Maintain ~30-35% of weekly distance as long run
- Ensure gradual mileage increases (max 10% per week for most runners)

TAPERING CONSIDERATIONS:
- If this chunk includes final weeks before race, apply tapering rules
- Reduce mileage by 20-30% in final 2-3 weeks
- Maintain workout frequency but reduce distance
- Prioritize recovery and freshness over volume

LONG RUN PROGRESSION:
- Continue gradual increase from previous weeks
- Apply 3-up-1-down cutback pattern
- Maintain ~30-35% of that week's total weekly distance
- Final week: MUST equal exact race distance on long_run_day

PACING & INTENSITIES (UNIT-AWARE):
- Derive goal pace from goal_race_time or estimated_race_time midpoint
- Easy Run: goal pace + 60-90 sec per unit
- Long Run: goal pace + 45-75 sec per unit  
- Tempo Run: goal pace + 20-30 sec per unit
- Intervals/VO2: goal pace - 10 to -30 sec per unit
- Recovery: goal pace + 90-120 sec per unit

COURSE PROFILE IMPACTS:
- Flat: steady pace control, smooth splits
- Rolling Hills: effort-based pacing, gentle hill strides
- Hilly: dedicated hill repeats, controlled downhill

DEMOGRAPHIC ADJUSTMENTS:
- Use BMI category labels and apply appropriate caps
- Favor tempo/steady over frequent VO2 for older athletes
- Include strength and mobility guidance as needed

OUTPUT FORMAT:
{
  "success": true,
  "recommended_plan": {
    "plan_name": "{plan_type} ({target_distance})",
    "plan_type": "{plan_type}",
    "duration": {total_weeks},
    "target_distance": sum of weekly totals,
    "description": "Weeks {chunk_start_week}-{chunk_end_week} of {total_weeks}-week {plan_type} training plan",
    "why_recommended": "Chunked generation approach for long plan to ensure complete response",
    "weekly_plans": [
      {
        "week_number": {chunk_start_week},
        "week_focus": "Base building" | "Build phase" | "Peak training" | "Taper" | "Race preparation",
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD", 
        "total_weekly_distance": >= 0,
        "user_distance": 0,
        "user_time": 0,
        "workouts": [
          {
            "day": "Monday",
            "date": "YYYY-MM-DD",
            "workout_type": "Easy Run" | "Tempo Run" | "Interval Run" | "Long Run" | "Rest",
            "distance": >= 0,
            "duration": >= 0,
            "intensity": "Easy" | "Tempo" | "Intervals/VO2" | "Long Easy" | "Goal-pace" | "Rest",
            "pace_range": "X:XX-X:XX min/km" | "X:XX-X:XX min/mi",
            "description": "...",
            "user_distance": 0,
            "user_time": 0
          }
          // ... include all specific_days with unique non–long-run distances, long run 30-40% of total ON long_run_day
        ]
      }
      // ... continue for ALL weeks in this chunk (Week {chunk_start_week} through Week {chunk_end_week})
      // CRITICAL: Generate EXACTLY {chunk_size} weeks for this chunk. Do NOT stop early.
    ]
  },
  "has_more_weeks": true,
  "total_weeks": {total_weeks},
  "remaining_weeks": {total_weeks - chunk_end_week},
  "plan_id": "{plan_id}",
  "chunk_generated": "{chunk_start_week}-{chunk_end_week}",
  "generated_at": "{timestamp}",
  "api_version": "6.14 - Chunked Plan Generation for Long Plans"
}
`;



// Helper functions

/**
 * Validate and fix workout intensity based on actual pace
 * @param {Object} workout - Workout object with distance, duration, intensity
 * @param {number} goalPaceSeconds - Goal pace in seconds per unit
 * @param {string} unit - 'km' or 'miles'
 * @returns {Object} - Fixed workout object
 */
function validateAndFixIntensity(workout, goalPaceSeconds, unit = 'miles') {
  if (!workout.distance || !workout.duration || workout.distance === 0) {
    return workout;
  }

  // CRITICAL FIX: Respect workout type - don't change Easy Run to Recovery based on pace alone
  // Only validate intensity if it's clearly wrong, not just slow
  
  // If workout type and intensity already match, don't change it
  const workoutTypeIntensityMap = {
    'Easy Run': 'Easy',
    'Recovery Run': 'Recovery',
    'Tempo Run': 'Tempo',
    'Long Run': 'Long Easy',
    'Interval Run': 'Intervals/VO2',
    'Rest': 'Rest'
  };
  
  const expectedIntensity = workoutTypeIntensityMap[workout.workout_type];
  if (expectedIntensity && workout.intensity !== expectedIntensity) {
    console.log(`Fixed intensity based on workout type: ${workout.workout_type} ${workout.distance} ${unit}: ${workout.intensity} → ${expectedIntensity}`);
    workout.intensity = expectedIntensity;
    return workout;
  }

  // Only do pace-based validation if goal pace is reasonable (not impossibly fast)
  if (goalPaceSeconds < 180) { // Less than 3 minutes per unit is unrealistic
    console.log(`Skipping pace-based intensity validation - goal pace too fast: ${goalPaceSeconds}s per ${unit}`);
    return workout;
  }

  // Calculate actual pace in seconds per unit
  const actualPaceSeconds = (workout.duration * 60) / workout.distance;
  const paceDiffSeconds = actualPaceSeconds - goalPaceSeconds;

  // Define pace zones (relative to goal pace)
  let correctIntensity = workout.intensity;

  if (paceDiffSeconds > 90) {
    // Slower than goal pace + 90 sec = Recovery or Easy
    // CRITICAL FIX: Don't downgrade Easy Runs to Recovery just because they're slow
    if (workout.workout_type === 'Easy Run') {
      correctIntensity = 'Easy';
    } else {
      correctIntensity = workout.distance < (unit === 'km' ? 5 : 3) ? 'Recovery' : 'Easy';
    }
  } else if (paceDiffSeconds > 60) {
    // goal pace + 60-90 sec = Easy
    correctIntensity = 'Easy';
  } else if (paceDiffSeconds > 30) {
    // goal pace + 30-60 sec = Easy or Tempo
    correctIntensity = workout.intensity === 'Tempo' ? 'Tempo' : 'Easy';
  } else if (paceDiffSeconds > 15) {
    // goal pace + 15-30 sec = Threshold or Goal Pace
    correctIntensity = ['Threshold', 'Goal Pace'].includes(workout.intensity) ? workout.intensity : 'Tempo';
  } else if (paceDiffSeconds >= -5) {
    // At goal pace = Goal Pace
    correctIntensity = 'Goal Pace';
  } else {
    // Faster than goal pace = Intervals or VO2max
    correctIntensity = ['Intervals', 'VO2max'].includes(workout.intensity) ? workout.intensity : 'Threshold';
  }

  // Special rules
  const minDistanceForHard = unit === 'km' ? 3.0 : 2.0;
  if (workout.distance < minDistanceForHard && !['Recovery', 'Easy'].includes(correctIntensity)) {
    correctIntensity = 'Easy';
  }

  // Fix long runs
  const longRunDistance = unit === 'km' ? 15 : 10;
  if (workout.distance >= longRunDistance && workout.workout_type === 'Long Run') {
    correctIntensity = 'Long Easy';
  }

  // Ban "Hard" label
  if (workout.intensity === 'Hard') {
    correctIntensity = 'Tempo';
  }

  // Update intensity if changed
  if (workout.intensity !== correctIntensity) {
    console.log(`Fixed intensity: ${workout.workout_type} ${workout.distance} ${unit} in ${workout.duration} min: ${workout.intensity} → ${correctIntensity}`);
    workout.intensity = correctIntensity;
  }

  return workout;
}

/**
 * Convert time string to seconds per unit
 * @param {string} timeStr - Time in format "h:mm:ss" or "mm:ss"
 * @param {number} distance - Distance for the time
 * @returns {number} - Seconds per unit
 */
function parseGoalPace(timeStr, distance) {
  if (!timeStr) return 0;

  const parts = timeStr.split(':').map(p => parseInt(p));
  let totalSeconds = 0;

  if (parts.length === 3) {
    // h:mm:ss
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // mm:ss
    totalSeconds = parts[0] * 60 + parts[1];
  }

  return distance > 0 ? totalSeconds / distance : 0;
}

/**
 * Parse pace string like "5:42 min/km" to seconds per unit
 * @param {string} paceStr - Pace string like "5:42 min/km"
 * @returns {number} - Seconds per unit
 */
function parsePaceStringToSeconds(paceStr) {
  if (!paceStr) return 0;
  
  // Extract the time part (e.g., "5:42" from "5:42 min/km")
  const timeMatch = paceStr.match(/(\d+):(\d+)/);
  if (!timeMatch) return 0;
  
  const minutes = parseInt(timeMatch[1]);
  const seconds = parseInt(timeMatch[2]);
  
  return minutes * 60 + seconds;
}

/**
 * Round distance to appropriate increment based on unit
 * @param {number} distance - Distance to round
 * @param {string} unit - 'km' or 'miles'
 * @returns {number} - Rounded distance
 */
function roundDistance(distance, unit = 'km') {
  if (unit === 'miles') {
    // Round miles to nearest 0.5 for visual clarity (5.282 → 5.5)
    return Math.round(distance * 2) / 2;
  } else {
    // Round km to nearest 0.5 for consistency
    return Math.round(distance * 2) / 2;
  }
}

/**
 * Get maximum long run distance based on experience and plan type
 * @param {string} experience - Runner experience level
 * @param {string} planType - Plan type (marathon, half_marathon, etc.)
 * @param {string} unit - 'km' or 'miles'
 * @returns {number} - Maximum long run distance
 */
function getMaxLongRunDistance(experience, planType, unit = 'km') {
  const caps = {
    marathon: {
      Beginner: unit === 'km' ? 30 : 18,
      Intermediate: unit === 'km' ? 32 : 20,
      Advanced: unit === 'km' ? 34 : 21,
      Elite: unit === 'km' ? 36 : 22
    },
    half_marathon: {
      Beginner: unit === 'km' ? 18 : 11,
      Intermediate: unit === 'km' ? 20 : 12,
      Advanced: unit === 'km' ? 22 : 13,
      Elite: unit === 'km' ? 24 : 15
    },
    '10k': {
      Beginner: unit === 'km' ? 12 : 7.5,
      Intermediate: unit === 'km' ? 14 : 8.5,
      Advanced: unit === 'km' ? 16 : 10,
      Elite: unit === 'km' ? 18 : 11
    },
    '5k': {
      Beginner: unit === 'km' ? 8 : 5,
      Intermediate: unit === 'km' ? 10 : 6,
      Advanced: unit === 'km' ? 12 : 7.5,
      Elite: unit === 'km' ? 14 : 8.5
    }
  };

  return caps[planType]?.[experience] || (unit === 'km' ? 32 : 20);
}

/**
 * Enforce rest day requirements based on experience level
 * @param {Object} planJson - Complete plan JSON
 * @param {string} experience - Runner experience level
 * @param {Array} specificDays - Array of specific training days
 * @param {string} longRunDay - Designated long run day
 * @returns {Object} - Fixed plan JSON
 */
function enforceRestDayRequirements(planJson, experience, specificDays, longRunDay) {
  if (!planJson.weekly_plans || !experience || !specificDays) {
    return planJson;
  }

  console.log('🛌 Enforcing rest day requirements...');
  console.log(`   Experience: ${experience}`);
  console.log(`   Training days selected: ${specificDays.length} (${specificDays.join(', ')})`);

  const restRequirements = determineRestDayRequirements(experience, specificDays.length);
  
  if (restRequirements.required_rest_days === 0) {
    console.log(`   ✅ No rest days required for ${experience} runners`);
    return planJson;
  }

  console.log(`   Required rest days: ${restRequirements.required_rest_days}`);

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    // Count current rest days
    const currentRestDays = week.workouts.filter(w => w.workout_type === 'Rest').length;
    const neededRestDays = restRequirements.required_rest_days - currentRestDays;

    if (neededRestDays <= 0) {
      console.log(`   Week ${week.week_number}: Already has ${currentRestDays} rest day(s) ✅`);
      continue;
    }

    console.log(`   Week ${week.week_number}: Needs ${neededRestDays} more rest day(s)`);

    // Find the day after long run day (to protect recovery run)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const longRunDayIndex = dayNames.indexOf(longRunDay);
    const nextDayAfterLongRun = longRunDayIndex !== -1 ? dayNames[(longRunDayIndex + 1) % 7] : null;

    // Find the first workout day (chronologically first day with a workout)
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const workoutDays = week.workouts.filter(w => w.workout_type !== 'Rest').map(w => w.day);
    const firstWorkoutDay = dayOrder.find(day => workoutDays.includes(day));

    // Find candidates for conversion to rest days (avoid critical days)
    const candidates = week.workouts.filter(w => 
      w.workout_type !== 'Rest' && 
      w.workout_type !== 'Long Run' && 
      w.day !== longRunDay &&
      w.day !== nextDayAfterLongRun && // Protect the day after long run (for recovery run)
      w.day !== firstWorkoutDay && // CRITICAL: Never convert the first workout day to rest
      !(w.workout_type === 'Recovery Run' && w.day === nextDayAfterLongRun) // Extra protection for recovery runs
    );

    console.log(`     Protected days: Long Run (${longRunDay}), Recovery (${nextDayAfterLongRun}), First Workout (${firstWorkoutDay})`);

    // Sort candidates by distance (convert shortest runs first)
    candidates.sort((a, b) => (a.distance || 0) - (b.distance || 0));

    let converted = 0;
    for (const candidate of candidates) {
      if (converted >= neededRestDays) break;

      console.log(`     Converting ${candidate.day} from ${candidate.workout_type} (${candidate.distance}km) to Rest`);
      
      candidate.workout_type = 'Rest';
      candidate.distance = 0;
      candidate.duration = 0;
      candidate.intensity = 'Rest';
      candidate.pace_range = '';
      candidate.description = 'Rest day for recovery and adaptation. Focus on hydration, nutrition, and light stretching.';
      
      converted++;
    }

    if (converted > 0) {
      // Recalculate weekly total (excluding rest days)
      week.total_weekly_distance = week.workouts
        .filter(w => w.workout_type !== 'Rest')
        .reduce((sum, w) => sum + (w.distance || 0), 0);
      
      console.log(`     ✅ Converted ${converted} workout(s) to rest days`);
      console.log(`     New weekly total: ${week.total_weekly_distance}km`);
    }
  }

  return planJson;
}

/**
 * Validate and fix AI-generated plan to ensure it follows all rules
 * @param {Object} planJson - Plan JSON from AI
 * @param {Object} userInput - Original user input
 * @param {string} unit - Measurement unit
 * @returns {Object} - Fixed plan JSON
 */
function validateAndFixAIPlan(planJson, userInput, unit = 'km') {
  if (!planJson.weekly_plans || planJson.weekly_plans.length === 0) {
    return planJson;
  }

  console.log('🔍 Validating AI-generated plan...');
  
  const specificDaysArray = userInput.specific_days ? 
    userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
  const longRunDay = userInput.long_run_day;
  
  for (const week of planJson.weekly_plans) {
    if (!week.workouts) continue;
    
    // 1. Remove days that are NOT in specific_days (AI sometimes adds extra days)
    const originalWorkouts = [...week.workouts];
    week.workouts = week.workouts.filter(w => specificDaysArray.includes(w.day));
    const removedDays = originalWorkouts.filter(w => !specificDaysArray.includes(w.day)).map(w => w.day);
    
    if (removedDays.length > 0) {
      console.warn(`   Week ${week.week_number}: Removed extra days not in specific_days: ${removedDays.join(', ')}`);
    }
    
    // 2. Check if all specific_days are included and add missing days if needed
    const workoutDays = week.workouts.map(w => w.day);
    const missingDays = specificDaysArray.filter(day => !workoutDays.includes(day));
    
    if (missingDays.length > 0) {
      console.warn(`   Week ${week.week_number}: Missing days: ${missingDays.join(', ')} - Adding them now`);
      
      // Add missing days as Easy Runs
      for (const missingDay of missingDays) {
        console.warn(`     Adding missing day: ${missingDay} as Easy Run`);
        
        // Calculate date for missing day
        const weekStartDate = new Date(week.start_date);
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayIndex = dayNames.indexOf(missingDay);
        const workoutDate = new Date(weekStartDate);
        workoutDate.setDate(weekStartDate.getDate() + dayIndex);
        
        const newWorkout = {
          day: missingDay,
          date: workoutDate.toISOString().split('T')[0],
          workout_type: 'Easy Run',
          distance: unit === 'km' ? 3 : 2,
          duration: unit === 'km' ? 20 : 15,
          intensity: 'Easy',
          pace_range: unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi",
          description: "Easy conversational run. Should feel comfortable and sustainable.",
          user_distance: 0,
          user_time: 0
        };
        
        week.workouts.push(newWorkout);
      }
      
      // Sort workouts by day order
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      week.workouts.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
      
      // Recalculate total weekly distance
      week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
      console.warn(`     ✅ Added ${missingDays.length} missing day(s), new total: ${week.total_weekly_distance} ${unit}`);
    }
    
    // 3. Check Long Run is on correct day (AFTER adding missing days)
    const longRuns = week.workouts.filter(w => w.workout_type === 'Long Run');
    const correctLongRun = week.workouts.find(w => w.day === longRunDay && w.workout_type === 'Long Run');
    
    if (longRuns.length > 0 && !correctLongRun) {
      console.warn(`   Week ${week.week_number}: Long Run not on ${longRunDay}, fixing...`);
      // Move Long Run to correct day
      const wrongLongRun = longRuns[0];
      const targetWorkout = week.workouts.find(w => w.day === longRunDay);
      if (targetWorkout) {
        console.warn(`     Moving Long Run from ${wrongLongRun.day} to ${targetWorkout.day}`);
        
        // Swap ALL workout properties, not just type and intensity
        const tempWorkout = {
          workout_type: wrongLongRun.workout_type,
          distance: wrongLongRun.distance,
          duration: wrongLongRun.duration,
          intensity: wrongLongRun.intensity,
          pace_range: wrongLongRun.pace_range,
          description: wrongLongRun.description
        };
        
        // Move target workout properties to wrong day
        wrongLongRun.workout_type = targetWorkout.workout_type;
        wrongLongRun.distance = targetWorkout.distance;
        wrongLongRun.duration = targetWorkout.duration;
        wrongLongRun.intensity = targetWorkout.intensity;
        wrongLongRun.pace_range = targetWorkout.pace_range;
        wrongLongRun.description = targetWorkout.description;
        
        // Move long run properties to correct day
        targetWorkout.workout_type = tempWorkout.workout_type;
        targetWorkout.distance = tempWorkout.distance;
        targetWorkout.duration = tempWorkout.duration;
        targetWorkout.intensity = tempWorkout.intensity;
        targetWorkout.pace_range = tempWorkout.pace_range;
        targetWorkout.description = tempWorkout.description;
        
        console.warn(`     ✅ Long Run moved: ${targetWorkout.day} now has ${targetWorkout.distance} ${unit} Long Run`);
      }
    }
    
    // 4. Check first day is not Rest
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const workoutDaysInOrder = specificDaysArray.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    const firstDay = workoutDaysInOrder[0];
    const firstDayWorkout = week.workouts.find(w => w.day === firstDay);
    
    if (firstDayWorkout && firstDayWorkout.workout_type === 'Rest') {
      console.warn(`   Week ${week.week_number}: First day (${firstDay}) is Rest, converting to Easy Run`);
      firstDayWorkout.workout_type = 'Easy Run';
      firstDayWorkout.intensity = 'Easy';
      firstDayWorkout.distance = 2;
      firstDayWorkout.duration = 15;
      firstDayWorkout.pace_range = unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi";
      firstDayWorkout.description = "Easy conversational run. Should feel comfortable and sustainable.";
    }
    
    // 5. CRITICAL FIX: Check first day is not Recovery Run
    if (firstDayWorkout && firstDayWorkout.workout_type === 'Recovery Run') {
      console.warn(`   Week ${week.week_number}: First day (${firstDay}) is Recovery Run, converting to Easy Run`);
      firstDayWorkout.workout_type = 'Easy Run';
      firstDayWorkout.intensity = 'Easy';
      // Keep the same distance but adjust pace and description for Easy Run
      firstDayWorkout.pace_range = unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi";
      firstDayWorkout.description = "Easy conversational run. Should feel comfortable and sustainable.";
      
      // Recalculate duration for easy pace (slightly faster than recovery pace)
      const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
      firstDayWorkout.duration = Math.ceil(firstDayWorkout.distance * easyPaceMinutes);
    }
    
    // 6. CRITICAL: Enforce rest day rules for Advanced/Elite users
    const experience = userInput.experience || userInput.running_experience || 'Beginner';
    if (experience === 'Advanced' || experience === 'Elite') {
      const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
      if (restWorkouts.length > 0) {
        console.warn(`   Week ${week.week_number}: ${experience} user has ${restWorkouts.length} rest day(s), converting to Easy Runs`);
        for (const restWorkout of restWorkouts) {
          console.warn(`     Converting: ${restWorkout.day} Rest → Easy Run`);
          restWorkout.workout_type = 'Easy Run';
          restWorkout.intensity = 'Easy';
          restWorkout.distance = unit === 'km' ? 3 : 2;
          restWorkout.duration = unit === 'km' ? 20 : 15;
          restWorkout.pace_range = unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi";
          restWorkout.description = "Easy conversational run. Should feel comfortable and sustainable.";
        }
      }
    }
  }
  
  console.log('✅ AI plan validation complete');
  return planJson;
}

/**
 * Enforce single recovery run rule - only one recovery run per week (after long run)
 * @param {Object} planJson - Complete plan JSON
 * @param {string} longRunDay - Designated long run day
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function enforceSingleRecoveryRunRule(planJson, longRunDay, unit = 'km') {
  if (!planJson.weekly_plans || !longRunDay) {
    return planJson;
  }

  console.log('🔄 Enforcing single recovery run rule...');
  console.log(`   Long run day: ${longRunDay}`);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const longRunDayIndex = dayNames.indexOf(longRunDay);
  const nextDayAfterLongRun = longRunDayIndex !== -1 ? dayNames[(longRunDayIndex + 1) % 7] : null;

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    // Find all recovery runs in this week
    const recoveryRuns = week.workouts.filter(w => w.workout_type === 'Recovery Run');
    
    if (recoveryRuns.length <= 1) {
      console.log(`   Week ${week.week_number}: Has ${recoveryRuns.length} recovery run(s) ✅`);
      continue;
    }

    console.log(`   Week ${week.week_number}: Found ${recoveryRuns.length} recovery runs, converting extras to Easy Runs`);

    // Keep only the recovery run that's after the long run day
    let keptRecoveryRun = null;
    let convertedCount = 0;

    for (const workout of recoveryRuns) {
      if (workout.day === nextDayAfterLongRun && !keptRecoveryRun) {
        // Keep this one - it's the day after long run
        keptRecoveryRun = workout;
        console.log(`     Keeping: ${workout.day} Recovery Run (${workout.distance} ${unit}) - after long run`);
      } else {
        // Convert this one to Easy Run
        console.log(`     Converting: ${workout.day} Recovery Run (${workout.distance} ${unit}) → Easy Run`);
        
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
        
        // Recalculate duration for easy pace
        const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * easyPaceMinutes);
        
        convertedCount++;
      }
    }

    if (convertedCount > 0) {
      console.log(`     ✅ Converted ${convertedCount} extra recovery run(s) to Easy Runs`);
    }
  }

  return planJson;
}

/**
 * Add recovery runs after long runs
 * @param {Object} planJson - Complete plan JSON
 * @param {string} longRunDay - Designated long run day
 * @param {Array} specificDays - Array of specific training days
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function addRecoveryRunsAfterLongRuns(planJson, longRunDay, specificDays, unit = 'km') {
  if (!planJson.weekly_plans || !longRunDay || !specificDays) {
    return planJson;
  }

  console.log('🏃‍♂️ Adding recovery runs after long runs...');
  console.log(`   Long run day: ${longRunDay}`);
  console.log(`   Specific days: ${specificDays.join(', ')}`);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const longRunDayIndex = dayNames.indexOf(longRunDay);
  
  if (longRunDayIndex === -1) {
    console.warn(`   ⚠️ Invalid long run day: ${longRunDay}`);
    return planJson;
  }

  // Find the next day after long run day
  const nextDayIndex = (longRunDayIndex + 1) % 7;
  const nextDay = dayNames[nextDayIndex];

  console.log(`   Next day after long run: ${nextDay}`);

  // Check if the next day is in specific_days
  if (!specificDays.includes(nextDay)) {
    console.log(`   ⚠️ ${nextDay} is not in specific_days, cannot add recovery run`);
    return planJson;
  }

  // Determine the first workout day to prevent converting it to Recovery Run
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const workoutDaysInOrder = specificDays.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  const firstWorkoutDay = workoutDaysInOrder[0];

  console.log(`   First workout day: ${firstWorkoutDay}`);

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    // Find the long run in this week
    const longRunWorkout = week.workouts.find(w => w.day === longRunDay && w.workout_type === 'Long Run');
    if (!longRunWorkout) {
      continue; // No long run in this week
    }

    // Find the workout on the next day
    const nextDayWorkout = week.workouts.find(w => w.day === nextDay);
    if (!nextDayWorkout) {
      console.log(`   Week ${week.week_number}: No workout found on ${nextDay}`);
      continue;
    }

    // CRITICAL FIX: Never convert the first workout day to Recovery Run
    if (nextDay === firstWorkoutDay) {
      console.log(`   Week ${week.week_number}: ${nextDay} is the first workout day, keeping as ${nextDayWorkout.workout_type} (not converting to Recovery Run)`);
      continue;
    }

    // Check if it's already a recovery run
    if (nextDayWorkout.workout_type === 'Recovery Run') {
      console.log(`   Week ${week.week_number}: ${nextDay} is already a Recovery Run ✅`);
      
      // Still adjust the distance to be appropriate for recovery (40% of long run)
      const longRunDistance = longRunWorkout.distance || 0;
      const recoveryDistance = Math.max(1.0, Math.round((longRunDistance * 0.4) * 2) / 2);
      
      if (nextDayWorkout.distance !== recoveryDistance) {
        console.log(`     Adjusting recovery distance: ${nextDayWorkout.distance} → ${recoveryDistance} ${unit}`);
        nextDayWorkout.distance = recoveryDistance;
        
        // Recalculate duration
        const recoveryPaceMinutes = unit === 'km' ? 7.0 : 11.0;
        nextDayWorkout.duration = Math.ceil(recoveryDistance * recoveryPaceMinutes);
      }
      continue;
    }

    // Skip if it's a rest day
    if (nextDayWorkout.workout_type === 'Rest') {
      console.log(`   Week ${week.week_number}: ${nextDay} is a Rest day, keeping as is`);
      continue;
    }

    // Convert to recovery run
    const longRunDistance = longRunWorkout.distance || 0;
    // Recovery run should be 40-50% of long run distance, with minimum 2km for meaningful recovery
    let recoveryDistance = Math.max(longRunDistance * 0.45, 2.0); // 45% of long run, minimum 2km
    recoveryDistance = Math.round(recoveryDistance * 2) / 2; // Round to nearest 0.5

    console.log(`   Week ${week.week_number}: Converting ${nextDay} from ${nextDayWorkout.workout_type} to Recovery Run`);
    console.log(`     Long run: ${longRunDistance} ${unit} → Recovery: ${recoveryDistance} ${unit}`);

    nextDayWorkout.workout_type = 'Recovery Run';
    nextDayWorkout.distance = recoveryDistance;
    nextDayWorkout.intensity = 'Recovery';
    nextDayWorkout.pace_range = unit === 'km' ? '6:45-7:15 min/km' : '10:45-11:30 min/mi';
    nextDayWorkout.description = `Recovery run after long run. Very easy pace to promote active recovery and circulation.`;
    
    // Recalculate duration (assume 7 min/km or 11 min/mile for recovery pace)
    const recoveryPaceMinutes = unit === 'km' ? 7.0 : 11.0;
    nextDayWorkout.duration = Math.ceil(recoveryDistance * recoveryPaceMinutes);
  }

  return planJson;
}

/**
 * Fix first day recovery run issue - ensure first workout day is never a recovery run
 * and recovery runs only appear after long runs
 * @param {Object} planJson - Complete plan JSON
 * @param {string} startDate - Start date ISO string
 * @param {string} specificDays - Comma-separated specific days
 * @param {string} longRunDay - Designated long run day
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function fixFirstDayRecoveryRunIssue(planJson, startDate, specificDays, longRunDay, unit = 'km') {
  if (!planJson.weekly_plans || planJson.weekly_plans.length === 0) {
    return planJson;
  }

  const week1 = planJson.weekly_plans[0];
  if (!week1.workouts || week1.workouts.length === 0) {
    return planJson;
  }

  console.log('🔧 Fixing first day recovery run issue...');
  console.log(`   Input: startDate=${startDate}, specificDays=${specificDays}, longRunDay=${longRunDay}`);

  // Determine first workout day
  const startDt = new Date(startDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const specificList = specificDays.split(',').map(d => d.trim());
  
  let firstWorkoutDay = null;
  const currentHour = startDt.getUTCHours();
  const currentDayName = dayNames[startDt.getUTCDay()];
  
  // Apply AM/PM logic to find first workout day
  if (currentHour < 12 && specificList.includes(currentDayName)) {
    firstWorkoutDay = currentDayName;
  } else {
    // Find next available day
    for (let i = 1; i <= 7; i++) {
      const nextDay = new Date(startDt);
      nextDay.setUTCDate(startDt.getUTCDate() + i);
      const nextDayName = dayNames[nextDay.getUTCDay()];
      
      if (specificList.includes(nextDayName)) {
        firstWorkoutDay = nextDayName;
        break;
      }
    }
  }

  console.log(`   First workout day: ${firstWorkoutDay}`);
  console.log(`   Long run day: ${longRunDay}`);

  // Find first workout day workout
  const firstDayWorkout = week1.workouts.find(w => w.day === firstWorkoutDay);
  
  // CRITICAL FIX 1: First day should never be Recovery Run or Rest
  if (firstDayWorkout && (firstDayWorkout.workout_type === 'Recovery Run' || firstDayWorkout.workout_type === 'Rest')) {
    console.log(`   ❌ FIXING: First day (${firstWorkoutDay}) is ${firstDayWorkout.workout_type} → converting to Easy Run`);
    
    firstDayWorkout.workout_type = 'Easy Run';
    firstDayWorkout.intensity = 'Easy';
    firstDayWorkout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
    firstDayWorkout.description = 'Easy conversational run to start the week. Should feel comfortable and sustainable.';
    
    // Set appropriate distance if it was 0 (from Rest day)
    if (firstDayWorkout.distance === 0) {
      firstDayWorkout.distance = unit === 'km' ? 1.0 : 0.6; // Minimum distance
    }
    
    // Recalculate duration for easy pace
    const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
    firstDayWorkout.duration = Math.ceil(firstDayWorkout.distance * avgPaceMinutes);
  }

  // CRITICAL FIX 2: Remove any Recovery Runs that don't follow Long Runs
  const longRunWorkout = week1.workouts.find(w => w.workout_type === 'Long Run');
  
  if (!longRunWorkout) {
    // No Long Run in Week 1 - remove ALL Recovery Runs
    console.log(`   ❌ No Long Run found in Week 1 - removing all Recovery Runs`);
    
    for (const workout of week1.workouts) {
      if (workout.workout_type === 'Recovery Run') {
        console.log(`     Converting ${workout.day} Recovery Run → Easy Run`);
        
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
        
        // Recalculate duration for easy pace
        const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
      }
    }
  } else {
    // Long Run exists - only allow Recovery Run the day after Long Run
    const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const longRunDayIndex = dayOrder.indexOf(longRunDay);
    const nextDayIndex = (longRunDayIndex + 1) % 7;
    const allowedRecoveryDay = dayOrder[nextDayIndex];
    
    console.log(`   Long Run on ${longRunDay} → Recovery Run allowed only on ${allowedRecoveryDay}`);
    
    for (const workout of week1.workouts) {
      if (workout.workout_type === 'Recovery Run' && workout.day !== allowedRecoveryDay) {
        console.log(`     Converting ${workout.day} Recovery Run → Easy Run (not after Long Run)`);
        
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
        
        // Recalculate duration for easy pace
        const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
      }
    }
  }

  console.log('✅ First day recovery run issue fixed');
  return planJson;
}

/**
 * Enforce first workout day safety rule
 * @param {Object} planJson - Complete plan JSON
 * @param {string} startDate - Start date ISO string
 * @param {string} specificDays - Comma-separated specific days
 * @param {string} longRunDay - Designated long run day
 * @param {string} experience - Runner experience level
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function enforceFirstWorkoutDaySafetyRule(planJson, startDate, specificDays, longRunDay, experience, unit = 'km') {
  if (!planJson.weekly_plans || planJson.weekly_plans.length === 0) {
    return planJson;
  }

  const week1 = planJson.weekly_plans[0];
  if (!week1.workouts || week1.workouts.length === 0) {
    return planJson;
  }

  // Determine first workout day
  const startDt = new Date(startDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const specificList = specificDays.split(',').map(d => d.trim());
  
  let firstWorkoutDay = null;
  const currentHour = startDt.getUTCHours();
  const currentDayName = dayNames[startDt.getUTCDay()];
  
  // Apply AM/PM logic to find first workout day
  if (currentHour < 12 && specificList.includes(currentDayName)) {
    firstWorkoutDay = currentDayName;
  } else {
    // Find next available day
    for (let i = 1; i <= 7; i++) {
      const nextDay = new Date(startDt);
      nextDay.setUTCDate(startDt.getUTCDate() + i);
      const nextDayName = dayNames[nextDay.getUTCDay()];
      
      if (specificList.includes(nextDayName)) {
        firstWorkoutDay = nextDayName;
        break;
      }
    }
  }

  console.log(`🛡️ First Workout Day Safety Check: firstWorkoutDay=${firstWorkoutDay}, longRunDay=${longRunDay}`);

  // Check if first workout day equals long run day
  if (firstWorkoutDay === longRunDay) {
    console.log(`⚠️ SAFETY RULE TRIGGERED: First workout day (${firstWorkoutDay}) equals long run day (${longRunDay})`);
    
    // Find the workout on the long run day
    const longRunDayWorkout = week1.workouts.find(w => w.day === longRunDay);
    
    if (longRunDayWorkout) {
      // Determine distance limits based on experience
      let maxLongRunDistance;
      if (experience === 'Beginner' || experience === 'Intermediate') {
        maxLongRunDistance = unit === 'km' ? 3.0 : 1.9; // 3km or ~1.9 miles
      } else if (experience === 'Advanced') {
        maxLongRunDistance = unit === 'km' ? 4.0 : 2.5; // 4km or ~2.5 miles
      } else { // Elite
        maxLongRunDistance = unit === 'km' ? 5.0 : 3.1; // 5km or ~3.1 miles
      }

      const originalDistance = longRunDayWorkout.distance;
      
      // Keep as Long Run but enforce distance limit
      longRunDayWorkout.workout_type = 'Long Run';
      longRunDayWorkout.intensity = 'Long Easy';
      
      // Enforce distance limit for long run
      if (longRunDayWorkout.distance > maxLongRunDistance) {
        longRunDayWorkout.distance = maxLongRunDistance;
        // Recalculate duration (assume 7 min/km or 11 min/mile pace for long run)
        const avgPaceMinutes = unit === 'km' ? 7.0 : 11.0;
        longRunDayWorkout.duration = Math.ceil(longRunDayWorkout.distance * avgPaceMinutes);
      }
      
      // CRITICAL: Ensure all other workouts are shorter than the long run
      const longRunDistance = longRunDayWorkout.distance;
      const maxOtherDistance = longRunDistance - (unit === 'km' ? 0.5 : 0.3); // At least 0.5km/0.3mi shorter
      
      for (const workout of week1.workouts) {
        if (workout.day !== longRunDay && workout.distance >= longRunDistance) {
          const originalOtherDistance = workout.distance;
          workout.distance = Math.max(maxOtherDistance, unit === 'km' ? 1.0 : 0.6); // Minimum distance
          
          // Recalculate duration
          const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
          
          console.log(`   📏 Adjusted ${workout.day}: ${originalOtherDistance}${unit} → ${workout.distance}${unit} (must be < long run)`);
        }
      }
      
      console.log(`✅ SAFETY RULE APPLIED: ${longRunDay} kept as Long Run (${originalDistance}${unit} → ${longRunDayWorkout.distance}${unit})`);
      
      // Update description for safety-adjusted long run
      longRunDayWorkout.description = `Long run with safety distance limit for first workout. Maintain conversational pace throughout.`;
      
      // Recalculate weekly total
      week1.total_weekly_distance = week1.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    }
  }

  return planJson;
}

/**
 * Calculate BMI from height and weight
 * @param {number} height - Height in inches or cm
 * @param {number} weight - Weight in lbs or kg
 * @returns {number} - BMI value
 */
function calculateBMI(height, weight) {
  if (!height || !weight) return 22; // Default to healthy BMI if missing
  
  // Assume height in inches if < 100, otherwise cm
  const heightInMeters = height < 100 ? (height * 0.0254) : (height / 100);
  // Assume weight in kg if < 200, otherwise lbs
  const weightInKg = weight < 200 ? weight : (weight * 0.453592);
  return weightInKg / (heightInMeters * heightInMeters);
}

/**
 * Get BMI category from BMI value
 * @param {number} bmi - BMI value
 * @returns {string} - BMI category
 */
function getBMICategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy';
  if (bmi < 30) return 'Overweight';
  if (bmi < 35) return 'Obesity class 1';
  if (bmi < 40) return 'Obesity class 2';
  return 'Obesity class 3';
}

/**
 * Calculate expected plan duration based on experience and BMI
 * @param {string} experience - Running experience level
 * @param {number} minWeeks - Minimum weeks
 * @param {number} maxWeeks - Maximum weeks
 * @param {number} height - Height (for BMI calculation)
 * @param {number} weight - Weight (for BMI calculation)
 * @param {string} weeklyMileage - Weekly mileage from user input
 * @returns {number} - Expected duration in weeks
 */
function calculateExpectedDuration(experience, minWeeks, maxWeeks, height, weight, weeklyMileage = '0') {
  let duration;
  
  // Calculate BMI if height and weight provided
  let bmiCategory = 'Healthy';
  if (height && weight) {
    const bmi = calculateBMI(height, weight);
    bmiCategory = getBMICategory(bmi);
  }
  
  // CRITICAL FIX: Normalize experience level and handle common typos
  let normalizedExperience = experience.toLowerCase();
  if (normalizedExperience === 'advance') {
    normalizedExperience = 'advanced'; // Fix missing 'd'
  }
  
  // CRITICAL FIX: Parse weekly mileage correctly
  const weeklyMileageStr = String(weeklyMileage).replace(/[^\d.-]/g, ''); // Extract numeric value
  const weeklyMileageNum = parseFloat(weeklyMileageStr) || 0;
  const isHighMileageRunner = weeklyMileageNum > 100; // 100+ km per week or 60+ miles per week
  
  console.log(`Duration calculation: experience=${normalizedExperience}, weeklyMileage=${weeklyMileageNum}, isHighMileage=${isHighMileageRunner}`);
  
  // Base duration on experience level
  switch (normalizedExperience) {
    case 'beginner':
      duration = maxWeeks; // Beginners get MAXIMUM weeks
      if (bmiCategory.includes('Obesity')) {
        duration = Math.min(maxWeeks + 1, maxWeeks);
      }
      break;
    case 'intermediate':
      duration = Math.round((minWeeks + maxWeeks) / 2);
      if (bmiCategory === 'Overweight') duration += 1;
      if (bmiCategory.includes('Obesity')) duration += 1;
      break;
    case 'advanced':
      // CRITICAL FIX: Advanced runners with high mileage base need longer plans
      if (isHighMileageRunner) {
        duration = Math.round((minWeeks + maxWeeks) * 0.7); // 70% of range for high-mileage advanced
      } else {
        duration = Math.max(minWeeks + 2, Math.round((minWeeks + maxWeeks) * 0.4)); // At least minWeeks + 2
      }
      if (bmiCategory.includes('Obesity')) duration += 1;
      break;
    case 'elite':
      // CRITICAL FIX: Elite runners also need adequate time for proper build-up
      if (isHighMileageRunner) {
        duration = Math.round((minWeeks + maxWeeks) * 0.6); // 60% of range for high-mileage elite
      } else {
        duration = Math.max(minWeeks + 1, Math.round((minWeeks + maxWeeks) * 0.3));
      }
      break;
    default:
      console.warn(`⚠️ Unrecognized experience level in duration calculation: "${experience}" (normalized: "${normalizedExperience}"). Defaulting to intermediate.`);
      duration = Math.round((minWeeks + maxWeeks) / 2); // Default to intermediate
  }
  
  // CRITICAL FIX: Ensure minimum reasonable duration for marathon training
  const minimumMarathonWeeks = 8; // Absolute minimum for marathon
  duration = Math.max(duration, minimumMarathonWeeks);
  
  // CRITICAL FIX: Strictly respect user's min/max bounds - never exceed maxWeeks
  const finalDuration = Math.min(Math.max(duration, minWeeks), maxWeeks);
  
  console.log(`Final duration calculation: ${finalDuration} weeks (original: ${duration}, min: ${minWeeks}, max: ${maxWeeks})`);
  return finalDuration;
}

/**
 * Round all distances in the plan to nearest 0.5 units
 * @param {Object} planJson - Complete plan JSON
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Plan with rounded distances
 */
function roundAllDistances(planJson, unit = 'km') {
  if (!planJson.weekly_plans) {
    return planJson;
  }

  console.log(`🔧 Rounding all distances to nearest 0.5 ${unit}...`);

  for (const week of planJson.weekly_plans) {
    if (!week.workouts) continue;

    for (const workout of week.workouts) {
      if (workout.distance && workout.distance > 0) {
        const originalDistance = workout.distance;
        workout.distance = roundDistance(workout.distance, unit);
        
        if (originalDistance !== workout.distance) {
          console.log(`   Week ${week.week_number} ${workout.day}: ${originalDistance} → ${workout.distance} ${unit}`);
          
          // Recalculate duration based on rounded distance
          // Assume average pace for duration calculation (6:30 min/km or 10:30 min/mi)
          const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
        }
      }
    }

    // Recalculate weekly total
    week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
  }

  // Update target_distance if it exists (Week 1 total)
  if (planJson.weekly_plans.length > 0) {
    planJson.target_distance = planJson.weekly_plans[0].total_weekly_distance;
  }

  return planJson;
}

/**
 * Fix long run day assignment to ensure long run is on the correct day
 * @param {Object} planJson - Complete plan JSON
 * @param {string} longRunDay - Designated long run day (e.g., "Friday")
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function fixLongRunDayAssignment(planJson, longRunDay, unit = 'km', userInput = null) {
  if (!planJson.weekly_plans || !longRunDay) {
    return planJson;
  }

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    // Note: We no longer skip long run assignment for Week 1 when first workout day equals long run day
    // The safety rule now keeps it as Long Run but applies distance limits

    // Find the workout on the designated long run day
    const longRunDayWorkout = week.workouts.find(w => w.day === longRunDay);
    if (!longRunDayWorkout) {
      console.warn(`⚠️  Week ${week.week_number}: No workout found on long run day (${longRunDay})`);
      continue;
    }

    // Find the workout with the longest distance
    const longestWorkout = week.workouts.reduce((longest, current) => {
      return (current.distance > longest.distance) ? current : longest;
    }, week.workouts[0]);

    // Check if the long run day workout is actually the longest
    if (longRunDayWorkout.distance < longestWorkout.distance) {
      console.log(`🔧 Week ${week.week_number}: Fixing long run day assignment`);
      console.log(`   Current: ${longRunDay} has ${longRunDayWorkout.distance} ${unit} (${longRunDayWorkout.workout_type})`);
      console.log(`   Longest: ${longestWorkout.day} has ${longestWorkout.distance} ${unit} (${longestWorkout.workout_type})`);

      // Swap the distances and workout types
      const tempDistance = longRunDayWorkout.distance;
      const tempDuration = longRunDayWorkout.duration;
      const tempWorkoutType = longRunDayWorkout.workout_type;
      const tempIntensity = longRunDayWorkout.intensity;

      longRunDayWorkout.distance = longestWorkout.distance;
      longRunDayWorkout.duration = longestWorkout.duration;
      longRunDayWorkout.workout_type = 'Long Run';
      longRunDayWorkout.intensity = 'Long Easy';
      longRunDayWorkout.description = `Long run on ${unit === 'km' ? 'Flat' : 'Flat'} course. Maintain conversational pace throughout.`;

      longestWorkout.distance = tempDistance;
      longestWorkout.duration = tempDuration;
      longestWorkout.workout_type = tempWorkoutType === 'Long Run' ? 'Easy Run' : tempWorkoutType;
      longestWorkout.intensity = tempIntensity === 'Long Easy' ? 'Easy' : tempIntensity;

      console.log(`   Fixed: ${longRunDay} now has ${longRunDayWorkout.distance} ${unit} (Long Run)`);
      console.log(`   Fixed: ${longestWorkout.day} now has ${longestWorkout.distance} ${unit} (${longestWorkout.workout_type})`);
    } else if (longRunDayWorkout.workout_type !== 'Long Run') {
      // Distance is correct but workout type is wrong
      console.log(`🔧 Week ${week.week_number}: Fixing workout type on ${longRunDay}`);
      console.log(`   Changing from "${longRunDayWorkout.workout_type}" to "Long Run"`);
      
      longRunDayWorkout.workout_type = 'Long Run';
      longRunDayWorkout.intensity = 'Long Easy';
      longRunDayWorkout.description = `Long run on ${unit === 'km' ? 'Flat' : 'Flat'} course. Maintain conversational pace throughout.`;
    }
  }

  return planJson;
}

/**
 * Validate and fix Long Run distance - ensure Long Run has the longest distance in the week
 * If a Long Run has less distance than other workouts, swap with the longest workout
 * @param {Object} planJson - Complete plan JSON
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function validateAndFixLongRunDistance(planJson, unit = 'km') {
  if (!planJson.weekly_plans) {
    return planJson;
  }

  console.log(`\n🔍 Starting Long Run distance validation (unit: ${unit})...`);

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    console.log(`\n📅 Checking Week ${week.week_number}...`);

    // Find all Long Run workouts in this week
    const longRunWorkouts = week.workouts.filter(w => w.workout_type === 'Long Run');
    
    if (longRunWorkouts.length === 0) {
      console.log(`   No Long Run found in Week ${week.week_number}`);
      continue; // No Long Run in this week
    }

    // Get all non-rest workouts with distances
    const allWorkouts = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
    
    if (allWorkouts.length <= 1) {
      console.log(`   Only ${allWorkouts.length} workout(s) in Week ${week.week_number}, skipping validation`);
      continue; // Not enough workouts to compare
    }

    console.log(`   Found ${longRunWorkouts.length} Long Run(s) and ${allWorkouts.length} total workouts`);

    // For each Long Run workout, ensure it's the longest
    for (const longRun of longRunWorkouts) {
      console.log(`   Checking Long Run on ${longRun.day}: ${longRun.distance} ${unit}`);
      
      // CRITICAL FIX: Find the absolute longest workout in the entire week (excluding Rest)
      const absoluteLongestWorkout = allWorkouts.reduce((longest, current) => {
        return (current.distance > longest.distance) ? current : longest;
      }, allWorkouts[0]);

      // Check if the Long Run is already the longest
      if (longRun.distance >= absoluteLongestWorkout.distance) {
        console.log(`   ✅ Long Run on ${longRun.day} (${longRun.distance} ${unit}) is already the longest`);
        continue; // Long Run is already the longest
      }

      console.log(`   ⚠️  PROBLEM: Long Run on ${longRun.day} has ${longRun.distance} ${unit}`);
      console.log(`      But ${absoluteLongestWorkout.day} (${absoluteLongestWorkout.workout_type}) has ${absoluteLongestWorkout.distance} ${unit}`);
      console.log(`   🔧 ENSURING Long Run gets the longest distance...`);

      // Store original values
      const originalLongRunDistance = longRun.distance;
      const originalLongRunDuration = longRun.duration;
      const originalLongRunIntensity = longRun.intensity;
      const originalLongRunPaceRange = longRun.pace_range;
      const originalLongRunDescription = longRun.description;

      const originalLongestDistance = absoluteLongestWorkout.distance;
      const originalLongestDuration = absoluteLongestWorkout.duration;
      const originalLongestIntensity = absoluteLongestWorkout.intensity;
      const originalLongestPaceRange = absoluteLongestWorkout.pace_range;
      const originalLongestDescription = absoluteLongestWorkout.description;

      // SWAP: Long Run gets the longest distance
      longRun.distance = originalLongestDistance;
      longRun.duration = originalLongestDuration;
      longRun.intensity = 'Long Easy';
      longRun.pace_range = originalLongestPaceRange || longRun.pace_range;
      longRun.description = `Long run on ${unit === 'km' ? 'Flat' : 'Flat'} course. Maintain conversational pace throughout.`;

      // Other workout gets Long Run's original distance
      absoluteLongestWorkout.distance = originalLongRunDistance;
      absoluteLongestWorkout.duration = originalLongRunDuration;
      
      // Fix intensity based on workout type
      if (absoluteLongestWorkout.workout_type === 'Easy Run') {
        absoluteLongestWorkout.intensity = 'Easy';
      } else if (absoluteLongestWorkout.workout_type === 'Recovery Run') {
        absoluteLongestWorkout.intensity = 'Recovery';
      } else if (absoluteLongestWorkout.workout_type === 'Tempo Run') {
        absoluteLongestWorkout.intensity = 'Tempo';
      } else if (absoluteLongestWorkout.workout_type === 'Interval Run') {
        absoluteLongestWorkout.intensity = originalLongRunIntensity === 'Long Easy' ? 'Intervals/VO2' : originalLongRunIntensity;
      } else {
        absoluteLongestWorkout.intensity = originalLongRunIntensity === 'Long Easy' ? 'Easy' : originalLongRunIntensity;
      }
      absoluteLongestWorkout.pace_range = originalLongRunPaceRange;
      absoluteLongestWorkout.description = originalLongestDescription;

      console.log(`   ✅ SWAPPED:`);
      console.log(`      Long Run on ${longRun.day}: ${originalLongRunDistance} → ${longRun.distance} ${unit}`);
      console.log(`      ${absoluteLongestWorkout.workout_type} on ${absoluteLongestWorkout.day}: ${originalLongestDistance} → ${absoluteLongestWorkout.distance} ${unit}`);

      // After swap, check if there are still any workouts longer than the Long Run
      // This handles cases where multiple workouts were longer
      const remainingLonger = week.workouts.filter(w => 
        w.workout_type !== 'Rest' && 
        w.workout_type !== 'Long Run' && 
        w.distance > 0 && 
        w.distance > longRun.distance
      );

      if (remainingLonger.length > 0) {
        console.log(`   ⚠️  Still ${remainingLonger.length} workout(s) longer than Long Run. Continuing to fix...`);
        // Recursively fix by finding the new longest and swapping again
        const newLongest = remainingLonger.reduce((longest, current) => {
          return (current.distance > longest.distance) ? current : longest;
        }, remainingLonger[0]);
        
        console.log(`   🔧 Additional swap needed: ${newLongest.day} (${newLongest.workout_type}) has ${newLongest.distance} ${unit}`);
        
        // Swap again
        const tempDist = longRun.distance;
        const tempDur = longRun.duration;
        
        longRun.distance = newLongest.distance;
        longRun.duration = newLongest.duration;
        
        newLongest.distance = tempDist;
        newLongest.duration = tempDur;
        
        if (newLongest.workout_type === 'Easy Run') {
          newLongest.intensity = 'Easy';
        } else if (newLongest.workout_type === 'Recovery Run') {
          newLongest.intensity = 'Recovery';
        } else if (newLongest.workout_type === 'Tempo Run') {
          newLongest.intensity = 'Tempo';
        } else if (newLongest.workout_type === 'Interval Run') {
          newLongest.intensity = 'Intervals/VO2';
        }
        
        console.log(`   ✅ Additional swap complete: Long Run now ${longRun.distance} ${unit}, ${newLongest.day} now ${newLongest.distance} ${unit}`);
      }

      // Final verification
      const finalCheck = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
      const absoluteLongest = finalCheck.reduce((longest, current) => {
        return (current.distance > longest.distance) ? current : longest;
      }, finalCheck[0]);
      
      if (absoluteLongest.workout_type === 'Long Run' && absoluteLongest.distance === longRun.distance) {
        console.log(`   ✅ VERIFIED: Long Run on ${longRun.day} is now the longest at ${longRun.distance} ${unit}`);
      } else {
        console.warn(`   ⚠️  WARNING: ${absoluteLongest.day} (${absoluteLongest.workout_type}) still has ${absoluteLongest.distance} ${unit} > Long Run ${longRun.distance} ${unit}`);
      }
    }
  }

  console.log(`\n✅ Long Run distance validation complete\n`);
  return planJson;
}

/**
 * Validate and fix workout distance/type consistency
 * Ensures that:
 * - Rest workouts have distance = 0 and duration = 0
 * - Non-rest workouts have distance > 0 and duration > 0
 * @param {Object} planJson - Complete plan JSON
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed plan JSON
 */
function validateAndFixWorkoutDistances(planJson, unit = 'km') {
  if (!planJson.weekly_plans) {
    return planJson;
  }

  console.log('🔍 Validating workout distances and types...');

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    for (const workout of week.workouts) {
      if (workout.workout_type === 'Rest') {
        // Rest workouts must have distance = 0 and duration = 0
        if (workout.distance !== 0 || workout.duration !== 0) {
          console.log(`   Week ${week.week_number}: Fixing Rest workout on ${workout.day} - setting distance and duration to 0`);
          workout.distance = 0;
          workout.duration = 0;
          workout.intensity = 'Rest';
          workout.pace_range = 'N/A';
          workout.description = 'Rest day for recovery and adaptation. Focus on hydration, nutrition, and light stretching.';
        }
      } else {
        // Non-rest workouts must have distance > 0 and duration > 0
        if (workout.distance === 0 || workout.duration === 0) {
          console.log(`   Week ${week.week_number}: Fixing ${workout.workout_type} on ${workout.day} - has distance ${workout.distance} and duration ${workout.duration}`);
          
          // Set minimum distance based on workout type
          let minDistance;
          if (workout.workout_type === 'Long Run') {
            minDistance = unit === 'km' ? 5.0 : 3.0;
          } else if (workout.workout_type === 'Recovery Run') {
            minDistance = unit === 'km' ? 2.0 : 1.2;
          } else {
            minDistance = unit === 'km' ? 3.0 : 2.0;
          }
          
          workout.distance = minDistance;
          
          // Recalculate duration based on workout type
          let avgPaceMinutes;
          if (workout.workout_type === 'Recovery Run') {
            avgPaceMinutes = unit === 'km' ? 7.0 : 11.0;
          } else if (workout.workout_type === 'Long Run') {
            avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          } else {
            avgPaceMinutes = unit === 'km' ? 6.0 : 9.5;
          }
          
          workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
          
          // Set appropriate pace range and description
          if (workout.workout_type === 'Recovery Run') {
            workout.pace_range = unit === 'km' ? '6:45-7:15 min/km' : '10:45-11:30 min/mi';
            workout.description = 'Recovery run after hard workout. Very easy pace to promote active recovery.';
          } else if (workout.workout_type === 'Long Run') {
            workout.pace_range = unit === 'km' ? '6:00-6:30 min/km' : '9:30-10:00 min/mi';
            workout.description = 'Long run at comfortable, sustainable pace. Focus on completing the distance.';
          } else {
            workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
            workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
          }
          
          console.log(`     Fixed: ${workout.workout_type} now has ${workout.distance} ${unit} and ${workout.duration} minutes`);
        }
      }
    }

    // Recalculate weekly total (excluding rest days)
    week.total_weekly_distance = week.workouts
      .filter(w => w.workout_type !== 'Rest')
      .reduce((sum, w) => sum + (w.distance || 0), 0);
  }

  console.log('✅ Workout distance validation complete');
  return planJson;
}

/**
 * Validate and fix workout type and intensity consistency
 * Ensures workout types have matching intensities:
 * - Easy Run → intensity: "Easy"
 * - Recovery Run → intensity: "Recovery"
 * - Tempo Run → intensity: "Tempo"
 * - Long Run → intensity: "Long Easy"
 * - Interval Run → intensity: "Intervals/VO2" or "Threshold"
 * @param {Object} planJson - Complete plan JSON
 * @returns {Object} - Fixed plan JSON
 */
function validateAndFixWorkoutTypeIntensity(planJson) {
  if (!planJson.weekly_plans) {
    return planJson;
  }

  // Define expected intensity for each workout type
  const workoutTypeIntensityMap = {
    'Easy Run': 'Easy',
    'Recovery Run': 'Recovery',
    'Tempo Run': 'Tempo',
    'Long Run': 'Long Easy',
    'Interval Run': 'Intervals/VO2',
    'Intervals/VO2': 'Intervals/VO2', // Handle case where AI uses this as workout_type
    'Rest': 'Rest'
  };

  for (const week of planJson.weekly_plans) {
    if (!week.workouts || week.workouts.length === 0) {
      continue;
    }

    for (const workout of week.workouts) {
      if (!workout.workout_type) {
        continue;
      }

      const expectedIntensity = workoutTypeIntensityMap[workout.workout_type];
      
      // Skip if workout type is not in our map (e.g., "Race")
      if (!expectedIntensity) {
        continue;
      }

      // Special handling for Interval workouts - can be "Intervals/VO2" or "Threshold"
      if (workout.workout_type === 'Interval Run' || workout.workout_type === 'Intervals/VO2') {
        if (workout.intensity !== 'Intervals/VO2' && 
            workout.intensity !== 'Threshold' && 
            workout.intensity !== 'Intervals') {
          console.log(`🔧 Week ${week.week_number}: Fixing ${workout.workout_type} on ${workout.day} - intensity "${workout.intensity}" → "Intervals/VO2"`);
          workout.intensity = 'Intervals/VO2';
        }
      } else if (workout.intensity !== expectedIntensity) {
        // Fix intensity for other workout types
        console.log(`🔧 Week ${week.week_number}: Fixing ${workout.workout_type} on ${workout.day} - intensity "${workout.intensity}" → "${expectedIntensity}"`);
        workout.intensity = expectedIntensity;
      }
    }
  }

  return planJson;
}

/**
 * Fix duplicate distances in a week (anti-repetition rule)
 * @param {Object} week - Week object with workouts
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Fixed week object
 */
function fixDuplicateDistances(week, unit = 'km') {
  if (!week.workouts || week.workouts.length === 0) {
    return week;
  }

  // Get non-rest workouts
  const workouts = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
  
  if (workouts.length <= 1) {
    return week; // No duplicates possible
  }

  // Count distance occurrences
  const distanceCounts = {};
  for (const workout of workouts) {
    const dist = workout.distance;
    distanceCounts[dist] = (distanceCounts[dist] || 0) + 1;
  }

  // Find duplicates
  const duplicates = Object.keys(distanceCounts).filter(d => distanceCounts[d] > 1);
  
  if (duplicates.length === 0) {
    return week; // No duplicates
  }

  console.log(`⚠️  Week ${week.week_number}: Found duplicate distances: ${duplicates.join(', ')} ${unit}`);
  console.log(`   Applying anti-repetition rule...`);

  // Fix duplicates by adjusting distances
  const increment = 0.5; // Adjust by 0.5 units
  const usedDistances = new Set();

  for (const workout of workouts) {
    let distance = workout.distance;
    
    // If this distance is already used, adjust it
    while (usedDistances.has(distance)) {
      distance += increment;
      distance = Math.round(distance * 2) / 2; // Round to nearest 0.5
    }
    
    if (distance !== workout.distance) {
      console.log(`   ${workout.day}: ${workout.distance} ${unit} → ${distance} ${unit}`);
      workout.distance = distance;
      
      // Recalculate duration (assume 6:30 min/km or 10:30 min/mi pace)
      const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
      workout.duration = Math.ceil(distance * avgPaceMinutes);
    }
    
    usedDistances.add(distance);
  }

  // Recalculate weekly total
  week.total_weekly_distance = workouts.reduce((sum, w) => sum + w.distance, 0);

  return week;
}

/**
 * Fix plan dates to match the adjusted start_date (handles AM/PM logic)
 * @param {Object} planJson - Plan JSON object
 * @param {string} adjustedStartDate - The correctly adjusted start date
 * @returns {Object} - Fixed plan JSON
 */
function fixPlanDatesFromAdjustedStartDate(planJson, adjustedStartDate) {
  if (!planJson || !adjustedStartDate) return planJson;
  
  console.log('🔧 Fixing plan dates based on adjusted start_date...');
  console.log(`   Adjusted start_date: ${adjustedStartDate}`);
  
  const weeklyPlans = planJson.weekly_plans || planJson.recommended_plan?.weekly_plans || [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (weeklyPlans.length === 0) {
    console.log('   No weekly plans found to fix');
    return planJson;
  }
  
  console.log(`   Total weeks to fix: ${weeklyPlans.length}`);
  for (let i = 0; i < weeklyPlans.length; i++) {
    console.log(`   Week ${i + 1} (index ${i}): week_number=${weeklyPlans[i].week_number}, dates=${weeklyPlans[i].start_date} to ${weeklyPlans[i].end_date}`);
  }
  
  // Parse the adjusted start date (this is the first workout day)
  const firstWorkoutDate = new Date(adjustedStartDate);
  const firstWorkoutDayName = dayNames[firstWorkoutDate.getUTCDay()];
  
  console.log(`   First workout date: ${firstWorkoutDate.toISOString().split('T')[0]} (${firstWorkoutDayName})`);
  
  // Fix Week 1 dates (keep existing logic)
  const week1 = weeklyPlans[0];
  if (week1) {
    console.log(`   Fixing Week 1 with ${week1.workouts.length} workout dates...`);
    
    const startDayOfWeek = firstWorkoutDate.getUTCDay();
    let weekStartDate;
    let weekEndDate;
    
    const startHour = firstWorkoutDate.getUTCHours();
    
    // CRITICAL FIX: For PM starts, Week 1 should end at the next Sunday, not extend beyond
    if (startHour >= 12) {
      // PM start - Week 1 starts from first workout day and ends at the next Sunday
      weekStartDate = new Date(firstWorkoutDate);
      weekEndDate = new Date(firstWorkoutDate);
      
      // Find the next Sunday after the first workout day
      const daysToNextSunday = startDayOfWeek === 0 ? 0 : 7 - startDayOfWeek;
      weekEndDate.setUTCDate(firstWorkoutDate.getUTCDate() + daysToNextSunday);
      
      console.log(`   PM start (${startHour}:00) - Week 1 from first workout day to next Sunday`);
      console.log(`   First workout day: ${firstWorkoutDayName} (${firstWorkoutDate.toISOString().split('T')[0]})`);
      console.log(`   Days to next Sunday: ${daysToNextSunday}`);
    } else {
      // AM start logic (existing)
      weekStartDate = new Date(firstWorkoutDate);
      weekEndDate = new Date(firstWorkoutDate);
      const daysToSunday = startDayOfWeek === 0 ? 0 : 7 - startDayOfWeek;
      weekEndDate.setUTCDate(firstWorkoutDate.getUTCDate() + daysToSunday);
      console.log(`   AM start (${startHour}:00) - Week 1 from start date to end of calendar week`);
    }
    
    week1.start_date = weekStartDate.toISOString().split('T')[0];
    week1.end_date = weekEndDate.toISOString().split('T')[0];
    
    console.log(`   Week 1: ${week1.start_date} to ${week1.end_date}`);
    
    // Assign dates to Week 1 workouts, but ONLY include those within Week 1 boundaries
    const week1Workouts = [];
    const week2Workouts = [];
    
    for (const workout of week1.workouts) {
      const dayIndex = dayNames.indexOf(workout.day);
      if (dayIndex !== -1) {
        let workoutDate = new Date(firstWorkoutDate);
        const startDayIndex = firstWorkoutDate.getUTCDay();
        let daysToAdd = dayIndex - startDayIndex;
        
        if (daysToAdd < 0) {
          daysToAdd += 7;
        }
        
        workoutDate.setUTCDate(firstWorkoutDate.getUTCDate() + daysToAdd);
        workout.date = workoutDate.toISOString().split('T')[0];
        
        // CRITICAL: Check if this workout falls within Week 1 boundaries
        const workoutDateObj = new Date(workout.date);
        const week1StartObj = new Date(week1.start_date);
        const week1EndObj = new Date(week1.end_date);
        
        if (workoutDateObj >= week1StartObj && workoutDateObj <= week1EndObj) {
          week1Workouts.push(workout);
          console.log(`     ${workout.day}: → ${workout.date} (${workout.workout_type}) - Week 1 ✅`);
        } else {
          week2Workouts.push(workout);
          console.log(`     ${workout.day}: → ${workout.date} (${workout.workout_type}) - Week 2 (moved)`);
        }
      }
    }
    
    // CRITICAL: Update Week 1 to only include workouts that fall within its boundaries
    week1.workouts = week1Workouts;
    
    // Recalculate Week 1 total distance
    week1.total_weekly_distance = week1Workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    
    console.log(`   Week 1 final: ${week1Workouts.length} workouts, ${week1.total_weekly_distance} km total`);
    if (week2Workouts.length > 0) {
      console.log(`   Week 2 preview: ${week2Workouts.length} workouts will be in Week 2`);
      console.log(`   Week 2 workouts: ${week2Workouts.map(w => `${w.day} (${w.date})`).join(', ')}`);
    }
    
    week1.workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log(`   Week 1 sorted workouts: ${week1.workouts.map(w => `${w.day} ${w.date}`).join(', ')}`);
  }
  
  console.log(`   Total weeks to fix: ${weeklyPlans.length}`);
  for (let i = 0; i < weeklyPlans.length; i++) {
    console.log(`   Week ${i + 1} (index ${i}): week_number=${weeklyPlans[i].week_number}, dates=${weeklyPlans[i].start_date} to ${weeklyPlans[i].end_date}`);
  }
  
  // CRITICAL FIX: Fix dates for subsequent weeks (Week 2+)
  for (let i = 1; i < weeklyPlans.length; i++) {
    const week = weeklyPlans[i];
    const weekNumber = week.week_number || (i + 1);
    
    console.log(`   Fixing Week ${weekNumber} dates (index ${i})...`);
    console.log(`   Current dates: ${week.start_date} to ${week.end_date}`);
    
    // Calculate week start date: Week N starts the Monday after Week N-1 ends
    const previousWeek = weeklyPlans[i - 1];
    let previousWeekEndDate = new Date(previousWeek.end_date);
    
    console.log(`   Previous week end date: ${previousWeekEndDate.toISOString().split('T')[0]}`);
    
    // Week N starts the Monday after Week N-1 ends
    const weekStartDate = new Date(previousWeekEndDate);
    weekStartDate.setUTCDate(previousWeekEndDate.getUTCDate() + 1); // Day after previous week ends
    
    // Ensure it's a Monday
    const startDayOfWeek = weekStartDate.getUTCDay(); // 0 = Sunday, 1 = Monday
    if (startDayOfWeek !== 1) { // If not Monday
      const daysToMonday = startDayOfWeek === 0 ? 1 : 8 - startDayOfWeek; // Days to next Monday
      weekStartDate.setUTCDate(weekStartDate.getUTCDate() + daysToMonday);
    }
    
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6); // Sunday
    
    week.start_date = weekStartDate.toISOString().split('T')[0];
    week.end_date = weekEndDate.toISOString().split('T')[0];
    
    console.log(`   Week ${weekNumber}: ${week.start_date} to ${week.end_date}`);
    
    // Assign dates to workouts in this week
    if (week.workouts && week.workouts.length > 0) {
      for (const workout of week.workouts) {
        const dayIndex = dayNames.indexOf(workout.day);
        if (dayIndex !== -1) {
          const workoutDate = new Date(weekStartDate);
          // Monday = 1, so dayIndex 1 = 0 days to add, dayIndex 2 = 1 day to add, etc.
          const daysToAdd = dayIndex === 0 ? 6 : dayIndex - 1; // Sunday = 6 days from Monday
          workoutDate.setUTCDate(weekStartDate.getUTCDate() + daysToAdd);
          workout.date = workoutDate.toISOString().split('T')[0];
          console.log(`     ${workout.day}: → ${workout.date} (${workout.workout_type})`);
        }
      }
      
      // Sort workouts by date
      week.workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Recalculate weekly total
      week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    }
  }
  
  console.log('✅ All plan dates fixed based on adjusted start_date');
  return planJson;
}

/**
 * Validate and fix invalid dates (e.g., Feb 29 in non-leap years)
 * @param {string} dateStr - ISO date string
 * @returns {string} - Valid ISO date string
 */
function validateAndFixDate(dateStr) {
  if (!dateStr) return dateStr;
  
  // Parse the date string BEFORE creating Date object
  // Format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    console.warn(`⚠️  Invalid date format: ${dateStr}`);
    return dateStr;
  }
  
  const year = parseInt(match[1]);
  const month = parseInt(match[2]); // 1-12
  const day = parseInt(match[3]);
  
  // Check if it's February 29 in a non-leap year
  if (month === 2 && day === 29) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (!isLeapYear) {
      console.warn(`⚠️  Invalid date detected: Feb 29, ${year} (not a leap year). Correcting to Feb 28, ${year}`);
      // Replace the day in the original string
      return dateStr.replace(/^(\d{4}-\d{2}-)29/, '$128');
    }
  }
  
  // Verify the date is valid by creating Date object
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.warn(`⚠️  Invalid date detected: ${dateStr}`);
    return new Date().toISOString();
  }
  
  return dateStr;
}

/**
 * Fix all dates in a training plan
 * @param {Object} planJson - Plan JSON object
 * @returns {Object} - Fixed plan JSON
 */
function fixPlanDates(planJson) {
  if (!planJson) return planJson;
  
  // Fix dates in weekly_plans
  const weeklyPlans = planJson.weekly_plans || planJson.recommended_plan?.weekly_plans || [];
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  for (const week of weeklyPlans) {
    if (week.start_date) {
      week.start_date = validateAndFixDate(week.start_date);
    }
    if (week.end_date) {
      week.end_date = validateAndFixDate(week.end_date);
    }
    
    if (week.workouts && week.workouts.length > 0) {
      // First pass: validate all dates
      for (const workout of week.workouts) {
        if (workout.date) {
          workout.date = validateAndFixDate(workout.date);
        }
      }
      
      // Second pass: fix duplicate dates within the same week
      const usedDates = new Set();
      const dayToIndex = {};
      dayNames.forEach((day, idx) => dayToIndex[day] = idx);
      
      for (let i = 0; i < week.workouts.length; i++) {
        const workout = week.workouts[i];
        if (!workout.date || !workout.day) continue;
        
        // Check if this date is already used by a previous workout
        if (usedDates.has(workout.date)) {
          console.warn(`⚠️  Week ${week.week_number}: Duplicate date detected: ${workout.date} for ${workout.day}`);
          
          // Calculate the correct date based on the day name
          const targetDayIndex = dayToIndex[workout.day];
          if (targetDayIndex !== undefined && week.start_date) {
            const weekStart = new Date(week.start_date);
            const weekStartDayIndex = weekStart.getUTCDay();
            
            // Calculate days to add from week start
            let daysToAdd = targetDayIndex - weekStartDayIndex;
            if (daysToAdd < 0) daysToAdd += 7;
            
            const correctDate = new Date(weekStart);
            correctDate.setUTCDate(weekStart.getUTCDate() + daysToAdd);
            const correctedDateStr = correctDate.toISOString().split('T')[0];
            
            console.warn(`   Correcting ${workout.day} from ${workout.date} to ${correctedDateStr}`);
            workout.date = correctedDateStr;
          }
        }
        
        usedDates.add(workout.date);
      }
      
      // Third pass: ensure week end_date is correct (should be the last workout date or Sunday)
      if (week.workouts.length > 0 && week.start_date) {
        const lastWorkout = week.workouts[week.workouts.length - 1];
        if (lastWorkout.date) {
          const lastDate = new Date(lastWorkout.date);
          const currentEndDate = new Date(week.end_date);
          
          // If last workout date is after current end_date, update end_date
          if (lastDate > currentEndDate) {
            console.warn(`⚠️  Week ${week.week_number}: Updating end_date from ${week.end_date} to ${lastWorkout.date}`);
            week.end_date = lastWorkout.date;
          }
        }
      }
    }
  }
  
  return planJson;
}

function adjustStartDate(startDateStr, specificDays) {
  /**
   * Adjust start date based on AM/PM logic:
   * - If AM (before 12:00): Start from today if today is in specific_days, otherwise next available day
   * - If PM (12:00 or after): Start from next available day in specific_days (skip today)
   */
  if (!startDateStr) {
    startDateStr = new Date().toISOString();
  }

  const dt = new Date(startDateStr);
  const specificList = specificDays.split(',').map(d => d.trim());

  // Get day name
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = dayNames[dt.getUTCDay()];
  const currentHour = dt.getUTCHours();

  console.log(`Adjusting start date: ${startDateStr}, Hour: ${currentHour}, Day: ${currentDayName}, Specific days: ${specificList}`);

  // CRITICAL FIX: For PM starts, always find the NEXT available day in specific_days
  // This ensures Week 1 doesn't span across two calendar weeks incorrectly
  if (currentHour >= 12) {
    console.log(`PM time (${currentHour}:00) - finding next available day in specific_days`);
    for (let i = 1; i <= 7; i++) {
      const nextDay = new Date(dt);
      nextDay.setUTCDate(dt.getUTCDate() + i);
      const nextDayName = dayNames[nextDay.getUTCDay()];
      
      if (specificList.includes(nextDayName)) {
        console.log(`Found next available day: ${nextDayName} (${i} days from now) - ${nextDay.toISOString().split('T')[0]}`);
        nextDay.setUTCHours(6, 0, 0, 0);
        return nextDay.toISOString();
      }
    }
  }

  // If AM (before 12:00 UTC) and today is in specific_days, start today
  if (currentHour < 12 && specificList.includes(currentDayName)) {
    console.log(`AM time and today (${currentDayName}) is in specific_days - starting today`);
    dt.setUTCHours(6, 0, 0, 0);
    return dt.toISOString();
  }

  // Fallback - find next available day
  console.log(`Fallback - finding next available day`);
  for (let i = 1; i <= 7; i++) {
    const nextDay = new Date(dt);
    nextDay.setUTCDate(dt.getUTCDate() + i);
    const nextDayName = dayNames[nextDay.getUTCDay()];
    
    if (specificList.includes(nextDayName)) {
      console.log(`Found next available day: ${nextDayName} (${i} days from now)`);
      nextDay.setUTCHours(6, 0, 0, 0);
      return nextDay.toISOString();
    }
  }

  // Final fallback (should never reach here if specific_days is valid)
  console.log(`Final fallback - using original date`);
  dt.setUTCHours(6, 0, 0, 0);
  return dt.toISOString();
}

/**
 * Calculate plan duration based on race date
 * @param {string} startDate - ISO date string
 * @param {string} raceDate - ISO date string
 * @param {number} minWeeks - Minimum weeks allowed
 * @param {number} maxWeeks - Maximum weeks allowed
 * @returns {number} - Number of weeks for the plan
 */
function calculateDurationFromRaceDate(startDate, raceDate, minWeeks, maxWeeks) {
  const start = new Date(startDate);
  const race = new Date(raceDate);
  
  // Calculate weeks between dates
  const diffTime = Math.abs(race - start);
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  
  // Clamp to min/max range
  const duration = Math.max(minWeeks, Math.min(maxWeeks, diffWeeks));
  
  console.log(`Calculated duration from race date: ${diffWeeks} weeks (clamped to ${duration} weeks)`);
  return duration;
}

/**
 * Calculate pace ranges based on goal race time
 * @param {string} goalRaceTime - Time in format "h:mm:ss"
 * @param {number} raceDistance - Race distance in km or miles
 * @param {string} experience - Runner experience level
 * @param {string} unit - 'km' or 'miles'
 * @returns {Object} - Pace zones with ranges
 */
function calculatePaceZones(goalRaceTime, raceDistance, experience, unit = 'km') {
  if (!goalRaceTime || !raceDistance) {
    return null;
  }

  // Parse goal time to seconds
  const parts = goalRaceTime.split(':').map(p => parseInt(p));
  let totalSeconds = 0;
  if (parts.length === 3) {
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    totalSeconds = parts[0] * 60 + parts[1];
  }

  if (totalSeconds === 0) return null;

  // Calculate goal pace in seconds per unit
  const goalPaceSeconds = totalSeconds / raceDistance;

  // Helper to format pace
  const formatPace = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate pace zones based on experience
  const zones = {
    goal_pace: `${formatPace(goalPaceSeconds)} min/${unit}`,
    easy: '',
    long: '',
    tempo: '',
    threshold: '',
    intervals: '',
    recovery: ''
  };

  // Easy pace adjustments by experience
  const easyAdjustments = {
    'Beginner': [75, 90],
    'Intermediate': [60, 75],
    'Advanced': [60, 70],
    'Elite': [60, 70]
  };
  const easyRange = easyAdjustments[experience] || [60, 75];
  zones.easy = `${formatPace(goalPaceSeconds + easyRange[0])}-${formatPace(goalPaceSeconds + easyRange[1])} min/${unit}`;

  // Long run pace
  const longAdjustments = {
    'Beginner': [60, 75],
    'Intermediate': [50, 65],
    'Advanced': [45, 60],
    'Elite': [45, 55]
  };
  const longRange = longAdjustments[experience] || [50, 65];
  zones.long = `${formatPace(goalPaceSeconds + longRange[0])}-${formatPace(goalPaceSeconds + longRange[1])} min/${unit}`;

  // Tempo pace
  const tempoAdjustments = {
    'Beginner': [25, 30],
    'Intermediate': [20, 25],
    'Advanced': [15, 20],
    'Elite': [15, 20]
  };
  const tempoRange = tempoAdjustments[experience] || [20, 25];
  zones.tempo = `${formatPace(goalPaceSeconds + tempoRange[0])}-${formatPace(goalPaceSeconds + tempoRange[1])} min/${unit}`;

  // Threshold pace
  zones.threshold = `${formatPace(goalPaceSeconds + 10)}-${formatPace(goalPaceSeconds + 20)} min/${unit}`;

  // Intervals pace
  const intervalAdjustments = {
    'Beginner': [-10, -15],
    'Intermediate': [-15, -20],
    'Advanced': [-20, -30],
    'Elite': [-20, -30]
  };
  const intervalRange = intervalAdjustments[experience] || [-15, -20];
  zones.intervals = `${formatPace(goalPaceSeconds + intervalRange[1])}-${formatPace(goalPaceSeconds + intervalRange[0])} min/${unit}`;

  // Recovery pace
  zones.recovery = `${formatPace(goalPaceSeconds + 90)}-${formatPace(goalPaceSeconds + 120)} min/${unit}`;

  return zones;
}

/**
 * Determine rest day requirements based on experience level
 * @param {string} experience - Runner experience level
 * @param {number} trainingDays - Number of training days selected
 * @returns {Object} - Rest day requirements and recommendations
 */
/**
 * Remove invalid rest days for Elite/Advanced users and Beginner/Intermediate with <7 days
 * NEW RULES:
 * - Elite/Advanced: NEVER get rest days (any number of training days)
 * - Beginner/Intermediate: Only get 1 rest day if they select ALL 7 days, otherwise NO rest days
 * @param {Object} planJson - Complete plan JSON
 * @param {Object} originalInput - Original user input
 */
function removeInvalidRestDays(planJson, originalInput) {
  const experience = originalInput.running_experience || 'Intermediate';
  const specificDays = originalInput.specific_days ? originalInput.specific_days.split(',').map(d => d.trim()) : [];
  
  console.log('🚫 Checking for invalid rest days...');
  console.log(`   Experience: ${experience}`);
  console.log(`   Selected days: ${specificDays.length} (${specificDays.join(', ')})`);
  
  // Elite and Advanced users should NEVER have rest days
  if (experience.toLowerCase() === 'elite' || experience.toLowerCase() === 'advanced') {
    console.log(`   🔧 ${experience} user detected - removing ALL rest days`);
    
    for (const week of planJson.weekly_plans) {
      const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
      
      if (restWorkouts.length > 0) {
        console.log(`   Week ${week.week_number}: Found ${restWorkouts.length} rest day(s) - converting to Easy Runs`);
        
        for (const restWorkout of restWorkouts) {
          // Convert rest day to Easy Run
          restWorkout.workout_type = 'Easy Run';
          restWorkout.intensity = 'Easy';
          restWorkout.distance = 3; // 3km easy run
          restWorkout.duration = 21; // ~7 min/km pace
          restWorkout.pace_range = '6:15-6:45 min/km';
          restWorkout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
          
          console.log(`     ${restWorkout.day}: Rest → Easy Run (3 km)`);
        }
        
        // Recalculate weekly total
        week.total_weekly_distance = week.workouts
          .filter(w => w.workout_type !== 'Rest')
          .reduce((sum, w) => sum + (w.distance || 0), 0);
      }
    }
  }
  // For Beginner/Intermediate: Only allow 1 rest day if they selected ALL 7 days
  else if (experience.toLowerCase() === 'beginner' || experience.toLowerCase() === 'intermediate') {
    if (specificDays.length < 7) {
      // Less than 7 days selected - remove ALL rest days
      console.log(`   🔧 ${experience} user with ${specificDays.length} days - removing ALL rest days`);
      
      for (const week of planJson.weekly_plans) {
        const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
        
        if (restWorkouts.length > 0) {
          console.log(`   Week ${week.week_number}: Found ${restWorkouts.length} rest day(s) - removing them`);
          
          // Simply remove rest days from the workouts array
          week.workouts = week.workouts.filter(w => w.workout_type !== 'Rest');
          
          // Recalculate weekly total
          week.total_weekly_distance = week.workouts
            .filter(w => w.workout_type !== 'Rest')
            .reduce((sum, w) => sum + (w.distance || 0), 0);
        }
      }
    } else if (specificDays.length === 7) {
      // Exactly 7 days selected - allow ONLY 1 rest day per week
      console.log(`   🔧 ${experience} user with 7 days - allowing ONLY 1 rest day per week`);
      
      for (const week of planJson.weekly_plans) {
        const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
        
        if (restWorkouts.length > 1) {
          console.log(`   Week ${week.week_number}: Found ${restWorkouts.length} rest days - keeping only 1`);
          
          // Keep only the first rest day, convert others to Easy Runs
          for (let i = 1; i < restWorkouts.length; i++) {
            const restWorkout = restWorkouts[i];
            restWorkout.workout_type = 'Easy Run';
            restWorkout.intensity = 'Easy';
            restWorkout.distance = 3; // 3km easy run
            restWorkout.duration = 21; // ~7 min/km pace
            restWorkout.pace_range = '6:15-6:45 min/km';
            restWorkout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
            
            console.log(`     ${restWorkout.day}: Rest → Easy Run (3 km)`);
          }
          
          // Recalculate weekly total
          week.total_weekly_distance = week.workouts
            .filter(w => w.workout_type !== 'Rest')
            .reduce((sum, w) => sum + (w.distance || 0), 0);
        } else if (restWorkouts.length === 1) {
          console.log(`   Week ${week.week_number}: Found 1 rest day - keeping it ✅`);
        } else {
          console.log(`   Week ${week.week_number}: No rest days found - this is acceptable for ${experience}`);
        }
      }
    }
  }
}

/**
 * Ensure long run day has the highest distance in each week
 * @param {Object} planJson - Complete plan JSON  
 * @param {string} longRunDay - The designated long run day
 * @param {string} unit - Measurement unit (km or miles)
 */
function ensureLongRunIsHighest(planJson, longRunDay, unit) {
  console.log('📏 Ensuring long run day has highest distance...');
  console.log(`   Long run day: ${longRunDay}`);
  
  for (const week of planJson.weekly_plans) {
    const longRunDayWorkout = week.workouts.find(w => w.day === longRunDay);
    
    if (!longRunDayWorkout || longRunDayWorkout.workout_type === 'Rest') {
      continue; // Skip if no workout on long run day or it's a rest day
    }
    
    // Find the workout with highest distance (excluding rest days)
    const nonRestWorkouts = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
    
    if (nonRestWorkouts.length === 0) {
      continue;
    }
    
    const highestDistanceWorkout = nonRestWorkouts.reduce((highest, current) => {
      return (current.distance > highest.distance) ? current : highest;
    }, nonRestWorkouts[0]);
    
    // If long run day doesn't have the highest distance, fix it
    if (longRunDayWorkout.distance < highestDistanceWorkout.distance) {
      console.log(`   Week ${week.week_number}: Long run day (${longRunDay}) has ${longRunDayWorkout.distance} ${unit}`);
      console.log(`     But ${highestDistanceWorkout.day} has ${highestDistanceWorkout.distance} ${unit}`);
      console.log(`   🔧 Swapping distances...`);
      
      // Swap distances and durations
      const tempDistance = longRunDayWorkout.distance;
      const tempDuration = longRunDayWorkout.duration;
      
      longRunDayWorkout.distance = highestDistanceWorkout.distance;
      longRunDayWorkout.duration = highestDistanceWorkout.duration;
      
      highestDistanceWorkout.distance = tempDistance;
      highestDistanceWorkout.duration = tempDuration;
      
      // Ensure long run day is marked as Long Run
      if (longRunDayWorkout.workout_type !== 'Long Run') {
        longRunDayWorkout.workout_type = 'Long Run';
        longRunDayWorkout.intensity = 'Long Easy';
        longRunDayWorkout.description = `Long run on ${longRunDay}. Maintain conversational pace throughout.`;
      }
      
      console.log(`     Fixed: ${longRunDay} now has ${longRunDayWorkout.distance} ${unit} (Long Run)`);
      console.log(`     Fixed: ${highestDistanceWorkout.day} now has ${highestDistanceWorkout.distance} ${unit}`);
    }
  }
}

/**
 * Validate and fix invalid workout types
 * @param {Object} planJson - Complete plan JSON
 */
function validateAndFixWorkoutTypes(planJson) {
  const validWorkoutTypes = [
    'Easy Run',
    'Recovery Run', 
    'Long Run',
    'Tempo Run',
    'Interval Run',
    'Race',
    'Rest'
  ];
  
  // Map of invalid types to valid types
  const workoutTypeMap = {
    'Race Pace': 'Tempo Run',
    'Goal Pace': 'Tempo Run',
    'Goal-Pace Run': 'Tempo Run',
    'Pace Run': 'Tempo Run',
    'Speed Work': 'Interval Run',
    'Speed Run': 'Interval Run',
    'Intervals': 'Interval Run',
    'Tempo': 'Tempo Run',
    'Easy': 'Easy Run',
    'Recovery': 'Recovery Run',
    'Long': 'Long Run',
    'Rest Day': 'Rest'
  };
  
  console.log('🔧 Validating and fixing workout types...');
  
  for (const week of planJson.weekly_plans) {
    if (!week.workouts) continue;
    
    for (const workout of week.workouts) {
      const originalType = workout.workout_type;
      
      // Check if workout type is invalid
      if (!validWorkoutTypes.includes(originalType)) {
        // Try to map to a valid type
        const mappedType = workoutTypeMap[originalType];
        
        if (mappedType) {
          console.log(`   Week ${week.week_number}: "${originalType}" → "${mappedType}" (${workout.day})`);
          workout.workout_type = mappedType;
          
          // Fix intensity to match the new workout type
          const intensityMap = {
            'Easy Run': 'Easy',
            'Recovery Run': 'Recovery',
            'Long Run': 'Long Easy',
            'Tempo Run': 'Tempo',
            'Interval Run': 'Intervals/VO2',
            'Race': 'Goal-pace',
            'Rest': 'Rest'
          };
          
          workout.intensity = intensityMap[mappedType] || workout.intensity;
          
        } else {
          // Default invalid types to Easy Run
          console.log(`   Week ${week.week_number}: Unknown type "${originalType}" → "Easy Run" (${workout.day})`);
          workout.workout_type = 'Easy Run';
          workout.intensity = 'Easy';
        }
      }
    }
  }
}

function determineRestDayRequirements(experience, trainingDays) {
  const requirements = {
    required_rest_days: 0,
    recommended_rest_days: 0,
    allow_all_seven_days: false,
    warning: null
  };

  // Normalize experience to lowercase for consistent matching
  let normalizedExperience = experience.toLowerCase();
  
  // CRITICAL FIX: Handle common typos and variations
  if (normalizedExperience === 'advance') {
    normalizedExperience = 'advanced'; // Fix missing 'd'
  }

  switch (normalizedExperience) {
    case 'beginner':
      // NEW RULE: Only require rest day if user selects ALL 7 days
      // If they select less than 7 days, NO rest days are forced
      if (trainingDays >= 7) {
        requirements.required_rest_days = 1;
        requirements.recommended_rest_days = 1;
        requirements.allow_all_seven_days = false;
        requirements.warning = 'Beginners require at least 1 rest day per week when training all 7 days. One of your selected days will be converted to a rest day.';
      } else {
        // If they select less than 7 days, NO rest days
        requirements.required_rest_days = 0;
        requirements.recommended_rest_days = 0;
        requirements.allow_all_seven_days = true;
      }
      break;

    case 'intermediate':
      // NEW RULE: Only require rest day if user selects ALL 7 days
      // If they select less than 7 days, NO rest days are forced
      if (trainingDays >= 7) {
        requirements.required_rest_days = 1;
        requirements.recommended_rest_days = 1;
        requirements.allow_all_seven_days = false;
        requirements.warning = 'Intermediate runners require at least 1 rest day per week when training all 7 days. One of your selected days will be converted to a rest day.';
      } else {
        // If they select less than 7 days, NO rest days
        requirements.required_rest_days = 0;
        requirements.recommended_rest_days = 0;
        requirements.allow_all_seven_days = true;
      }
      break;

    case 'advanced':
      // NEW RULE: Advanced runners NEVER get rest days regardless of training days selected
      requirements.required_rest_days = 0;
      requirements.recommended_rest_days = 0;
      requirements.allow_all_seven_days = true;
      break;

    case 'elite':
      // EXISTING RULE: Elite runners NEVER get rest days regardless of training days selected
      requirements.required_rest_days = 0;
      requirements.recommended_rest_days = 0;
      requirements.allow_all_seven_days = true;
      break;

    default:
      // CRITICAL FIX: Log unrecognized experience levels for debugging
      console.warn(`⚠️ Unrecognized experience level: "${experience}" (normalized: "${normalizedExperience}"). Defaulting to Intermediate logic.`);
      // Default to Intermediate logic
      if (trainingDays >= 7) {
        requirements.required_rest_days = 1;
        requirements.recommended_rest_days = 1;
        requirements.allow_all_seven_days = false;
        requirements.warning = 'Unrecognized experience level. Applying intermediate runner rest day requirements.';
      } else {
        requirements.required_rest_days = 0;
        requirements.recommended_rest_days = 0;
        requirements.allow_all_seven_days = true;
      }
  }

  console.log(`Rest day requirements for ${experience} with ${trainingDays} training days:`, requirements);
  return requirements;
}




function updateWeeklyTotals(planJson) {
  const weeklyPlans = planJson.recommended_plan?.weekly_plans || [];

  for (const week of weeklyPlans) {
    const weeklyTotal = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    week.total_weekly_distance = weeklyTotal;
  }

  return planJson;
}

/**
 * Validate training plan for common issues
 * @param {Object} planJson - Complete plan JSON
 * @param {string} experience - User's running experience level
 * @param {string} planType - Plan type (marathon, half_marathon, etc.)
 * @param {string} unit - Measurement unit (km or miles)
 * @returns {Object} - Validation result with warnings array
 */
function validateTrainingPlan(planJson, experience, planType, unit = 'miles') {
  const weeklyPlans = planJson.recommended_plan?.weekly_plans || planJson.weekly_plans || [];
  const warnings = [];

  // Define maximum long run caps
  const longRunCaps = {
    marathon: {
      Beginner: unit === 'km' ? 32 : 20,
      Intermediate: unit === 'km' ? 34 : 21,
      Advanced: unit === 'km' ? 35 : 22,
      Elite: unit === 'km' ? 37 : 23
    },
    half_marathon: {
      Beginner: unit === 'km' ? 18 : 11,
      Intermediate: unit === 'km' ? 19 : 12,
      Advanced: unit === 'km' ? 21 : 13,
      Elite: unit === 'km' ? 21 : 13
    }
  };

  const maxLongRun = longRunCaps[planType]?.[experience] || (unit === 'km' ? 35 : 22);

  let prevWeekMileage = 0;

  for (let i = 0; i < weeklyPlans.length; i++) {
    const week = weeklyPlans[i];
    const weekNum = week.week_number || (i + 1);
    const weeklyMileage = week.total_weekly_distance || 0;

    // Check long run cap (skip final week - that's race day)
    if (weekNum < weeklyPlans.length) {
      const longRun = week.workouts.find(w =>
        w.workout_type === 'Long Run' ||
        w.intensity === 'Long Easy' ||
        w.distance === Math.max(...week.workouts.map(wk => wk.distance || 0))
      );

      if (longRun && longRun.distance > maxLongRun) {
        warnings.push({
          week: weekNum,
          type: 'LONG_RUN_CAP_EXCEEDED',
          message: `Week ${weekNum}: Long run ${longRun.distance} ${unit} exceeds maximum cap of ${maxLongRun} ${unit} for ${experience} ${planType} runners`,
          severity: 'HIGH',
          recommended: `Reduce to ${maxLongRun} ${unit}`
        });
      }
    }

    // Check 10% rule (skip first week and cutback weeks)
    if (i > 0 && prevWeekMileage > 0) {
      const increase = ((weeklyMileage - prevWeekMileage) / prevWeekMileage) * 100;

      // Allow decreases (cutback weeks), only flag excessive increases
      if (increase > 10.5 && weeklyMileage > prevWeekMileage) {
        warnings.push({
          week: weekNum,
          type: '10_PERCENT_RULE_VIOLATION',
          message: `Week ${weekNum}: Weekly mileage increased ${increase.toFixed(1)}% (${prevWeekMileage.toFixed(1)} → ${weeklyMileage.toFixed(1)} ${unit}), exceeds 10% rule`,
          severity: 'MEDIUM',
          recommended: `Limit increase to ${(prevWeekMileage * 1.10).toFixed(1)} ${unit}`
        });
      }
    }

    prevWeekMileage = weeklyMileage;
  }

  return {
    isValid: warnings.filter(w => w.severity === 'HIGH').length === 0,
    warnings: warnings,
    totalWarnings: warnings.length,
    highSeverity: warnings.filter(w => w.severity === 'HIGH').length,
    mediumSeverity: warnings.filter(w => w.severity === 'MEDIUM').length
  };
}

/**
 * Fix ALL Week 1 workout distances to be appropriate for experience level
 * PREVENTS BEGINNERS FROM STARTING WITH EXCESSIVE DISTANCE - CAPS ALL WORKOUTS
 * ONLY APPLIES TO TRUE BEGINNERS (0 weekly mileage) - Elite/Advanced runners are not capped
 * @param {Object} planJson - The plan JSON object
 * @param {string} experience - Running experience level
 * @param {string} unit - Measurement unit (km or miles)
 * @param {string|number} weeklyMileage - Recent weekly mileage (e.g., "0", "20-25", "50")
 * @returns {Object} - Fixed plan JSON
 */
function fixFirstWorkoutDistance(planJson, experience, unit, weeklyMileage) {
  if (!planJson.weekly_plans || planJson.weekly_plans.length === 0) {
    return planJson;
  }

  const week1 = planJson.weekly_plans[0];
  if (!week1.workouts || week1.workouts.length === 0) {
    return planJson;
  }

  // Parse weekly mileage to determine if user has a running base
  let hasRunningBase = true;
  const mileageStr = String(weeklyMileage || '0');
  
  if (mileageStr === '0' || mileageStr === '0-0' || mileageStr.toLowerCase() === 'none') {
    hasRunningBase = false;
  } else {
    // Extract lower bound from range like "20-25" or single value "30"
    const match = mileageStr.match(/(\d+)/);
    if (match) {
      const lowerBound = parseInt(match[1]);
      hasRunningBase = lowerBound > 0;
    }
  }

  // CRITICAL: Only apply caps to Beginners and Intermediate runners with NO running base
  // Elite/Advanced runners should NEVER be capped - they know their limits
  if (experience === 'Elite' || experience === 'Advanced') {
    console.log(`✅ ${experience} runner - no Week 1 caps applied (elite/advanced can self-regulate)`);
    return planJson;
  }
  
  // For Intermediate runners, only cap if they have NO running base
  if (experience === 'Intermediate' && hasRunningBase) {
    console.log(`✅ ${experience} runner with running base - no Week 1 caps applied`);
    return planJson;
  }

  // Define max distances for ANY workout in Week 1 based on experience
  // These only apply to runners with NO running base
  const maxWorkoutDistance = {
    Beginner: unit === 'km' ? 3 : 2,      // Beginners: max 3km per workout (very conservative)
    Intermediate: unit === 'km' ? 5 : 3,  // Intermediate (no base): max 5km per workout
    Advanced: unit === 'km' ? 8 : 5,      // Advanced (no base): max 8km per workout
    Elite: unit === 'km' ? 10 : 6         // Elite (no base): max 10km per workout
  };

  // Define max TOTAL weekly distance for Week 1 based on experience
  const maxWeeklyDistance = {
    Beginner: unit === 'km' ? 12 : 8,       // Beginners: max 12km total in Week 1 (very conservative)
    Intermediate: unit === 'km' ? 20 : 12,  // Intermediate (no base): max 20km total
    Advanced: unit === 'km' ? 30 : 20,      // Advanced (no base): max 30km total
    Elite: unit === 'km' ? 40 : 25          // Elite (no base): max 40km total
  };

  const maxPerWorkout = maxWorkoutDistance[experience] || (unit === 'km' ? 3 : 2);
  const maxWeekly = maxWeeklyDistance[experience] || (unit === 'km' ? 12 : 8);

  let needsFix = false;
  let totalDistance = 0;

  // Check if any workout exceeds the max
  for (const workout of week1.workouts) {
    if (workout.workout_type !== 'Rest') {
      totalDistance += workout.distance || 0;
      if (workout.distance > maxPerWorkout) {
        needsFix = true;
      }
    }
  }

  // Also check if total weekly distance exceeds max
  if (totalDistance > maxWeekly) {
    needsFix = true;
  }

  if (!needsFix) {
    return planJson;
  }

  console.log(`⚠️  Week 1 needs adjustment for ${experience} runner with NO running base (${unit})`);
  console.log(`   Current total: ${totalDistance.toFixed(1)} ${unit}, Max allowed: ${maxWeekly} ${unit}`);

  // Cap each workout and recalculate
  const nonRestWorkouts = week1.workouts.filter(w => w.workout_type !== 'Rest');
  const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;

  // Strategy: Cap each workout, then scale down proportionally if still over weekly max
  for (const workout of nonRestWorkouts) {
    if (workout.distance > maxPerWorkout) {
      console.log(`   Capping ${workout.day}: ${workout.distance} ${unit} → ${maxPerWorkout} ${unit}`);
      workout.distance = maxPerWorkout;
      workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
    }
  }

  // Recalculate total
  totalDistance = nonRestWorkouts.reduce((sum, w) => sum + w.distance, 0);

  // If still over weekly max, scale down all workouts proportionally
  if (totalDistance > maxWeekly) {
    const scaleFactor = maxWeekly / totalDistance;
    console.log(`   Scaling all workouts by ${(scaleFactor * 100).toFixed(1)}% to fit weekly max`);

    for (const workout of nonRestWorkouts) {
      workout.distance = Math.round(workout.distance * scaleFactor * 2) / 2; // Round to 0.5
      workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
    }

    totalDistance = nonRestWorkouts.reduce((sum, w) => sum + w.distance, 0);
  }

  // Update weekly total
  week1.total_weekly_distance = Math.round(totalDistance * 2) / 2;

  console.log(`✅ Week 1 fixed. New total: ${week1.total_weekly_distance} ${unit}`);
  console.log(`   Workouts: ${nonRestWorkouts.map(w => `${w.day}: ${w.distance}${unit}`).join(', ')}`);

  return planJson;
}

async function generateFirstWeek(userInput) {
  /**
   * Generate only the first week of the training plan - fast and minimal
   */

  // Input validation and normalization
  console.log('Validating user input...');
  console.log(`📊 User Profile: ${userInput.running_experience} runner, BMI category: ${userInput.bmi ? 'Will be calculated' : 'Not provided'}`);
  console.log(`📏 Weekly mileage (past 4 weeks): ${userInput.weekly_mileage_past_4_weeks} ${userInput.measurement_unit || 'miles'}`);
  console.log(`🏃 Longest run (past 4 weeks): ${userInput.longest_run_past_4_weeks}`);
  console.log(`🏔️  Course profile: ${userInput.course_profile || 'Not specified'}`);

  // Validate critical prerequisites
  const errors = [];

  // Check weekly mileage
  if (userInput.weekly_mileage_past_4_weeks === '0' || userInput.weekly_mileage_past_4_weeks === 0) {
    errors.push('weekly_mileage_past_4_weeks cannot be 0. User must have a running base. Minimum for beginners: 10-15 miles/week (15-25 km/week)');
    // Auto-fix for beginners
    if (userInput.running_experience === 'Beginner') {
      userInput.weekly_mileage_past_4_weeks = userInput.measurement_unit === 'km' ? '20-25' : '12-15';
      console.log(`Auto-fixed weekly_mileage_past_4_weeks to: ${userInput.weekly_mileage_past_4_weeks}`);
    }
  }

  // Check longest run
  if (userInput.longest_run_past_4_weeks === '0' || userInput.longest_run_past_4_weeks === 0 ||
      userInput.longest_run_past_4_weeks === '0km' || userInput.longest_run_past_4_weeks === '0 miles') {
    errors.push('longest_run_past_4_weeks cannot be 0. User must have done at least one long run. Minimum: 5 miles (8 km)');
    // Auto-fix for beginners
    if (userInput.running_experience === 'Beginner') {
      userInput.longest_run_past_4_weeks = userInput.measurement_unit === 'km' ? '8 km' : '5 miles';
      console.log(`Auto-fixed longest_run_past_4_weeks to: ${userInput.longest_run_past_4_weeks}`);
    }
  }

  // Check estimated_race_time
  if (userInput.estimated_race_time &&
      (userInput.estimated_race_time.includes('0-5') ||
       userInput.estimated_race_time.toLowerCase().includes('mins') && !userInput.estimated_race_time.toLowerCase().includes('hrs'))) {
    errors.push('estimated_race_time is invalid. Marathon takes hours, not minutes. Typical range: 3:00:00-6:00:00');
    // Auto-fix based on experience
    const defaultTimes = {
      'Beginner': '5:00:00-5:30:00',
      'Intermediate': '4:00:00-4:30:00',
      'Advanced': '3:30:00-4:00:00',
      'Elite': '3:00:00-3:30:00'
    };
    userInput.estimated_race_time = defaultTimes[userInput.running_experience] || '4:30:00-5:00:00';
    console.log(`Auto-fixed estimated_race_time to: ${userInput.estimated_race_time}`);
  }

  if (errors.length > 0) {
    console.warn('⚠️ PAYLOAD VALIDATION WARNINGS:', errors);
    console.warn('Auto-fixing critical values to prevent injury...');
  }

  // Fix goal_race_time format (02:21 → 2:21:00 for marathon)
  if (userInput.goal_race_time && !userInput.goal_race_time.includes(':')) {
    console.log(`Invalid goal_race_time format: ${userInput.goal_race_time}`);
  } else if (userInput.goal_race_time && userInput.goal_race_time.split(':').length === 2) {
    // Format is HH:MM for marathon (always treat as hours:minutes, not minutes:seconds)
    const parts = userInput.goal_race_time.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    
    // For marathon plans, HH:MM format should always be hours:minutes
    if (userInput.plan_name === 'Marathon' || userInput.plan_type === 'marathon') {
      userInput.goal_race_time = `${hours}:${minutes.toString().padStart(2, '0')}:00`;
      console.log(`Fixed marathon goal_race_time to: ${userInput.goal_race_time}`);
    } else if (hours > 23) {
      // For other races, only convert if hours > 23 (likely hours in first part)
      userInput.goal_race_time = `${parts[0]}:${parts[1]}:00`;
      console.log(`Fixed goal_race_time to: ${userInput.goal_race_time}`);
    }
  }

  // Fix estimated_race_time format
  if (userInput.estimated_race_time) {
    const timeStr = userInput.estimated_race_time.toLowerCase();
    if (timeStr.includes('mins') || timeStr.includes('min')) {
      console.warn(`Invalid estimated_race_time: ${userInput.estimated_race_time}. Marathon cannot be in minutes.`);
      // Try to infer: "5hrs-6hrs" → "5:00:00-6:00:00"
    } else if (timeStr.includes('hrs') || timeStr.includes('hr')) {
      // Convert "5hrs-6hrs" to "5:00:00-6:00:00"
      const match = timeStr.match(/(\d+).*?-.*?(\d+)/);
      if (match) {
        userInput.estimated_race_time = `${match[1]}:00:00-${match[2]}:00:00`;
        console.log(`Fixed estimated_race_time to: ${userInput.estimated_race_time}`);
      }
    }
  }

  // Fix longest_run_past_4_weeks - extract just the distance
  if (userInput.longest_run_past_4_weeks) {
    const longRun = userInput.longest_run_past_4_weeks.toLowerCase();
    if (longRun.includes('hours') || longRun.includes('mins')) {
      // Extract distance: "30 miles 15 hours" → "30 miles"
      const distMatch = longRun.match(/(\d+\.?\d*)\s*(miles?|mi|km|kilometers?)/);
      if (distMatch) {
        userInput.longest_run_past_4_weeks = `${distMatch[1]} ${distMatch[2]}`;
        console.log(`Fixed longest_run_past_4_weeks to: ${userInput.longest_run_past_4_weeks}`);
      }
    }
  }

  // Fix weekly_mileage_past_4_weeks - "50+" should be "50-55"
  if (userInput.weekly_mileage_past_4_weeks === '50+') {
    userInput.weekly_mileage_past_4_weeks = '50-55';
    console.log(`Fixed weekly_mileage_past_4_weeks to: ${userInput.weekly_mileage_past_4_weeks}`);
  }

  // Convert specific_days array to string if needed
  if (Array.isArray(userInput.specific_days)) {
    userInput.specific_days = userInput.specific_days.join(', ');
  }

  // Validate long_run_day is in specific_days
  if (userInput.long_run_day && userInput.specific_days) {
    const daysArray = userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0);
    console.log(`🔍 Long run day validation:`);
    console.log(`   Original long_run_day: "${userInput.long_run_day}"`);
    console.log(`   Parsed specific_days: [${daysArray.join(', ')}]`);
    console.log(`   Includes check: ${daysArray.includes(userInput.long_run_day)}`);
    
    if (!daysArray.includes(userInput.long_run_day)) {
      console.warn(`long_run_day "${userInput.long_run_day}" not in specific_days. Setting to last day.`);
      userInput.long_run_day = daysArray[daysArray.length - 1];
      console.log(`   Changed long_run_day to: "${userInput.long_run_day}"`);
    } else {
      console.log(`   ✅ long_run_day validation passed`);
    }
    
    // Check for mismatch between days_per_week and actual specific_days count
    const actualDaysCount = daysArray.length;
    const requestedDays = parseInt(userInput.days_per_week) || actualDaysCount;
    
    if (requestedDays !== actualDaysCount) {
      console.warn(`⚠️  MISMATCH: days_per_week=${requestedDays} but specific_days has ${actualDaysCount} days`);
      console.warn(`   Specific days: ${daysArray.join(', ')}`);
      
      // For Elite/Advanced runners requesting 7 days but only listing 6, add the missing day
      if (requestedDays === 7 && actualDaysCount === 6 && 
          (userInput.running_experience === 'Elite' || userInput.running_experience === 'Advanced')) {
        const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const missingDay = allDays.find(day => !daysArray.includes(day));
        if (missingDay) {
          daysArray.push(missingDay);
          userInput.specific_days = daysArray.join(', ');
          console.log(`✅ Added missing day for ${userInput.running_experience} runner: ${missingDay}`);
          console.log(`   Updated specific_days: ${userInput.specific_days}`);
        }
      } else {
        // Otherwise, use the actual count from specific_days
        userInput.days_per_week = actualDaysCount;
        console.log(`✅ Corrected days_per_week to match specific_days: ${actualDaysCount}`);
      }
    }
  }

  // Handle race date / plan end date
  if (userInput.race_date || userInput.plan_end_date) {
    const raceDate = userInput.race_date || userInput.plan_end_date;
    console.log(`Race date provided: ${raceDate}`);
    
    // Adjust start_date if needed
    if (!userInput.start_date) {
      userInput.start_date = new Date().toISOString();
    }
    
    // Calculate duration based on race date
    const calculatedDuration = calculateDurationFromRaceDate(
      userInput.start_date,
      raceDate,
      userInput.min_weeks_plan || 8,
      userInput.max_week_plans || 20
    );
    
    // Override min/max to match calculated duration
    userInput.calculated_duration = calculatedDuration;
    userInput.race_date_provided = true;
    
    console.log(`Plan will be ${calculatedDuration} weeks to end on race date: ${raceDate}`);
  }

  // Check rest day requirements based on experience
  const specificDaysArray = userInput.specific_days ? userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
  const trainingDays = specificDaysArray.length;
  
  console.log(`🔍 Input analysis:`);
  console.log(`   days_per_week: ${userInput.days_per_week}`);
  console.log(`   specific_days: "${userInput.specific_days}"`);
  console.log(`   parsed specific_days: [${specificDaysArray.join(', ')}]`);
  console.log(`   actual training days count: ${trainingDays}`);
  
  const restRequirements = determineRestDayRequirements(
    userInput.running_experience || 'Intermediate',
    trainingDays
  );
  
  if (restRequirements.warning) {
    console.warn(`⚠️ REST DAY WARNING: ${restRequirements.warning}`);
  }
  
  // Add rest requirements to user input for LLM
  userInput.rest_day_requirements = restRequirements;

  // Calculate pace zones for recommendations
  const unit = userInput.measurement_unit === 'km' ? 'km' : 'miles';
  const raceDistance = userInput.plan_name === 'Marathon' ? (unit === 'km' ? 42.2 : 26.2) :
                       userInput.plan_name === 'Half Marathon' ? (unit === 'km' ? 21.1 : 13.1) :
                       userInput.plan_name === '10k' ? (unit === 'km' ? 10 : 6.2) :
                       (unit === 'km' ? 5 : 3.1);
  
  const paceZones = calculatePaceZones(
    userInput.goal_race_time || userInput.estimated_race_time?.split('-')[0],
    raceDistance,
    userInput.running_experience || 'Intermediate',
    unit
  );
  
  if (paceZones) {
    console.log('Calculated pace zones:', paceZones);
    userInput.pace_zones = paceZones;
  }

  // Adjust start_date before sending to LLM
  if (userInput.specific_days) {
    const originalStartDate = userInput.start_date || '';
    userInput.start_date = adjustStartDate(
      originalStartDate,
      userInput.specific_days
    );
    console.log(`Start date adjusted from ${originalStartDate} to ${userInput.start_date}`);
  }

  // Log the cleaned input for debugging
  console.log('Cleaned user input:', {
    experience: userInput.running_experience,
    weekly_mileage: userInput.weekly_mileage_past_4_weeks,
    longest_run: userInput.longest_run_past_4_weeks,
    estimated_time: userInput.estimated_race_time,
    goal_time: userInput.goal_race_time,
    days_per_week: userInput.days_per_week,
    long_run_day: userInput.long_run_day,
    start_date: userInput.start_date,
    race_date: userInput.race_date || userInput.plan_end_date,
    calculated_duration: userInput.calculated_duration,
    rest_requirements: userInput.rest_day_requirements,
    pace_zones: userInput.pace_zones
  });

  // Simple prompt for fast generation
  const prompt = FIRST_WEEK_PROMPT.replace('{user_input}', JSON.stringify(userInput, null, 2));

  try {
    console.log('Calling OpenAI API for first week generation...');
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini for first week generation
      // temperature: 0.7,
      // max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: "Generate ONLY first week workouts quickly. No detailed analysis. Return minimal JSON with just week 1 workouts. CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', or any other variations. CRITICAL: Always include 'user_distance': 0 and 'user_time': 0 in BOTH week-level and workout-level data. CRITICAL: Follow the WEEK CALCULATION LOGIC precisely - Week 1 must span Monday to Sunday of the calendar week, and include ALL days from specific_days that fall within Week 1 boundaries and are on/after start_date. CRITICAL: NEVER SKIP DAYS FROM SPECIFIC_DAYS - if Monday is in specific_days, it MUST appear in the workout schedule. CRITICAL: Apply FIRST WORKOUT DAY SAFETY RULE - if first workout day equals long_run_day, KEEP it as 'Long Run' but apply DISTANCE LIMITS: Beginner/Intermediate max 3.0km, Advanced max 4.0km, Elite max 5.0km. CRITICAL: All other workouts in Week 1 MUST have distance less than the long run distance. NEVER EXCEED THESE LIMITS. CRITICAL: FIRST DAY CANNOT BE RECOVERY RUN - the chronologically first workout day must be Easy Run, Tempo Run, or Long Run, NEVER Recovery Run. CRITICAL: Recovery Runs only allowed the day after Long Run - if no Long Run in Week 1, NO Recovery Runs allowed. CRITICAL: LONG RUN DAY ASSIGNMENT - The workout on long_run_day MUST be assigned workout_type 'Long Run' and be the longest distance of the week. IF FIRST WORKOUT DAY = LONG RUN DAY: Keep as 'Long Run' but apply distance limits: max 3km for Beginner/Intermediate, max 4km for Advanced, max 5km for Elite. All other workouts must be shorter than the long run. CRITICAL: Duration MUST be between min_weeks_plan and max_week_plans based on experience level. If race_date provided, calculate duration to end on that date. CRITICAL: DISTANCE ROUNDING - ALL distances MUST be rounded to nearest 0.5 units. Examples: 1.6 mi → 1.5 mi, 2.2 mi → 2.0 mi, 1.4 mi → 1.5 mi, 0.9 mi → 1.0 mi. NO decimal distances like 1.6, 2.2, 1.4, 0.9 are allowed. CRITICAL: Long run MAXIMUM caps - Beginner: 18 mi/30 km, Intermediate: 20 mi/32 km, Advanced: 21 mi/34 km, Elite: 22 mi/36 km. NEVER exceed these. CRITICAL: Include 'pace_guide' object at plan level showing all pace zones with descriptions. CRITICAL: Include 'pace_range' and 'description' fields for EVERY workout. CRITICAL REST DAY RULES: Elite and Advanced runners NEVER get rest days regardless of how many training days selected. Beginner/Intermediate ONLY get 1 rest day if they select ALL 7 days, otherwise NO rest days. If Elite/Advanced user lists any number of specific_days, schedule workouts on ALL those days with ZERO rest days. If Beginner/Intermediate lists less than 7 days, schedule workouts on ALL those days with ZERO rest days. CRITICAL: Follow OPTIMAL TRAINING PATTERN - Easy → Tempo/Intervals → Recovery → Easy → Long Run. Never schedule back-to-back hard workouts. CRITICAL: Replace 'Track' with 'Flat' in all outputs. Goal-based personalization must be reflected in workout mix and intensity. total_weeks must be between min_weeks_plan and max_week_plans. Generate description according to user input dont include any goal in description."
        },
        { role: 'user', content: prompt }
      ]
    });

    let content = response.choices[0].message.content.trim();

    // Simple JSON extraction
    if (content.includes('```')) {
      const parts = content.split('```');
      for (let part of parts) {
        part = part.trim();
        if (part.startsWith('json')) {
          part = part.substring(4).trim();
        }
        if (part.startsWith('{')) {
          content = part;
          break;
        }
      }
    }

    // Find JSON boundaries
    const startIdx = content.indexOf('{');
    if (startIdx !== -1) {
      let braceCount = 0;
      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
          braceCount++;
        } else if (content[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            content = content.substring(startIdx, i + 1);
            break;
          }
        }
      }
    }

    // Clean up any control characters that might cause JSON parsing issues
    content = content.replace(/[\x00-\x1F\x7F]/g, '');

    let planJson = JSON.parse(content);

    // Parse goal pace from user input
    const unit = userInput.measurement_unit === 'km' ? 'km' : 'miles';

    // CRITICAL: Validate and fix AI-generated plan to ensure all rules are followed
    // First remove duplicates from all weeks
    if (planJson.recommended_plan && planJson.recommended_plan.weekly_plans) {
      for (const week of planJson.recommended_plan.weekly_plans) {
        removeDuplicateDaysFromWeek(week);
      }
    }
    
    validateAndFixAIPlan(planJson, userInput, unit);
    
    // CRITICAL: Validate and fix invalid workout types
    validateAndFixWorkoutTypes(planJson);
    
    const marathonDistance = unit === 'km' ? 42.2 : 26.2;
    let goalPaceSeconds = 0;

    if (userInput.goal_race_time) {
      goalPaceSeconds = parseGoalPace(userInput.goal_race_time, marathonDistance);
    } else if (userInput.estimated_race_time) {
      // Handle range like "4:30:00-5:00:00"
      const timeStr = userInput.estimated_race_time.includes('-')
        ? userInput.estimated_race_time.split('-')[0].trim()
        : userInput.estimated_race_time;
      goalPaceSeconds = parseGoalPace(timeStr, marathonDistance);
    }

    // Validate and fix intensities
    if (planJson.weekly_plans && goalPaceSeconds > 0) {
      for (const week of planJson.weekly_plans) {
        for (let i = 0; i < week.workouts.length; i++) {
          week.workouts[i] = validateAndFixIntensity(week.workouts[i], goalPaceSeconds, unit);
        }
      }
    }

    // CRITICAL: Fix invalid dates (e.g., Feb 29 in non-leap years)
    fixPlanDates(planJson);

    // CRITICAL: Enforce first workout day safety rule (PREVENTS INJURY)
    const experience = userInput.running_experience || 'Intermediate';
    enforceFirstWorkoutDaySafetyRule(
      planJson, 
      userInput.start_date, 
      userInput.specific_days, 
      userInput.long_run_day, 
      experience, 
      unit
    );

    // CRITICAL: Add recovery runs after long runs (FIRST WEEK)
    // This runs AFTER rest day enforcement to ensure recovery runs are preserved
    if (planJson.weekly_plans && userInput.long_run_day && userInput.specific_days) {
      const specificDaysArray = userInput.specific_days.split(',').map(d => d.trim());
      const longRunDay = userInput.long_run_day;
      addRecoveryRunsAfterLongRuns(planJson, longRunDay, specificDaysArray, unit);
    }

    // CRITICAL: Remove invalid rest days for Elite/Advanced users (FIRST WEEK)
    removeInvalidRestDays(planJson, userInput);
    
    // CRITICAL: Ensure long run day has highest distance (FIRST WEEK)
    ensureLongRunIsHighest(planJson, userInput.long_run_day, unit);

    // CRITICAL: Enforce single recovery run rule (only after long run)
    if (planJson.weekly_plans && userInput.long_run_day) {
      enforceSingleRecoveryRunRule(planJson, userInput.long_run_day, unit);
    }

    // CRITICAL FIX: Remove any Recovery Runs from first workout day and ensure proper placement
    // This MUST run AFTER addRecoveryRunsAfterLongRuns to prevent it from being undone
    console.log('🔧 About to call fixFirstDayRecoveryRunIssue...');
    planJson = fixFirstDayRecoveryRunIssue(planJson, userInput.start_date, userInput.specific_days, userInput.long_run_day, unit);

    // CRITICAL: Fix workout type and intensity consistency (AFTER pace-based validation)
    validateAndFixWorkoutTypeIntensity(planJson);

    // Fix duplicate distances (anti-repetition rule)
    if (planJson.weekly_plans) {
      for (const week of planJson.weekly_plans) {
        fixDuplicateDistances(week, unit);
      }
    }

    // CRITICAL: Validate and fix Long Run distance LAST - ensure Long Run has longest distance in each week
    // This must run AFTER all other modifications to ensure it's not overwritten
    validateAndFixLongRunDistance(planJson, unit);

    // Fix duplicate distances (anti-repetition rule)
    if (planJson.weekly_plans) {
      for (const week of planJson.weekly_plans) {
        fixDuplicateDistances(week, unit);
      }
    }

    // CRITICAL: Validate and fix Long Run distance LAST - ensure Long Run has longest distance in each week
    // This must run AFTER all other modifications to ensure it's not overwritten
    validateAndFixLongRunDistance(planJson, unit);

    // Final verification: Double-check Long Run is longest (run one more time if needed)
    if (planJson.weekly_plans) {
      for (const week of planJson.weekly_plans) {
        const longRuns = week.workouts.filter(w => w.workout_type === 'Long Run');
        const allWorkouts = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
        
        for (const longRun of longRuns) {
          const longerThanLongRun = allWorkouts.filter(w => 
            w.workout_type !== 'Long Run' && w.distance > longRun.distance
          );
          
          if (longerThanLongRun.length > 0) {
            console.warn(`⚠️  WARNING: After validation, Long Run on ${longRun.day} (${longRun.distance} ${unit}) is still not the longest!`);
            console.warn(`   Longer workouts found: ${longerThanLongRun.map(w => `${w.day} (${w.workout_type}) ${w.distance}${unit}`).join(', ')}`);
            // Run validation one more time
            validateAndFixLongRunDistance(planJson, unit);
            break; // Only run once more
          }
        }
      }
    }

    // Update weekly totals
    let week1TotalDistance = 0;
    if (planJson.weekly_plans) {
      for (const week of planJson.weekly_plans) {
        const weeklyTotal = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
        week.total_weekly_distance = weeklyTotal;
        if (week.week_number === 1) {
          week1TotalDistance = weeklyTotal;
        }
      }
    }

    // Add total_distance (week 1 total) to the plan
    planJson.target_distance = week1TotalDistance;

    // CRITICAL: Validate and fix duration based on experience level
    const expectedDuration = calculateExpectedDuration(
      userInput.running_experience,
      userInput.min_weeks_plan || 8,
      userInput.max_week_plans || 15,
      userInput.height,
      userInput.weight,
      userInput.weekly_mileage_past_4_weeks // Pass weekly mileage for proper calculation
    );
    
    if (planJson.duration !== expectedDuration) {
      console.warn(`⚠️  Duration mismatch: AI returned ${planJson.duration} weeks, expected ${expectedDuration} weeks for ${userInput.running_experience}`);
      console.warn(`   Correcting duration to ${expectedDuration} weeks...`);
      planJson.duration = expectedDuration;
      planJson.total_weeks = expectedDuration;
      planJson.remaining_weeks = expectedDuration - 1;
    }

    // CRITICAL: Fix plan dates to match the adjusted start_date (handles AM/PM logic)
    // This MUST be the last step to ensure no other validation overwrites the dates
    fixPlanDatesFromAdjustedStartDate(planJson, userInput.start_date);

    // Generate unique plan_id and store minimal context
    const planId = uuidv4().replace(/-/g, '').substring(0, 20);
    planJson.plan_id = planId;
    planJson.generated_at = new Date().toISOString();

    // CRITICAL: Store EXACT copy of Week 1 data AFTER date correction for consistency between APIs
    // Create a deep copy to prevent any modifications to the stored data
    const exactWeek1Copy = JSON.parse(JSON.stringify(planJson.weekly_plans[0]));
    
    console.log(`📋 Storing corrected Week 1 data: ${exactWeek1Copy.workouts.length} workouts, ${exactWeek1Copy.total_weekly_distance} km`);
    console.log(`   Week 1 dates: ${exactWeek1Copy.start_date} to ${exactWeek1Copy.end_date}`);
    console.log(`   Week 1 workouts: ${exactWeek1Copy.workouts.map(w => `${w.day} (${w.date})`).join(', ')}`);
    
    // Store minimal context for generating remaining weeks
    planStorage[planId] = {
      original_input: userInput,
      first_week_basic: {
        ...planJson,
        weekly_plans: [exactWeek1Copy] // Store exact copy AFTER date correction
      },
      total_weeks: planJson.duration || 12,
      plan_type: planJson.plan_type || 'marathon',
      generated_at: new Date().toISOString()
    };

    console.log('✅ Week 1 data stored with exact copy for consistency between APIs');

    return planJson;

  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`JSON Parse Error: ${error.message}`);
      // Only log content if it exists
      if (typeof content !== 'undefined') {
        console.error(`Problematic content length: ${content.length}`);
        console.error(`First 1000 chars: ${content.substring(0, 1000)}`);
      }
      throw new Error(`Failed to parse first week JSON: ${error.message}`);
    }
    console.error(`Unexpected error: ${error.message}`);
    throw new Error(`Error generating first week: ${error.message}`);
  }
}

async function generateChunkedPlan(planId, storedData) {
  /**
   * Generate very long plans (>16 weeks) in chunks to avoid response truncation
   */
  const originalInput = storedData.original_input;
  const firstWeekBasic = storedData.first_week_basic;
  const totalWeeks = storedData.total_weeks;
  const planType = storedData.plan_type;
  
  console.log(`🧩 Generating chunked plan for ${totalWeeks} weeks`);
  
  // Split into chunks of appropriate size based on total weeks
  let chunkSize = 6;
  if (totalWeeks > 20) {
    chunkSize = 4; // Even smaller chunks for very long plans to avoid token limits
  }
  if (totalWeeks > 30) {
    chunkSize = 3; // Very small chunks for extremely long plans
  }
  
  const chunks = [];
  for (let i = 2; i <= totalWeeks; i += chunkSize) {
    const endWeek = Math.min(i + chunkSize - 1, totalWeeks);
    chunks.push({ startWeek: i, endWeek: endWeek, size: endWeek - i + 1 });
  }
  
  console.log(`📦 Split into ${chunks.length} chunks:`, chunks.map(c => `Weeks ${c.startWeek}-${c.endWeek}`).join(', '));
  
  const allWeeks = [];
  const firstWeekData = firstWeekBasic.weekly_plans?.[0] || {};
  
  // Generate each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`🔄 Generating chunk ${i + 1}/${chunks.length}: Weeks ${chunk.startWeek}-${chunk.endWeek}`);
    
    const chunkPrompt = CHUNKED_PLAN_PROMPT
      .replace(/{total_weeks}/g, totalWeeks)
      .replace(/{plan_type}/g, planType)
      .replace('{original_input}', JSON.stringify(originalInput, null, 2))
      .replace('{first_week_data}', JSON.stringify(firstWeekData, null, 2))
      .replace('{chunk_start_week}', chunk.startWeek)
      .replace('{chunk_end_week}', chunk.endWeek)
      .replace('{chunk_size}', chunk.size)
      .replace('{plan_id}', planId)
      .replace('{timestamp}', new Date().toISOString());
    
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 16000, // Maximum allowed for gpt-4o (16,384 - some buffer)
        temperature: 0.7, // Add some creativity while maintaining consistency
        messages: [
          {
            role: 'system',
            content: "Generate training plan chunk efficiently. Use ONLY these workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. Return ONLY JSON. Include 'user_distance': 0 and 'user_time': 0 for ALL data. Include 'pace_range' and 'description' for EVERY workout. Follow Monday-Sunday structure. Recovery Run after long run day. Round distances to 0.5 units. No back-to-back hard workouts. Elite/Advanced: NO rest days. Beginner/Intermediate: 1 rest day only if ALL 7 days selected. CRITICAL: Ensure complete JSON response - do not truncate."
          },
          { role: 'user', content: `Generate training plan weeks ${chunk.startWeek}-${chunk.endWeek}. Return ONLY complete JSON.\n\n${chunkPrompt}` },
        ],
      }, { timeout: 300000 }); // 5 minutes per chunk
      
      if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Invalid API response structure');
      }
      
      let chunkContent = response.choices[0].message.content;
      if (!chunkContent) {
        throw new Error('Empty content in API response');
      }
      
      // Extract JSON from response
      chunkContent = chunkContent.trim();
      
      // Remove markdown if present
      if (chunkContent.includes('```')) {
        const parts = chunkContent.split('```');
        for (let part of parts) {
          part = part.trim();
          if (part.startsWith('json')) {
            part = part.substring(4).trim();
          }
          if (part.startsWith('{') && part.endsWith('}')) {
            chunkContent = part;
            break;
          }
        }
      }
      
      // Find JSON boundaries
      const startIdx = chunkContent.indexOf('{');
      if (startIdx === -1) {
        throw new Error('No JSON object found in chunk response');
      }
      
      // Simple brace counting for chunks (should be smaller)
      let braceCount = 0;
      let endIdx = -1;
      for (let i = startIdx; i < chunkContent.length; i++) {
        if (chunkContent[i] === '{') {
          braceCount++;
        } else if (chunkContent[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }
      
      if (endIdx === -1) {
        throw new Error('Could not find complete JSON object in chunk');
      }
      
      chunkContent = chunkContent.substring(startIdx, endIdx + 1);
      
      // Remove comments that might cause JSON parsing issues
      chunkContent = chunkContent.replace(/\/\/.*$/gm, ''); // Remove single-line comments
      chunkContent = chunkContent.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
      
      // Clean up any control characters that might cause JSON parsing issues
      chunkContent = chunkContent.replace(/[\x00-\x1F\x7F]/g, '');
      
      // Parse JSON
      let chunkPlan;
      try {
        chunkPlan = JSON.parse(chunkContent);
      } catch (parseError) {
        console.error(`JSON parsing failed for chunk ${i + 1}:`, parseError.message);
        console.error('Chunk content that failed to parse:', chunkContent.substring(0, 500));
        
        // Check if the JSON appears to be truncated
        if (chunkContent.length > 15000 && !chunkContent.trim().endsWith('}')) {
          console.error('⚠️  JSON appears to be truncated (doesn\'t end with }). This suggests the response hit the token limit.');
          console.error('💡 Retrying with smaller chunk size...');
          
          // Retry with smaller chunk if this chunk has more than 2 weeks
          if (chunk.size > 2) {
            console.log(`🔄 Splitting chunk ${i + 1} into smaller pieces...`);
            
            // Split current chunk into 2 smaller chunks
            const midPoint = Math.floor((chunk.startWeek + chunk.endWeek) / 2);
            const chunk1 = { startWeek: chunk.startWeek, endWeek: midPoint, size: midPoint - chunk.startWeek + 1 };
            const chunk2 = { startWeek: midPoint + 1, endWeek: chunk.endWeek, size: chunk.endWeek - midPoint };
            
            // Replace current chunk with smaller chunks
            chunks.splice(i, 1, chunk1, chunk2);
            
            // Retry current iteration (will process chunk1)
            i--;
            continue;
          }
        }
        
        // Try to fix common truncation issues
        let fixedContent = chunkContent.trim();
        
        // If it doesn't end with }, try to close the JSON structure
        if (!fixedContent.endsWith('}')) {
          console.log('🔧 Attempting to fix truncated JSON...');
          
          // Count open braces to determine how many closing braces we need
          let openBraces = 0;
          for (let char of fixedContent) {
            if (char === '{') openBraces++;
            else if (char === '}') openBraces--;
          }
          
          // Add missing closing braces
          while (openBraces > 0) {
            fixedContent += '}';
            openBraces--;
          }
          
          console.log('🔧 Added missing closing braces, attempting to parse...');
          
          try {
            chunkPlan = JSON.parse(fixedContent);
            console.log('✅ Successfully parsed fixed JSON');
          } catch (fixError) {
            console.error('❌ Failed to fix truncated JSON:', fixError.message);
            throw new Error(`JSON parsing failed even after attempting to fix truncation: ${parseError.message}`);
          }
        } else {
          throw new Error(`JSON parsing failed: ${parseError.message}`);
        }
      }
      
      // Extract weeks from chunk
      if (chunkPlan.recommended_plan && chunkPlan.recommended_plan.weekly_plans) {
        const chunkWeeks = chunkPlan.recommended_plan.weekly_plans;
        console.log(`✅ Chunk ${i + 1} generated ${chunkWeeks.length} weeks`);
        allWeeks.push(...chunkWeeks);
      } else {
        throw new Error(`Chunk ${i + 1} missing weekly_plans`);
      }
      
    } catch (chunkError) {
      console.error(`❌ Chunk ${i + 1} generation failed:`, chunkError.message);
      throw new Error(`Failed to generate chunk ${i + 1}: ${chunkError.message}`);
    }
  }
  
  console.log(`🎯 All chunks completed! Total weeks generated: ${allWeeks.length}`);
  
  // Add Week 1 data to the beginning of allWeeks
  const storedFirstWeek = firstWeekBasic.weekly_plans?.[0];
  if (storedFirstWeek) {
    console.log(`📋 Adding Week 1 data to complete plan`);
    allWeeks.unshift(storedFirstWeek); // Add Week 1 at the beginning
    console.log(`✅ Complete plan now has ${allWeeks.length} weeks (including Week 1)`);
  } else {
    console.warn(`⚠️ Week 1 data not found in firstWeekBasic`);
  }
  
  // Combine all chunks into final plan
  const completePlan = {
    success: true,
    recommended_plan: {
      plan_name: `${planType} (${originalInput.measurement_unit === 'km' ? '42.2 km' : '26.2 miles'})`,
      plan_type: planType.toLowerCase().replace(' ', '_'),
      duration: totalWeeks,
      target_distance: originalInput.target_weekly_distance || 1200,
      description: `Complete ${totalWeeks}-week ${planType} training plan generated in ${chunks.length} chunks`,
      why_recommended: `Chunked generation approach used for ${totalWeeks}-week plan to ensure complete response`,
      weekly_plans: allWeeks
    }
  };
  
  // Apply the same validation and fixing logic as non-chunked generation
  const unit = originalInput.measurement_unit === 'km' ? 'km' : 'miles';
  
  // Validate and fix AI-generated complete plan to ensure all rules are followed
  if (completePlan.recommended_plan) {
    for (const week of completePlan.recommended_plan.weekly_plans) {
      // CRITICAL: Skip Week 1 validation to maintain consistency with first API
      if (week.week_number === 1) {
        console.log('⏭️  Skipping Week 1 validation to maintain consistency with first API response');
        continue;
      }
      
      // CRITICAL: Remove duplicates BEFORE other validations
      removeDuplicateDaysFromWeek(week);
      
      validateAndFixAIPlan({ weekly_plans: [week] }, originalInput, unit);
      
      // CRITICAL: Also validate long run distance for each week individually
      validateAndFixLongRunDistance({ weekly_plans: [week] }, unit);
      
      // CRITICAL: Apply rest day requirements to each week individually
      const experience = originalInput.running_experience || 'Intermediate';
      const specificDaysArray = originalInput.specific_days ? 
        originalInput.specific_days.split(',').map(d => d.trim()) : [];
      const longRunDay = originalInput.long_run_day || 'Sunday';
      
      enforceRestDayRequirements({ weekly_plans: [week] }, experience, specificDaysArray, longRunDay);
    }
  }
  
  // CRITICAL: Fix race day AFTER all other validations to ensure it's not overwritten
  // This must be the LAST validation step
  const weeklyPlans = completePlan.recommended_plan?.weekly_plans || [];
  if (weeklyPlans.length > 0) {
    const finalWeek = weeklyPlans[weeklyPlans.length - 1];
    const longRunDay = originalInput.long_run_day;
    const planType = storedData.plan_type;
    
    // Normalize plan type for race distance lookup
    const normalizedPlanType = planType.toLowerCase().replace(/\s+/g, '_');
    
    // Define race distances by plan type and unit
    const raceDistances = {
      'marathon': unit === 'km' ? 42.2 : 26.2,
      'half_marathon': unit === 'km' ? 21.1 : 13.1,
      '10k': unit === 'km' ? 10.0 : 6.2,
      '5k': unit === 'km' ? 5.0 : 3.1
    };
    const expectedRaceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];
    
    console.log(`🏁 FINAL RACE DAY DETECTION: Week ${finalWeek.week_number}`);
    console.log(`   Plan Type: "${planType}" → normalized: "${normalizedPlanType}"`);
    console.log(`   Expected Race Distance: ${expectedRaceDistance} ${unit}`);
    console.log(`   Long Run Day: "${longRunDay}"`);
    
    // Find the longest workout in the final week
    const nonRestWorkouts = finalWeek.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
    const longestWorkout = nonRestWorkouts.length > 0 
      ? nonRestWorkouts.reduce((longest, current) => 
          (current.distance > longest.distance) ? current : longest, nonRestWorkouts[0])
      : null;
    
    if (longestWorkout) {
      console.log(`   Longest workout: ${longestWorkout.day}, ${longestWorkout.distance} ${unit}, type: ${longestWorkout.workout_type}`);
    }
    
    // Also check workouts on long_run_day
    const longRunDayWorkouts = finalWeek.workouts.filter(w => w.day === longRunDay && w.distance > 0);
    console.log(`   Workouts on ${longRunDay}: ${longRunDayWorkouts.map(w => `${w.workout_type} ${w.distance}${unit}`).join(', ')}`);
    
    // Get goal pace for duration calculation
    const goalPaceSeconds = originalInput.pace_zones?.goal_pace ? 
      parsePaceStringToSeconds(originalInput.pace_zones.goal_pace) : 0;
    
    for (let workout of finalWeek.workouts) {
      const isOnLongRunDay = workout.day === longRunDay;
      
      // CRITICAL: Only the workout on long_run_day should be marked as Race
      // For final week, if it's on long_run_day, it's the race day
      if (isOnLongRunDay) {
        console.log(`🏁 FIXING RACE DAY: ${workout.day} - Changing "${workout.workout_type}" → "Race"`);
        console.log(`   Distance: ${workout.distance} ${unit} → ${expectedRaceDistance} ${unit}`);
        
        workout.workout_type = 'Race';
        workout.intensity = 'Goal-pace';
        workout.distance = expectedRaceDistance; // CRITICAL: Set to full race distance
        
        // Calculate duration based on goal pace
        if (goalPaceSeconds > 0) {
          workout.duration = Math.ceil((expectedRaceDistance * goalPaceSeconds) / 60);
        } else {
          // Fallback duration calculation (assume reasonable pace)
          const fallbackPaceSeconds = unit === 'km' ? 360 : 580; // 6 min/km or ~9:20 min/mile
          workout.duration = Math.ceil((expectedRaceDistance * fallbackPaceSeconds) / 60);
        }
        
        const planTypeName = normalizedPlanType === 'half_marathon' ? 'Half Marathon' : 
                            normalizedPlanType === 'marathon' ? 'Marathon' : 
                            normalizedPlanType === '5k' ? '5K' : 
                            normalizedPlanType === '10k' ? '10K' : 'Race';
        workout.description = `Race day! Follow your nutrition and pacing plan. Good luck!`;
      }
      // Ensure no other workouts are marked as Race in the final week
      else if (workout.workout_type === 'Race') {
        console.log(`🔧 REMOVING incorrect Race marking: ${workout.day} - "Race" → "Easy Run"`);
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        // Keep the existing distance and duration for non-race workouts
      }
    }
    
    // CRITICAL: Ensure no other workout in final week exceeds race distance
    console.log(`🏁 VALIDATING final week distances - ensuring no workout exceeds race distance (${expectedRaceDistance} ${unit})`);
    console.log(`🏁 ENFORCING final week taper - all non-race workouts must be under 6 ${unit}`);
    
    const maxTaperDistance = unit === 'km' ? 6 : 3.7; // 6km or ~3.7 miles
    
    for (const workout of finalWeek.workouts) {
      // Skip race day workout
      if (workout.workout_type === 'Race') {
        continue;
      }
      
      // Skip rest days
      if (workout.workout_type === 'Rest' || workout.distance === 0) {
        continue;
      }
      
      // Check if workout exceeds taper distance limit
      if (workout.distance > maxTaperDistance) {
        console.log(`⚠️  TAPER VIOLATION: ${workout.day} (${workout.workout_type}) has ${workout.distance} ${unit}, exceeds taper limit (${maxTaperDistance} ${unit})`);
        
        const oldDistance = workout.distance;
        workout.distance = maxTaperDistance;
        
        console.log(`🔧 TAPER FIX: ${workout.day} distance ${oldDistance} → ${workout.distance} ${unit}`);
        
        // Recalculate duration proportionally
        if (workout.duration > 0) {
          workout.duration = Math.ceil(workout.duration * (workout.distance / oldDistance));
        }
        
        // Update description to reflect taper
        workout.description = `${workout.workout_type} at taper distance for race week. Focus on freshness and race preparation.`;
      }
      
      // Also check if workout is too close to race distance (legacy check)
      const tolerance = Math.max(expectedRaceDistance * 0.01, unit === 'km' ? 0.5 : 0.3);
      const isExcessive = workout.distance >= (expectedRaceDistance - tolerance);
      
      if (isExcessive) {
        console.log(`⚠️  PROBLEM: ${workout.day} (${workout.workout_type}) has ${workout.distance} ${unit}, which is too close to race distance (${expectedRaceDistance} ${unit})`);
        
        // Reduce the workout distance to be significantly less than race distance
        const maxAllowedDistance = Math.min(maxTaperDistance, Math.max(expectedRaceDistance * 0.7, expectedRaceDistance - (unit === 'km' ? 5 : 3)));
        const oldDistance = workout.distance;
        workout.distance = Math.round(maxAllowedDistance * 2) / 2; // Round to nearest 0.5
        
        console.log(`🔧 REDUCED: ${workout.day} distance ${oldDistance} → ${workout.distance} ${unit}`);
        
        // Recalculate duration proportionally
        if (workout.duration > 0) {
          workout.duration = Math.ceil(workout.duration * (workout.distance / oldDistance));
        }
        
        // Update description to reflect the change
        workout.description = `${workout.workout_type} at reduced distance for race week. Focus on freshness and preparation.`;
      }
    }
    
    // CRITICAL: Validate and fix rest days in final week according to experience level
    console.log(`🏁 VALIDATING final week rest days...`);
    const experience = originalInput.experience || originalInput.running_experience || 'Beginner';
    const daysPerWeek = parseInt(originalInput.days_per_week) || 7;
    const restWorkouts = finalWeek.workouts.filter(w => w.workout_type === 'Rest');
    
    console.log(`   Experience: ${experience}`);
    console.log(`   Days per week: ${daysPerWeek}`);
    console.log(`   Current rest days: ${restWorkouts.length} (${restWorkouts.map(w => w.day).join(', ')})`);
    
    // Determine allowed rest days based on experience and days per week
    let maxAllowedRestDays = 0;
    if ((experience === 'Beginner' || experience === 'Intermediate') && daysPerWeek === 7) {
      maxAllowedRestDays = 1;
    } else if (experience === 'Advanced' || experience === 'Elite') {
      maxAllowedRestDays = 0;
    } else {
      maxAllowedRestDays = 0; // Less than 7 days selected = no rest days
    }
    
    console.log(`   Max allowed rest days: ${maxAllowedRestDays}`);
    
    // Fix excess rest days
    if (restWorkouts.length > maxAllowedRestDays) {
      console.log(`⚠️  PROBLEM: Final week has ${restWorkouts.length} rest days, but only ${maxAllowedRestDays} allowed`);
      
      // Convert excess rest days to Easy Runs, but avoid the race day
      const excessRestDays = restWorkouts.length - maxAllowedRestDays;
      let converted = 0;
      
      for (const restWorkout of restWorkouts) {
        if (converted >= excessRestDays) break;
        if (restWorkout.day === longRunDay) continue; // Don't convert race day
        
        console.log(`🔧 CONVERTING: ${restWorkout.day} Rest → Easy Run`);
        restWorkout.workout_type = 'Easy Run';
        restWorkout.intensity = 'Easy';
        restWorkout.distance = unit === 'km' ? 3 : 2; // Short easy run
        restWorkout.duration = unit === 'km' ? 20 : 15; // Appropriate duration
        restWorkout.description = 'Short easy run for race week. Keep it light and maintain readiness.';
        
        converted++;
      }
      
      console.log(`✅ Converted ${converted} rest day(s) to Easy Run(s)`);
      
      // Recalculate final week total distance after conversions
      const newWeeklyTotal = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
      finalWeek.total_weekly_distance = newWeeklyTotal;
      console.log(`   Updated final week total distance: ${newWeeklyTotal} ${unit}`);
      
    } else if (restWorkouts.length === maxAllowedRestDays) {
      console.log(`✅ Rest days are within limits (${restWorkouts.length}/${maxAllowedRestDays})`);
    }
    
    console.log(`✅ Race day distance fix completed. Final week total: ${finalWeek.total_weekly_distance} ${unit}`);
    
    // CRITICAL: Fix Recovery Run placement in final week - should only be AFTER race day, not before
    console.log(`🏁 FIXING Recovery Run placement in final week...`);
    
    // Find race day
    const raceWorkout = finalWeek.workouts.find(w => w.workout_type === 'Race');
    if (raceWorkout) {
      console.log(`   Race day found: ${raceWorkout.day}`);
      
      // Find the day after race day
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const raceDayIndex = dayNames.indexOf(raceWorkout.day);
      const nextDayIndex = (raceDayIndex + 1) % 7;
      const dayAfterRace = dayNames[nextDayIndex];
      
      console.log(`   Day after race: ${dayAfterRace}`);
      
      // Check for Recovery Runs before race day and convert them
      let recoveryRunsFixed = 0;
      for (const workout of finalWeek.workouts) {
        if (workout.workout_type === 'Recovery Run' && workout.day !== dayAfterRace) {
          console.log(`⚠️  PROBLEM: Recovery Run on ${workout.day} (should only be after race day on ${dayAfterRace})`);
          console.log(`🔧 CONVERTING: ${workout.day} Recovery Run → Easy Run`);
          
          workout.workout_type = 'Easy Run';
          workout.intensity = 'Easy';
          workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
          workout.description = 'Easy run for race week preparation. Keep it light and maintain readiness.';
          
          // Recalculate duration for easy pace
          const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          workout.duration = Math.ceil(workout.distance * easyPaceMinutes);
          
          recoveryRunsFixed++;
        }
      }
      
      if (recoveryRunsFixed > 0) {
        console.log(`✅ Fixed ${recoveryRunsFixed} Recovery Run(s) in final week`);
        
        // Recalculate final week total distance after conversions
        const newWeeklyTotal = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
        finalWeek.total_weekly_distance = newWeeklyTotal;
        console.log(`   Updated final week total distance: ${newWeeklyTotal} ${unit}`);
      } else {
        console.log(`✅ No Recovery Run placement issues found in final week`);
      }
    } else {
      console.log(`   No race day found in final week`);
    }
  }
  
  // Store the original Week 1 data for later replacement
  const originalStoredWeek1 = firstWeekBasic.weekly_plans?.[0] || null;
  
  // CRITICAL: Replace Week 1 with stored first week data to ensure EXACT consistency
  if (completePlan.recommended_plan && completePlan.recommended_plan.weekly_plans && originalStoredWeek1) {
    console.log('🔄 FINAL STEP: Replacing Week 1 with exact stored first week data for consistency (CHUNKED)');
    console.log(`   Stored Week 1 details:`);
    console.log(`     - Workouts: ${originalStoredWeek1.workouts?.length || 0}`);
    console.log(`     - Days: ${originalStoredWeek1.workouts?.map(w => w.day).join(', ') || 'none'}`);
    console.log(`     - Dates: ${originalStoredWeek1.start_date} to ${originalStoredWeek1.end_date}`);
    console.log(`     - Total distance: ${originalStoredWeek1.total_weekly_distance}`);
    
    console.log(`   Current Week 1 details:`);
    const currentWeek1 = completePlan.recommended_plan.weekly_plans[0];
    console.log(`     - Workouts: ${currentWeek1?.workouts?.length || 0}`);
    console.log(`     - Days: ${currentWeek1?.workouts?.map(w => w.day).join(', ') || 'none'}`);
    console.log(`     - Dates: ${currentWeek1?.start_date} to ${currentWeek1?.end_date}`);
    console.log(`     - Total distance: ${currentWeek1?.total_weekly_distance}`);
    
    // Replace with exact copy to ensure identical distances
    completePlan.recommended_plan.weekly_plans[0] = JSON.parse(JSON.stringify(originalStoredWeek1));
    
    console.log('✅ Week 1 replaced with exact stored data - consistency guaranteed between both APIs (CHUNKED)');
  } else {
    console.warn('⚠️ Cannot replace Week 1 - missing stored data or complete plan structure');
  }
  
  console.log(`Successfully generated chunked plan with ${completePlan.recommended_plan.weekly_plans.length} weeks`);
  
  return completePlan;
}

async function generateRemainingWeeks(planId) {
  /**
   * Generate the complete training plan with all details and remaining weeks
   */
  let content = ''; // Declare content variable for error handling
  
  if (!planStorage[planId]) {
    throw new Error('Plan ID not found');
  }

  const storedData = planStorage[planId];
  const originalInput = storedData.original_input;
  const firstWeekBasic = storedData.first_week_basic;
  const totalWeeks = storedData.total_weeks;
  const planType = storedData.plan_type;

  console.log(`Generating complete plan for plan_id: ${planId}, total_weeks: ${totalWeeks}`);
  
  // For very long plans (>16 weeks), use chunked generation strategy
  const isLongPlan = totalWeeks > 16;
  if (isLongPlan) {
    console.log(`⚠️ Long plan detected (${totalWeeks} weeks) - using chunked generation strategy`);
    return await generateChunkedPlan(planId, storedData);
  }

  // Create timestamp
  const timestamp = new Date().toISOString();

  // Get first week data for inclusion in complete plan
  const firstWeekData = firstWeekBasic.weekly_plans?.[0] || {};

  const prompt = REMAINING_WEEKS_PROMPT
    .replace(/{total_weeks}/g, totalWeeks)
    .replace(/{plan_type}/g, planType)
    .replace('{original_input}', JSON.stringify(originalInput, null, 2))
    .replace('{first_week_data}', JSON.stringify(firstWeekData, null, 2))
    .replace('{plan_id}', planId)
    .replace('{timestamp}', timestamp);

  try {
    console.log('Calling OpenAI API for complete plan generation...');
    console.log(`Prompt length: ${prompt.length} characters`);

    // Calculate dynamic timeout based on plan duration
    // Longer plans need more time to generate
    const baseTimeout = 300000; // 5 minutes base (increased from 3)
    const timeoutPerWeek = 30000; // 30 seconds per week (increased from 15)
    const dynamicTimeout = baseTimeout + (totalWeeks * timeoutPerWeek);
    const maxTimeout = 1200000; // 20 minutes maximum (increased from 10)
    let finalTimeout = Math.min(dynamicTimeout, maxTimeout);
    
    console.log(`Using dynamic timeout: ${finalTimeout / 1000} seconds for ${totalWeeks} weeks`);

    // Use different system messages based on plan length
    const systemMessage = isLongPlan 
      ? "Generate complete training plan efficiently. CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', or any other variations. Return only valid JSON. CRITICAL: Include 'user_distance': 0 and 'user_time': 0 for ALL data. Include 'pace_range' and 'description' for EVERY workout. Follow Monday-Sunday structure. Recovery Run day after long_run_day. Round distances to 0.5 units. No back-to-back hard workouts. Taper final weeks. CRITICAL REST RULES: Elite/Advanced runners NEVER get rest days regardless of training days selected. Beginner/Intermediate ONLY get 1 rest day if they select ALL 7 days, otherwise NO rest days. CRITICAL: Long run day MUST have highest distance in each week."
      : "Generate complete training plan with full analysis and all remaining weeks. CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', or any other variations. Return only valid JSON with the complete recommended_plan structure. CRITICAL: Always include 'user_distance': 0 and 'user_time': 0 in BOTH week-level and workout-level data for ALL weeks. CRITICAL: Include 'pace_range' and 'description' fields for EVERY workout in ALL weeks with specific pace guidance. CRITICAL: Each week from Week 2 onwards must follow Monday-to-Sunday structure and include ALL days from specific_days. CRITICAL: From Week 2 onwards, ALWAYS include the long run on long_run_day regardless of Week 1 safety rules. CRITICAL: MANDATORY RECOVERY RUN RULE - The day immediately after long_run_day MUST be a Recovery Run if that day is in specific_days. Recovery runs should be 30-50% of the long run distance, very easy pace (6:45-7:15 min/km or 10:45-11:30 min/mi), with intensity 'Recovery'. This is NON-NEGOTIABLE for injury prevention. CRITICAL: DISTANCE ROUNDING - ALL distances MUST be rounded to nearest 0.5 units. Examples: 1.6 mi → 1.5 mi, 2.2 mi → 2.0 mi, 1.4 mi → 1.5 mi, 0.9 mi → 1.0 mi. NO decimal distances like 1.6, 2.2, 1.4, 0.9 are allowed. CRITICAL: NEVER schedule back-to-back hard workouts - always place Easy/Recovery runs between Tempo, Intervals, and Long Run. CRITICAL: Implement TAPERING in final 1-3 weeks before race (reduce mileage by 20-30% per week, maintain frequency). CRITICAL REST RULES: Elite/Advanced runners NEVER get rest days regardless of training days selected. Beginner/Intermediate ONLY get 1 rest day if they select ALL 7 days, otherwise NO rest days. If Elite/Advanced user lists any number of specific_days, schedule workouts on ALL those days with ZERO rest days. If Beginner/Intermediate lists less than 7 days, schedule workouts on ALL those days with ZERO rest days. CRITICAL: Long run day MUST have highest distance in each week - if not, swap distances with longest workout. CRITICAL: Rest days are SEPARATE from training days - specific_days are training days only, rest is automatic on remaining days. CRITICAL: The first day safety rule (skipping long run if first day = long run day) applies ONLY to Week 1. Long run day must be included each week from Week 2 onwards and must be higher distance than other runs. If race_date provided, ensure final week ends on race_date with proper taper leading up to it.";

    let response;
    let retryCount = 0;
    const maxRetries = isLongPlan ? 2 : 1; // Allow retries for long plans

    while (retryCount <= maxRetries) {
      try {
        response = await client.chat.completions.create({
          model: 'gpt-4o', // Using gpt-4o for complete plan generation (more capable for long plans)
          // temperature: 0.7,
          max_tokens: 16384, // Maximum tokens supported by gpt-4o
          messages: [
            {
              role: 'system',
              content: systemMessage
            },
            { role: 'user', content: `Generate complete marathon training plan. Return ONLY JSON, no other text.\n\n${prompt}` },
          ],
        },
          {timeout: finalTimeout}, // Dynamic timeout based on plan length
        );
        break; // Success, exit retry loop
      } catch (apiError) {
        retryCount++;
        if (apiError.message && apiError.message.includes('timeout')) {
          console.warn(`⚠️ API timeout on attempt ${retryCount}/${maxRetries + 1} for ${totalWeeks}-week plan`);
          if (retryCount <= maxRetries) {
            console.log(`🔄 Retrying with extended timeout...`);
            // Increase timeout for retry significantly
            finalTimeout = Math.min(finalTimeout * 2, 1800000); // Max 30 minutes
            continue;
          }
        }
        throw apiError; // Re-throw if not timeout or max retries reached
      }
    }

    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      console.error('Invalid API response structure:', JSON.stringify(response, null, 2));
      throw new Error('Invalid response from OpenAI API');
    }

    // Main processing block starts here
    {
      let content = response.choices[0].message.content;
    if (!content) {
      console.error('Empty content in API response');
      throw new Error('OpenAI API returned empty content');
    }

    content = content.trim();
    console.log(`Raw response length: ${content.length}`);
    console.log(`First 500 chars: ${content.substring(0, 500)}`);
    
    // Enhanced logging for debugging
    if (content.length > 1000) {
      console.log(`Last 500 chars: ${content.substring(content.length - 500)}`);
    }
    
    // Check for common response issues
    if (content.includes('```json')) {
      console.log('✅ Detected proper JSON markdown formatting');
    } else if (content.includes('```')) {
      console.log('⚠️  Detected markdown but not JSON-specific');
    }
    
    if (!content.includes('recommended_plan')) {
      console.warn('⚠️  Response does not contain "recommended_plan" - this may indicate an incomplete or malformed response');
    }
    
    // Check for truncated response indicators
    if (content.endsWith('...') || content.length < 100) {
      console.warn('⚠️  Response appears to be truncated or too short');
    }
    
    // Log response structure indicators
    const hasSuccess = content.includes('"success": true');
    const hasWeeklyPlans = content.includes('"weekly_plans"');
    console.log(`Response structure check - has success: ${hasSuccess}, has weekly_plans: ${hasWeeklyPlans}`);
    
    // If response seems incomplete, try to construct a minimal valid response
    if (!hasSuccess || !hasWeeklyPlans) {
      console.warn('⚠️  Response appears incomplete, attempting to construct minimal valid response...');
      
      // If we have some JSON structure but it's incomplete, try to extract what we can
      if (content.includes('{') && content.includes('}')) {
        console.log('Found partial JSON structure, will attempt extraction...');
      }
    }

    // Remove markdown if present
    if (content.includes('```')) {
      console.log('Detected markdown code blocks, extracting JSON...');
      const parts = content.split('```');
      for (let part of parts) {
        part = part.trim();
        if (part.startsWith('json')) {
          part = part.substring(4).trim();
        }
        if (part.startsWith('{') && part.endsWith('}')) {
          content = part;
          console.log('Successfully extracted JSON from markdown');
          break;
        }
      }
    }

    // Find JSON boundaries
    const startIdx = content.indexOf('{');
    if (startIdx === -1) {
      console.error('FULL RESPONSE CONTENT:');
      console.error(content);
      throw new Error('No JSON object found in response. LLM may have returned plain text instead of JSON. Check logs above for full response.');
    }

    // More robust brace counting with string handling
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < content.length; i++) {
      const char = content[i];
      
      // Handle string escaping
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      // Handle string boundaries
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      // Only count braces outside of strings
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx === -1) {
      console.error('JSON extraction failed. Brace count:', braceCount);
      console.error('Content around start:', content.substring(Math.max(0, startIdx - 100), startIdx + 500));
      
      // Try alternative parsing methods
      console.log('Attempting alternative JSON extraction...');
      
      // Method 1: Look for the recommended_plan structure
      const planMatch = content.match(/\{[\s\S]*"recommended_plan"[\s\S]*\}/);
      if (planMatch) {
        content = planMatch[0];
        console.log('Found JSON using regex pattern matching');
      } else {
        // Method 2: Try to find the longest valid JSON-like structure
        const jsonMatches = content.match(/\{[^{}]*\}/g);
        if (jsonMatches && jsonMatches.length > 0) {
          // Find the longest match
          let longestMatch = jsonMatches[0];
          for (const match of jsonMatches) {
            if (match.length > longestMatch.length) {
              longestMatch = match;
            }
          }
          content = longestMatch;
          console.log('Using longest JSON-like structure found');
        } else {
          throw new Error('Could not find complete JSON object using any method');
        }
      }
    } else {
      content = content.substring(startIdx, endIdx + 1);
    }
    
    console.log(`Extracted JSON length: ${content.length}`);

    // Clean up any control characters that might cause JSON parsing issues
    content = content.replace(/[\x00-\x1F\x7F]/g, '');

    // Parse JSON with better error handling
    let completePlan;
    try {
      completePlan = JSON.parse(content);
      console.log('✅ JSON parsing successful');
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError.message);
      console.error('First 200 characters of content:', content.substring(0, 200));
      console.error('Last 200 characters of content:', content.substring(Math.max(0, content.length - 200)));
      
      // Try to fix common JSON issues
      console.log('Attempting JSON repair...');
      
      // Fix common issues: trailing commas, unclosed braces, etc.
      let repairedContent = content;
      
      // Remove trailing commas
      repairedContent = repairedContent.replace(/,\s*}/g, '}');
      repairedContent = repairedContent.replace(/,\s*]/g, ']');
      
      // Ensure proper closing
      if (!repairedContent.trim().endsWith('}')) {
        // Try to find the last complete object
        const lastBrace = repairedContent.lastIndexOf('}');
        if (lastBrace !== -1) {
          repairedContent = repairedContent.substring(0, lastBrace + 1);
        }
      }
      
      try {
        completePlan = JSON.parse(repairedContent);
        console.log('✅ JSON repair successful');
      } catch (repairError) {
        console.error('❌ JSON repair failed:', repairError.message);
        throw new Error(`Failed to parse JSON response: ${parseError.message}. Content length: ${content.length}`);
      }
    }

    // CRITICAL: Validate that the AI generated the correct number of weeks
    const generatedWeeks = completePlan.recommended_plan?.weekly_plans?.length || 0;
    if (generatedWeeks !== totalWeeks) {
      console.error(`❌ WEEK COUNT MISMATCH: Expected ${totalWeeks} weeks, got ${generatedWeeks} weeks`);
      throw new Error(`AI generated ${generatedWeeks} weeks instead of the requested ${totalWeeks} weeks. This is a critical error.`);
    }
    console.log(`✅ Week count validation passed: ${generatedWeeks}/${totalWeeks} weeks generated`);

    // Store the original Week 1 data for later replacement
    const originalStoredWeek1 = firstWeekBasic.weekly_plans?.[0] || null;

    // Parse goal pace from original input
    const unit = originalInput.measurement_unit === 'km' ? 'km' : 'miles';

    // CRITICAL: Validate and fix AI-generated complete plan to ensure all rules are followed
    // BUT SKIP WEEK 1 - it should remain exactly as returned by the first API
    if (completePlan.recommended_plan) {
      console.log('🔍 Starting comprehensive AI plan validation and fixing...');
      
      // CRITICAL: Fix missing days in Week 2+ FIRST (before other validations)
      const specificDaysArray = originalInput.specific_days ? 
        originalInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
      const longRunDay = originalInput.long_run_day || 'Sunday';
      
      console.log(`   Expected specific_days: ${specificDaysArray.join(', ')} (${specificDaysArray.length} days)`);
      console.log(`   Long run day: ${longRunDay}`);
      
      for (let i = 0; i < completePlan.recommended_plan.weekly_plans.length; i++) {
        const week = completePlan.recommended_plan.weekly_plans[i];
        
        // CRITICAL: Skip Week 1 validation to maintain consistency with first API
        if (week.week_number === 1) {
          console.log('⏭️  Skipping Week 1 validation to maintain consistency with first API response');
          continue;
        }
        
        console.log(`\n📅 Validating Week ${week.week_number}...`);
        console.log(`   Current workout days: ${week.workouts.map(w => w.day).join(', ')} (${week.workouts.length} days)`);
        
        // CRITICAL: Check if all specific_days are included and add missing days if needed
        const workoutDays = week.workouts.map(w => w.day);
        const missingDays = specificDaysArray.filter(day => !workoutDays.includes(day));
        
        if (missingDays.length > 0) {
          console.log(`   ❌ MISSING DAYS: ${missingDays.join(', ')} - Adding them now`);
          
          // Add missing days as Easy Runs
          for (const missingDay of missingDays) {
            console.log(`     Adding missing day: ${missingDay} as Easy Run`);
            
            // Calculate date for missing day
            const weekStartDate = new Date(week.start_date);
            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const dayIndex = dayNames.indexOf(missingDay);
            const workoutDate = new Date(weekStartDate);
            workoutDate.setDate(weekStartDate.getDate() + dayIndex);
            
            const newWorkout = {
              day: missingDay,
              date: workoutDate.toISOString().split('T')[0],
              workout_type: 'Easy Run',
              distance: unit === 'km' ? 3 : 2,
              duration: unit === 'km' ? 20 : 15,
              intensity: 'Easy',
              pace_range: unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi",
              description: "Easy conversational run. Should feel comfortable and sustainable.",
              user_distance: 0,
              user_time: 0
            };
            
            week.workouts.push(newWorkout);
          }
          
          // Sort workouts by day order
          const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          week.workouts.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
          
          // Recalculate total weekly distance
          week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
          console.log(`     ✅ Added ${missingDays.length} missing day(s), new total: ${week.total_weekly_distance} ${unit}`);
        }
      }
      
      // CRITICAL: Validate and fix invalid workout types (SKIP WEEK 1)
      const weeklyPlansToFixTypes = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      validateAndFixWorkoutTypes(weeklyPlansToFixTypes);
      
      // CRITICAL: Remove rest days for Elite/Advanced users who selected less than 7 days
      // BUT SKIP WEEK 1 to maintain consistency
      const weeklyPlansToFix = completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1);
      removeInvalidRestDays({ weekly_plans: weeklyPlansToFix }, originalInput);
      
      // CRITICAL: Ensure long run day has highest distance in each week
      // BUT SKIP WEEK 1 to maintain consistency
      ensureLongRunIsHighest({ weekly_plans: weeklyPlansToFix }, originalInput.long_run_day, unit);
    }
    
    const marathonDistance = unit === 'km' ? 42.2 : 26.2;
    let goalPaceSeconds = 0;

    if (originalInput.goal_race_time) {
      goalPaceSeconds = parseGoalPace(originalInput.goal_race_time, marathonDistance);
    } else if (originalInput.estimated_race_time) {
      const timeStr = originalInput.estimated_race_time.includes('-')
        ? originalInput.estimated_race_time.split('-')[0].trim()
        : originalInput.estimated_race_time;
      goalPaceSeconds = parseGoalPace(timeStr, marathonDistance);
    }

    // Validate and fix intensities for all weeks (SKIP WEEK 1)
    const weeklyPlans = completePlan.recommended_plan?.weekly_plans || [];
    if (goalPaceSeconds > 0) {
      for (const week of weeklyPlans) {
        if (week.week_number === 1) {
          console.log('⏭️  Skipping Week 1 intensity validation to maintain consistency');
          continue;
        }
        for (let i = 0; i < week.workouts.length; i++) {
          week.workouts[i] = validateAndFixIntensity(week.workouts[i], goalPaceSeconds, unit);
        }
      }
    }

    // CRITICAL: Fix invalid dates (e.g., Feb 29 in non-leap years)
    fixPlanDates(completePlan);

    // Fix Week 1 workout distances for beginners with no base (CRITICAL FOR SAFETY)
    // SKIP THIS - Week 1 should remain as generated by first API
    const experience = originalInput.running_experience || 'Intermediate';
    const weeklyMileage = originalInput.weekly_mileage_past_4_weeks || '0';
    console.log('⏭️  Skipping Week 1 distance fixing to maintain consistency with first API response');
    
    // Round all distances to nearest 0.5 units (CRITICAL FOR CONSISTENCY)
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const weeklyPlansToRound = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      roundAllDistances(weeklyPlansToRound, unit);
    }

    // Fix long run day assignment for all weeks (CRITICAL FIX)
    // SKIP WEEK 1 to maintain consistency
    if (originalInput.long_run_day && completePlan.recommended_plan) {
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      fixLongRunDayAssignment(weeklyPlansToFix, originalInput.long_run_day, unit);
    }

    // CRITICAL: Add recovery runs after long runs for all weeks
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const specificDaysArray = originalInput.specific_days ? 
        originalInput.specific_days.split(',').map(d => d.trim()) : [];
      const longRunDay = originalInput.long_run_day || 'Sunday';
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      addRecoveryRunsAfterLongRuns(weeklyPlansToFix, longRunDay, specificDaysArray, unit);
    }

    // CRITICAL: Enforce single recovery run rule for all weeks
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const longRunDay = originalInput.long_run_day || 'Sunday';
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      enforceSingleRecoveryRunRule(weeklyPlansToFix, longRunDay, unit);
    }

    // CRITICAL: Enforce rest day requirements for all weeks
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const specificDaysArray = originalInput.specific_days ? 
        originalInput.specific_days.split(',').map(d => d.trim()) : [];
      const experience = originalInput.running_experience || 'Intermediate';
      const longRunDay = originalInput.long_run_day || 'Sunday';
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      enforceRestDayRequirements(weeklyPlansToFix, experience, specificDaysArray, longRunDay);
    }

    // CRITICAL FIX: Remove any Recovery Runs from first workout day and ensure proper placement
    // SKIP WEEK 1 to maintain consistency with first API
    if (completePlan.recommended_plan && originalInput.start_date && originalInput.specific_days && originalInput.long_run_day) {
      console.log('⏭️  Skipping first day recovery run fix for Week 1 to maintain consistency');
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      weeklyPlansToFix.weekly_plans = weeklyPlansToFix.weekly_plans.map(week => 
        fixFirstDayRecoveryRunIssue(
          { weekly_plans: [week] }, 
          originalInput.start_date, 
          originalInput.specific_days, 
          originalInput.long_run_day, 
          unit
        ).weekly_plans[0]
      );
    }

    // Validate and fix Long Run distance - ensure Long Run has longest distance in each week
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      validateAndFixLongRunDistance(weeklyPlansToFix, unit);
    }

    // CRITICAL: Validate and fix workout type and intensity consistency (AFTER pace-based validation)
    // NOTE: This runs BEFORE race day detection, so Race workouts won't be affected
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      validateAndFixWorkoutTypeIntensity(weeklyPlansToFix);
    }

    // CRITICAL: Validate and fix workout distances (ensure non-rest workouts have distance > 0)
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      validateAndFixWorkoutDistances(weeklyPlansToFix, unit);
    }

    // Fix duplicate distances (anti-repetition rule) for all weeks EXCEPT Week 1
    for (const week of weeklyPlans) {
      if (week.week_number === 1) {
        console.log('⏭️  Skipping Week 1 duplicate distance fix to maintain consistency');
        continue;
      }
      fixDuplicateDistances(week, unit);
    }

    // CRITICAL: Re-validate long run distances AFTER all other modifications
    // This ensures that functions like fixDuplicateDistances don't break the long run validation
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      console.log('🔄 Re-validating long run distances after all modifications (skipping Week 1)...');
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      validateAndFixLongRunDistance(weeklyPlansToFix, unit);
    }

    // CRITICAL: Fix race day AFTER all other validations to ensure it's not overwritten
    // This must be the LAST validation step
    if (weeklyPlans.length > 0) {
      const finalWeek = weeklyPlans[weeklyPlans.length - 1];
      const longRunDay = originalInput.long_run_day || 'Sunday';
      
      // Normalize plan type to handle variations
      let normalizedPlanType = (planType || '').toLowerCase().trim();
      if (normalizedPlanType.includes('half')) {
        normalizedPlanType = 'half marathon';
      } else if (normalizedPlanType === '5k' || normalizedPlanType === '5 k') {
        normalizedPlanType = '5k';
      } else if (normalizedPlanType === '10k' || normalizedPlanType === '10 k') {
        normalizedPlanType = '10k';
      } else if (!normalizedPlanType || normalizedPlanType === 'marathon') {
        normalizedPlanType = 'marathon';
      }
      
      // Calculate expected race distance based on plan type
      const raceDistances = {
        'marathon': unit === 'km' ? 42.2 : 26.2,
        'half marathon': unit === 'km' ? 21.1 : 13.1,
        'half_marathon': unit === 'km' ? 21.1 : 13.1,
        '10k': unit === 'km' ? 10.0 : 6.2,
        '5k': unit === 'km' ? 5.0 : 3.1
      };
      const expectedRaceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];
      
      console.log(`🏁 FINAL RACE DAY DETECTION: Week ${finalWeek.week_number}`);
      console.log(`   Plan Type: "${planType}" → normalized: "${normalizedPlanType}"`);
      console.log(`   Expected Race Distance: ${expectedRaceDistance} ${unit}`);
      console.log(`   Long Run Day: "${longRunDay}"`);
      
      // Find the longest workout in the final week
      const nonRestWorkouts = finalWeek.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
      const longestWorkout = nonRestWorkouts.length > 0 
        ? nonRestWorkouts.reduce((longest, current) => 
            (current.distance > longest.distance) ? current : longest, nonRestWorkouts[0])
        : null;
      
      if (longestWorkout) {
        console.log(`   Longest workout: ${longestWorkout.day}, ${longestWorkout.distance} ${unit}, type: ${longestWorkout.workout_type}`);
      }
      
      // Also check workouts on long_run_day
      const longRunDayWorkouts = finalWeek.workouts.filter(w => w.day === longRunDay && w.distance > 0);
      console.log(`   Workouts on ${longRunDay}: ${longRunDayWorkouts.map(w => `${w.workout_type} ${w.distance}${unit}`).join(', ')}`);
      
      for (let workout of finalWeek.workouts) {
        const isOnLongRunDay = workout.day === longRunDay;
        const isLongRun = workout.workout_type === 'Long Run';
        const isLongest = longestWorkout && workout.distance === longestWorkout.distance;
        const distanceMatch = Math.abs(workout.distance - expectedRaceDistance) <= (expectedRaceDistance * 0.15);
        const isCloseToRaceDistance = workout.distance >= (expectedRaceDistance * 0.7) && workout.distance <= (expectedRaceDistance * 1.2);
        
        // CRITICAL: Only the workout on long_run_day should be marked as Race
        // For final week, if it's on long_run_day, it's the race day
        if (isOnLongRunDay) {
          console.log(`🏁 FIXING RACE DAY: ${workout.day} - Changing "${workout.workout_type}" → "Race"`);
          console.log(`   Distance: ${workout.distance} ${unit} → ${expectedRaceDistance} ${unit}`);
          
          workout.workout_type = 'Race';
          workout.intensity = 'Goal-pace';
          workout.distance = expectedRaceDistance; // CRITICAL: Set to full race distance
          
          // Calculate duration based on goal pace
          if (goalPaceSeconds > 0) {
            workout.duration = Math.ceil((expectedRaceDistance * goalPaceSeconds) / 60);
          } else {
            // Fallback duration calculation (assume reasonable pace)
            const fallbackPaceSeconds = unit === 'km' ? 360 : 580; // 6 min/km or ~9:20 min/mile
            workout.duration = Math.ceil((expectedRaceDistance * fallbackPaceSeconds) / 60);
          }
          
          const planTypeName = normalizedPlanType === 'half marathon' ? 'Half Marathon' : 
                              normalizedPlanType === 'marathon' ? 'Marathon' : 
                              normalizedPlanType === '5k' ? '5K' : 
                              normalizedPlanType === '10k' ? '10K' : 'Race';
          workout.description = `Race day! Follow your nutrition and pacing plan. Good luck!`;
        }
        // Ensure no other workouts are marked as Race in the final week
        else if (workout.workout_type === 'Race') {
          console.log(`🔧 REMOVING incorrect Race marking: ${workout.day} - "Race" → "Easy Run"`);
          workout.workout_type = 'Easy Run';
          workout.intensity = 'Easy';
          // Keep the existing distance and duration for non-race workouts
        }
      }
      
      // CRITICAL: Ensure no other workout in final week exceeds race distance
      console.log(`🏁 VALIDATING final week distances - ensuring no workout exceeds race distance (${expectedRaceDistance} ${unit})`);
      console.log(`🏁 ENFORCING final week taper - all non-race workouts must be under 6 ${unit}`);
      
      const maxTaperDistance = unit === 'km' ? 6 : 3.7; // 6km or ~3.7 miles
      
      for (const workout of finalWeek.workouts) {
        // Skip race day workout
        if (workout.workout_type === 'Race') {
          continue;
        }
        
        // Skip rest days
        if (workout.workout_type === 'Rest' || workout.distance === 0) {
          continue;
        }
        
        // Check if workout exceeds taper distance limit
        if (workout.distance > maxTaperDistance) {
          console.log(`⚠️  TAPER VIOLATION: ${workout.day} (${workout.workout_type}) has ${workout.distance} ${unit}, exceeds taper limit (${maxTaperDistance} ${unit})`);
          
          const oldDistance = workout.distance;
          workout.distance = maxTaperDistance;
          
          console.log(`🔧 TAPER FIX: ${workout.day} distance ${oldDistance} → ${workout.distance} ${unit}`);
          
          // Recalculate duration based on workout type and pace
          if (workout.intensity === 'Easy' || workout.workout_type === 'Easy Run') {
            const easyPaceSeconds = unit === 'km' ? 390 : 630; // 6:30 min/km or ~10:30 min/mile
            workout.duration = Math.ceil((workout.distance * easyPaceSeconds) / 60);
          } else if (workout.intensity === 'Recovery') {
            const recoveryPaceSeconds = unit === 'km' ? 420 : 660; // 7:00 min/km or ~11:00 min/mile
            workout.duration = Math.ceil((workout.distance * recoveryPaceSeconds) / 60);
          } else {
            // Default pace calculation
            const defaultPaceSeconds = unit === 'km' ? 360 : 580; // 6:00 min/km or ~9:40 min/mile
            workout.duration = Math.ceil((workout.distance * defaultPaceSeconds) / 60);
          }
          
          // Update description to reflect taper
          workout.description = `${workout.workout_type} at taper distance for race week. Focus on freshness and race preparation.`;
        }
        
        // Also check if workout is too close to race distance (legacy check)
        const tolerance = Math.max(expectedRaceDistance * 0.01, unit === 'km' ? 0.5 : 0.3);
        const isExcessive = workout.distance >= (expectedRaceDistance - tolerance);
        
        if (isExcessive) {
          console.log(`⚠️  PROBLEM: ${workout.day} (${workout.workout_type}) has ${workout.distance} ${unit}, which is too close to race distance (${expectedRaceDistance} ${unit})`);
          
          // Reduce the workout distance to be significantly less than race distance
          const maxAllowedDistance = Math.min(maxTaperDistance, Math.max(expectedRaceDistance * 0.7, expectedRaceDistance - (unit === 'km' ? 5 : 3)));
          const oldDistance = workout.distance;
          workout.distance = Math.round(maxAllowedDistance * 2) / 2; // Round to nearest 0.5
          
          console.log(`🔧 REDUCED: ${workout.day} distance ${oldDistance} → ${workout.distance} ${unit}`);
          
          // Recalculate duration based on workout type and pace
          if (workout.intensity === 'Easy' || workout.workout_type === 'Easy Run') {
            const easyPaceSeconds = unit === 'km' ? 390 : 630; // 6:30 min/km or ~10:30 min/mile
            workout.duration = Math.ceil((workout.distance * easyPaceSeconds) / 60);
          } else if (workout.intensity === 'Recovery') {
            const recoveryPaceSeconds = unit === 'km' ? 420 : 660; // 7:00 min/km or ~11:00 min/mile
            workout.duration = Math.ceil((workout.distance * recoveryPaceSeconds) / 60);
          } else {
            // Default pace calculation
            const defaultPaceSeconds = unit === 'km' ? 360 : 580; // 6:00 min/km or ~9:40 min/mile
            workout.duration = Math.ceil((workout.distance * defaultPaceSeconds) / 60);
          }
          
          // Update description to reflect the change
          workout.description = `${workout.workout_type} at reduced distance for race week. Focus on freshness and preparation.`;
        }
      }
      
      // CRITICAL: Validate and fix rest days in final week according to experience level
      console.log(`🏁 VALIDATING final week rest days...`);
      const experience = originalInput.experience || originalInput.running_experience || 'Beginner';
      const daysPerWeek = parseInt(originalInput.days_per_week) || 7;
      const restWorkouts = finalWeek.workouts.filter(w => w.workout_type === 'Rest');
      
      console.log(`   Experience: ${experience}`);
      console.log(`   Days per week: ${daysPerWeek}`);
      console.log(`   Current rest days: ${restWorkouts.length} (${restWorkouts.map(w => w.day).join(', ')})`);
      
      // Determine allowed rest days based on experience and days per week
      let maxAllowedRestDays = 0;
      if ((experience === 'Beginner' || experience === 'Intermediate') && daysPerWeek === 7) {
        maxAllowedRestDays = 1;
      } else if (experience === 'Advanced' || experience === 'Elite') {
        maxAllowedRestDays = 0;
      } else {
        maxAllowedRestDays = 0; // Less than 7 days selected = no rest days
      }
      
      console.log(`   Max allowed rest days: ${maxAllowedRestDays}`);
      
      // Fix excess rest days
      if (restWorkouts.length > maxAllowedRestDays) {
        console.log(`⚠️  PROBLEM: Final week has ${restWorkouts.length} rest days, but only ${maxAllowedRestDays} allowed`);
        
        // Convert excess rest days to Easy Runs, but avoid the race day
        const excessRestDays = restWorkouts.length - maxAllowedRestDays;
        let converted = 0;
        
        for (const restWorkout of restWorkouts) {
          if (converted >= excessRestDays) break;
          if (restWorkout.day === longRunDay) continue; // Don't convert race day
          
          console.log(`🔧 CONVERTING: ${restWorkout.day} Rest → Easy Run`);
          restWorkout.workout_type = 'Easy Run';
          restWorkout.intensity = 'Easy';
          restWorkout.distance = unit === 'km' ? 3 : 2; // Short easy run
          restWorkout.duration = unit === 'km' ? 20 : 15; // Appropriate duration
          restWorkout.description = 'Short easy run for race week. Keep it light and maintain readiness.';
          
          converted++;
        }
        
        console.log(`✅ Converted ${converted} rest day(s) to Easy Run(s)`);
        
        // Recalculate final week total distance after conversions
        const newWeeklyTotal = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
        finalWeek.total_weekly_distance = newWeeklyTotal;
        console.log(`   Updated final week total distance: ${newWeeklyTotal} ${unit}`);
        
      } else if (restWorkouts.length === maxAllowedRestDays) {
        console.log(`✅ Rest days are within limits (${restWorkouts.length}/${maxAllowedRestDays})`);
      }
      
      // CRITICAL: Fix Recovery Run placement in final week - should only be AFTER race day, not before
      console.log(`🏁 FIXING Recovery Run placement in final week...`);
      
      // Find race day
      const raceWorkout = finalWeek.workouts.find(w => w.workout_type === 'Race');
      if (raceWorkout) {
        console.log(`   Race day found: ${raceWorkout.day}`);
        
        // Find the day after race day
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const raceDayIndex = dayNames.indexOf(raceWorkout.day);
        const nextDayIndex = (raceDayIndex + 1) % 7;
        const dayAfterRace = dayNames[nextDayIndex];
        
        console.log(`   Day after race: ${dayAfterRace}`);
        
        // Check for Recovery Runs before race day and convert them
        let recoveryRunsFixed = 0;
        for (const workout of finalWeek.workouts) {
          if (workout.workout_type === 'Recovery Run' && workout.day !== dayAfterRace) {
            console.log(`⚠️  PROBLEM: Recovery Run on ${workout.day} (should only be after race day on ${dayAfterRace})`);
            console.log(`🔧 CONVERTING: ${workout.day} Recovery Run → Easy Run`);
            
            workout.workout_type = 'Easy Run';
            workout.intensity = 'Easy';
            workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
            workout.description = 'Easy run for race week preparation. Keep it light and maintain readiness.';
            
            // Recalculate duration for easy pace
            const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
            workout.duration = Math.ceil(workout.distance * easyPaceMinutes);
            
            recoveryRunsFixed++;
          }
        }
        
        if (recoveryRunsFixed > 0) {
          console.log(`✅ Fixed ${recoveryRunsFixed} Recovery Run(s) in final week`);
          
          // Recalculate final week total distance after conversions
          const newWeeklyTotal = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
          finalWeek.total_weekly_distance = newWeeklyTotal;
          console.log(`   Updated final week total distance: ${newWeeklyTotal} ${unit}`);
        } else {
          console.log(`✅ No Recovery Run placement issues found in final week`);
        }
      } else {
        console.log(`   No race day found in final week`);
      }
    }

    // Update weekly totals for all weeks in the complete plan
    let totalPlanDistance = 0;

    for (const week of weeklyPlans) {
      const weeklyTotal = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
      week.total_weekly_distance = weeklyTotal;
      totalPlanDistance += weeklyTotal;
    }

    // Add total_distance to the plan
    if (completePlan.recommended_plan) {
      completePlan.recommended_plan.target_distance = totalPlanDistance;
    }

    console.log(`✅ Race day distance fix completed. Final week total: ${weeklyPlans[weeklyPlans.length - 1]?.total_weekly_distance} ${unit}`);

    // CRITICAL: Final long run distance validation AFTER all modifications
    // This ensures that race day detection and other modifications don't break long run validation
    // SKIP WEEK 1 to maintain consistency
    if (completePlan.recommended_plan) {
      console.log('🔄 Final long run distance validation after race day detection (skipping Week 1)...');
      const weeklyPlansToFix = { 
        weekly_plans: completePlan.recommended_plan.weekly_plans.filter(w => w.week_number !== 1) 
      };
      validateAndFixLongRunDistance(weeklyPlansToFix, unit);
    }
    // Validate the plan for common issues
    const validation = validateTrainingPlan(
      completePlan,
      originalInput.running_experience || 'Intermediate',
      planType,
      unit
    );

    if (validation.warnings.length > 0) {
      console.warn(`⚠️  Plan validation found ${validation.totalWarnings} issue(s):`);
      validation.warnings.forEach(w => {
        console.warn(`  [${w.severity}] Week ${w.week}: ${w.message}`);
      });

      // Add validation warnings to the response
      if (completePlan.recommended_plan) {
        completePlan.recommended_plan.validation_warnings = validation.warnings;
      }
    } else {
      console.log('✅ Plan validation passed - no issues found');
    }

    // CRITICAL: Fix plan dates to match the adjusted start_date (handles AM/PM logic)
    // This MUST happen AFTER Week 1 replacement to ensure Week 2+ have correct dates
    if (completePlan.recommended_plan && completePlan.recommended_plan.weekly_plans && originalStoredWeek1) {
      console.log('� FIxNAL STEP: Replacing Week 1 with exact stored first week data for consistency');
      console.log(`   Original Week 1 total distance: ${originalStoredWeek1.total_weekly_distance}`);
      console.log(`   AI-generated Week 1 total distance: ${completePlan.recommended_plan.weekly_plans[0]?.total_weekly_distance}`);
      
      // CRITICAL FIX: Create a deep copy and ensure it's exactly the same as the first API response
      const exactWeek1Copy = JSON.parse(JSON.stringify(originalStoredWeek1));
      
      // Ensure the copy has the exact same structure and data
      completePlan.recommended_plan.weekly_plans[0] = exactWeek1Copy;
      
      console.log('✅ Week 1 replaced with exact stored data');
      
      // NOW fix all dates including Week 2+ progression based on Week 1's end date
      console.log('🔧 Fixing Week 2+ dates to ensure correct progression from Week 1');
      fixWeekProgressionDates(completePlan.recommended_plan);
    } else if (completePlan.recommended_plan) {
      console.log('🔧 Fixing ALL week dates to ensure correct progression');
      fixPlanDatesFromAdjustedStartDate(completePlan.recommended_plan, originalInput.start_date);
    }

    console.log(`Successfully generated complete plan with ${weeklyPlans.length} weeks`);
    return completePlan;
    } // End of main processing block

  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`JSON Parse Error: ${error.message}`);
      console.error(`Problematic content length: ${content.length}`);
      console.error(`First 1000 chars: ${content.substring(0, 1000)}`);
      console.error(`Last 1000 chars: ${content.substring(Math.max(0, content.length - 1000))}`);
      throw new Error(`Failed to parse complete plan JSON: ${error.message}`);
    }
    console.error(`Unexpected error: ${error.message}`);
    console.error(error.stack);
    throw new Error(`Error generating complete plan: ${error.message}`);
  }
}

// API Endpoints
app.post('/generate-plan', async (req, res) => {
  /**
   * Generate the first week of a training plan
   */
  try {
    const userInput = req.body;
    
    // Debug logging for server vs localhost differences
    console.log('🔍 Generate Plan Request Debug:');
    console.log(`   Request timestamp: ${new Date().toISOString()}`);
    console.log(`   User input start_date: ${userInput.start_date}`);
    console.log(`   Server timezone offset: ${new Date().getTimezoneOffset()} minutes`);
    
    const result = await generateFirstWeek(userInput);
    
    // Log the result for debugging
    if (result.success && result.weekly_plans && result.weekly_plans[0]) {
      const week1 = result.weekly_plans[0];
      console.log(`   Generated Week 1: ${week1.start_date} to ${week1.end_date}`);
      console.log(`   Week 1 workouts: ${week1.workouts.length}`);
      week1.workouts.forEach(w => {
        console.log(`     ${w.day} ${w.date}: ${w.workout_type} (${w.distance}km)`);
      });
    }

    res.json(result);
  } catch (error) {
    console.error(`Error in generate_plan_endpoint: ${error.message}`);
    res.status(500).json({ error: `Error generating plan: ${error.message}` });
  }
});

app.post('/get-remaining-plan', async (req, res) => {
  /**
   * Get the remaining weeks of a training plan using plan_id
   */
  try {
    const { plan_id } = req.body;

    console.log(`Received request for plan_id: ${plan_id}`);

    // Check if plan exists before processing
    if (!planStorage[plan_id]) {
      console.log(`Plan ID ${plan_id} not found in storage`);
      console.log(`Available plan IDs: ${Object.keys(planStorage)}`);
      return res.status(404).json({ error: 'Plan ID not found' });
    }

    const result = await generateRemainingWeeks(plan_id);

    res.json(result);
  } catch (error) {
    if (error.message === 'Plan ID not found') {
      return res.status(404).json({ error: 'Plan ID not found' });
    }
    console.error(`Error in get_remaining_plan_endpoint: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({ error: `Error generating remaining plan: ${error.message}` });
  }
});

app.get('/health', (req, res) => {
  /**
   * Health check endpoint
   */
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/plan-status/:plan_id', (req, res) => {
  /**
   * Check if a plan_id exists and get basic info
   */
  const { plan_id } = req.params;

  if (!planStorage[plan_id]) {
    return res.status(404).json({ error: 'Plan ID not found' });
  }

  const storedData = planStorage[plan_id];
  res.json({
    plan_id: plan_id,
    total_weeks: storedData.total_weeks,
    generated_at: storedData.generated_at,
    has_remaining_weeks: true
  });
});

app.post('/calculate-pace-zones', (req, res) => {
  /**
   * Calculate pace zones based on goal race time
   * Body: { goal_race_time, race_distance, experience, measurement_unit }
   */
  try {
    const { goal_race_time, race_distance, experience, measurement_unit } = req.body;

    if (!goal_race_time || !race_distance) {
      return res.status(400).json({ 
        error: 'Missing required fields: goal_race_time and race_distance' 
      });
    }

    const unit = measurement_unit === 'km' ? 'km' : 'miles';
    const paceZones = calculatePaceZones(
      goal_race_time,
      race_distance,
      experience || 'Intermediate',
      unit
    );

    if (!paceZones) {
      return res.status(400).json({ error: 'Invalid input for pace calculation' });
    }

    res.json({
      success: true,
      pace_zones: paceZones,
      measurement_unit: unit,
      experience: experience || 'Intermediate',
      notes: {
        easy: 'Conversational pace, should be able to talk in full sentences',
        long: 'Comfortable, sustainable pace for long distances',
        tempo: 'Comfortably hard, sustainable for 45-75 minutes',
        threshold: 'Hard but controlled, race pace effort',
        intervals: 'Hard effort with recovery periods between',
        recovery: 'Very easy, active recovery pace'
      }
    });
  } catch (error) {
    console.error(`Error calculating pace zones: ${error.message}`);
    res.status(500).json({ error: `Error calculating pace zones: ${error.message}` });
  }
});

app.post('/calculate-plan-duration', (req, res) => {
  /**
   * Calculate plan duration based on start and race dates
   * Body: { start_date, race_date, min_weeks, max_weeks }
   */
  try {
    const { start_date, race_date, min_weeks, max_weeks } = req.body;

    if (!start_date || !race_date) {
      return res.status(400).json({ 
        error: 'Missing required fields: start_date and race_date' 
      });
    }

    const duration = calculateDurationFromRaceDate(
      start_date,
      race_date,
      min_weeks || 8,
      max_weeks || 20
    );

    const start = new Date(start_date);
    const race = new Date(race_date);
    const diffTime = Math.abs(race - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      start_date: start_date,
      race_date: race_date,
      calculated_duration_weeks: duration,
      total_days: diffDays,
      min_weeks_allowed: min_weeks || 8,
      max_weeks_allowed: max_weeks || 20,
      notes: duration < (min_weeks || 8) 
        ? 'Duration is less than minimum recommended weeks. Consider starting earlier.'
        : duration > (max_weeks || 20)
        ? 'Duration exceeds maximum recommended weeks. Plan will be capped.'
        : 'Duration is within recommended range.'
    });
  } catch (error) {
    console.error(`Error calculating plan duration: ${error.message}`);
    res.status(500).json({ error: `Error calculating plan duration: ${error.message}` });
  }
});

app.post('/validate-rest-days', (req, res) => {
  /**
   * Validate rest day requirements based on experience and training days
   * Body: { experience, training_days }
   */
  try {
    const { experience, training_days } = req.body;

    if (!experience || !training_days) {
      return res.status(400).json({ 
        error: 'Missing required fields: experience and training_days' 
      });
    }

    const requirements = determineRestDayRequirements(experience, training_days);

    res.json({
      success: true,
      experience: experience,
      training_days: training_days,
      rest_day_requirements: requirements,
      recommendation: requirements.warning || 'Rest day schedule is appropriate for your experience level.'
    });
  } catch (error) {
    console.error(`Error validating rest days: ${error.message}`);
    res.status(500).json({ error: `Error validating rest days: ${error.message}` });
  }
});

/**
 * Fix week progression dates starting from Week 2, using Week 1's end date as reference
 * @param {Object} planJson - Plan JSON object with weekly_plans
 * @returns {Object} - Fixed plan JSON
 */
function fixWeekProgressionDates(planJson) {
  if (!planJson || !planJson.weekly_plans || planJson.weekly_plans.length < 2) {
    console.log('   No Week 2+ to fix');
    return planJson;
  }
  
  const weeklyPlans = planJson.weekly_plans;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  console.log(`   Fixing dates for ${weeklyPlans.length - 1} weeks (Week 2 to ${weeklyPlans.length})`);
  
  // Use Week 1's end date as the reference point
  const week1EndDate = new Date(weeklyPlans[0].end_date);
  console.log(`   Week 1 ends on: ${week1EndDate.toISOString().split('T')[0]}`);
  
  // Fix dates for Week 2 onwards
  for (let i = 1; i < weeklyPlans.length; i++) {
    const week = weeklyPlans[i];
    const weekNumber = week.week_number || (i + 1);
    
    console.log(`   Fixing Week ${weekNumber} dates...`);
    
    // Calculate this week's start date: Monday after previous week's end
    const previousWeek = weeklyPlans[i - 1];
    const previousWeekEndDate = new Date(previousWeek.end_date);
    
    // Week starts the Monday after previous week ends
    const weekStartDate = new Date(previousWeekEndDate);
    weekStartDate.setUTCDate(previousWeekEndDate.getUTCDate() + 1); // Day after previous week ends
    
    // Ensure it's a Monday
    const startDayOfWeek = weekStartDate.getUTCDay(); // 0 = Sunday, 1 = Monday
    if (startDayOfWeek !== 1) { // If not Monday
      const daysToMonday = startDayOfWeek === 0 ? 1 : 8 - startDayOfWeek; // Days to next Monday
      weekStartDate.setUTCDate(weekStartDate.getUTCDate() + daysToMonday);
    }
    
    // Week ends on Sunday (6 days after Monday)
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);
    
    // Update week dates
    week.start_date = weekStartDate.toISOString().split('T')[0];
    week.end_date = weekEndDate.toISOString().split('T')[0];
    
    console.log(`   Week ${weekNumber}: ${week.start_date} to ${week.end_date}`);
    
    // Fix workout dates within this week
    if (week.workouts && week.workouts.length > 0) {
      for (const workout of week.workouts) {
        const dayIndex = dayNames.indexOf(workout.day);
        if (dayIndex !== -1) {
          const workoutDate = new Date(weekStartDate);
          // Calculate days to add from Monday (dayIndex 1 = Monday = 0 days, dayIndex 2 = Tuesday = 1 day, etc.)
          const daysToAdd = dayIndex === 0 ? 6 : dayIndex - 1; // Sunday = 6 days from Monday
          workoutDate.setUTCDate(weekStartDate.getUTCDate() + daysToAdd);
          workout.date = workoutDate.toISOString().split('T')[0];
          console.log(`     ${workout.day}: → ${workout.date} (${workout.workout_type})`);
        }
      }
      
      // Sort workouts by date
      week.workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
  }
  
  console.log('✅ Week progression dates fixed successfully');
  return planJson;
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏃 Training Plan Generator API running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`\n📍 Available Endpoints:`);
  console.log(`   POST /generate-plan - Generate first week of training plan`);
  console.log(`   POST /get-remaining-plan - Get complete training plan`);
  console.log(`   POST /calculate-pace-zones - Calculate pace recommendations`);
  console.log(`   POST /calculate-plan-duration - Calculate duration from race date`);
  console.log(`   POST /validate-rest-days - Validate rest day requirements`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /plan-status/:plan_id - Check plan status\n`);
});
