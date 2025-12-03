const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');

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

// In-memory storage for plans (in production, use Redis or database)
const planStorage = {};
const PLAN_STORAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Clean up old plans every hour
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

CRITICAL WEEK CALCULATION LOGIC (MONDAY TO SUNDAY STRUCTURE):
1. WEEK BOUNDARY RULES:
   - All weeks follow Monday-to-Sunday.
   - Find Monday of the week containing the first workout day.
   - Week 1 = that Monday through Sunday.

2. START DATE PROCESSING:
   - Parse ISO start_date.
   - If AM and weekday ∈ specific_days → first workout = that day; else → next available day ∈ specific_days.
   - Find Monday of the week containing the first workout day and set Week 1 boundaries accordingly.

3. WORKOUT DAY INCLUSION FOR WEEK 1:
   - Include only days on/after first workout day, in specific_days, within Week 1 boundaries.

4. ⚠️ FIRST WORKOUT DAY SAFETY RULE (CRITICAL - PREVENTS INJURY):
   After determining first_workout_date:
   A. Check if first_workout_date == long_run_day:
      • If TRUE (first workout day IS the long run day):
        - SKIP the long run in Week 1 entirely
        - Distribute workouts only on remaining specific_days in Week 1
        - Start with easier/shorter runs (Easy Runs only)
        - The long run schedule begins from Week 2 onwards on the designated long_run_day
      • If FALSE (first workout day is NOT the long run day):
        - Proceed normally with long run on long_run_day in Week 1
        - Follow standard Week 1 distribution rules
   B. Rationale: Starting with a long run as the very first workout poses high injury risk for runners resuming training. This safety measure ensures a gentler introduction.
   • NOTE: Under TRUE BEGINNER OVERRIDE, the long run is disabled in Week 1 even if the first workout day is not the long_run_day; resume long run logic from Week 2.

5. CRITICAL DATE MAPPING:
   - Accurate day-to-date mapping within Week 1 boundaries.

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

