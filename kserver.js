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
  process.exit(1);
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
}, 60 * 60 * 1000);

/**
 * Remove duplicate days and invalid dates from a week's workouts
 */
function removeDuplicateDaysFromWeek(week) {
  if (!week || !week.workouts || !Array.isArray(week.workouts)) {
    return week;
  }

  console.log(`🔧 Cleaning duplicate days from Week ${week.week_number}...`);

  const originalCount = week.workouts.length;
  const seenDays = new Set();
  const validWorkouts = [];

  let weekStartDate, weekEndDate;
  try {
    weekStartDate = new Date(week.start_date);
    weekEndDate = new Date(week.end_date);
  } catch (e) {
    console.warn(`   Warning: Could not parse week dates, skipping date range validation`);
  }

  week.workouts.forEach((w) => {
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

    if (isDayNotSeen && isNotHardcodedWrongDate && isDateInRange) {
      validWorkouts.push(w);
      seenDays.add(w.day);
      console.log(`   ✅ Keeping: ${w.day} ${w.workout_type} (Date: ${w.date})`);
    } else {
      const reason = !isDayNotSeen ? 'Duplicate day' : !isNotHardcodedWrongDate ? 'Wrong hardcoded date' : 'Date out of range';
      console.log(`   🗑️  Removing: ${w.day} ${w.workout_type} (Date: ${w.date}) - ${reason}`);
    }
  });

  week.workouts = validWorkouts;

  const removedCount = originalCount - validWorkouts.length;
  if (removedCount > 0) {
    console.log(`   🔧 Removed ${removedCount} duplicate/invalid workout(s) from Week ${week.week_number}`);
    week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    console.log(`   Updated Week ${week.week_number} total distance: ${week.total_weekly_distance}`);
  } else {
    console.log(`   ✅ No workouts needed to be removed from Week ${week.week_number}`);
  }

  return week;
}

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
  • Hilly: Add 20-30 seconds per unit to ALL pace zones (significant slowdown)

- ⚠️ CRITICAL: Course profile must visibly affect workout paces in descriptions.

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
⚠️ CRITICAL CLARIFICATION: "weekly_mileage_past_4_weeks" is the TOTAL DISTANCE the runner covered in the past 7 days (one week), NOT distance per hour.

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

- ⚠️ CRITICAL SAFETY RULE: Week 1 total_weekly_distance must be SIGNIFICANTLY LESS than weekly_mileage_past_4_weeks for beginners and high BMI runners.

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
⚠️ CRITICAL: "weekly_mileage_past_4_weeks" is TOTAL DISTANCE per week (7 days), NOT per hour.

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

- ⚠️ CRITICAL RULE: Lower experience levels and higher BMI categories get SMALLER weekly increases.

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
  
- Hard workout spacing:
  • Tempo and Intervals should be 3-4 days apart minimum
  • Long Run should be 3-4 days after last hard effort
  • Never schedule: Tempo → Intervals (consecutive days)
  • Never schedule: Intervals → Long Run (consecutive days)
  • Never schedule: Long Run → Tempo/Intervals (next day)

- Intra-week distance shaping (MANDATORY — never one flat distance every day):
  • Each week must vary day-by-day volume: short easy, medium days, and a clearly longest long run on long_run_day.
  • Non–long-run distances in the same week must not all be identical; if totals require similar numbers, differ by at least 0.5 unit between days and keep recovery the shortest.
  • Long run must be the longest run of that week; quality (tempo/interval) typically between easy and long, not equal to every easy day.

RULES FOR PLAN CREATION (UNIT-AWARE AND BMI-AWARE):
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
8) Long Run Rule (ENFORCED):
- Long run must always be on long_run_day
- Week N (Final): MUST equal exact race distance on long_run_day:
  • Marathon: 42.2 km or 26.2 miles
  • Half Marathon: 21.1 km or 13.1 miles
  • 5k: 5.0 km or 3.1 miles
  • 10k: 10.0 km or 6.2 miles
- **CRITICAL: From Week 2 onwards, ALWAYS schedule the long run on long_run_day**
- Label final week long run as workout_type: "Race" and intensity: "Goal-pace"

11) Pacing & Intensities (UNIT-AWARE WITH DETAILED PACE RECOMMENDATIONS):
   - Pace format "X:XX-X:XX min/km" or "X:XX-X:XX min/mi" (ASCII hyphens).
   - Derive goal pace from goal_race_time or estimated_race_time midpoint.
   - ALWAYS include specific pace ranges in workout descriptions
   - Include perceived exertion guidance: "Should feel comfortable, able to hold conversation"
   - For tempo/intervals, include structure: "Tempo: 2km warmup, 6km at 5:30-5:45 min/km, 2km cooldown"
   - Hills: maintain effort (not pace) on inclines for Rolling/Hilly.
   - Intensity labeling rules:
     • Allowed: "Rest","Recovery","Easy","Long Easy","Steady","Tempo","Intervals/VO2","Goal-pace".
     • Do not label a whole run as "Hard"; if segments are hard, use "Intervals/VO2".
     • Sanity rule: if average pace slower than Easy upper bound, intensity cannot be "Tempo" or "Intervals/VO2"; downgrade to "Easy" or "Recovery".
     • Any workout < 2.0 mi or < 3.0 km must be "Recovery" or "Easy".

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
            "distance": >= 0,
            "duration": >= 0,
            "intensity": "Easy" | "Tempo" | "Intervals/VO2" | "Long Easy" | "Goal-pace" | "Rest",
            "pace_range": "X:XX-X:XX min/km",
            "description": "...",
            "user_distance": 0,
            "user_time": 0
          }
        ]
      }
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
- NEVER use one identical distance for every workout in a week; vary by day (recovery shortest, long run longest, quality between).

TAPERING CONSIDERATIONS:
- If this chunk includes final weeks before race, apply tapering rules
- Reduce mileage by 20-30% in final 2-3 weeks
- Maintain workout frequency but reduce distance

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
        ]
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the weekly_plans array regardless of whether the plan uses the flat structure
 * (first-week response) or the nested recommended_plan structure (complete plan).
 * Returns a DIRECT REFERENCE to the array so mutations propagate correctly.
 */
function getWeeklyPlans(planJson) {
  if (!planJson) return [];
  if (planJson.weekly_plans) return planJson.weekly_plans;
  if (planJson.recommended_plan && planJson.recommended_plan.weekly_plans) {
    return planJson.recommended_plan.weekly_plans;
  }
  return [];
}

/**
 * Normalize experience string for pace-band lookups (handles "elite", "Elite ", etc.)
 */
function normalizeExperienceTier(experience) {
  const raw = (experience || 'Intermediate').toString().trim().toLowerCase();
  if (raw === 'elite') return 'Elite';
  if (raw === 'advanced' || raw === 'advance') return 'Advanced';
  if (raw === 'beginner') return 'Beginner';
  return 'Intermediate';
}

/**
 * When goal race pace is known, rewrite pace_range per workout type so:
 * - Easy / recovery / long easy are slower than goal (and consistent across the week)
 * - Tempo / intervals are faster than easy and intervals faster than tempo
 * - Race shows an explicit goal-pace band (fixes missing "—" in clients)
 */
function synchronizePaceRangesWithGoal(weeks, goalPaceSeconds, unit, experience) {
  if (!weeks || !goalPaceSeconds || goalPaceSeconds <= 0 || !isFinite(goalPaceSeconds)) return;
  if (goalPaceSeconds < 180) return;

  const tier = normalizeExperienceTier(experience);
  const bands = {
    Beginner: { easyLo: 65, easyHi: 95, recLo: 98, recHi: 125, longLo: 55, longHi: 85, tempoLo: 18, tempoHi: 32, intFast: 28, intSlow: 12 },
    Intermediate: { easyLo: 50, easyHi: 75, recLo: 78, recHi: 102, longLo: 45, longHi: 70, tempoLo: 15, tempoHi: 28, intFast: 32, intSlow: 10 },
    Advanced: { easyLo: 38, easyHi: 60, recLo: 65, recHi: 88, longLo: 35, longHi: 58, tempoLo: 12, tempoHi: 25, intFast: 35, intSlow: 8 },
    Elite: { easyLo: 22, easyHi: 45, recLo: 50, recHi: 72, longLo: 22, longHi: 48, tempoLo: 8, tempoHi: 20, intFast: 40, intSlow: 5 }
  };
  const b = bands[tier] || bands.Intermediate;
  const minRunPace = unit === 'km' ? 150 : 240;

  for (const week of weeks) {
    if (!week.workouts) continue;
    for (const workout of week.workouts) {
      const wt = workout.workout_type;
      if (wt === 'Rest') continue;

      if (wt === 'Easy Run') {
        workout.pace_range = formatPaceRange(goalPaceSeconds + b.easyLo, goalPaceSeconds + b.easyHi, unit);
      } else if (wt === 'Recovery Run') {
        workout.pace_range = formatPaceRange(goalPaceSeconds + b.recLo, goalPaceSeconds + b.recHi, unit);
      } else if (wt === 'Long Run') {
        workout.pace_range = formatPaceRange(goalPaceSeconds + b.longLo, goalPaceSeconds + b.longHi, unit);
      } else if (wt === 'Tempo Run') {
        const tLo = goalPaceSeconds + b.tempoLo;
        const tHi = goalPaceSeconds + b.tempoHi;
        workout.pace_range = formatPaceRange(tLo, tHi, unit);
      } else if (wt === 'Interval Run') {
        const iFast = Math.max(minRunPace, goalPaceSeconds - b.intFast);
        const iSlow = Math.max(iFast + 8, goalPaceSeconds - b.intSlow);
        workout.pace_range = formatPaceRange(iFast, iSlow, unit);
      } else if (wt === 'Race') {
        workout.pace_range = formatPaceRange(Math.max(minRunPace, goalPaceSeconds - 8), goalPaceSeconds + 15, unit);
      }
    }
  }
}

/**
 * Validate and fix workout intensity based on actual pace
 */
function validateAndFixIntensity(workout, goalPaceSeconds, unit = 'miles') {
  if (!workout.distance || !workout.duration || workout.distance === 0) {
    return workout;
  }

  const workoutTypeIntensityMap = {
    'Easy Run': 'Easy',
    'Recovery Run': 'Recovery',
    'Tempo Run': 'Tempo',
    'Long Run': 'Long Easy',
    'Interval Run': 'Intervals/VO2',
    'Rest': 'Rest',
    'Race': 'Goal-pace'
  };

  const expectedIntensity = workoutTypeIntensityMap[workout.workout_type];
  if (expectedIntensity) {
    if (workout.intensity !== expectedIntensity) {
      console.log(`Fixed intensity based on workout type: ${workout.workout_type} ${workout.distance} ${unit}: ${workout.intensity} → ${expectedIntensity}`);
      workout.intensity = expectedIntensity;
    }
    // Never infer Threshold/Goal Pace from duration vs marathon goal for canonical types:
    // elite easy runs are often faster than marathon pace; Race must stay Goal-pace.
    return workout;
  }

  if (goalPaceSeconds < 180) {
    console.log(`Skipping pace-based intensity validation - goal pace too fast: ${goalPaceSeconds}s per ${unit}`);
    return workout;
  }

  const actualPaceSeconds = (workout.duration * 60) / workout.distance;
  const paceDiffSeconds = actualPaceSeconds - goalPaceSeconds;

  let correctIntensity = workout.intensity;

  if (paceDiffSeconds > 90) {
    correctIntensity = workout.workout_type === 'Easy Run' ? 'Easy' :
      (workout.distance < (unit === 'km' ? 5 : 3) ? 'Recovery' : 'Easy');
  } else if (paceDiffSeconds > 60) {
    correctIntensity = 'Easy';
  } else if (paceDiffSeconds > 30) {
    correctIntensity = workout.intensity === 'Tempo' ? 'Tempo' : 'Easy';
  } else if (paceDiffSeconds > 15) {
    correctIntensity = ['Threshold', 'Goal Pace'].includes(workout.intensity) ? workout.intensity : 'Tempo';
  } else if (paceDiffSeconds >= -5) {
    correctIntensity = 'Goal Pace';
  } else {
    correctIntensity = ['Intervals', 'VO2max'].includes(workout.intensity) ? workout.intensity : 'Threshold';
  }

  const minDistanceForHard = unit === 'km' ? 3.0 : 2.0;
  if (workout.distance < minDistanceForHard && !['Recovery', 'Easy'].includes(correctIntensity)) {
    correctIntensity = 'Easy';
  }

  const longRunDistance = unit === 'km' ? 15 : 10;
  if (workout.distance >= longRunDistance && workout.workout_type === 'Long Run') {
    correctIntensity = 'Long Easy';
  }

  if (workout.intensity === 'Hard') {
    correctIntensity = 'Tempo';
  }

  if (workout.intensity !== correctIntensity) {
    console.log(`Fixed intensity: ${workout.workout_type} ${workout.distance} ${unit} in ${workout.duration} min: ${workout.intensity} → ${correctIntensity}`);
    workout.intensity = correctIntensity;
  }

  return workout;
}

/**
 * Convert time string to seconds per unit
 */
/**
 * Convert time string to seconds per unit
 * Handles both HH:MM:SS and MM:SS formats
 * For shorter races (5K, 10K), assumes MM:SS format
 * For longer races (Half Marathon, Marathon), assumes HH:MM:SS or HH:MM format
 */
function parseGoalPace(timeStr, distance) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(p => parseInt(p));
  let totalSeconds = 0;
  
  if (parts.length === 3) {
    // HH:MM:SS format
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS format - but need to check if it's actually HH:MM for longer races
    // If distance is > 15 km (half marathon or longer), assume HH:MM format
    if (distance > 15) {
      // HH:MM format for longer races
      // Check if first part is reasonable for hours (should be 2-10 for marathon)
      if (parts[0] >= 2 && parts[0] <= 10) {
        totalSeconds = parts[0] * 3600 + parts[1] * 60;
      } else {
        // If first part is too small, treat as MM:SS
        totalSeconds = parts[0] * 60 + parts[1];
      }
    } else {
      // MM:SS format for shorter races
      totalSeconds = parts[0] * 60 + parts[1];
    }
  }
  
  return distance > 0 ? totalSeconds / distance : 0;
}

/**
 * Parse pace string like "5:42 min/km" to seconds per unit
 */
function parsePaceStringToSeconds(paceStr) {
  if (!paceStr) return 0;
  const timeMatch = paceStr.match(/(\d+):(\d+)/);
  if (!timeMatch) return 0;
  return parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
}

/**
 * Round distance to nearest 0.5
 */
function roundDistance(distance, unit = 'km') {
  return Math.round(distance * 2) / 2;
}

/**
 * Normalize plan_type strings for distance lookups (avoid "50k" matching "5k").
 */
function normalizePlanTypeKey(planType) {
  const p = String(planType || 'marathon').toLowerCase().trim().replace(/_/g, ' ');
  if (p.includes('half')) return 'half marathon';
  if (/\b10\s*k\b/.test(p) || p === '10k') return '10k';
  if (/\b5\s*k\b/.test(p) || p === '5k') return '5k';
  return 'marathon';
}

function getRaceDistanceForPlanType(planType, unit = 'km') {
  const key = normalizePlanTypeKey(planType);
  const km = { marathon: 42.2, 'half marathon': 21.1, '10k': 10.0, '5k': 5.0 };
  const mi = { marathon: 26.2, 'half marathon': 13.1, '10k': 6.2, '5k': 3.1 };
  return unit === 'km' ? km[key] || 42.2 : mi[key] || 26.2;
}

function formatPlanTitleWithRaceDistance(planType, unit = 'km') {
  const d = getRaceDistanceForPlanType(planType, unit);
  const label = String(planType || 'Plan').replace(/_/g, ' ');
  const suffix = unit === 'km' ? `${d} km` : `${d} miles`;
  return `${label} (${suffix})`;
}

/** Map normalized plan type to getMaxLongRunDistance / caps keys (half_marathon not "half marathon"). */
function planTypeToCapsKey(planType) {
  const k = normalizePlanTypeKey(planType);
  if (k === 'half marathon') return 'half_marathon';
  if (k === '10k') return '10k';
  if (k === '5k') return '5k';
  return 'marathon';
}

/**
 * Get maximum long run distance based on experience and plan type
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
      Beginner: unit === 'km' ? 10 : 6.2,
      Intermediate: unit === 'km' ? 10 : 6.2,
      Advanced: unit === 'km' ? 10 : 6.2,
      Elite: unit === 'km' ? 10 : 6.2
    },
    '5k': {
      Beginner: unit === 'km' ? 5 : 3.1,
      Intermediate: unit === 'km' ? 5 : 3.1,
      Advanced: unit === 'km' ? 5 : 3.1,
      Elite: unit === 'km' ? 5 : 3.1
    }
  };
  const key = planTypeToCapsKey(planType);
  return caps[key]?.[experience] || (unit === 'km' ? 32 : 20);
}

/**
 * Enforce rest day requirements based on experience level.
 * Operates directly on the weeks array passed in (no wrapper object needed).
 */
function enforceRestDayRequirements(weeks, experience, specificDays, longRunDay) {
  if (!weeks || !experience || !specificDays) return;

  console.log('🛌 Enforcing rest day requirements...');
  console.log(`   Experience: ${experience}`);
  console.log(`   Training days selected: ${specificDays.length} (${specificDays.join(', ')})`);

  const restRequirements = determineRestDayRequirements(experience, specificDays.length);

  if (restRequirements.required_rest_days === 0) {
    console.log(`   ✅ No rest days required for ${experience} runners`);
    return;
  }

  console.log(`   Required rest days: ${restRequirements.required_rest_days}`);

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    const currentRestDays = week.workouts.filter(w => w.workout_type === 'Rest').length;
    const neededRestDays = restRequirements.required_rest_days - currentRestDays;

    if (neededRestDays <= 0) {
      console.log(`   Week ${week.week_number}: Already has ${currentRestDays} rest day(s) ✅`);
      continue;
    }

    console.log(`   Week ${week.week_number}: Needs ${neededRestDays} more rest day(s)`);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const longRunDayIndex = dayNames.indexOf(longRunDay);
    const nextDayAfterLongRun = longRunDayIndex !== -1 ? dayNames[(longRunDayIndex + 1) % 7] : null;
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const workoutDays = week.workouts.filter(w => w.workout_type !== 'Rest').map(w => w.day);
    const firstWorkoutDay = dayOrder.find(day => workoutDays.includes(day));

    const candidates = week.workouts.filter(w =>
      w.workout_type !== 'Rest' &&
      w.workout_type !== 'Long Run' &&
      w.day !== longRunDay &&
      w.day !== nextDayAfterLongRun &&
      w.day !== firstWorkoutDay &&
      !(w.workout_type === 'Recovery Run' && w.day === nextDayAfterLongRun)
    );

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
      week.total_weekly_distance = week.workouts
        .filter(w => w.workout_type !== 'Rest')
        .reduce((sum, w) => sum + (w.distance || 0), 0);
      console.log(`     ✅ Converted ${converted} workout(s) to rest days`);
    }
  }
}