OBJECTIVE:
Generate the complete training plan with full details including all remaining weeks (2 through {total_weeks}), plus all the detailed analysis that was skipped in the first API call.

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
      // ... continue for all remaining weeks with progression, cutbacks, Rest policy, and anti-repetition applied
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

  // Calculate actual pace in seconds per unit
  const actualPaceSeconds = (workout.duration * 60) / workout.distance;
  const paceDiffSeconds = actualPaceSeconds - goalPaceSeconds;

  // Define pace zones (relative to goal pace)
  let correctIntensity = workout.intensity;

  if (paceDiffSeconds > 90) {
    // Slower than goal pace + 90 sec = Recovery or Easy
    correctIntensity = workout.distance < (unit === 'km' ? 5 : 3) ? 'Recovery' : 'Easy';
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
 * @returns {number} - Expected duration in weeks
 */
function calculateExpectedDuration(experience, minWeeks, maxWeeks, height, weight) {
  let duration;
  
  // Calculate BMI if height and weight provided
  let bmiCategory = 'Healthy';
  if (height && weight) {
    const bmi = calculateBMI(height, weight);
    bmiCategory = getBMICategory(bmi);
  }
  
  // Base duration on experience level
  switch (experience) {
    case 'Beginner':
      duration = maxWeeks; // Beginners get MAXIMUM weeks
      if (bmiCategory.includes('Obesity')) duration += 2;
      break;
    case 'Intermediate':
      duration = Math.round((minWeeks + maxWeeks) / 2);
      if (bmiCategory === 'Overweight') duration += 1;
      if (bmiCategory.includes('Obesity')) duration += 2;
      break;
    case 'Advanced':
      duration = Math.max(minWeeks + 1, minWeeks);
      if (bmiCategory.includes('Obesity')) duration += 2;
      break;
    case 'Elite':
      duration = minWeeks;
      break;
    default:
      duration = maxWeeks; // Default to max for safety
  }
  
  // Clamp to valid range
  return Math.min(Math.max(duration, minWeeks), maxWeeks + 4);
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

  // If AM (before 12:00 UTC) and today is in specific_days, start today
  if (currentHour < 12 && specificList.includes(currentDayName)) {
    console.log(`AM time and today (${currentDayName}) is in specific_days - starting today`);
    dt.setUTCHours(6, 0, 0, 0);
    return dt.toISOString();
  }

  // Otherwise (PM or today not in specific_days), find next available day
  console.log(`PM time or today not in specific_days - finding next available day`);
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

  // Fallback (should never reach here if specific_days is valid)
  console.log(`Fallback - using original date`);
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
function determineRestDayRequirements(experience, trainingDays) {
  const requirements = {
    required_rest_days: 0,
    recommended_rest_days: 0,
    allow_all_seven_days: false,
    warning: null
  };

  switch (experience) {
    case 'Beginner':
      requirements.required_rest_days = 1;
      requirements.recommended_rest_days = 1;
      requirements.allow_all_seven_days = false;
      if (trainingDays >= 7) {
        requirements.warning = 'Beginners should include at least 1 rest day per week to prevent injury and allow recovery.';
      }
      break;

    case 'Intermediate':
      requirements.required_rest_days = 0;
      requirements.recommended_rest_days = 1;
      requirements.allow_all_seven_days = true;
      if (trainingDays >= 7) {
        requirements.warning = 'Consider including 1 rest day per week for optimal recovery, though 7 training days is acceptable for intermediate runners.';
      }
      break;

    case 'Advanced':
      requirements.required_rest_days = 0;
      requirements.recommended_rest_days = 0;
      requirements.allow_all_seven_days = true;
      break;

    case 'Elite':
      requirements.required_rest_days = 0;
      requirements.recommended_rest_days = 0;
      requirements.allow_all_seven_days = true;
      break;

    default:
      requirements.required_rest_days = 1;
      requirements.recommended_rest_days = 1;
      requirements.allow_all_seven_days = false;
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

  // Fix goal_race_time format (04:16 → 4:16:00)
  if (userInput.goal_race_time && !userInput.goal_race_time.includes(':')) {
    console.log(`Invalid goal_race_time format: ${userInput.goal_race_time}`);
  } else if (userInput.goal_race_time && userInput.goal_race_time.split(':').length === 2) {
    // Format is MM:SS, should be HH:MM:SS
    const parts = userInput.goal_race_time.split(':');
    if (parseInt(parts[0]) > 23) {
      // Likely hours in first part
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
    if (!daysArray.includes(userInput.long_run_day)) {
      console.warn(`long_run_day "${userInput.long_run_day}" not in specific_days. Setting to last day.`);
      userInput.long_run_day = daysArray[daysArray.length - 1];
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
  const trainingDays = userInput.specific_days ? userInput.specific_days.split(',').length : 0;
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
      model: 'gpt-5-nano', // Using gpt-5-mini for consistency
      // temperature: 0.7,
      // max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: "Generate ONLY first week workouts quickly. No detailed analysis. Return minimal JSON with just week 1 workouts. Use exact workout types: Easy Run, Recovery Run, Long Run, Tempo Run, Interval Run, Rest. CRITICAL: Always include 'user_distance': 0 and 'user_time': 0 in BOTH week-level and workout-level data. CRITICAL: Follow the WEEK CALCULATION LOGIC precisely - Week 1 must span Monday to Sunday of the calendar week, and only include workout days that fall on/after start_date based on AM/PM rules. CRITICAL: Apply FIRST WORKOUT DAY SAFETY RULE - if first workout day equals long_run_day, SKIP the long run in Week 1 and use only Easy Runs. CRITICAL: Duration MUST be between min_weeks_plan and max_week_plans based on experience level. If race_date provided, calculate duration to end on that date. CRITICAL: Round ALL distances - miles to nearest 0.5 (5.282 mi → 5.5 mi), km to nearest 0.5. CRITICAL: Long run MAXIMUM caps - Beginner: 18 mi/30 km, Intermediate: 20 mi/32 km, Advanced: 21 mi/34 km, Elite: 22 mi/36 km. NEVER exceed these. CRITICAL: Include 'pace_guide' object at plan level showing all pace zones with descriptions. CRITICAL: Include 'pace_range' and 'description' fields for EVERY workout. CRITICAL: Rest days are SEPARATE from training days - if user selects 6 specific_days, schedule workouts on ALL 6 days, rest is automatic on 7th day. Do NOT add extra rest days. CRITICAL: If Elite or Advanced runner selects 7 specific_days (all 7 days), schedule workouts on ALL 7 days with NO rest days. CRITICAL: Follow OPTIMAL TRAINING PATTERN - Easy → Tempo/Intervals → Recovery → Easy → Long Run. Never schedule back-to-back hard workouts. CRITICAL: Replace 'Track' with 'Flat' in all outputs. Goal-based personalization must be reflected in workout mix and intensity. total_weeks must be between min_weeks_plan and max_week_plans. Generate description according to user input dont include any goal in description."
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

    const planJson = JSON.parse(content);

    // Parse goal pace from user input
    const unit = userInput.measurement_unit === 'km' ? 'km' : 'miles';
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

    // Fix first workout distance to prevent injury (CRITICAL FOR BEGINNERS WITH NO BASE)
    const experience = userInput.running_experience || 'Intermediate';
    const weeklyMileage = userInput.weekly_mileage_past_4_weeks || '0';
    fixFirstWorkoutDistance(planJson, experience, unit, weeklyMileage);

    // Fix duplicate distances (anti-repetition rule)
    if (planJson.weekly_plans) {
      for (const week of planJson.weekly_plans) {
        fixDuplicateDistances(week, unit);
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
      userInput.weight
    );
    
    if (planJson.duration !== expectedDuration) {
      console.warn(`⚠️  Duration mismatch: AI returned ${planJson.duration} weeks, expected ${expectedDuration} weeks for ${userInput.running_experience}`);
      console.warn(`   Correcting duration to ${expectedDuration} weeks...`);
      planJson.duration = expectedDuration;
      planJson.total_weeks = expectedDuration;
      planJson.remaining_weeks = expectedDuration - 1;
    }

    // Generate unique plan_id and store minimal context
    const planId = uuidv4().replace(/-/g, '').substring(0, 20);
    planJson.plan_id = planId;
    planJson.generated_at = new Date().toISOString();

    // Store minimal context for generating remaining weeks
    planStorage[planId] = {
      original_input: userInput,
      first_week_basic: planJson,
      total_weeks: planJson.duration || 12,
      plan_type: planJson.plan_type || 'marathon',
      generated_at: new Date().toISOString()
    };

    return planJson;

  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`JSON Parse Error: ${error.message}`);
      console.error(`Content: ${content}`);
      throw new Error(`Failed to parse first week JSON: ${error.message}`);
    }
    console.error(`Unexpected error: ${error.message}`);
    throw new Error(`Error generating first week: ${error.message}`);
  }
}

async function generateRemainingWeeks(planId) {
  /**
   * Generate the complete training plan with all details and remaining weeks
   */
  if (!planStorage[planId]) {
    throw new Error('Plan ID not found');
  }

  const storedData = planStorage[planId];
  const originalInput = storedData.original_input;
  const firstWeekBasic = storedData.first_week_basic;
  const totalWeeks = storedData.total_weeks;
  const planType = storedData.plan_type;

  console.log(`Generating complete plan for plan_id: ${planId}, total_weeks: ${totalWeeks}`);

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

    const response = await client.chat.completions.create({
      model: 'gpt-5-mini', // Using gpt-5-mini instead of gpt-5-nano (which may not exist)
      // temperature: 0.7,
      // max_tokens: 16000, // Allow large response for full plan
      messages: [
        {
          role: 'system',
          content: "Generate complete training plan with full analysis and all remaining weeks. Use exact workout types: Easy Run, Long Run, Tempo Run, Interval Run, Rest. Return only valid JSON with the complete recommended_plan structure. CRITICAL: Always include 'user_distance': 0 and 'user_time': 0 in BOTH week-level and workout-level data for ALL weeks. CRITICAL: Include 'pace_range' and 'description' fields for EVERY workout in ALL weeks with specific pace guidance. CRITICAL: Each week from Week 2 onwards must follow Monday-to-Sunday structure and include ALL days from specific_days. CRITICAL: From Week 2 onwards, ALWAYS include the long run on long_run_day regardless of Week 1 safety rules. CRITICAL: NEVER schedule back-to-back hard workouts - always place Easy/Recovery runs between Tempo, Intervals, and Long Run. CRITICAL: Implement TAPERING in final 1-3 weeks before race (reduce mileage by 20-30% per week, maintain frequency). CRITICAL: Rest days are SEPARATE from training days - specific_days are training days only, rest is automatic on remaining days. CRITICAL: If Elite or Advanced runner selects 7 specific_days (all 7 days), schedule workouts on ALL 7 days with NO rest days. For Beginners/Intermediates with 7 days selected, force 1 rest day. Rest Days Policy: Schedule rest days intelligently based on experience level and training load, never on long_run_day, preferably after hard workouts. Represent Rest as workout_type 'Rest' with intensity 'Rest', distance 0, duration 0. The first day safety rule (skipping long run if first day = long run day) applies ONLY to Week 1. Long run day must be included each week from Week 2 onwards and must be higher distance than other runs. If race_date provided, ensure final week ends on race_date with proper taper leading up to it."
        },
        { role: 'user', content: `Generate complete marathon training plan. Return ONLY JSON, no other text.\n\n${prompt}` },
      ],
    },
      {timeout: 12000000}, // 2 minute timeout
);

    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      console.error('Invalid API response structure:', JSON.stringify(response, null, 2));
      throw new Error('Invalid response from OpenAI API');
    }

    let content = response.choices[0].message.content;
    if (!content) {
      console.error('Empty content in API response');
      throw new Error('OpenAI API returned empty content');
    }

    content = content.trim();
    console.log(`Raw response length: ${content.length}`);
    console.log(`First 500 chars: ${content.substring(0, 500)}`);

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

    // Count braces to find the end
    let braceCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') {
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) {
      throw new Error('Could not find complete JSON object');
    }

    content = content.substring(startIdx, endIdx + 1);
    console.log(`Extracted JSON length: ${content.length}`);

    // Parse JSON
    const completePlan = JSON.parse(content);

    // Parse goal pace from original input
    const unit = originalInput.measurement_unit === 'km' ? 'km' : 'miles';
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

    // Validate and fix intensities for all weeks
    const weeklyPlans = completePlan.recommended_plan?.weekly_plans || [];
    if (goalPaceSeconds > 0) {
      for (const week of weeklyPlans) {
        for (let i = 0; i < week.workouts.length; i++) {
          week.workouts[i] = validateAndFixIntensity(week.workouts[i], goalPaceSeconds, unit);
        }
      }
    }

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

    // Fix Week 1 workout distances for beginners with no base (CRITICAL FOR SAFETY)
    const experience = originalInput.running_experience || 'Intermediate';
    const weeklyMileage = originalInput.weekly_mileage_past_4_weeks || '0';
    if (completePlan.recommended_plan) {
      fixFirstWorkoutDistance(completePlan.recommended_plan, experience, unit, weeklyMileage);
    }

    // Fix duplicate distances (anti-repetition rule) for all weeks
    for (const week of weeklyPlans) {
      fixDuplicateDistances(week, unit);
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

    console.log(`Successfully generated complete plan with ${weeklyPlans.length} weeks`);
    return completePlan;

  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`JSON Parse Error: ${error.message}`);
      console.error(`Problematic content: ${content}`);
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

    const result = await generateFirstWeek(userInput);

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