/**
 * Validate and fix AI-generated plan to ensure it follows all rules.
 * Works on the weeks array directly.
 */
function validateAndFixAIPlan(weeks, userInput, unit = 'km') {
  if (!weeks || weeks.length === 0) return;

  console.log('🔍 Validating AI-generated plan...');

  const specificDaysArray = userInput.specific_days ?
    userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
  const longRunDay = userInput.long_run_day;
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (const week of weeks) {
    if (!week.workouts) continue;

    // 1. Remove days NOT in specific_days
    const originalWorkouts = [...week.workouts];
    week.workouts = week.workouts.filter(w => specificDaysArray.includes(w.day));
    const removedDays = originalWorkouts.filter(w => !specificDaysArray.includes(w.day)).map(w => w.day);
    if (removedDays.length > 0) {
      console.warn(`   Week ${week.week_number}: Removed extra days not in specific_days: ${removedDays.join(', ')}`);
    }

    // 2. Add missing specific_days
    const workoutDays = week.workouts.map(w => w.day);
    const missingDays = specificDaysArray.filter(day => !workoutDays.includes(day));

    if (missingDays.length > 0) {
      console.warn(`   Week ${week.week_number}: Missing days: ${missingDays.join(', ')} - Adding them now`);
      for (const missingDay of missingDays) {
        const weekStartDate = new Date(week.start_date);
        const dayIndex = dayOrder.indexOf(missingDay);
        const workoutDate = new Date(weekStartDate);
        workoutDate.setDate(weekStartDate.getDate() + dayIndex);
        week.workouts.push({
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
        });
      }
      week.workouts.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
      week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    }

    // 3. Ensure Long Run is on correct day
    const longRuns = week.workouts.filter(w => w.workout_type === 'Long Run');
    const correctLongRun = week.workouts.find(w => w.day === longRunDay && w.workout_type === 'Long Run');

    if (longRuns.length > 0 && !correctLongRun) {
      console.warn(`   Week ${week.week_number}: Long Run not on ${longRunDay}, fixing...`);
      const wrongLongRun = longRuns[0];
      const targetWorkout = week.workouts.find(w => w.day === longRunDay);
      if (targetWorkout) {
        const temp = {
          workout_type: wrongLongRun.workout_type,
          distance: wrongLongRun.distance,
          duration: wrongLongRun.duration,
          intensity: wrongLongRun.intensity,
          pace_range: wrongLongRun.pace_range,
          description: wrongLongRun.description
        };
        wrongLongRun.workout_type = targetWorkout.workout_type;
        wrongLongRun.distance = targetWorkout.distance;
        wrongLongRun.duration = targetWorkout.duration;
        wrongLongRun.intensity = targetWorkout.intensity;
        wrongLongRun.pace_range = targetWorkout.pace_range;
        wrongLongRun.description = targetWorkout.description;
        targetWorkout.workout_type = temp.workout_type;
        targetWorkout.distance = temp.distance;
        targetWorkout.duration = temp.duration;
        targetWorkout.intensity = temp.intensity;
        targetWorkout.pace_range = temp.pace_range;
        targetWorkout.description = temp.description;
      }
    }

    // 4. First day must not be Rest
    const workoutDaysInOrder = specificDaysArray.slice().sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
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

    // 5. First day must not be Recovery Run
    if (firstDayWorkout && firstDayWorkout.workout_type === 'Recovery Run') {
      console.warn(`   Week ${week.week_number}: First day (${firstDay}) is Recovery Run, converting to Easy Run`);
      firstDayWorkout.workout_type = 'Easy Run';
      firstDayWorkout.intensity = 'Easy';
      const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
      firstDayWorkout.duration = Math.ceil(firstDayWorkout.distance * easyPaceMinutes);
      firstDayWorkout.pace_range = unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi";
      firstDayWorkout.description = "Easy conversational run. Should feel comfortable and sustainable.";
    }

    // 6. Elite/Advanced: no rest days allowed
    const experience = userInput.experience || userInput.running_experience || 'Beginner';
    if (experience === 'Advanced' || experience === 'Elite') {
      const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
      for (const restWorkout of restWorkouts) {
        console.warn(`   Week ${week.week_number}: ${experience} user has Rest on ${restWorkout.day}, converting to Easy Run`);
        restWorkout.workout_type = 'Easy Run';
        restWorkout.intensity = 'Easy';
        restWorkout.distance = unit === 'km' ? 3 : 2;
        restWorkout.duration = unit === 'km' ? 20 : 15;
        restWorkout.pace_range = unit === 'km' ? "6:15-6:45 min/km" : "10:00-10:30 min/mi";
        restWorkout.description = "Easy conversational run. Should feel comfortable and sustainable.";
      }
    }
  }

  console.log('✅ AI plan validation complete');
}

/**
 * Enforce single recovery run rule - only one recovery run per week (after long run).
 * Operates directly on weeks array.
 */
function enforceSingleRecoveryRunRule(weeks, longRunDay, unit = 'km') {
  if (!weeks || !longRunDay) return;

  console.log('🔄 Enforcing single recovery run rule...');

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const longRunDayIndex = dayNames.indexOf(longRunDay);
  const nextDayAfterLongRun = longRunDayIndex !== -1 ? dayNames[(longRunDayIndex + 1) % 7] : null;

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    const recoveryRuns = week.workouts.filter(w => w.workout_type === 'Recovery Run');
    if (recoveryRuns.length <= 1) {
      console.log(`   Week ${week.week_number}: Has ${recoveryRuns.length} recovery run(s) ✅`);
      continue;
    }

    console.log(`   Week ${week.week_number}: Found ${recoveryRuns.length} recovery runs, converting extras to Easy Runs`);

    let keptRecoveryRun = null;
    for (const workout of recoveryRuns) {
      if (workout.day === nextDayAfterLongRun && !keptRecoveryRun) {
        keptRecoveryRun = workout;
      } else {
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
        const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * easyPaceMinutes);
      }
    }
  }
}

/**
 * Add recovery runs after long runs.
 * Operates directly on weeks array.
 */
function addRecoveryRunsAfterLongRuns(weeks, longRunDay, specificDays, unit = 'km') {
  if (!weeks || !longRunDay || !specificDays) return;

  console.log('🏃‍♂️ Adding recovery runs after long runs...');

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const longRunDayIndex = dayNames.indexOf(longRunDay);
  if (longRunDayIndex === -1) return;

  const nextDayIndex = (longRunDayIndex + 1) % 7;
  const nextDay = dayNames[nextDayIndex];

  if (!specificDays.includes(nextDay)) {
    console.log(`   ⚠️ ${nextDay} is not in specific_days, cannot add recovery run`);
    return;
  }

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const firstWorkoutDay = specificDays.slice().sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))[0];

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    const longRunWorkout = week.workouts.find(w => w.day === longRunDay && w.workout_type === 'Long Run');
    if (!longRunWorkout) continue;

    const nextDayWorkout = week.workouts.find(w => w.day === nextDay);
    if (!nextDayWorkout) continue;

    if (nextDay === firstWorkoutDay) continue;
    if (nextDayWorkout.workout_type === 'Recovery Run') {
      const longRunDistance = roundDistance(Number(longRunWorkout.distance) || 0, unit);
      const minRec = unit === 'km' ? 1.0 : 0.6;
      const recoveryDistance = Math.max(
        minRec,
        Math.min(
          roundDistance(longRunDistance - 0.5, unit),
          roundDistance(longRunDistance * 0.4, unit)
        )
      );
      nextDayWorkout.distance = roundDistance(recoveryDistance, unit);
      const recoveryPaceMinutes = unit === 'km' ? 7.0 : 11.0;
      nextDayWorkout.duration = Math.ceil(nextDayWorkout.distance * recoveryPaceMinutes);
      continue;
    }
    if (nextDayWorkout.workout_type === 'Rest') continue;

    const longRunDistance = roundDistance(Number(longRunWorkout.distance) || 0, unit);
    const minRec = unit === 'km' ? 1.0 : 0.6;
    let recoveryDistance = Math.max(
      minRec,
      Math.min(
        roundDistance(longRunDistance - 0.5, unit),
        Math.max(longRunDistance * 0.45, 2.0)
      )
    );
    recoveryDistance = roundDistance(recoveryDistance, unit);

    nextDayWorkout.workout_type = 'Recovery Run';
    nextDayWorkout.distance = recoveryDistance;
    nextDayWorkout.intensity = 'Recovery';
    nextDayWorkout.pace_range = unit === 'km' ? '6:45-7:15 min/km' : '10:45-11:30 min/mi';
    nextDayWorkout.description = `Recovery run after long run. Very easy pace to promote active recovery and circulation.`;
    const recoveryPaceMinutes = unit === 'km' ? 7.0 : 11.0;
    nextDayWorkout.duration = Math.ceil(recoveryDistance * recoveryPaceMinutes);
  }
}

/**
 * Recovery run the day after long run must be strictly shorter than the long run (never equal).
 */
function enforceRecoveryShorterThanLongRun(weeks, longRunDay, unit = 'km') {
  if (!weeks || !longRunDay) return;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const longIdx = dayNames.indexOf(longRunDay);
  if (longIdx === -1) return;

  const nextDay = dayNames[(longIdx + 1) % 7];
  const step = 0.5;
  const minRec = unit === 'km' ? 1.0 : 0.6;

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    const longW = week.workouts.find(w => w.day === longRunDay && w.workout_type === 'Long Run');
    const recW = week.workouts.find(w => w.day === nextDay && w.workout_type === 'Recovery Run');
    if (!longW || !recW) continue;

    const L = roundDistance(Number(longW.distance) || 0, unit);
    const R = roundDistance(Number(recW.distance) || 0, unit);
    if (L <= step) continue;

    if (R < L) continue;

    let target = Math.max(
      minRec,
      Math.min(roundDistance(L - step, unit), roundDistance(L * 0.4, unit))
    );
    target = roundDistance(target, unit);
    if (target >= L) {
      target = Math.max(unit === 'km' ? 0.5 : 0.3, roundDistance(L - step, unit));
    }
    if (target >= L) continue;

    recW.distance = target;
    const recoveryPaceMinutes = unit === 'km' ? 7.0 : 11.0;
    recW.duration = Math.max(1, Math.ceil(recW.distance * recoveryPaceMinutes));
    console.log(`   🩹 Week ${week.week_number}: Recovery (${nextDay}) ${R} → ${target} ${unit} (long ${L} ${unit})`);
  }
}

/**
 * Fix first day recovery run issue.
 * Operates directly on weeks array.
 */
function fixFirstDayRecoveryRunIssue(weeks, startDate, specificDays, longRunDay, unit = 'km') {
  if (!weeks || weeks.length === 0) return;

  const week1 = weeks[0];
  if (!week1.workouts || week1.workouts.length === 0) return;

  console.log('🔧 Fixing first day recovery run issue...');

  const startDt = new Date(startDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const specificList = specificDays.split(',').map(d => d.trim());

  let firstWorkoutDay = null;
  const currentHour = startDt.getUTCHours();
  const currentDayName = dayNames[startDt.getUTCDay()];

  if (currentHour < 12 && specificList.includes(currentDayName)) {
    firstWorkoutDay = currentDayName;
  } else {
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

  const firstDayWorkout = week1.workouts.find(w => w.day === firstWorkoutDay);

  if (firstDayWorkout && (firstDayWorkout.workout_type === 'Recovery Run' || firstDayWorkout.workout_type === 'Rest')) {
    firstDayWorkout.workout_type = 'Easy Run';
    firstDayWorkout.intensity = 'Easy';
    firstDayWorkout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
    firstDayWorkout.description = 'Easy conversational run to start the week. Should feel comfortable and sustainable.';
    if (firstDayWorkout.distance === 0) {
      firstDayWorkout.distance = unit === 'km' ? 1.0 : 0.6;
    }
    const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
    firstDayWorkout.duration = Math.ceil(firstDayWorkout.distance * avgPaceMinutes);
  }

  const longRunWorkout = week1.workouts.find(w => w.workout_type === 'Long Run');
  if (!longRunWorkout) {
    for (const workout of week1.workouts) {
      if (workout.workout_type === 'Recovery Run') {
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
        const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
      }
    }
  } else {
    const dayOrder2 = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const longRunDayIndex = dayOrder2.indexOf(longRunDay);
    const nextDayIndex = (longRunDayIndex + 1) % 7;
    const allowedRecoveryDay = dayOrder2[nextDayIndex];

    for (const workout of week1.workouts) {
      if (workout.workout_type === 'Recovery Run' && workout.day !== allowedRecoveryDay) {
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
        const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
      }
    }
  }

  console.log('✅ First day recovery run issue fixed');
}

/**
 * Enforce first workout day safety rule.
 * Operates directly on weeks array.
 */
function enforceFirstWorkoutDaySafetyRule(weeks, startDate, specificDays, longRunDay, experience, unit = 'km') {
  if (!weeks || weeks.length === 0) return;

  const week1 = weeks[0];
  if (!week1.workouts || week1.workouts.length === 0) return;

  const startDt = new Date(startDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const specificList = specificDays.split(',').map(d => d.trim());

  let firstWorkoutDay = null;
  const currentHour = startDt.getUTCHours();
  const currentDayName = dayNames[startDt.getUTCDay()];

  if (currentHour < 12 && specificList.includes(currentDayName)) {
    firstWorkoutDay = currentDayName;
  } else {
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

  if (firstWorkoutDay === longRunDay) {
    console.log(`⚠️ SAFETY RULE TRIGGERED: First workout day (${firstWorkoutDay}) equals long run day (${longRunDay})`);

    const longRunDayWorkout = week1.workouts.find(w => w.day === longRunDay);
    if (longRunDayWorkout) {
      let maxLongRunDistance;
      if (experience === 'Beginner' || experience === 'Intermediate') {
        maxLongRunDistance = unit === 'km' ? 3.0 : 1.9;
      } else if (experience === 'Advanced') {
        maxLongRunDistance = unit === 'km' ? 4.0 : 2.5;
      } else {
        maxLongRunDistance = unit === 'km' ? 5.0 : 3.1;
      }

      const originalDistance = longRunDayWorkout.distance;
      longRunDayWorkout.workout_type = 'Long Run';
      longRunDayWorkout.intensity = 'Long Easy';

      if (longRunDayWorkout.distance > maxLongRunDistance) {
        longRunDayWorkout.distance = maxLongRunDistance;
        const avgPaceMinutes = unit === 'km' ? 7.0 : 11.0;
        longRunDayWorkout.duration = Math.ceil(longRunDayWorkout.distance * avgPaceMinutes);
      }

      const longRunDistance = longRunDayWorkout.distance;
      const maxOtherDistance = longRunDistance - (unit === 'km' ? 0.5 : 0.3);

      for (const workout of week1.workouts) {
        if (workout.day !== longRunDay && workout.distance >= longRunDistance) {
          const originalOtherDistance = workout.distance;
          workout.distance = Math.max(maxOtherDistance, unit === 'km' ? 1.0 : 0.6);
          const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
          console.log(`   📏 Adjusted ${workout.day}: ${originalOtherDistance}${unit} → ${workout.distance}${unit}`);
        }
      }

      console.log(`✅ SAFETY RULE APPLIED: ${longRunDay} kept as Long Run (${originalDistance}${unit} → ${longRunDayWorkout.distance}${unit})`);
      longRunDayWorkout.description = `Long run with safety distance limit for first workout. Maintain conversational pace throughout.`;
      week1.total_weekly_distance = week1.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    }
  }
}

/**
 * Calculate BMI from height and weight
 */
function calculateBMI(height, weight) {
  if (!height || !weight) return 22;
  const heightInMeters = height < 100 ? (height * 0.0254) : (height / 100);
  const weightInKg = weight < 200 ? weight : (weight * 0.453592);
  return weightInKg / (heightInMeters * heightInMeters);
}

/**
 * Get BMI category from BMI value
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
 */
function calculateExpectedDuration(experience, minWeeks, maxWeeks, height, weight, weeklyMileage = '0') {
  let duration;

  let bmiCategory = 'Healthy';
  if (height && weight) {
    const bmi = calculateBMI(height, weight);
    bmiCategory = getBMICategory(bmi);
  }

  let normalizedExperience = (experience || 'Intermediate').toLowerCase();
  if (normalizedExperience === 'advance') normalizedExperience = 'advanced';

  const weeklyMileageStr = String(weeklyMileage).replace(/[^\d.-]/g, '');
  const weeklyMileageNum = parseFloat(weeklyMileageStr) || 0;
  const isHighMileageRunner = weeklyMileageNum > 100;

  console.log(`Duration calculation: experience=${normalizedExperience}, weeklyMileage=${weeklyMileageNum}, isHighMileage=${isHighMileageRunner}`);

  switch (normalizedExperience) {
    case 'beginner':
      duration = maxWeeks;
      if (bmiCategory.includes('Obesity')) duration = Math.min(maxWeeks + 1, maxWeeks);
      break;
    case 'intermediate':
      duration = Math.round((minWeeks + maxWeeks) / 2);
      if (bmiCategory === 'Overweight') duration += 1;
      if (bmiCategory.includes('Obesity')) duration += 1;
      break;
    case 'advanced':
      duration = isHighMileageRunner
        ? Math.round((minWeeks + maxWeeks) * 0.7)
        : Math.max(minWeeks + 2, Math.round((minWeeks + maxWeeks) * 0.4));
      if (bmiCategory.includes('Obesity')) duration += 1;
      break;
    case 'elite':
      duration = isHighMileageRunner
        ? Math.round((minWeeks + maxWeeks) * 0.6)
        : Math.max(minWeeks + 1, Math.round((minWeeks + maxWeeks) * 0.3));
      break;
    default:
      console.warn(`⚠️ Unrecognized experience level: "${experience}". Defaulting to intermediate.`);
      duration = Math.round((minWeeks + maxWeeks) / 2);
  }

  duration = Math.max(duration, 8);
  const finalDuration = Math.min(Math.max(duration, minWeeks), maxWeeks);
  console.log(`Final duration calculation: ${finalDuration} weeks`);
  return finalDuration;
}

/**
 * Round all distances in the plan to nearest 0.5 units.
 * Operates directly on weeks array.
 */
function roundAllDistances(weeks, unit = 'km') {
  if (!weeks) return;
  console.log(`🔧 Rounding all distances to nearest 0.5 ${unit}...`);

  for (const week of weeks) {
    if (!week.workouts) continue;
    for (const workout of week.workouts) {
      if (workout.distance && workout.distance > 0) {
        const originalDistance = workout.distance;
        workout.distance = roundDistance(workout.distance, unit);
        if (originalDistance !== workout.distance) {
          const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
        }
      }
    }
    week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
  }
}

/**
 * Fix long run day assignment.
 * Operates directly on weeks array.
 */
function fixLongRunDayAssignment(weeks, longRunDay, unit = 'km') {
  if (!weeks || !longRunDay) return;

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    const longRunDayWorkout = week.workouts.find(w => w.day === longRunDay);
    if (!longRunDayWorkout) continue;

    const longestWorkout = week.workouts.reduce((longest, current) =>
      (current.distance > longest.distance) ? current : longest, week.workouts[0]);

    if (longRunDayWorkout.distance < longestWorkout.distance) {
      console.log(`🔧 Week ${week.week_number}: Fixing long run day assignment`);
      const tempDistance = longRunDayWorkout.distance;
      const tempDuration = longRunDayWorkout.duration;
      const tempWorkoutType = longRunDayWorkout.workout_type;
      const tempIntensity = longRunDayWorkout.intensity;

      longRunDayWorkout.distance = longestWorkout.distance;
      longRunDayWorkout.duration = longestWorkout.duration;
      longRunDayWorkout.workout_type = 'Long Run';
      longRunDayWorkout.intensity = 'Long Easy';
      longRunDayWorkout.description = `Long run on Flat course. Maintain conversational pace throughout.`;

      longestWorkout.distance = tempDistance;
      longestWorkout.duration = tempDuration;
      longestWorkout.workout_type = tempWorkoutType === 'Long Run' ? 'Easy Run' : tempWorkoutType;
      longestWorkout.intensity = tempIntensity === 'Long Easy' ? 'Easy' : tempIntensity;
    } else if (longRunDayWorkout.workout_type !== 'Long Run') {
      longRunDayWorkout.workout_type = 'Long Run';
      longRunDayWorkout.intensity = 'Long Easy';
      longRunDayWorkout.description = `Long run on Flat course. Maintain conversational pace throughout.`;
    }
  }
}

/**
 * Validate and fix Long Run distance - ensure Long Run has the longest distance in the week.
 * Operates directly on weeks array.
 */
function validateAndFixLongRunDistance(weeks, unit = 'km', raceDistance = null, experience = 'Intermediate', planType = 'marathon', totalWeeks = 0) {
  if (!weeks) return;
  const capsPlanKey = planTypeToCapsKey(planType);
  const planKey = normalizePlanTypeKey(planType);
  console.log(`\n🔍 Starting Long Run distance validation (unit: ${unit}, raceDistance: ${raceDistance}, experience: ${experience}, planType: ${planType})...`);

  // Get max long run distance based on experience and plan type
  const maxLongRunDistance = getMaxLongRunDistance(experience, capsPlanKey, unit);
  console.log(`   Max long run distance for ${experience} ${planType}: ${maxLongRunDistance} ${unit}`);

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    console.log(`\n📅 Checking Week ${week.week_number}...`);
    const longRunWorkouts = week.workouts.filter(w => w.workout_type === 'Long Run');
    if (longRunWorkouts.length === 0) { console.log(`   No Long Run found in Week ${week.week_number}`); continue; }

    const allWorkouts = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
    if (allWorkouts.length <= 1) continue;

    for (const longRun of longRunWorkouts) {
      // RULE: Before race week, Long Run must stay strictly below race distance (half/marathon included).
      if (raceDistance && totalWeeks > 0 && Number(week.week_number) < Number(totalWeeks)) {
        const buffer = planKey === 'marathon'
          ? (unit === 'km' ? 2.0 : 1.2)
          : planKey === 'half marathon'
            ? (unit === 'km' ? 1.5 : 1.0)
            : (unit === 'km' ? 0.5 : 0.3);

        const preRaceCap = roundDistance(Math.max(0, raceDistance - buffer), unit);
        if (longRun.distance >= raceDistance || longRun.distance > preRaceCap) {
          const old = longRun.distance;
          longRun.distance = Math.min(longRun.distance, preRaceCap);
          longRun.duration = Math.ceil(longRun.distance * (unit === 'km' ? 6.5 : 10.5));
          console.log(`   🛑 PRE-RACE CAP: Long Run ${old} → ${longRun.distance} ${unit} (raceDistance=${raceDistance}${unit})`);

          // Re-allocate removed distance to another day to preserve weekly volume when possible
          const removed = roundDistance(old - longRun.distance, unit);
          if (removed > 0) {
            const receiver = week.workouts
              .filter(w =>
                w.workout_type !== 'Rest' &&
                w.workout_type !== 'Long Run' &&
                w.workout_type !== 'Race' &&
                Number(w.distance) > 0
              )
              .sort((a, b) => (Number(a.distance) || 0) - (Number(b.distance) || 0))[0];

            if (receiver) {
              const maxPerWorkout = (raceDistance && raceDistance <= 10) ? raceDistance : null;
              const receiverCap = maxPerWorkout != null ? roundDistance(maxPerWorkout, unit) : null;
              const candidate = receiverCap != null ? Math.min(Number(receiver.distance) + removed, receiverCap) : (Number(receiver.distance) + removed);
              const add = roundDistance(candidate - Number(receiver.distance), unit);
              if (add > 0) {
                receiver.distance = roundDistance(Number(receiver.distance) + add, unit);
                const paceMin = receiver.workout_type === 'Recovery Run'
                  ? (unit === 'km' ? 7.0 : 11.0)
                  : (unit === 'km' ? 6.5 : 10.5);
                receiver.duration = Math.ceil(receiver.distance * paceMin);
                console.log(`   ↔️  Rebalanced: added ${add}${unit} to ${receiver.day} (${receiver.workout_type})`);
              }
            }
          }
        }
      }

      // CAP 1: Long run should not exceed max long run distance for the plan
      if (longRun.distance > maxLongRunDistance) {
        console.log(`   ⚠️  PROBLEM: Long Run on ${longRun.day} has ${longRun.distance} ${unit}, exceeds max ${maxLongRunDistance} ${unit}`);
        longRun.distance = maxLongRunDistance;
        longRun.duration = Math.ceil(maxLongRunDistance * (unit === 'km' ? 6.5 : 10.5));
        console.log(`   ✅ FIXED: Long Run capped to max ${maxLongRunDistance} ${unit}`);
        continue;
      }

      // CAP 2: For all races, long run must not exceed race distance
      if (raceDistance && longRun.distance > raceDistance) {
        console.log(`   ⚠️  PROBLEM: Long Run on ${longRun.day} has ${longRun.distance} ${unit}, exceeds race distance ${raceDistance} ${unit}`);
        longRun.distance = raceDistance;
        longRun.duration = Math.ceil((raceDistance * (unit === 'km' ? 6.5 : 10.5)));
        console.log(`   ✅ FIXED: Long Run capped to race distance ${raceDistance} ${unit}`);
        continue;
      }

      const absoluteLongestWorkout = allWorkouts.reduce((longest, current) =>
        (current.distance > longest.distance) ? current : longest, allWorkouts[0]);

      if (longRun.distance >= absoluteLongestWorkout.distance) {
        console.log(`   ✅ Long Run on ${longRun.day} (${longRun.distance} ${unit}) is already the longest`);
        continue;
      }

      console.log(`   ⚠️  PROBLEM: Long Run on ${longRun.day} has ${longRun.distance} ${unit}, But ${absoluteLongestWorkout.day} has ${absoluteLongestWorkout.distance} ${unit}`);

      // Swap
      const oLRD = longRun.distance, oLRDur = longRun.duration, oLRI = longRun.intensity, oLRPR = longRun.pace_range, oLRDesc = longRun.description;
      const oLD = absoluteLongestWorkout.distance, oLDur = absoluteLongestWorkout.duration, oLI = absoluteLongestWorkout.intensity, oLPR = absoluteLongestWorkout.pace_range, oLDesc = absoluteLongestWorkout.description;

      longRun.distance = oLD; longRun.duration = oLDur; longRun.intensity = 'Long Easy'; longRun.pace_range = oLPR || longRun.pace_range;
      longRun.description = `Long run on Flat course. Maintain conversational pace throughout.`;

      absoluteLongestWorkout.distance = oLRD; absoluteLongestWorkout.duration = oLRDur;
      if (absoluteLongestWorkout.workout_type === 'Easy Run') absoluteLongestWorkout.intensity = 'Easy';
      else if (absoluteLongestWorkout.workout_type === 'Recovery Run') absoluteLongestWorkout.intensity = 'Recovery';
      else if (absoluteLongestWorkout.workout_type === 'Tempo Run') absoluteLongestWorkout.intensity = 'Tempo';
      else if (absoluteLongestWorkout.workout_type === 'Interval Run') absoluteLongestWorkout.intensity = 'Intervals/VO2';
      else absoluteLongestWorkout.intensity = oLI === 'Long Easy' ? 'Easy' : oLI;
      absoluteLongestWorkout.pace_range = oLRPR;
      absoluteLongestWorkout.description = oLDesc;

      // Handle additional longer workouts
      const remaining = week.workouts.filter(w => w.workout_type !== 'Rest' && w.workout_type !== 'Long Run' && w.distance > 0 && w.distance > longRun.distance);
      if (remaining.length > 0) {
        const newLongest = remaining.reduce((a, b) => b.distance > a.distance ? b : a);
        const tD = longRun.distance, tDur = longRun.duration;
        longRun.distance = newLongest.distance; longRun.duration = newLongest.duration;
        newLongest.distance = tD; newLongest.duration = tDur;
        if (newLongest.workout_type === 'Easy Run') newLongest.intensity = 'Easy';
        else if (newLongest.workout_type === 'Recovery Run') newLongest.intensity = 'Recovery';
        else if (newLongest.workout_type === 'Tempo Run') newLongest.intensity = 'Tempo';
        else if (newLongest.workout_type === 'Interval Run') newLongest.intensity = 'Intervals/VO2';
      }

      console.log(`   ✅ VERIFIED: Long Run on ${longRun.day} is now the longest at ${longRun.distance} ${unit}`);
    }
  }

  console.log(`\n✅ Long Run distance validation complete\n`);
}

/**
 * Validate and fix workout distance/type consistency.
 * Operates directly on weeks array.
 */
function validateAndFixWorkoutDistances(weeks, unit = 'km') {
  if (!weeks) return;
  console.log('🔍 Validating workout distances and types...');

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;

    for (const workout of week.workouts) {
      if (workout.workout_type === 'Rest') {
        if (workout.distance !== 0 || workout.duration !== 0) {
          workout.distance = 0; workout.duration = 0; workout.intensity = 'Rest';
          workout.pace_range = 'N/A';
          workout.description = 'Rest day for recovery and adaptation. Focus on hydration, nutrition, and light stretching.';
        }
      } else {
        if (workout.distance === 0 || workout.duration === 0) {
          let minDistance;
          if (workout.workout_type === 'Long Run') minDistance = unit === 'km' ? 5.0 : 3.0;
          else if (workout.workout_type === 'Recovery Run') minDistance = unit === 'km' ? 2.0 : 1.2;
          else minDistance = unit === 'km' ? 3.0 : 2.0;

          workout.distance = minDistance;
          let avgPaceMinutes;
          if (workout.workout_type === 'Recovery Run') avgPaceMinutes = unit === 'km' ? 7.0 : 11.0;
          else if (workout.workout_type === 'Long Run') avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
          else avgPaceMinutes = unit === 'km' ? 6.0 : 9.5;
          workout.duration = Math.ceil(workout.distance * avgPaceMinutes);

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
        }
      }
    }

    week.total_weekly_distance = week.workouts
      .filter(w => w.workout_type !== 'Rest')
      .reduce((sum, w) => sum + (w.distance || 0), 0);
  }

  console.log('✅ Workout distance validation complete');
}

/**
 * Validate and fix workout type and intensity consistency.
 * Operates directly on weeks array.
 */
function validateAndFixWorkoutTypeIntensity(weeks) {
  if (!weeks) return;

  const workoutTypeIntensityMap = {
    'Easy Run': 'Easy',
    'Recovery Run': 'Recovery',
    'Tempo Run': 'Tempo',
    'Long Run': 'Long Easy',
    'Interval Run': 'Intervals/VO2',
    'Rest': 'Rest',
    'Race': 'Goal-pace'
  };

  for (const week of weeks) {
    if (!week.workouts || week.workouts.length === 0) continue;
    for (const workout of week.workouts) {
      if (!workout.workout_type) continue;
      const expectedIntensity = workoutTypeIntensityMap[workout.workout_type];
      if (!expectedIntensity) continue;

      if (workout.workout_type === 'Interval Run' || workout.workout_type === 'Intervals/VO2') {
        if (!['Intervals/VO2', 'Threshold', 'Intervals'].includes(workout.intensity)) {
          workout.intensity = 'Intervals/VO2';
        }
      } else if (workout.intensity !== expectedIntensity) {
        workout.intensity = expectedIntensity;
      }
    }
  }
}

/**
 * When distances are flat (common bad AI pattern), redistribute while preserving weekly total.
 * Applies to all plan types (5k / 10k / half / marathon). Last-plan-weeks use a slightly lower long share
 * so reshaping aligns with taper-style volume. Re-run after proportional taper to fix re-collapsed weeks.
 * maxWorkoutDistance: cap per day for short-race plans (e.g. 5 km).
 */
function reshapeUniformWeekDistances(week, longRunDay, unit = 'km', maxWorkoutDistance = null, totalWeeks = 0) {
  if (!week?.workouts?.length || !longRunDay) return;

  if (week.workouts.some(w => w.workout_type === 'Race')) return;

  const running = week.workouts.filter(
    w => w.workout_type !== 'Rest' && w.workout_type !== 'Race' && Number(w.distance) > 0
  );
  if (running.length < 2) return;

  const nums = running.map(w => Number(w.distance));
  const roundedAll = nums.map(n => roundDistance(n, unit));
  const distinctAll = new Set(roundedAll);
  const allRunningSame =
    distinctAll.size === 1 ||
    nums.every(x => Math.abs(x - nums[0]) < 0.001);

  const nonRecovery = running.filter(w => w.workout_type !== 'Recovery Run');
  const allNonRecoverySame =
    nonRecovery.length >= 2 &&
    nonRecovery.every(w =>
      Math.abs(Number(w.distance) - Number(nonRecovery[0].distance)) < 0.001
    );

  const roundedNR = nonRecovery.map(w => roundDistance(Number(w.distance), unit));
  let maxFreq = 0;
  const freq = new Map();
  for (const r of roundedNR) {
    freq.set(r, (freq.get(r) || 0) + 1);
    maxFreq = Math.max(maxFreq, freq.get(r));
  }
  const majorityNonRecoveryFlat =
    nonRecovery.length >= 3 && maxFreq >= nonRecovery.length - 1;

  const spreadNR =
    roundedNR.length > 0 ? Math.max(...roundedNR) - Math.min(...roundedNR) : 0;
  const tightSpan = unit === 'km' ? 1.5 : 1.0;
  const tightNonRecoveryCluster =
    nonRecovery.length >= 3 && freq.size <= 2 && spreadNR <= tightSpan + 1e-6;

  if (
    !allRunningSame &&
    !allNonRecoverySame &&
    !majorityNonRecoveryFlat &&
    !tightNonRecoveryCluster
  ) {
    return;
  }

  const total = roundDistance(nums.reduce((a, b) => a + b, 0), unit);
  const step = 0.5;
  let minOther = unit === 'km' ? 1.5 : 1.0;

  const longWorkout = running.find(w => w.day === longRunDay);
  if (!longWorkout) return;

  const others = running.filter(w => w !== longWorkout);
  const nO = others.length;

  if (total < nO * minOther + minOther + step * 2) {
    minOther = Math.max(unit === 'km' ? 1.0 : 0.5, roundDistance((total * 0.5) / (nO + 1), unit));
  }

  const cap =
    maxWorkoutDistance != null && maxWorkoutDistance > 0
      ? roundDistance(maxWorkoutDistance, unit)
      : null;

  const isTaperWeek =
    totalWeeks > 0 &&
    week.week_number != null &&
    week.week_number >= totalWeeks - 2;
  const longFraction = isTaperWeek ? 0.27 : 0.325;

  let longDist = roundDistance(total * longFraction, unit);
  longDist = Math.max(longDist, minOther + step * 2);
  longDist = Math.min(longDist, total - nO * minOther);
  if (cap != null) longDist = Math.min(longDist, cap);
  longDist = roundDistance(longDist, unit);

  let remainder = roundDistance(total - longDist, unit);

  const typeW = w => {
    if (w.workout_type === 'Recovery Run') return 0.65;
    if (w.workout_type === 'Interval Run') return 1.05;
    if (w.workout_type === 'Tempo Run') return 1.0;
    if (w.workout_type === 'Easy Run') return 0.9;
    return 0.85;
  };

  const ws = others.map(typeW);
  const wSum = ws.reduce((a, b) => a + b, 0);

  let assigned = others.map((w, i) => {
    const p = (remainder * ws[i]) / wSum;
    let a = Math.max(minOther, Math.round(p / step) * step);
    if (cap != null) a = Math.min(a, cap);
    return a;
  });

  let s = assigned.reduce((a, b) => a + b, 0);
  let leftover = remainder - s;

  let guard = 0;
  while (leftover > 0.01 && guard++ < 80) {
    const candidates = others
      .map((w, i) => ({ i, w }))
      .filter(({ w, i }) => cap == null || assigned[i] + step <= cap + 1e-6)
      .filter(({ w }) => w.workout_type !== 'Recovery Run');
    const pick = (candidates.length ? candidates : others.map((w, i) => ({ i, w })).filter(({ i }) => cap == null || assigned[i] + step <= cap + 1e-6))
      .sort((a, b) => assigned[a.i] - assigned[b.i])[0]?.i;
    if (pick === undefined) break;
    assigned[pick] += step;
    leftover -= step;
  }

  guard = 0;
  while (leftover < -0.01 && guard++ < 80) {
    const pool = others
      .map((w, i) => ({ i, w }))
      .filter(({ w, i }) => assigned[i] - step >= minOther && w.workout_type !== 'Recovery Run');
    const pick = (pool.length ? pool : others.map((w, i) => ({ i, w })).filter(({ i }) => assigned[i] - step >= minOther))
      .sort((a, b) => assigned[b.i] - assigned[a.i])[0]?.i;
    if (pick === undefined) break;
    assigned[pick] -= step;
    leftover += step;
  }

  const applyDuration = (w, d) => {
    let dist = roundDistance(d, unit);
    if (cap != null) dist = Math.min(dist, cap);
    w.distance = dist;
    let paceMin;
    if (w.workout_type === 'Recovery Run') paceMin = unit === 'km' ? 7.0 : 11.0;
    else if (w.workout_type === 'Long Run') paceMin = unit === 'km' ? 6.5 : 10.5;
    else if (w.workout_type === 'Tempo Run') paceMin = unit === 'km' ? 6.0 : 9.5;
    else if (w.workout_type === 'Interval Run') paceMin = unit === 'km' ? 5.8 : 9.2;
    else paceMin = unit === 'km' ? 6.5 : 10.5;
    w.duration = Math.max(1, Math.ceil(dist * paceMin));
  };

  longWorkout.workout_type = 'Long Run';
  longWorkout.intensity = 'Long Easy';
  applyDuration(longWorkout, longDist);

  others.forEach((w, i) => applyDuration(w, assigned[i]));

  let maxOther = Math.max(...others.map(w => w.distance));
  if (longWorkout.distance <= maxOther) {
    const delta = roundDistance(maxOther - longWorkout.distance + step, unit);
    const donor = others.reduce((a, b) => (b.distance > a.distance ? b : a));
    const donorNext = roundDistance(donor.distance - delta, unit);
    if (donorNext >= minOther) {
      applyDuration(donor, donorNext);
      applyDuration(longWorkout, longWorkout.distance + delta);
    }
  }

  // Resolve remaining ties without changing weekly total (+step / -step pairs)
  for (let iter = 0; iter < 50; iter++) {
    const byDist = new Map();
    for (const w of running) {
      const k = roundDistance(Number(w.distance), unit);
      if (!byDist.has(k)) byDist.set(k, []);
      byDist.get(k).push(w);
    }
    let progressed = false;
    for (const [, group] of byDist) {
      if (group.length < 2) continue;
      const avoid = group.filter(w => w !== longWorkout && w.workout_type !== 'Recovery Run');
      const pool = avoid.length >= 2 ? avoid : group.filter(w => w !== longWorkout);
      if (pool.length < 2) continue;
      const donor = pool.reduce((a, b) => (b.distance > a.distance ? b : a));
      const recv = pool.find(w => w !== donor) || pool[0];
      if (donor === recv) continue;
      if (roundDistance(donor.distance - step, unit) < minOther) continue;
      applyDuration(donor, donor.distance - step);
      applyDuration(recv, recv.distance + step);
      progressed = true;
      break;
    }
    if (!progressed) break;
    maxOther = Math.max(...others.map(w => w.distance));
    if (longWorkout.distance <= maxOther) {
      const delta = roundDistance(maxOther - longWorkout.distance + step, unit);
      const donor = others.reduce((a, b) => (b.distance > a.distance ? b : a));
      const donorNext = roundDistance(donor.distance - delta, unit);
      if (donorNext >= minOther) {
        applyDuration(donor, donorNext);
        applyDuration(longWorkout, longWorkout.distance + delta);
      }
    }
  }

  week.total_weekly_distance = week.workouts
    .filter(w => w.workout_type !== 'Rest')
    .reduce((sum, w) => sum + (Number(w.distance) || 0), 0);

  const flatKind = allRunningSame
    ? 'all days equal'
    : allNonRecoverySame
      ? 'non-recovery equal'
      : majorityNonRecoveryFlat
        ? 'majority non-recovery tied'
        : 'tight distance cluster';
  const taperTag = isTaperWeek ? ', taper long-share' : '';
  console.log(
    `🔧 Week ${week.week_number}: reshaped (${flatKind}${taperTag}) → varied volumes, total ${week.total_weekly_distance} ${unit}`
  );
}

/**
 * Fix duplicate distances in a week (anti-repetition rule)
 */
function fixDuplicateDistances(week, unit = 'km', raceDistance = null) {
  if (!week.workouts || week.workouts.length === 0) return week;

  for (const w of week.workouts) {
    if (w.workout_type !== 'Rest' && w.distance != null) {
      const n = Number(w.distance);
      if (!Number.isNaN(n)) w.distance = n;
    }
  }

  const workouts = week.workouts.filter(w => w.workout_type !== 'Rest' && Number(w.distance) > 0);
  if (workouts.length <= 1) return week;

  const distanceCounts = {};
  for (const workout of workouts) {
    const key = roundDistance(Number(workout.distance), unit);
    distanceCounts[key] = (distanceCounts[key] || 0) + 1;
  }

  const duplicates = Object.keys(distanceCounts).filter(d => distanceCounts[d] > 1);
  if (duplicates.length === 0) return week;

  console.log(`⚠️  Week ${week.week_number}: Found duplicate distances: ${duplicates.join(', ')} ${unit}`);

  const increment = 0.5;
  const usedDistances = new Set();

  for (const workout of workouts) {
    let distance = roundDistance(Number(workout.distance), unit);
    while (usedDistances.has(distance)) {
      distance += increment;
      distance = Math.round(distance * 2) / 2;
      // Don't exceed race distance if specified
      if (raceDistance && distance > raceDistance) {
        distance -= increment;
        break;
      }
    }
    if (distance !== roundDistance(Number(workout.distance), unit)) {
      console.log(`   ${workout.day}: ${workout.distance} ${unit} → ${distance} ${unit}`);
      workout.distance = distance;
      const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;
      workout.duration = Math.ceil(distance * avgPaceMinutes);
    }
    usedDistances.add(distance);
  }

  week.total_weekly_distance = week.workouts
    .filter(w => w.workout_type !== 'Rest')
    .reduce((sum, w) => sum + (Number(w.distance) || 0), 0);
  return week;
}

/**
 * Fix plan dates from adjusted start date.
 * Works on weekly_plans array directly or via planJson/recommended_plan.
 */
function fixPlanDatesFromAdjustedStartDate(planJson, adjustedStartDate) {
  if (!planJson || !adjustedStartDate) return planJson;

  console.log('🔧 Fixing plan dates based on adjusted start_date...');

  const weeklyPlans = getWeeklyPlans(planJson);
  if (weeklyPlans.length === 0) return planJson;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const firstWorkoutDate = new Date(adjustedStartDate);
  const startDayOfWeek = firstWorkoutDate.getUTCDay();
  const startHour = firstWorkoutDate.getUTCHours();

  const week1 = weeklyPlans[0];
  if (week1) {
    let weekStartDate, weekEndDate;

    if (startHour >= 12) {
      weekStartDate = new Date(firstWorkoutDate);
      weekEndDate = new Date(firstWorkoutDate);
      const daysToNextSunday = startDayOfWeek === 0 ? 0 : 7 - startDayOfWeek;
      weekEndDate.setUTCDate(firstWorkoutDate.getUTCDate() + daysToNextSunday);
    } else {
      weekStartDate = new Date(firstWorkoutDate);
      weekEndDate = new Date(firstWorkoutDate);
      const daysToSunday = startDayOfWeek === 0 ? 0 : 7 - startDayOfWeek;
      weekEndDate.setUTCDate(firstWorkoutDate.getUTCDate() + daysToSunday);
    }

    week1.start_date = weekStartDate.toISOString().split('T')[0];
    week1.end_date = weekEndDate.toISOString().split('T')[0];

    const week1Workouts = [];
    const week2Workouts = [];

    for (const workout of week1.workouts) {
      const dayIndex = dayNames.indexOf(workout.day);
      if (dayIndex !== -1) {
        const workoutDate = new Date(firstWorkoutDate);
        const startDayIndex = firstWorkoutDate.getUTCDay();
        let daysToAdd = dayIndex - startDayIndex;
        if (daysToAdd < 0) daysToAdd += 7;
        workoutDate.setUTCDate(firstWorkoutDate.getUTCDate() + daysToAdd);
        workout.date = workoutDate.toISOString().split('T')[0];

        const workoutDateObj = new Date(workout.date);
        const week1StartObj = new Date(week1.start_date);
        const week1EndObj = new Date(week1.end_date);

        if (workoutDateObj >= week1StartObj && workoutDateObj <= week1EndObj) {
          week1Workouts.push(workout);
        } else {
          week2Workouts.push(workout);
        }
      }
    }

    week1.workouts = week1Workouts;
    week1.total_weekly_distance = week1Workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    week1.workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Fix Week 2+ dates
  for (let i = 1; i < weeklyPlans.length; i++) {
    const week = weeklyPlans[i];
    const previousWeek = weeklyPlans[i - 1];
    const previousWeekEndDate = new Date(previousWeek.end_date);

    const weekStartDate = new Date(previousWeekEndDate);
    weekStartDate.setUTCDate(previousWeekEndDate.getUTCDate() + 1);

    const startDow = weekStartDate.getUTCDay();
    if (startDow !== 1) {
      const daysToMonday = startDow === 0 ? 1 : 8 - startDow;
      weekStartDate.setUTCDate(weekStartDate.getUTCDate() + daysToMonday);
    }

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);

    week.start_date = weekStartDate.toISOString().split('T')[0];
    week.end_date = weekEndDate.toISOString().split('T')[0];

    if (week.workouts && week.workouts.length > 0) {
      for (const workout of week.workouts) {
        const dayIndex = dayNames.indexOf(workout.day);
        if (dayIndex !== -1) {
          const workoutDate = new Date(weekStartDate);
          const daysToAdd = dayIndex === 0 ? 6 : dayIndex - 1;
          workoutDate.setUTCDate(weekStartDate.getUTCDate() + daysToAdd);
          workout.date = workoutDate.toISOString().split('T')[0];
        }
      }
      week.workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
      week.total_weekly_distance = week.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    }
  }

  console.log('✅ All plan dates fixed based on adjusted start_date');
  return planJson;
}

/**
 * Validate and fix invalid dates
 */
function validateAndFixDate(dateStr) {
  if (!dateStr) return dateStr;

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) { console.warn(`⚠️  Invalid date format: ${dateStr}`); return dateStr; }

  const year = parseInt(match[1]);
  const month = parseInt(match[2]);
  const day = parseInt(match[3]);

  if (month === 2 && day === 29) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (!isLeapYear) {
      console.warn(`⚠️  Invalid date: Feb 29, ${year}. Correcting to Feb 28.`);
      return dateStr.replace(/^(\d{4}-\d{2}-)29/, '$128');
    }
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.warn(`⚠️  Invalid date detected: ${dateStr}`);
    return new Date().toISOString();
  }

  return dateStr;
}

/**
 * Fix all dates in a training plan.
 * Works on weekly_plans regardless of plan structure.
 */
function fixPlanDates(planJson) {
  if (!planJson) return planJson;

  const weeklyPlans = getWeeklyPlans(planJson);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const week of weeklyPlans) {
    if (week.start_date) week.start_date = validateAndFixDate(week.start_date);
    if (week.end_date) week.end_date = validateAndFixDate(week.end_date);

    if (week.workouts && week.workouts.length > 0) {
      for (const workout of week.workouts) {
        if (workout.date) workout.date = validateAndFixDate(workout.date);
      }

      const usedDates = new Set();
      const dayToIndex = {};
      dayNames.forEach((day, idx) => dayToIndex[day] = idx);

      for (const workout of week.workouts) {
        if (!workout.date || !workout.day) continue;
        if (usedDates.has(workout.date)) {
          const targetDayIndex = dayToIndex[workout.day];
          if (targetDayIndex !== undefined && week.start_date) {
            const weekStart = new Date(week.start_date);
            const weekStartDayIndex = weekStart.getUTCDay();
            let daysToAdd = targetDayIndex - weekStartDayIndex;
            if (daysToAdd < 0) daysToAdd += 7;
            const correctDate = new Date(weekStart);
            correctDate.setUTCDate(weekStart.getUTCDate() + daysToAdd);
            workout.date = correctDate.toISOString().split('T')[0];
          }
        }
        usedDates.add(workout.date);
      }

      if (week.workouts.length > 0 && week.start_date) {
        const lastWorkout = week.workouts[week.workouts.length - 1];
        if (lastWorkout.date) {
          const lastDate = new Date(lastWorkout.date);
          const currentEndDate = new Date(week.end_date);
          if (lastDate > currentEndDate) week.end_date = lastWorkout.date;
        }
      }
    }
  }

  return planJson;
}

function adjustStartDate(startDateStr, specificDays) {
  if (!startDateStr) startDateStr = new Date().toISOString();

  const dt = new Date(startDateStr);
  const specificList = specificDays.split(',').map(d => d.trim());
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = dayNames[dt.getUTCDay()];
  const currentHour = dt.getUTCHours();

  console.log(`Adjusting start date: ${startDateStr}, Hour: ${currentHour}, Day: ${currentDayName}`);

  if (currentHour >= 12) {
    for (let i = 1; i <= 7; i++) {
      const nextDay = new Date(dt);
      nextDay.setUTCDate(dt.getUTCDate() + i);
      const nextDayName = dayNames[nextDay.getUTCDay()];
      if (specificList.includes(nextDayName)) {
        nextDay.setUTCHours(6, 0, 0, 0);
        return nextDay.toISOString();
      }
    }
  }

  if (currentHour < 12 && specificList.includes(currentDayName)) {
    dt.setUTCHours(6, 0, 0, 0);
    return dt.toISOString();
  }

  for (let i = 1; i <= 7; i++) {
    const nextDay = new Date(dt);
    nextDay.setUTCDate(dt.getUTCDate() + i);
    const nextDayName = dayNames[nextDay.getUTCDay()];
    if (specificList.includes(nextDayName)) {
      nextDay.setUTCHours(6, 0, 0, 0);
      return nextDay.toISOString();
    }
  }

  dt.setUTCHours(6, 0, 0, 0);
  return dt.toISOString();
}

/**
 * Calculate plan duration based on race date
 */
function calculateDurationFromRaceDate(startDate, raceDate, minWeeks, maxWeeks) {
  const start = new Date(startDate);
  const race = new Date(raceDate);
  const diffTime = Math.abs(race - start);
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  const duration = Math.max(minWeeks, Math.min(maxWeeks, diffWeeks));
  console.log(`Calculated duration from race date: ${diffWeeks} weeks (clamped to ${duration} weeks)`);
  return duration;
}

/**
 * Calculate pace zones based on goal race time
 */
function calculatePaceZones(goalRaceTime, raceDistance, experience, unit = 'km') {
  if (!goalRaceTime || !raceDistance) return null;

  const parts = goalRaceTime.split(':').map(p => parseInt(p));
  let totalSeconds = 0;
  if (parts.length === 3) totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];
  if (totalSeconds === 0) return null;

  const goalPaceSeconds = totalSeconds / raceDistance;
  
  // FIX #1: Validate that goal pace is realistic
  if (!validatePaceIsRealistic(goalPaceSeconds, unit)) {
    console.warn(`⚠️  Goal pace is unrealistic. Using fallback pace zones.`);
    return null;
  }
  
  const formatPace = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const expKey = ['Beginner', 'Intermediate', 'Advanced', 'Elite'].find(
    (k) => k.toLowerCase() === (experience || '').toString().trim().toLowerCase()
  ) || 'Intermediate';

  const easyAdjustments = { 'Beginner': [75, 90], 'Intermediate': [60, 75], 'Advanced': [45, 62], 'Elite': [22, 45] };
  const longAdjustments = { 'Beginner': [60, 75], 'Intermediate': [50, 65], 'Advanced': [40, 58], 'Elite': [22, 48] };
  const tempoAdjustments = { 'Beginner': [25, 30], 'Intermediate': [20, 25], 'Advanced': [15, 20], 'Elite': [10, 20] };
  const intervalAdjustments = { 'Beginner': [-10, -15], 'Intermediate': [-15, -20], 'Advanced': [-20, -30], 'Elite': [-25, -38] };

  const easyRange = easyAdjustments[expKey] || [60, 75];
  const longRange = longAdjustments[expKey] || [50, 65];
  const tempoRange = tempoAdjustments[expKey] || [20, 25];
  const intervalRange = intervalAdjustments[expKey] || [-15, -20];

  return {
    goal_pace: `${formatPace(goalPaceSeconds)} min/${unit}`,
    easy: `${formatPace(goalPaceSeconds + easyRange[0])}-${formatPace(goalPaceSeconds + easyRange[1])} min/${unit}`,
    long: `${formatPace(goalPaceSeconds + longRange[0])}-${formatPace(goalPaceSeconds + longRange[1])} min/${unit}`,
    tempo: `${formatPace(goalPaceSeconds + tempoRange[0])}-${formatPace(goalPaceSeconds + tempoRange[1])} min/${unit}`,
    threshold: `${formatPace(goalPaceSeconds + 10)}-${formatPace(goalPaceSeconds + 20)} min/${unit}`,
    intervals: `${formatPace(goalPaceSeconds + intervalRange[1])}-${formatPace(goalPaceSeconds + intervalRange[0])} min/${unit}`,
    recovery: `${formatPace(goalPaceSeconds + 90)}-${formatPace(goalPaceSeconds + 120)} min/${unit}`
  };
}

/**
 * Determine rest day requirements based on experience level
 */
function determineRestDayRequirements(experience, trainingDays) {
  const requirements = { required_rest_days: 0, recommended_rest_days: 0, allow_all_seven_days: false, warning: null };

  let normalizedExperience = (experience || 'Intermediate').toLowerCase();
  if (normalizedExperience === 'advance') normalizedExperience = 'advanced';

  switch (normalizedExperience) {
    case 'beginner':
    case 'intermediate':
      if (trainingDays >= 7) {
        requirements.required_rest_days = 1;
        requirements.recommended_rest_days = 1;
        requirements.allow_all_seven_days = false;
        requirements.warning = `${experience} runners require at least 1 rest day per week when training all 7 days.`;
      } else {
        requirements.required_rest_days = 0;
        requirements.allow_all_seven_days = true;
      }
      break;
    case 'advanced':
    case 'elite':
      requirements.required_rest_days = 0;
      requirements.allow_all_seven_days = true;
      break;
    default:
      console.warn(`⚠️ Unrecognized experience level: "${experience}". Defaulting to Intermediate logic.`);
      if (trainingDays >= 7) {
        requirements.required_rest_days = 1;
        requirements.warning = 'Unrecognized experience level. Applying intermediate runner rest day requirements.';
      }
  }

  console.log(`Rest day requirements for ${experience} with ${trainingDays} training days:`, requirements);
  return requirements;
}

/**
 * Remove invalid rest days. Operates directly on weeks array.
 */
function removeInvalidRestDays(weeks, originalInput) {
  const experience = originalInput.running_experience || 'Intermediate';
  const specificDays = originalInput.specific_days ? originalInput.specific_days.split(',').map(d => d.trim()) : [];

  console.log('🚫 Checking for invalid rest days...');
  console.log(`   Experience: ${experience}, Selected days: ${specificDays.length}`);

  if (['elite', 'advanced'].includes((experience || 'Intermediate').toLowerCase())) {
    // Remove ALL rest days
    for (const week of weeks) {
      const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
      for (const restWorkout of restWorkouts) {
        restWorkout.workout_type = 'Easy Run';
        restWorkout.intensity = 'Easy';
        restWorkout.distance = 3;
        restWorkout.duration = 21;
        restWorkout.pace_range = '6:15-6:45 min/km';
        restWorkout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
      }
      week.total_weekly_distance = week.workouts.filter(w => w.workout_type !== 'Rest').reduce((s, w) => s + (w.distance || 0), 0);
    }
  } else if (['beginner', 'intermediate'].includes((experience || 'Intermediate').toLowerCase())) {
    if (specificDays.length < 7) {
      // Remove ALL rest days (training on fewer than 7 days means natural rest on other days)
      for (const week of weeks) {
        week.workouts = week.workouts.filter(w => w.workout_type !== 'Rest');
        week.total_weekly_distance = week.workouts.reduce((s, w) => s + (w.distance || 0), 0);
      }
    } else {
      // Allow max 1 rest day per week
      for (const week of weeks) {
        const restWorkouts = week.workouts.filter(w => w.workout_type === 'Rest');
        if (restWorkouts.length > 1) {
          for (let i = 1; i < restWorkouts.length; i++) {
            const restWorkout = restWorkouts[i];
            restWorkout.workout_type = 'Easy Run';
            restWorkout.intensity = 'Easy';
            restWorkout.distance = 3;
            restWorkout.duration = 21;
            restWorkout.pace_range = '6:15-6:45 min/km';
            restWorkout.description = 'Easy conversational run. Should feel comfortable and sustainable.';
          }
          week.total_weekly_distance = week.workouts.filter(w => w.workout_type !== 'Rest').reduce((s, w) => s + (w.distance || 0), 0);
        }
      }
    }
  }
}

/**
 * Ensure long run day has highest distance in each week.
 * Operates directly on weeks array.
 */
function ensureLongRunIsHighest(weeks, longRunDay, unit) {
  if (!weeks || !longRunDay) return;
  console.log('📏 Ensuring long run day has highest distance...');

  for (const week of weeks) {
    const longRunDayWorkout = week.workouts.find(w => w.day === longRunDay);
    if (!longRunDayWorkout || longRunDayWorkout.workout_type === 'Rest') continue;

    const nonRestWorkouts = week.workouts.filter(w => w.workout_type !== 'Rest' && w.distance > 0);
    if (nonRestWorkouts.length === 0) continue;

    const highestDistanceWorkout = nonRestWorkouts.reduce((highest, current) =>
      (current.distance > highest.distance) ? current : highest, nonRestWorkouts[0]);

    if (longRunDayWorkout.distance < highestDistanceWorkout.distance) {
      const tempDistance = longRunDayWorkout.distance;
      const tempDuration = longRunDayWorkout.duration;
      longRunDayWorkout.distance = highestDistanceWorkout.distance;
      longRunDayWorkout.duration = highestDistanceWorkout.duration;
      highestDistanceWorkout.distance = tempDistance;
      highestDistanceWorkout.duration = tempDuration;

      if (longRunDayWorkout.workout_type !== 'Long Run') {
        longRunDayWorkout.workout_type = 'Long Run';
        longRunDayWorkout.intensity = 'Long Easy';
        longRunDayWorkout.description = `Long run on ${longRunDay}. Maintain conversational pace throughout.`;
      }
    }
  }
}

/**
 * Validate and fix invalid workout types. Operates directly on weeks array.
 */
function validateAndFixWorkoutTypes(weeks) {
  const validWorkoutTypes = ['Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'];
  const workoutTypeMap = {
    'Race Pace': 'Tempo Run', 'Goal Pace': 'Tempo Run', 'Goal-Pace Run': 'Tempo Run', 'Pace Run': 'Tempo Run',
    'Speed Work': 'Interval Run', 'Speed Run': 'Interval Run', 'Intervals': 'Interval Run',
    'Tempo': 'Tempo Run', 'Easy': 'Easy Run', 'Recovery': 'Recovery Run', 'Long': 'Long Run', 'Rest Day': 'Rest'
  };
  const intensityMap = {
    'Easy Run': 'Easy', 'Recovery Run': 'Recovery', 'Long Run': 'Long Easy',
    'Tempo Run': 'Tempo', 'Interval Run': 'Intervals/VO2', 'Race': 'Goal-pace', 'Rest': 'Rest'
  };

  console.log('🔧 Validating and fixing workout types...');
  for (const week of weeks) {
    if (!week.workouts) continue;
    for (const workout of week.workouts) {
      if (!validWorkoutTypes.includes(workout.workout_type)) {
        const mappedType = workoutTypeMap[workout.workout_type];
        if (mappedType) {
          console.log(`   Week ${week.week_number}: "${workout.workout_type}" → "${mappedType}" (${workout.day})`);
          workout.workout_type = mappedType;
          workout.intensity = intensityMap[mappedType] || workout.intensity;
        } else {
          console.log(`   Week ${week.week_number}: Unknown type "${workout.workout_type}" → "Easy Run" (${workout.day})`);
          workout.workout_type = 'Easy Run';
          workout.intensity = 'Easy';
        }
      }
    }
  }
}

/**
 * Fix ALL Week 1 workout distances to be appropriate for experience level.
 * Operates directly on weeks array.
 */
function fixFirstWorkoutDistance(weeks, experience, unit, weeklyMileage) {
  if (!weeks || weeks.length === 0) return;
  const week1 = weeks[0];
  if (!week1.workouts || week1.workouts.length === 0) return;

  let hasRunningBase = true;
  const mileageStr = String(weeklyMileage || '0');
  if (mileageStr === '0' || mileageStr === '0-0' || mileageStr.toLowerCase() === 'none') {
    hasRunningBase = false;
  } else {
    const match = mileageStr.match(/(\d+)/);
    if (match) hasRunningBase = parseInt(match[1]) > 0;
  }

  if (experience === 'Elite' || experience === 'Advanced') return;
  if (experience === 'Intermediate' && hasRunningBase) return;

  const maxWorkoutDistance = {
    Beginner: unit === 'km' ? 3 : 2,
    Intermediate: unit === 'km' ? 5 : 3,
    Advanced: unit === 'km' ? 8 : 5,
    Elite: unit === 'km' ? 10 : 6
  };
  const maxWeeklyDistance = {
    Beginner: unit === 'km' ? 12 : 8,
    Intermediate: unit === 'km' ? 20 : 12,
    Advanced: unit === 'km' ? 30 : 20,
    Elite: unit === 'km' ? 40 : 25
  };

  const maxPerWorkout = maxWorkoutDistance[experience] || (unit === 'km' ? 3 : 2);
  const maxWeekly = maxWeeklyDistance[experience] || (unit === 'km' ? 12 : 8);
  const avgPaceMinutes = unit === 'km' ? 6.5 : 10.5;

  let totalDistance = 0;
  let needsFix = false;
  const nonRestWorkouts = week1.workouts.filter(w => w.workout_type !== 'Rest');
  for (const workout of nonRestWorkouts) {
    totalDistance += workout.distance || 0;
    if (workout.distance > maxPerWorkout) needsFix = true;
  }
  if (totalDistance > maxWeekly) needsFix = true;
  if (!needsFix) return;

  for (const workout of nonRestWorkouts) {
    if (workout.distance > maxPerWorkout) {
      workout.distance = maxPerWorkout;
      workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
    }
  }

  totalDistance = nonRestWorkouts.reduce((sum, w) => sum + w.distance, 0);
  if (totalDistance > maxWeekly) {
    const scaleFactor = maxWeekly / totalDistance;
    for (const workout of nonRestWorkouts) {
      workout.distance = Math.round(workout.distance * scaleFactor * 2) / 2;
      workout.duration = Math.ceil(workout.distance * avgPaceMinutes);
    }
    totalDistance = nonRestWorkouts.reduce((sum, w) => sum + w.distance, 0);
  }

  week1.total_weekly_distance = Math.round(totalDistance * 2) / 2;
  console.log(`✅ Week 1 fixed. New total: ${week1.total_weekly_distance} ${unit}`);
}

/**
 * Validate training plan for common issues
 */
function validateTrainingPlan(planJson, experience, planType, unit = 'miles') {
  const weeklyPlans = getWeeklyPlans(planJson);
  const warnings = [];

  const longRunCaps = {
    marathon: { Beginner: unit === 'km' ? 32 : 20, Intermediate: unit === 'km' ? 34 : 21, Advanced: unit === 'km' ? 35 : 22, Elite: unit === 'km' ? 37 : 23 },
    half_marathon: { Beginner: unit === 'km' ? 18 : 11, Intermediate: unit === 'km' ? 19 : 12, Advanced: unit === 'km' ? 21 : 13, Elite: unit === 'km' ? 21 : 13 }
  };
  const maxLongRun = longRunCaps[planType]?.[experience] || (unit === 'km' ? 35 : 22);
  let prevWeekMileage = 0;

  for (let i = 0; i < weeklyPlans.length; i++) {
    const week = weeklyPlans[i];
    const weekNum = week.week_number || (i + 1);
    const weeklyMileage = week.total_weekly_distance || 0;

    if (weekNum < weeklyPlans.length) {
      const longRun = week.workouts.find(w => w.workout_type === 'Long Run' || w.intensity === 'Long Easy' || w.distance === Math.max(...week.workouts.map(wk => wk.distance || 0)));
      if (longRun && longRun.distance > maxLongRun) {
        warnings.push({ week: weekNum, type: 'LONG_RUN_CAP_EXCEEDED', message: `Week ${weekNum}: Long run ${longRun.distance} ${unit} exceeds maximum cap of ${maxLongRun} ${unit}`, severity: 'HIGH', recommended: `Reduce to ${maxLongRun} ${unit}` });
      }
    }

    if (i > 0 && prevWeekMileage > 0) {
      const increase = ((weeklyMileage - prevWeekMileage) / prevWeekMileage) * 100;
      if (increase > 10.5 && weeklyMileage > prevWeekMileage) {
        warnings.push({ week: weekNum, type: '10_PERCENT_RULE_VIOLATION', message: `Week ${weekNum}: Weekly mileage increased ${increase.toFixed(1)}%`, severity: 'MEDIUM', recommended: `Limit increase to ${(prevWeekMileage * 1.10).toFixed(1)} ${unit}` });
      }
    }
    prevWeekMileage = weeklyMileage;
  }

  return { isValid: warnings.filter(w => w.severity === 'HIGH').length === 0, warnings, totalWarnings: warnings.length, highSeverity: warnings.filter(w => w.severity === 'HIGH').length, mediumSeverity: warnings.filter(w => w.severity === 'MEDIUM').length };
}

/**
 * FIX #1: Validate that pace is realistic (not slower than walking pace)
 * Walking pace is approximately 15-20 min/km or 24-32 min/mile
 * Running pace should be faster than this
 */
function validatePaceIsRealistic(paceSeconds, unit = 'km') {
  // Minimum realistic running pace (slower than this is walking)
  const minRealisticPaceSeconds = unit === 'km' ? 900 : 1440; // 15 min/km or 24 min/mile
  
  if (paceSeconds <= 0) {
    console.warn(`⚠️  Invalid pace: ${paceSeconds} seconds - using fallback`);
    return false;
  }
  
  if (paceSeconds > minRealisticPaceSeconds) {
    console.warn(`⚠️  UNREALISTIC PACE DETECTED: ${Math.floor(paceSeconds / 60)}:${(paceSeconds % 60).toString().padStart(2, '0')} min/${unit} (slower than walking pace)`);
    return false;
  }
  
  return true;
}

/**
 * Format pace seconds into a readable pace string (MM:SS format)
 * Ensures the result is always valid and realistic
 */
function formatPaceSeconds(seconds, unit = 'km') {
  // Validate input
  if (!seconds || seconds <= 0 || !isFinite(seconds)) {
    // Return fallback pace
    return unit === 'km' ? '6:00 min/km' : '9:40 min/mi';
  }

  // Ensure pace is realistic (not slower than walking)
  const minRealisticPaceSeconds = unit === 'km' ? 900 : 1440; // 15 min/km or 24 min/mile
  if (seconds > minRealisticPaceSeconds) {
    // Return fallback pace
    return unit === 'km' ? '6:00 min/km' : '9:40 min/mi';
  }

  // Format as MM:SS
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  
  // Ensure secs is 0-59
  if (secs >= 60) {
    return `${mins + 1}:00 min/${unit}`;
  }
  
  return `${mins}:${secs.toString().padStart(2, '0')} min/${unit}`;
}

/**
 * Format pace range (two paces with hyphen)
 * Ensures both paces are valid and the range makes sense
 */
function formatPaceRange(minSeconds, maxSeconds, unit = 'km') {
  // Validate inputs
  if (!minSeconds || !maxSeconds || minSeconds <= 0 || maxSeconds <= 0 || !isFinite(minSeconds) || !isFinite(maxSeconds)) {
    // Return fallback range
    return unit === 'km' ? '5:30-6:00 min/km' : '8:50-9:40 min/mi';
  }

  // Ensure min < max
  if (minSeconds >= maxSeconds) {
    const temp = minSeconds;
    minSeconds = maxSeconds;
    maxSeconds = temp;
  }

  // Ensure paces are realistic
  const minRealisticPaceSeconds = unit === 'km' ? 900 : 1440;
  if (minSeconds > minRealisticPaceSeconds || maxSeconds > minRealisticPaceSeconds) {
    // Return fallback range
    return unit === 'km' ? '5:30-6:00 min/km' : '8:50-9:40 min/mi';
  }

  // Format both paces
  const minPace = formatPaceSeconds(minSeconds, unit);
  const maxPace = formatPaceSeconds(maxSeconds, unit);

  // Extract just the time part (remove " min/km" or " min/mi")
  const minTime = minPace.split(' ')[0];
  const maxTime = maxPace.split(' ')[0];

  return `${minTime}-${maxTime} min/${unit}`;
}

/**
 * Fix invalid pace ranges in a workout
 * Detects and corrects negative, unrealistic, or malformed pace ranges
 */
function fixInvalidPaceRange(workout, unit = 'km') {
  if (!workout.pace_range) return;
  
  // Check for negative pace ranges (e.g., "-1:15--1:05 min/km")
  if (workout.pace_range.includes('-') && workout.pace_range.startsWith('-')) {
    console.log(`🔧 PACE FIX: ${workout.day} ${workout.workout_type} has invalid pace range: ${workout.pace_range}`);
    
    // Generate correct pace range based on workout type and distance
    const paceMinutes = unit === 'km' ? 6.5 : 10.5; // Default easy pace
    const duration = workout.duration || Math.ceil(workout.distance * paceMinutes);
    const paceSeconds = Math.round((duration * 60) / workout.distance);
    
    if (workout.intensity === 'Intervals/VO2' || workout.workout_type === 'Interval Run') {
      // Intervals should be faster (around 5:00-5:30 min/km)
      workout.pace_range = unit === 'km' ? '5:00-5:30 min/km' : '8:00-8:50 min/mi';
    } else if (workout.intensity === 'Tempo' || workout.workout_type === 'Tempo Run') {
      // Tempo should be moderate (around 6:00-6:30 min/km)
      workout.pace_range = unit === 'km' ? '6:00-6:30 min/km' : '9:40-10:10 min/mi';
    } else if (workout.intensity === 'Recovery' || workout.workout_type === 'Recovery Run') {
      // Recovery should be easy (around 7:00-7:30 min/km)
      workout.pace_range = unit === 'km' ? '7:00-7:30 min/km' : '11:15-12:05 min/mi';
    } else {
      // Easy runs
      workout.pace_range = unit === 'km' ? '6:30-7:00 min/km' : '10:30-11:15 min/mi';
    }
    
    console.log(`✅ PACE FIX: ${workout.day} ${workout.workout_type} corrected to: ${workout.pace_range}`);
  }
  
  // Also check for unrealistic pace ranges (too fast or too slow)
  // Parse the pace range to check if it's realistic
  const paceMatch = workout.pace_range.match(/(\d+):(\d+)-(\d+):(\d+)/);
  if (paceMatch) {
    const minSeconds = parseInt(paceMatch[1]) * 60 + parseInt(paceMatch[2]);
    const maxSeconds = parseInt(paceMatch[3]) * 60 + parseInt(paceMatch[4]);
    
    // Check if pace is unrealistic (faster than 3:00/km or slower than 15:00/km)
    const minRealistic = unit === 'km' ? 180 : 290; // 3:00/km or 4:50/mi
    const maxRealistic = unit === 'km' ? 900 : 1440; // 15:00/km or 24:00/mi
    
    if (minSeconds < minRealistic || maxSeconds > maxRealistic) {
      console.log(`🔧 PACE FIX: ${workout.day} ${workout.workout_type} has unrealistic pace range: ${workout.pace_range}`);
      
      // Generate correct pace range based on workout type
      if (workout.intensity === 'Intervals/VO2' || workout.workout_type === 'Interval Run') {
        workout.pace_range = unit === 'km' ? '4:30-5:00 min/km' : '7:15-8:00 min/mi';
      } else if (workout.intensity === 'Tempo' || workout.workout_type === 'Tempo Run') {
        workout.pace_range = unit === 'km' ? '5:30-6:00 min/km' : '8:50-9:40 min/mi';
      } else if (workout.intensity === 'Recovery' || workout.workout_type === 'Recovery Run') {
        workout.pace_range = unit === 'km' ? '7:00-7:30 min/km' : '11:15-12:05 min/mi';
      } else if (workout.intensity === 'Long Easy' || workout.workout_type === 'Long Run') {
        workout.pace_range = unit === 'km' ? '6:30-7:00 min/km' : '10:30-11:15 min/mi';
      } else {
        // Easy runs
        workout.pace_range = unit === 'km' ? '6:00-6:30 min/km' : '9:40-10:10 min/mi';
      }
      
      console.log(`✅ PACE FIX: ${workout.day} ${workout.workout_type} corrected to: ${workout.pace_range}`);
    }
  }
}

/**
 * Apply race day fix to final week. Operates on the finalWeek object directly.
 * FIX #2: Now includes a reduced-distance tempo/interval session during race week
 * FIX #3: Correctly uses plan_type to determine race distance (not plan_name)
 */
function applyRaceDayFix(finalWeek, longRunDay, normalizedPlanType, unit, goalPaceSeconds) {
  const planKey = normalizePlanTypeKey(normalizedPlanType);
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };

  const expectedRaceDistance = raceDistances[planKey] || raceDistances['marathon'];

  console.log(`🏁 FINAL RACE DAY FIX: Week ${finalWeek.week_number}, plan type: ${planKey}, race distance: ${expectedRaceDistance} ${unit}`);

  // FIX: First, fix all invalid pace ranges in the week
  for (const workout of finalWeek.workouts) {
    fixInvalidPaceRange(workout, unit);
  }

  // Validate and normalize goalPaceSeconds
  if (!goalPaceSeconds || goalPaceSeconds <= 0 || !isFinite(goalPaceSeconds)) {
    console.warn(`⚠️  Invalid goal pace: ${goalPaceSeconds} seconds - using fallback`);
    goalPaceSeconds = unit === 'km' ? 360 : 580; // ~6:00/km or ~9:40/mi
  }

  // Track if we've added a quality workout
  let qualityWorkoutAdded = false;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // First pass: Set race day and identify quality workout opportunity
  for (const workout of finalWeek.workouts) {
    if (workout.day === longRunDay) {
      workout.workout_type = 'Race';
      workout.intensity = 'Goal-pace';
      workout.distance = expectedRaceDistance;
      if (goalPaceSeconds > 0 && validatePaceIsRealistic(goalPaceSeconds, unit)) {
        workout.duration = Math.ceil((expectedRaceDistance * goalPaceSeconds) / 60);
      } else {
        const fallbackPaceSeconds = unit === 'km' ? 360 : 580; // ~3:20/km or ~9:40/mi
        workout.duration = Math.ceil((expectedRaceDistance * fallbackPaceSeconds) / 60);
      }
      const minRaceMinutes = {
        '5k': 14,
        '10k': 28,
        'half marathon': 85,
        marathon: 150
      };
      workout.duration = Math.max(minRaceMinutes[planKey] || 20, workout.duration);
      workout.description = `Race day! Follow your nutrition and pacing plan. Good luck!`;
      const racePaceLo = Math.max(unit === 'km' ? 150 : 240, goalPaceSeconds - 10);
      const racePaceHi = goalPaceSeconds + 15;
      workout.pace_range = formatPaceRange(racePaceLo, racePaceHi, unit);
    } else if (workout.workout_type === 'Race') {
      workout.workout_type = 'Easy Run';
      workout.intensity = 'Easy';
    }
  }

  // FIX #2: Add a reduced-distance quality workout during race week (3-4 days before race)
  const raceWorkout = finalWeek.workouts.find(w => w.workout_type === 'Race');
  let qualityWorkoutDay = null; // Track the quality workout day
  
  if (raceWorkout && !qualityWorkoutAdded) {
    const raceDayIndex = dayNames.indexOf(raceWorkout.day);
    
    // Find a day 3-4 days before race for quality workout
    for (let daysBack = 3; daysBack <= 4; daysBack++) {
      const targetDayIndex = (raceDayIndex - daysBack + 7) % 7;
      const targetDay = dayNames[targetDayIndex];
      const targetWorkout = finalWeek.workouts.find(w => w.day === targetDay && w.workout_type !== 'Rest');
      
      if (targetWorkout && !qualityWorkoutAdded) {
        // Convert to reduced-distance tempo or interval
        const isIntervalDay = Math.random() > 0.5; // Alternate between tempo and intervals
        
        // FIX #4: Cap quality workout distance based on race distance
        // For shorter races (5K, 10K), quality workout should not exceed 60-70% of race distance
        let baseDistance = unit === 'km' ? 8 : 5; // Default reduced distance for race week
        
        // Cap based on race distance to prevent exceeding race distance
        if (planKey === '5k') {
          baseDistance = unit === 'km' ? 3 : 1.9; // 5K race: max 3km quality workout
        } else if (planKey === '10k') {
          baseDistance = unit === 'km' ? 6 : 3.7; // 10K race: max 6km quality workout
        }
        // For half marathon and marathon, keep default 8km (or 5 miles)
        
        // Calculate tempo/interval portion (should be less than baseDistance to account for warmup/cooldown)
        const tempoDistance = Math.max(baseDistance * 0.5, unit === 'km' ? 1.5 : 1); // Tempo/interval portion
        
        if (isIntervalDay) {
          targetWorkout.workout_type = 'Interval Run';
          targetWorkout.intensity = 'Intervals/VO2';
          targetWorkout.distance = baseDistance;
          
          // FIX: Use safe pace calculation with validation
          if (goalPaceSeconds > 0 && validatePaceIsRealistic(goalPaceSeconds, unit)) {
            // Interval pace is faster than goal pace (subtract 30 seconds)
            const intervalPaceSeconds = Math.max(goalPaceSeconds - 30, 180); // Min 3:00/km
            targetWorkout.duration = Math.max(12, Math.ceil((baseDistance * intervalPaceSeconds) / 60));
            targetWorkout.pace_range = formatPaceRange(intervalPaceSeconds - 15, intervalPaceSeconds, unit);
          } else {
            targetWorkout.duration = Math.max(12, Math.ceil(baseDistance * 6)); // Fallback
            targetWorkout.pace_range = unit === 'km' ? '5:00-5:30 min/km' : '8:00-8:50 min/mi';
          }
          targetWorkout.description = `Race week sharpener: 2 x 1.5 ${unit} intervals with 90 sec recovery. Keep effort controlled - this is maintenance, not a hard workout.`;
        } else {
          targetWorkout.workout_type = 'Tempo Run';
          targetWorkout.intensity = 'Tempo';
          targetWorkout.distance = baseDistance;
          
          // FIX: Use safe pace calculation with validation
          if (goalPaceSeconds > 0 && validatePaceIsRealistic(goalPaceSeconds, unit)) {
            // Tempo pace is slightly slower than goal pace (add 15 seconds)
            const tempoPaceSeconds = goalPaceSeconds + 15;
            targetWorkout.duration = Math.max(12, Math.ceil((baseDistance * tempoPaceSeconds) / 60));
            targetWorkout.pace_range = formatPaceRange(tempoPaceSeconds, tempoPaceSeconds + 15, unit);
          } else {
            targetWorkout.duration = Math.max(12, Math.ceil(baseDistance * 6.5)); // Fallback
            targetWorkout.pace_range = unit === 'km' ? '5:30-5:45 min/km' : '8:50-9:15 min/mi';
          }
          const tempoCoreKm = roundDistance(baseDistance > 4 ? baseDistance - 2 : baseDistance * 0.6, unit);
          targetWorkout.description = `Race week tempo: Easy warmup, ${tempoCoreKm} ${unit} at comfortably hard effort, easy cooldown. This maintains sharpness without heavy fatigue.`;
        }
        
        qualityWorkoutAdded = true;
        qualityWorkoutDay = targetDay; // TRACK THE QUALITY WORKOUT DAY IMMEDIATELY
        console.log(`✅ RACE WEEK QUALITY WORKOUT ADDED: ${targetDay} - ${targetWorkout.workout_type} (${baseDistance} ${unit})`);
        break;
      }
    }
  }

  // Enforce taper distances for non-race workouts in final week
  // Recovery runs should be shorter than other workouts (anti-repetition rule)
  // Taper distances should be based on race distance
  let maxTaperDistance, maxRecoveryDistance;
  
  if (planKey === '5k') {
    maxTaperDistance = unit === 'km' ? 4 : 2.5;
    maxRecoveryDistance = unit === 'km' ? 2.5 : 1.5;
  } else if (planKey === '10k') {
    maxTaperDistance = unit === 'km' ? 6 : 3.7;
    maxRecoveryDistance = unit === 'km' ? 4 : 2.5;
  } else if (planKey === 'half marathon') {
    maxTaperDistance = unit === 'km' ? 10 : 6.2;
    maxRecoveryDistance = unit === 'km' ? 6 : 3.7;
  } else {
    // Marathon
    maxTaperDistance = unit === 'km' ? 12 : 7.5;
    maxRecoveryDistance = unit === 'km' ? 8 : 5;
  }
  
  // NOTE: qualityWorkoutDay was already set when we added the quality workout (line 2632)
  // Do NOT re-identify it here - use the value that was already set
  
  // Remove duplicate Tempo/Interval Runs (keep only the quality workout)
  if (qualityWorkoutDay) {
    const tempoIntervalWorkouts = finalWeek.workouts.filter(w => (w.workout_type === 'Tempo Run' || w.workout_type === 'Interval Run') && w.day !== qualityWorkoutDay);
    for (const workout of tempoIntervalWorkouts) {
      // Convert to Easy Run instead of removing
      workout.workout_type = 'Easy Run';
      workout.intensity = 'Easy';
      const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
      workout.duration = Math.ceil(workout.distance * easyPaceMinutes);
      workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
      workout.description = 'Easy run for race week preparation. Keep it light and maintain readiness.';
      console.log(`🔧 DUPLICATE REMOVAL: ${workout.day} ${workout.workout_type} converted to Easy Run`);
    }
  }
  
  for (const workout of finalWeek.workouts) {
    if (workout.workout_type === 'Race' || workout.workout_type === 'Rest' || workout.distance === 0) continue;
    // Skip the quality workout we just added (by day, not by type)
    if (qualityWorkoutDay && workout.day === qualityWorkoutDay) continue;
    
    // Determine max distance based on workout type
    const maxDistance = workout.workout_type === 'Recovery Run' ? maxRecoveryDistance : maxTaperDistance;
    
    if (workout.distance > maxDistance) {
      const oldDistance = workout.distance;
      workout.distance = maxDistance;
      const paceSeconds = workout.intensity === 'Recovery' ? (unit === 'km' ? 420 : 660) : (unit === 'km' ? 390 : 630);
      if (validatePaceIsRealistic(paceSeconds, unit)) {
        workout.duration = Math.ceil((workout.distance * paceSeconds) / 60);
      } else {
        workout.duration = Math.ceil(workout.distance * 6.5);
      }
      workout.description = `${workout.workout_type} at taper distance for race week. Focus on freshness and race preparation.`;
      console.log(`🔧 TAPER FIX: ${workout.day} ${oldDistance} → ${workout.distance} ${unit}`);
    }
  }

  // Fix Recovery Run placement in final week (should only be after race day)
  if (raceWorkout) {
    const raceDayIndex = dayNames.indexOf(raceWorkout.day);
    const dayAfterRace = dayNames[(raceDayIndex + 1) % 7];
    for (const workout of finalWeek.workouts) {
      if (workout.workout_type === 'Recovery Run' && workout.day !== dayAfterRace) {
        workout.workout_type = 'Easy Run';
        workout.intensity = 'Easy';
        workout.pace_range = unit === 'km' ? '6:15-6:45 min/km' : '10:00-10:30 min/mi';
        workout.description = 'Easy run for race week preparation. Keep it light and maintain readiness.';
        const easyPaceMinutes = unit === 'km' ? 6.5 : 10.5;
        workout.duration = Math.ceil(workout.distance * easyPaceMinutes);
      }
    }
  }

  // Anti-repetition rule: Ensure no two workouts have the same distance in race week
  // Build a set of all current distances (excluding Rest and Race workouts)
  let usedDistances = new Set(
    finalWeek.workouts
      .filter(w => w.workout_type !== 'Rest' && w.workout_type !== 'Race' && w.distance > 0)
      .map(w => Math.round(w.distance * 10) / 10) // Round to 1 decimal place for comparison
  );
  
  // Find all duplicate distances
  const distanceMap = new Map();
  for (const workout of finalWeek.workouts) {
    if (workout.workout_type !== 'Rest' && workout.workout_type !== 'Race' && workout.distance > 0) {
      const roundedDist = Math.round(workout.distance * 10) / 10;
      if (!distanceMap.has(roundedDist)) {
        distanceMap.set(roundedDist, []);
      }
      distanceMap.get(roundedDist).push(workout);
    }
  }
  
  // Fix duplicates
  for (const [distance, workouts] of distanceMap) {
    if (workouts.length > 1) {
      console.log(`⚠️  ANTI-REPETITION: Found ${workouts.length} workouts with distance ${distance} ${unit}`);
      
      // Keep the first one, adjust the rest
      for (let i = 1; i < workouts.length; i++) {
        const workout = workouts[i];
        const originalDistance = workout.distance;
        let newDistance = null;
        
        // Try adjusting by ±0.5, ±1.0, ±1.5, ±2.0
        const adjustments = [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0];
        
        for (const adjustment of adjustments) {
          const candidate = Math.round((workout.distance + adjustment) * 10) / 10;
          if (candidate > 0 && !usedDistances.has(candidate)) {
            newDistance = candidate;
            break;
          }
        }
        
        if (newDistance !== null) {
          workout.distance = newDistance;
          usedDistances.add(newDistance);
          
          // Recalculate duration based on new distance
          const paceSeconds = workout.intensity === 'Recovery' ? (unit === 'km' ? 420 : 660) : (unit === 'km' ? 390 : 630);
          if (validatePaceIsRealistic(paceSeconds, unit)) {
            workout.duration = Math.ceil((newDistance * paceSeconds) / 60);
          } else {
            workout.duration = Math.ceil(newDistance * 6.5);
          }
          
          console.log(`✅ ANTI-REPETITION FIX: ${workout.day} ${workout.workout_type} ${originalDistance} → ${newDistance} ${unit}`);
        } else {
          console.warn(`⚠️  ANTI-REPETITION: Could not find unique distance for ${workout.day} ${workout.workout_type}`);
        }
      }
    }
  }

  // FIX: Fix all invalid pace ranges in the race week (after all other modifications)
  for (const workout of finalWeek.workouts) {
    fixInvalidPaceRange(workout, unit);
  }

  finalWeek.total_weekly_distance = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
}

/**
 * Apply all post-generation validations to a plan.
 * @param {Object} planJson - The full plan object (may have weekly_plans directly or under recommended_plan)
 * @param {Object} userInput - Original user input
 * @param {string} unit - 'km' or 'miles'
 * @param {Object} opts - Options: { skipWeek1: bool, goalPaceSeconds: number, planType: string, totalWeeks: number }
 */
function applyAllValidations(planJson, userInput, unit, opts = {}) {
  const { skipWeek1 = false, goalPaceSeconds = 0, planType = 'marathon', totalWeeks: totalWeeksOpt = 0 } = opts;
  const weeks = getWeeklyPlans(planJson);
  if (!weeks || weeks.length === 0) return;

  const specificDaysArray = userInput.specific_days ?
    userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
  const longRunDay = userInput.long_run_day || 'Sunday';
  const experience = userInput.running_experience || userInput.experience || 'Intermediate';

  const weeksToProcess = skipWeek1 ? weeks.filter(w => w.week_number !== 1) : weeks;

  if (weeksToProcess.length === 0) return;

  const totalWeeksResolved =
    totalWeeksOpt > 0
      ? totalWeeksOpt
      : Math.max(0, ...weeks.map(w => Number(w.week_number) || 0));

  const planTypeNorm = normalizePlanTypeKey(planType);

  // 0. FIX: Fix all invalid pace ranges first (before any other processing)
  console.log('🔧 Fixing invalid pace ranges...');
  for (const week of weeksToProcess) {
    for (const workout of week.workouts) {
      fixInvalidPaceRange(workout, unit);
    }
  }

  // 1. Remove duplicate days
  for (const week of weeksToProcess) {
    removeDuplicateDaysFromWeek(week);
  }

  // 2. Validate/fix workout types
  validateAndFixWorkoutTypes(weeksToProcess);

  // 3. Core AI plan validation (missing days, long run day, first day rules, elite rest days)
  validateAndFixAIPlan(weeksToProcess, userInput, unit);

  // 4. Fix invalid workout type/intensity combos
  validateAndFixWorkoutTypeIntensity(weeksToProcess);

  // 5. Fix workout distances (zeros, etc.)
  validateAndFixWorkoutDistances(weeksToProcess, unit);

  // 6. Fix long run day assignment
  fixLongRunDayAssignment(weeksToProcess, longRunDay, unit);

  // 7. Ensure long run is highest distance
  ensureLongRunIsHighest(weeksToProcess, longRunDay, unit);

  // 8. Add recovery runs after long runs
  addRecoveryRunsAfterLongRuns(weeksToProcess, longRunDay, specificDaysArray, unit);

  // 9. Enforce single recovery run rule
  enforceSingleRecoveryRunRule(weeksToProcess, longRunDay, unit);

  // 9b. Recovery after long must be shorter than long (never equal)
  enforceRecoveryShorterThanLongRun(weeksToProcess, longRunDay, unit);

  // 10. Remove invalid rest days
  removeInvalidRestDays(weeksToProcess, userInput);

  // 11. Enforce rest day requirements
  enforceRestDayRequirements(weeksToProcess, experience, specificDaysArray, longRunDay);

  // 12. Validate/fix Long Run distance (ensure it's longest)
  // Calculate race distance based on plan type
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };
  const raceDistance = raceDistances[planTypeNorm] || raceDistances[planType] || null;
  validateAndFixLongRunDistance(weeksToProcess, unit, raceDistance, experience, planType, totalWeeksResolved);

  // 13. Round all distances
  roundAllDistances(weeksToProcess, unit);

  // 13b. CAP ALL WORKOUTS TO RACE DISTANCE AFTER ROUNDING (for 5K and 10K plans)
  // This must be done AFTER rounding because rounding can round UP
  if (raceDistance && raceDistance <= 10) {
    console.log(`\n🔒 Capping all workouts to race distance after rounding: ${raceDistance} ${unit}`);
    for (const week of weeksToProcess) {
      for (const workout of week.workouts) {
        if (workout.workout_type !== 'Rest' && workout.distance > raceDistance) {
          console.log(`   ⚠️  ${week.week_number}-${workout.day}: ${workout.workout_type} ${workout.distance} ${unit} → ${raceDistance} ${unit}`);
          workout.distance = raceDistance;
          const paceMinutes = unit === 'km' ? 6.5 : 10.5;
          workout.duration = Math.ceil(raceDistance * paceMinutes);
        }
      }
    }
  }

  // 13c. Reshape flat / near-flat weeks (preserve weekly total; cap segments for 5K/10K)
  const segmentCap = raceDistance && raceDistance <= 10 ? raceDistance : null;
  for (const week of weeksToProcess) {
    reshapeUniformWeekDistances(week, longRunDay, unit, segmentCap, totalWeeksResolved);
  }

  // 14. Fix duplicate distances (anti-repetition)
  for (const week of weeksToProcess) {
    fixDuplicateDistances(week, unit, raceDistance);
  }

  enforceRecoveryShorterThanLongRun(weeksToProcess, longRunDay, unit);

  // 15. APPLY TAPER TO FINAL 2-3 WEEKS
  if (weeksToProcess.length >= 2) {
    console.log(`\n📉 Applying taper logic to final weeks (${weeksToProcess.length} weeks total)...`);
    const taperStartIndex = Math.max(0, weeksToProcess.length - 3); // Last 3 weeks
    
    for (let i = taperStartIndex; i < weeksToProcess.length; i++) {
      const week = weeksToProcess[i];
      const weeksUntilRace = weeksToProcess.length - i;
      let taperFactor = 1.0;
      
      if (weeksUntilRace === 1) {
        taperFactor = 0.5; // Final week: 50% of normal
      } else if (weeksUntilRace === 2) {
        taperFactor = 0.75; // 2 weeks out: 75% of normal
      } else if (weeksUntilRace === 3) {
        taperFactor = 0.85; // 3 weeks out: 85% of normal
      }
      
      if (taperFactor < 1.0 && week && week.workouts) {
        console.log(`   Week ${i + 1} (${weeksUntilRace} weeks to race): Applying ${(taperFactor * 100).toFixed(0)}% taper`);
        for (const workout of week.workouts) {
          if (
            workout &&
            workout.workout_type !== 'Rest' &&
            workout.workout_type !== 'Race' &&
            workout.distance > 0
          ) {
            const originalDistance = workout.distance;
            workout.distance = Math.round(workout.distance * taperFactor * 2) / 2; // Round to nearest 0.5
            if (workout.distance !== originalDistance) {
              const paceMinutes = unit === 'km' ? 6.5 : 10.5;
              workout.duration = Math.ceil(workout.distance * paceMinutes);
            }
          }
        }
      }
    }
  }

  // 15b. Taper scales every day by the same factor — often makes distances identical again; re-spread (all plan types)
  for (const week of weeksToProcess) {
    reshapeUniformWeekDistances(week, longRunDay, unit, segmentCap, totalWeeksResolved);
  }
  for (const week of weeksToProcess) {
    fixDuplicateDistances(week, unit, raceDistance);
  }

  enforceRecoveryShorterThanLongRun(weeksToProcess, longRunDay, unit);

  // 15c. Final Long Run validation after all modifications
  validateAndFixLongRunDistance(weeksToProcess, unit, raceDistance, experience, planType, totalWeeksResolved);

  // 16. Intensity validation using pace
  if (goalPaceSeconds > 0) {
    for (const week of weeksToProcess) {
      for (let i = 0; i < week.workouts.length; i++) {
        week.workouts[i] = validateAndFixIntensity(week.workouts[i], goalPaceSeconds, unit);
      }
    }
  }

  // 17. Align displayed pace ranges with goal pace (fixes easy vs interval inversion and generic placeholders)
  if (goalPaceSeconds > 0) {
    synchronizePaceRangesWithGoal(weeksToProcess, goalPaceSeconds, unit, experience);
  }

  // 18. Update weekly totals
  for (const week of weeks) {
    week.total_weekly_distance = week.workouts
      .filter(w => w.workout_type !== 'Rest')
      .reduce((sum, w) => sum + (w.distance || 0), 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN GENERATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function generateFirstWeek(userInput) {
  console.log('Validating user input...');
  console.log(`📊 User Profile: ${userInput.running_experience} runner`);
  console.log(`📏 Weekly mileage: ${userInput.weekly_mileage_past_4_weeks} ${userInput.measurement_unit || 'miles'}`);
  console.log(`🏃 Longest run: ${userInput.longest_run_past_4_weeks}`);
  console.log(`🏔️  Course profile: ${userInput.course_profile || 'Not specified'}`);

  const errors = [];

  if (userInput.weekly_mileage_past_4_weeks === '0' || userInput.weekly_mileage_past_4_weeks === 0) {
    errors.push('weekly_mileage_past_4_weeks cannot be 0.');
    if (userInput.running_experience === 'Beginner') {
      userInput.weekly_mileage_past_4_weeks = userInput.measurement_unit === 'km' ? '20-25' : '12-15';
    }
  }

  if (['0', 0, '0km', '0 miles'].includes(userInput.longest_run_past_4_weeks)) {
    errors.push('longest_run_past_4_weeks cannot be 0.');
    if (userInput.running_experience === 'Beginner') {
      userInput.longest_run_past_4_weeks = userInput.measurement_unit === 'km' ? '8 km' : '5 miles';
    }
  }

  if (errors.length > 0) {
    console.warn('⚠️ PAYLOAD VALIDATION WARNINGS:', errors);
  }

  if (userInput.goal_race_time && userInput.goal_race_time.split(':').length === 2) {
    const parts = userInput.goal_race_time.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (userInput.plan_name === 'Marathon' || userInput.plan_type === 'marathon') {
      userInput.goal_race_time = `${hours}:${minutes.toString().padStart(2, '0')}:00`;
    }
  }

  if (userInput.estimated_race_time) {
    const timeStr = userInput.estimated_race_time.toLowerCase();
    if (timeStr.includes('hrs') || timeStr.includes('hr')) {
      const match = timeStr.match(/(\d+).*?-.*?(\d+)/);
      if (match) userInput.estimated_race_time = `${match[1]}:00:00-${match[2]}:00:00`;
    }
  }

  if (userInput.longest_run_past_4_weeks) {
    const longRun = userInput.longest_run_past_4_weeks.toLowerCase();
    if (longRun.includes('hours') || longRun.includes('mins')) {
      const distMatch = longRun.match(/(\d+\.?\d*)\s*(miles?|mi|km|kilometers?)/);
      if (distMatch) userInput.longest_run_past_4_weeks = `${distMatch[1]} ${distMatch[2]}`;
    }
  }

  if (userInput.weekly_mileage_past_4_weeks === '50+') {
    userInput.weekly_mileage_past_4_weeks = '50-55';
  }

  if (Array.isArray(userInput.specific_days)) {
    userInput.specific_days = userInput.specific_days.join(', ');
  }

  if (userInput.long_run_day && userInput.specific_days) {
    const daysArray = userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0);
    if (!daysArray.includes(userInput.long_run_day)) {
      console.warn(`long_run_day "${userInput.long_run_day}" not in specific_days. Setting to last day.`);
      userInput.long_run_day = daysArray[daysArray.length - 1];
    }
    const actualDaysCount = daysArray.length;
    const requestedDays = parseInt(userInput.days_per_week) || actualDaysCount;
    if (requestedDays !== actualDaysCount) {
      if (requestedDays === 7 && actualDaysCount === 6 && ['Elite', 'Advanced'].includes(userInput.running_experience)) {
        const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const missingDay = allDays.find(day => !daysArray.includes(day));
        if (missingDay) {
          daysArray.push(missingDay);
          userInput.specific_days = daysArray.join(', ');
        }
      } else {
        userInput.days_per_week = actualDaysCount;
      }
    }
  }

  if (userInput.race_date || userInput.plan_end_date) {
    const raceDate = userInput.race_date || userInput.plan_end_date;
    if (!userInput.start_date) userInput.start_date = new Date().toISOString();
    const calculatedDuration = calculateDurationFromRaceDate(userInput.start_date, raceDate, userInput.min_weeks_plan || 8, userInput.max_week_plans || 20);
    userInput.calculated_duration = calculatedDuration;
    userInput.race_date_provided = true;
  }

  const specificDaysArray = userInput.specific_days ? userInput.specific_days.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
  const restRequirements = determineRestDayRequirements(userInput.running_experience || 'Intermediate', specificDaysArray.length);
  if (restRequirements.warning) console.warn(`⚠️ REST DAY WARNING: ${restRequirements.warning}`);
  userInput.rest_day_requirements = restRequirements;

  const unit = userInput.measurement_unit === 'km' ? 'km' : 'miles';
  
  // FIX #3: Use plan_type (normalized) instead of plan_name to determine race distance
  // Handle both race_type and plan_type/plan_name for backwards compatibility
  const planTypeInput = userInput.plan_type || userInput.plan_name || userInput.race_type || 'marathon';
  let normalizedPlanType = (planTypeInput || 'marathon').toLowerCase().trim();
  if (normalizedPlanType.includes('half')) normalizedPlanType = 'half marathon';
  
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };
  const raceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];
  
  console.log(`📏 Race distance calculation: plan_type="${userInput.plan_type}", plan_name="${userInput.plan_name}", normalized="${normalizedPlanType}", distance=${raceDistance}${unit}`);

  const paceZones = calculatePaceZones(userInput.goal_race_time || userInput.estimated_race_time?.split('-')[0], raceDistance, userInput.running_experience || 'Intermediate', unit);
  if (paceZones) userInput.pace_zones = paceZones;

  if (userInput.specific_days) {
    const originalStartDate = userInput.start_date || '';
    userInput.start_date = adjustStartDate(originalStartDate, userInput.specific_days);
    console.log(`Start date adjusted from ${originalStartDate} to ${userInput.start_date}`);
  }

  const prompt = FIRST_WEEK_PROMPT.replace('{user_input}', JSON.stringify(userInput, null, 2));

  try {
    console.log('Calling OpenAI API for first week generation...');
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: "Generate ONLY first week workouts quickly. No detailed analysis. Return minimal JSON with just week 1 workouts. CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', or any other variations. CRITICAL: Always include 'user_distance': 0 and 'user_time': 0 in BOTH week-level and workout-level data. CRITICAL: Follow the WEEK CALCULATION LOGIC precisely - Week 1 must span Monday to Sunday of the calendar week, and include ALL days from specific_days that fall within Week 1 boundaries and are on/after start_date. CRITICAL: NEVER SKIP DAYS FROM SPECIFIC_DAYS - if Monday is in specific_days, it MUST appear in the workout schedule. CRITICAL: Apply FIRST WORKOUT DAY SAFETY RULE - if first workout day equals long_run_day, KEEP it as 'Long Run' but apply DISTANCE LIMITS: Beginner/Intermediate max 3.0km, Advanced max 4.0km, Elite max 5.0km. CRITICAL: All other workouts in Week 1 MUST have distance less than the long run distance. NEVER EXCEED THESE LIMITS. CRITICAL: FIRST DAY CANNOT BE RECOVERY RUN - the chronologically first workout day must be Easy Run, Tempo Run, or Long Run, NEVER Recovery Run. CRITICAL: Recovery Runs only allowed the day after Long Run - if no Long Run in Week 1, NO Recovery Runs allowed. CRITICAL: LONG RUN DAY ASSIGNMENT - The workout on long_run_day MUST be assigned workout_type 'Long Run' and be the longest distance of the week. IF FIRST WORKOUT DAY = LONG RUN DAY: Keep as 'Long Run' but apply distance limits: max 3km for Beginner/Intermediate, max 4km for Advanced, max 5km for Elite. All other workouts must be shorter than the long run. CRITICAL: Duration MUST be between min_weeks_plan and max_week_plans based on experience level. If race_date provided, calculate duration to end on that date. CRITICAL: DISTANCE ROUNDING - ALL distances MUST be rounded to nearest 0.5 units. Examples: 1.6 mi → 1.5 mi, 2.2 mi → 2.0 mi, 1.4 mi → 1.5 mi, 0.9 mi → 1.0 mi. NO decimal distances like 1.6, 2.2, 1.4, 0.9 are allowed. CRITICAL: Long run MAXIMUM caps - Beginner: 18 mi/30 km, Intermediate: 20 mi/32 km, Advanced: 21 mi/34 km, Elite: 22 mi/36 km. NEVER exceed these. CRITICAL: Include 'pace_guide' object at plan level showing all pace zones with descriptions. CRITICAL: Include 'pace_range' and 'description' fields for EVERY workout. CRITICAL REST DAY RULES: Elite and Advanced runners NEVER get rest days regardless of how many training days selected. Beginner/Intermediate ONLY get 1 rest day if they select ALL 7 days, otherwise NO rest days. CRITICAL: Follow OPTIMAL TRAINING PATTERN - Easy → Tempo/Intervals → Recovery → Easy → Long Run. Never schedule back-to-back hard workouts. CRITICAL: Replace 'Track' with 'Flat' in all outputs. Goal-based personalization must be reflected in workout mix and intensity. total_weeks must be between min_weeks_plan and max_week_plans. Generate description according to user input dont include any goal in description."
        },
        { role: 'user', content: prompt }
      ]
    });

    let content = response.choices[0].message.content.trim();

    if (content.includes('```')) {
      const parts = content.split('```');
      for (let part of parts) {
        part = part.trim();
        if (part.startsWith('json')) part = part.substring(4).trim();
        if (part.startsWith('{')) { content = part; break; }
      }
    }

    const startIdx = content.indexOf('{');
    if (startIdx !== -1) {
      let braceCount = 0;
      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') { braceCount--; if (braceCount === 0) { content = content.substring(startIdx, i + 1); break; } }
      }
    }

    content = content.replace(/[\x00-\x1F\x7F]/g, '');
    let planJson = JSON.parse(content);

    // ── APPLY ALL VALIDATIONS (WEEK 1 ONLY - no skipWeek1) ──────────────────
    let goalPaceSeconds = 0;
    
    // FIX: Use the correct race distance based on plan type, not always marathon
    const raceDistances = {
      'marathon': unit === 'km' ? 42.2 : 26.2,
      'half marathon': unit === 'km' ? 21.1 : 13.1,
      'half_marathon': unit === 'km' ? 21.1 : 13.1,
      '10k': unit === 'km' ? 10.0 : 6.2,
      '5k': unit === 'km' ? 5.0 : 3.1
    };
    const raceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];
    
    if (userInput.goal_race_time) {
      goalPaceSeconds = parseGoalPace(userInput.goal_race_time, raceDistance);
    } else if (userInput.estimated_race_time) {
      const timeStr = userInput.estimated_race_time.includes('-') ? userInput.estimated_race_time.split('-')[0].trim() : userInput.estimated_race_time;
      goalPaceSeconds = parseGoalPace(timeStr, raceDistance);
    }

    // Fix dates first
    fixPlanDates(planJson);

    // Apply the full validation pipeline to Week 1
    applyAllValidations(planJson, userInput, unit, {
      skipWeek1: false,
      goalPaceSeconds,
      planType: normalizedPlanType,
      totalWeeks: planJson.duration || planJson.total_weeks || 0
    });

    // Safety rule specific to Week 1
    const weeks = getWeeklyPlans(planJson);
    enforceFirstWorkoutDaySafetyRule(weeks, userInput.start_date, userInput.specific_days, userInput.long_run_day, userInput.running_experience || 'Intermediate', unit);

    // Fix first day recovery run specific to Week 1
    fixFirstDayRecoveryRunIssue(weeks, userInput.start_date, userInput.specific_days, userInput.long_run_day, unit);

    // Validate duration
    const expectedDuration = calculateExpectedDuration(userInput.running_experience, userInput.min_weeks_plan || 8, userInput.max_week_plans || 15, userInput.height, userInput.weight, userInput.weekly_mileage_past_4_weeks);
    if (planJson.duration !== expectedDuration) {
      console.warn(`⚠️  Duration mismatch: AI returned ${planJson.duration} weeks, expected ${expectedDuration} weeks`);
      planJson.duration = expectedDuration;
      planJson.total_weeks = expectedDuration;
      planJson.remaining_weeks = expectedDuration - 1;
    }

    // Fix all plan dates (AM/PM logic applied LAST)
    fixPlanDatesFromAdjustedStartDate(planJson, userInput.start_date);

    // Update target_distance from Week 1
    const week1 = getWeeklyPlans(planJson)[0];
    planJson.target_distance = week1 ? week1.total_weekly_distance : 0;

    // Store plan
    const planId = uuidv4().replace(/-/g, '').substring(0, 20);
    planJson.plan_id = planId;
    planJson.generated_at = new Date().toISOString();
    planJson.plan_type = normalizedPlanType; // Set plan_type for later use

    const exactWeek1Copy = JSON.parse(JSON.stringify(getWeeklyPlans(planJson)[0]));
    console.log(`📋 Storing corrected Week 1 data: ${exactWeek1Copy.workouts.length} workouts, ${exactWeek1Copy.total_weekly_distance} km`);

    planStorage[planId] = {
      original_input: userInput,
      first_week_basic: { ...planJson, weekly_plans: [exactWeek1Copy] },
      total_weeks: planJson.duration || 12,
      plan_type: normalizedPlanType || 'marathon',
      generated_at: new Date().toISOString()
    };

    console.log('✅ Week 1 generated and stored successfully');
    return planJson;

  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`JSON Parse Error: ${error.message}`);
      throw new Error(`Failed to parse first week JSON: ${error.message}`);
    }
    console.error(`Unexpected error: ${error.message}`);
    throw new Error(`Error generating first week: ${error.message}`);
  }
}

async function generateChunkedPlan(planId, storedData) {
  const originalInput = storedData.original_input;
  const firstWeekBasic = storedData.first_week_basic;
  const totalWeeks = storedData.total_weeks;
  const planType = storedData.plan_type || 'marathon'; // Ensure planType is never undefined

  console.log(`🧩 Generating chunked plan for ${totalWeeks} weeks`);

  let chunkSize = 6;
  if (totalWeeks > 20) chunkSize = 4;
  if (totalWeeks > 30) chunkSize = 3;

  const chunks = [];
  for (let i = 2; i <= totalWeeks; i += chunkSize) {
    const endWeek = Math.min(i + chunkSize - 1, totalWeeks);
    chunks.push({ startWeek: i, endWeek, size: endWeek - i + 1 });
  }

  console.log(`📦 Split into ${chunks.length} chunks:`, chunks.map(c => `Weeks ${c.startWeek}-${c.endWeek}`).join(', '));

  const allWeeks = [];
  const firstWeekData = firstWeekBasic.weekly_plans?.[0] || {};
  const unit = originalInput.measurement_unit === 'km' ? 'km' : 'miles';

  let goalPaceSeconds = 0;
  
  // FIX: Use the correct race distance based on plan type, not always marathon
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };
  const raceDistance = raceDistances[planType] || raceDistances['marathon'];
  
  if (originalInput.goal_race_time) goalPaceSeconds = parseGoalPace(originalInput.goal_race_time, raceDistance);
  else if (originalInput.estimated_race_time) {
    const timeStr = originalInput.estimated_race_time.includes('-') ? originalInput.estimated_race_time.split('-')[0].trim() : originalInput.estimated_race_time;
    goalPaceSeconds = parseGoalPace(timeStr, raceDistance);
  }

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

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 16000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: "Generate training plan chunk efficiently. Use ONLY these workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. Return ONLY JSON. Include 'user_distance': 0 and 'user_time': 0 for ALL data. Include 'pace_range' and 'description' for EVERY workout. Follow Monday-Sunday structure. Recovery Run after long run day. Round distances to 0.5 units. No back-to-back hard workouts. Elite/Advanced: NO rest days. Beginner/Intermediate: 1 rest day only if ALL 7 days selected. CRITICAL: Ensure complete JSON response - do not truncate." },
        { role: 'user', content: `Generate training plan weeks ${chunk.startWeek}-${chunk.endWeek}. Return ONLY complete JSON.\n\n${chunkPrompt}` },
      ],
    }, { timeout: 300000 });

    let chunkContent = response.choices[0].message.content.trim();

    if (chunkContent.includes('```')) {
      const parts = chunkContent.split('```');
      for (let part of parts) {
        part = part.trim();
        if (part.startsWith('json')) part = part.substring(4).trim();
        if (part.startsWith('{') && part.endsWith('}')) { chunkContent = part; break; }
      }
    }

    const startIdx = chunkContent.indexOf('{');
    if (startIdx === -1) throw new Error(`No JSON object found in chunk ${i + 1}`);

    let braceCount = 0, endIdx = -1;
    for (let j = startIdx; j < chunkContent.length; j++) {
      if (chunkContent[j] === '{') braceCount++;
      else if (chunkContent[j] === '}') { braceCount--; if (braceCount === 0) { endIdx = j; break; } }
    }

    if (endIdx === -1) {
      // Attempt to fix truncated JSON
      let fixedContent = chunkContent.trim();
      let openBraces = 0;
      for (const char of fixedContent) { if (char === '{') openBraces++; else if (char === '}') openBraces--; }
      while (openBraces > 0) { fixedContent += '}'; openBraces--; }
      chunkContent = fixedContent;
    } else {
      chunkContent = chunkContent.substring(startIdx, endIdx + 1);
    }

    chunkContent = chunkContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/[\x00-\x1F\x7F]/g, '');

    let chunkPlan;
    try {
      chunkPlan = JSON.parse(chunkContent);
    } catch (parseError) {
      throw new Error(`JSON parsing failed for chunk ${i + 1}: ${parseError.message}`);
    }

    if (chunkPlan.recommended_plan && chunkPlan.recommended_plan.weekly_plans) {
      const chunkWeeks = chunkPlan.recommended_plan.weekly_plans;
      console.log(`✅ Chunk ${i + 1} generated ${chunkWeeks.length} weeks`);

      // Validate each week in the chunk immediately
      applyAllValidations({ weekly_plans: chunkWeeks }, originalInput, unit, {
        skipWeek1: false,
        goalPaceSeconds,
        planType,
        totalWeeks
      });

      allWeeks.push(...chunkWeeks);
    } else {
      throw new Error(`Chunk ${i + 1} missing weekly_plans`);
    }
  }

  console.log(`🎯 All chunks completed! Total weeks generated: ${allWeeks.length}`);

  // Prepend stored Week 1
  const storedFirstWeek = firstWeekBasic.weekly_plans?.[0];
  if (storedFirstWeek) {
    allWeeks.unshift(JSON.parse(JSON.stringify(storedFirstWeek)));
    console.log(`✅ Complete plan now has ${allWeeks.length} weeks (including Week 1)`);
  }

  const completePlan = {
    success: true,
    recommended_plan: {
      plan_name: formatPlanTitleWithRaceDistance(planType, unit),
      plan_type: planType.toLowerCase().replace(' ', '_'),
      duration: totalWeeks,
      target_distance: 0,
      description: `Complete ${totalWeeks}-week ${planType} training plan generated in chunks`,
      why_recommended: `Chunked generation approach used for ${totalWeeks}-week plan`,
      weekly_plans: allWeeks
    }
  };

  // Apply final race day fix
  const finalWeekIndex = completePlan.recommended_plan.weekly_plans.length - 1;
  const finalWeek = completePlan.recommended_plan.weekly_plans[finalWeekIndex];
  if (finalWeek) {
    let normalizedPlanType = (planType || 'marathon').toLowerCase().trim();
    if (normalizedPlanType.includes('half')) normalizedPlanType = 'half marathon';
    applyRaceDayFix(finalWeek, originalInput.long_run_day || 'Sunday', normalizedPlanType, unit, goalPaceSeconds);
  }

  // Fix dates
  fixPlanDatesFromAdjustedStartDate(completePlan, originalInput.start_date);

  // Ensure Week 1 is the exact stored copy
  completePlan.recommended_plan.weekly_plans[0] = JSON.parse(JSON.stringify(storedFirstWeek));
  console.log('✅ Week 1 replaced with exact stored data (CHUNKED)');

  // Update target_distance
  completePlan.recommended_plan.target_distance = completePlan.recommended_plan.weekly_plans
    .reduce((sum, w) => sum + (w.total_weekly_distance || 0), 0);

  console.log(`Successfully generated chunked plan with ${completePlan.recommended_plan.weekly_plans.length} weeks`);
  return completePlan;
}

async function generateRemainingWeeks(planId) {
  if (!planStorage[planId]) throw new Error('Plan ID not found');

  const storedData = planStorage[planId];
  const originalInput = storedData.original_input;
  const firstWeekBasic = storedData.first_week_basic;
  const totalWeeks = storedData.total_weeks;
  const planType = storedData.plan_type;

  console.log(`Generating complete plan for plan_id: ${planId}, total_weeks: ${totalWeeks}`);

  const isLongPlan = totalWeeks > 16;
  if (isLongPlan) {
    console.log(`⚠️ Long plan detected (${totalWeeks} weeks) - using chunked generation`);
    return await generateChunkedPlan(planId, storedData);
  }

  const timestamp = new Date().toISOString();
  const firstWeekData = firstWeekBasic.weekly_plans?.[0] || {};
  const unit = originalInput.measurement_unit === 'km' ? 'km' : 'miles';

  const prompt = REMAINING_WEEKS_PROMPT
    .replace(/{total_weeks}/g, totalWeeks)
    .replace(/{plan_type}/g, planType)
    .replace('{original_input}', JSON.stringify(originalInput, null, 2))
    .replace('{first_week_data}', JSON.stringify(firstWeekData, null, 2))
    .replace('{plan_id}', planId)
    .replace('{timestamp}', timestamp);

  const baseTimeout = 300000;
  const timeoutPerWeek = 30000;
  const dynamicTimeout = Math.min(baseTimeout + (totalWeeks * timeoutPerWeek), 1200000);

  console.log(`Calling OpenAI API for complete plan generation (timeout: ${dynamicTimeout / 1000}s)...`);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 16384,
    messages: [
      {
        role: 'system',
        content: "Generate complete training plan with full analysis and all remaining weeks. CRITICAL WORKOUT TYPES: Use ONLY these exact workout types: 'Easy Run', 'Recovery Run', 'Long Run', 'Tempo Run', 'Interval Run', 'Race', 'Rest'. NEVER use 'Race Pace', 'Goal Pace', 'Speed Work', or any other variations. Return only valid JSON with the complete recommended_plan structure. CRITICAL: Always include 'user_distance': 0 and 'user_time': 0 in BOTH week-level and workout-level data for ALL weeks. CRITICAL: Include 'pace_range' and 'description' fields for EVERY workout in ALL weeks with specific pace guidance. CRITICAL: Each week from Week 2 onwards must follow Monday-to-Sunday structure and include ALL days from specific_days. CRITICAL: From Week 2 onwards, ALWAYS include the long run on long_run_day regardless of Week 1 safety rules. CRITICAL: MANDATORY RECOVERY RUN RULE - The day immediately after long_run_day MUST be a Recovery Run if that day is in specific_days. CRITICAL: DISTANCE ROUNDING - ALL distances MUST be rounded to nearest 0.5 units. CRITICAL: NEVER schedule back-to-back hard workouts. CRITICAL: Implement TAPERING in final 1-3 weeks before race. CRITICAL REST RULES: Elite/Advanced runners NEVER get rest days regardless of training days selected. Beginner/Intermediate ONLY get 1 rest day if they select ALL 7 days, otherwise NO rest days. CRITICAL: Long run day MUST have highest distance in each week. CRITICAL: The first day safety rule applies ONLY to Week 1."
      },
      { role: 'user', content: `Generate complete marathon training plan. Return ONLY JSON, no other text.\n\n${prompt}` },
    ],
  }, { timeout: dynamicTimeout });

  if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
    throw new Error('Invalid response from OpenAI API');
  }

  let content = response.choices[0].message.content;
  if (!content) throw new Error('OpenAI API returned empty content');

  content = content.trim();
  console.log(`Raw response length: ${content.length}`);

  if (content.includes('```')) {
    const parts = content.split('```');
    for (let part of parts) {
      part = part.trim();
      if (part.startsWith('json')) part = part.substring(4).trim();
      if (part.startsWith('{') && part.endsWith('}')) { content = part; break; }
    }
  }

  const startIdx = content.indexOf('{');
  if (startIdx === -1) throw new Error('No JSON object found in response.');

  let braceCount = 0, inString = false, escapeNext = false, endIdx = -1;
  for (let i = startIdx; i < content.length; i++) {
    const char = content[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') { braceCount--; if (braceCount === 0) { endIdx = i; break; } }
    }
  }

  if (endIdx === -1) {
    const planMatch = content.match(/\{[\s\S]*"recommended_plan"[\s\S]*\}/);
    if (planMatch) content = planMatch[0];
    else throw new Error('Could not find complete JSON object');
  } else {
    content = content.substring(startIdx, endIdx + 1);
  }

  content = content.replace(/[\x00-\x1F\x7F]/g, '');

  let completePlan;
  try {
    completePlan = JSON.parse(content);
    console.log('✅ JSON parsing successful');
  } catch (parseError) {
    // Try repair
    let repairedContent = content.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    if (!repairedContent.trim().endsWith('}')) {
      const lastBrace = repairedContent.lastIndexOf('}');
      if (lastBrace !== -1) repairedContent = repairedContent.substring(0, lastBrace + 1);
    }
    try {
      completePlan = JSON.parse(repairedContent);
      console.log('✅ JSON repair successful');
    } catch (repairError) {
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }
  }

  const generatedWeeks = completePlan.recommended_plan?.weekly_plans?.length || 0;
  if (generatedWeeks !== totalWeeks) {
    throw new Error(`AI generated ${generatedWeeks} weeks instead of the requested ${totalWeeks} weeks.`);
  }

  // ── APPLY ALL VALIDATIONS (skip Week 1 to preserve first API consistency) ─

  let goalPaceSeconds = 0;
  
  // FIX: Use the correct race distance based on plan type, not always marathon
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };
  const raceDistance = raceDistances[planType] || raceDistances['marathon'];
  
  if (originalInput.goal_race_time) goalPaceSeconds = parseGoalPace(originalInput.goal_race_time, raceDistance);
  else if (originalInput.estimated_race_time) {
    const timeStr = originalInput.estimated_race_time.includes('-') ? originalInput.estimated_race_time.split('-')[0].trim() : originalInput.estimated_race_time;
    goalPaceSeconds = parseGoalPace(timeStr, raceDistance);
  }

  // Fix dates before validations
  fixPlanDates(completePlan);

  // Apply all validations SKIPPING week 1
  applyAllValidations(completePlan, originalInput, unit, { skipWeek1: true, goalPaceSeconds, planType, totalWeeks });

  // Final race day fix on the last week
  const weeklyPlans = getWeeklyPlans(completePlan);
  if (weeklyPlans.length > 0) {
    const finalWeek = weeklyPlans[weeklyPlans.length - 1];
    let normalizedPlanType = (planType || '').toLowerCase().trim();
    if (normalizedPlanType.includes('half')) normalizedPlanType = 'half marathon';
    else if (!normalizedPlanType || normalizedPlanType === 'marathon') normalizedPlanType = 'marathon';
    applyRaceDayFix(finalWeek, originalInput.long_run_day || 'Sunday', normalizedPlanType, unit, goalPaceSeconds);
  }

  // Validation warnings
  const validation = validateTrainingPlan(completePlan, originalInput.running_experience || 'Intermediate', planType, unit);
  if (validation.warnings.length > 0) {
    console.warn(`⚠️  Plan validation found ${validation.totalWarnings} issue(s):`);
    validation.warnings.forEach(w => console.warn(`  [${w.severity}] Week ${w.week}: ${w.message}`));
    if (completePlan.recommended_plan) completePlan.recommended_plan.validation_warnings = validation.warnings;
  } else {
    console.log('✅ Plan validation passed - no issues found');
  }

  // CRITICAL: Replace Week 1 with exact stored copy
  const originalStoredWeek1 = firstWeekBasic.weekly_plans?.[0];
  if (completePlan.recommended_plan && completePlan.recommended_plan.weekly_plans && originalStoredWeek1) {
    console.log('🔄 Replacing Week 1 with exact stored first week data');
    completePlan.recommended_plan.weekly_plans[0] = JSON.parse(JSON.stringify(originalStoredWeek1));

    // Fix Week 2+ dates based on Week 1's end date
    fixWeekProgressionDates(completePlan.recommended_plan);
    console.log('✅ Week 1 replaced with exact stored data - consistency guaranteed');
  } else if (completePlan.recommended_plan) {
    fixPlanDatesFromAdjustedStartDate(completePlan.recommended_plan, originalInput.start_date);
  }

  // Update total target_distance
  if (completePlan.recommended_plan) {
    completePlan.recommended_plan.target_distance = weeklyPlans.reduce((sum, w) => sum + (w.total_weekly_distance || 0), 0);
  }

  console.log(`Successfully generated complete plan with ${weeklyPlans.length} weeks`);
  return completePlan;
}

// ─────────────────────────────────────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

app.post('/generate-plan', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🔍 Generate Plan Request Debug:');
    console.log(`   Request timestamp: ${new Date().toISOString()}`);
    console.log(`   User input start_date: ${userInput.start_date}`);

    const result = await generateFirstWeek(userInput);

    if (result.success && result.weekly_plans && result.weekly_plans[0]) {
      const week1 = result.weekly_plans[0];
      console.log(`   Generated Week 1: ${week1.start_date} to ${week1.end_date}`);
      console.log(`   Week 1 workouts: ${week1.workouts.length}`);
      week1.workouts.forEach(w => console.log(`     ${w.day} ${w.date}: ${w.workout_type} (${w.distance}km)`));
    }

    res.json(result);
  } catch (error) {
    console.error(`Error in generate_plan_endpoint: ${error.message}`);
    res.status(500).json({ error: `Error generating plan: ${error.message}` });
  }
});

app.post('/get-remaining-plan', async (req, res) => {
  try {
    const { plan_id } = req.body;
    console.log(`Received request for plan_id: ${plan_id}`);

    if (!planStorage[plan_id]) {
      console.log(`Plan ID ${plan_id} not found in storage`);
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
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/plan-status/:plan_id', (req, res) => {
  const { plan_id } = req.params;
  if (!planStorage[plan_id]) return res.status(404).json({ error: 'Plan ID not found' });

  const storedData = planStorage[plan_id];
  res.json({
    plan_id,
    total_weeks: storedData.total_weeks,
    generated_at: storedData.generated_at,
    has_remaining_weeks: true
  });
});

app.post('/calculate-pace-zones', (req, res) => {
  try {
    const { goal_race_time, race_distance, experience, measurement_unit } = req.body;
    if (!goal_race_time || !race_distance) return res.status(400).json({ error: 'Missing required fields: goal_race_time and race_distance' });

    const unit = measurement_unit === 'km' ? 'km' : 'miles';
    const paceZones = calculatePaceZones(goal_race_time, race_distance, experience || 'Intermediate', unit);
    if (!paceZones) return res.status(400).json({ error: 'Invalid input for pace calculation' });

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
    res.status(500).json({ error: `Error calculating pace zones: ${error.message}` });
  }
});

app.post('/calculate-plan-duration', (req, res) => {
  try {
    const { start_date, race_date, min_weeks, max_weeks } = req.body;
    if (!start_date || !race_date) return res.status(400).json({ error: 'Missing required fields: start_date and race_date' });

    const duration = calculateDurationFromRaceDate(start_date, race_date, min_weeks || 8, max_weeks || 20);
    const start = new Date(start_date);
    const race = new Date(race_date);
    const diffDays = Math.ceil(Math.abs(race - start) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      start_date,
      race_date,
      calculated_duration_weeks: duration,
      total_days: diffDays,
      min_weeks_allowed: min_weeks || 8,
      max_weeks_allowed: max_weeks || 20,
      notes: duration < (min_weeks || 8) ? 'Duration is less than minimum recommended weeks.' :
        duration > (max_weeks || 20) ? 'Duration exceeds maximum recommended weeks.' :
          'Duration is within recommended range.'
    });
  } catch (error) {
    res.status(500).json({ error: `Error calculating plan duration: ${error.message}` });
  }
});

app.post('/validate-rest-days', (req, res) => {
  try {
    const { experience, training_days } = req.body;
    if (!experience || !training_days) return res.status(400).json({ error: 'Missing required fields: experience and training_days' });

    const requirements = determineRestDayRequirements(experience, training_days);
    res.json({
      success: true,
      experience,
      training_days,
      rest_day_requirements: requirements,
      recommendation: requirements.warning || 'Rest day schedule is appropriate for your experience level.'
    });
  } catch (error) {
    res.status(500).json({ error: `Error validating rest days: ${error.message}` });
  }
});

/**
 * Fix week progression dates starting from Week 2.
 */
function fixWeekProgressionDates(planJson) {
  const weeklyPlans = getWeeklyPlans(planJson);
  if (!weeklyPlans || weeklyPlans.length < 2) return planJson;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const week1EndDate = new Date(weeklyPlans[0].end_date);
  console.log(`   Fixing dates for ${weeklyPlans.length - 1} weeks, Week 1 ends: ${week1EndDate.toISOString().split('T')[0]}`);

  for (let i = 1; i < weeklyPlans.length; i++) {
    const week = weeklyPlans[i];
    const previousWeek = weeklyPlans[i - 1];
    const previousWeekEndDate = new Date(previousWeek.end_date);

    const weekStartDate = new Date(previousWeekEndDate);
    weekStartDate.setUTCDate(previousWeekEndDate.getUTCDate() + 1);

    const startDow = weekStartDate.getUTCDay();
    if (startDow !== 1) {
      const daysToMonday = startDow === 0 ? 1 : 8 - startDow;
      weekStartDate.setUTCDate(weekStartDate.getUTCDate() + daysToMonday);
    }

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);

    week.start_date = weekStartDate.toISOString().split('T')[0];
    week.end_date = weekEndDate.toISOString().split('T')[0];

    if (week.workouts && week.workouts.length > 0) {
      for (const workout of week.workouts) {
        const dayIndex = dayNames.indexOf(workout.day);
        if (dayIndex !== -1) {
          const workoutDate = new Date(weekStartDate);
          const daysToAdd = dayIndex === 0 ? 6 : dayIndex - 1;
          workoutDate.setUTCDate(weekStartDate.getUTCDate() + daysToAdd);
          workout.date = workoutDate.toISOString().split('T')[0];
        }
      }
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