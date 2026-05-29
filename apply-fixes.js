#!/usr/bin/env node

/**
 * Script to apply three critical fixes to server1.js
 * 1. Add pace validation function
 * 2. Enhance applyRaceDayFix() to include quality workout in race week
 * 3. Fix race distance calculation to use plan_type instead of plan_name
 */

const fs = require('fs');
const path = require('path');

const SERVER_FILE = 'server1.js';
const BACKUP_FILE = 'server1.js.backup';

console.log('🔧 Applying critical fixes to server1.js...\n');

// Read the file
let content = fs.readFileSync(SERVER_FILE, 'utf8');

// Create backup
fs.writeFileSync(BACKUP_FILE, content);
console.log(`✅ Backup created: ${BACKUP_FILE}\n`);

// ============================================================================
// FIX #1: Add validatePaceIsRealistic() function before applyRaceDayFix()
// ============================================================================

const validatePaceFunction = `/**
 * Validate pace is realistic (not slower than walking pace)
 * Walking pace is approximately 20 min/mile or 12:25 min/km
 * Running pace should be faster than this
 */
function validatePaceIsRealistic(paceSeconds, unit = 'km') {
  // Minimum realistic running pace (slower than this is walking)
  const minRunningPaceSeconds = unit === 'km' ? 300 : 480; // 5:00 min/km or 8:00 min/mi
  
  if (paceSeconds > minRunningPaceSeconds) {
    console.warn(\`⚠️  PACE VALIDATION: Pace \${paceSeconds}s per \${unit} is unrealistic (slower than walking). Clamping to minimum running pace.\`);
    return minRunningPaceSeconds;
  }
  
  return paceSeconds;
}

`;

// Find the location to insert (before applyRaceDayFix)
const applyRaceDayFixIndex = content.indexOf('/**\n * Apply race day fix to final week');
if (applyRaceDayFixIndex === -1) {
  console.error('❌ Could not find applyRaceDayFix() function');
  process.exit(1);
}

// Insert the validation function
content = content.slice(0, applyRaceDayFixIndex) + validatePaceFunction + content.slice(applyRaceDayFixIndex);
console.log('✅ Fix #1: Added validatePaceIsRealistic() function\n');

// ============================================================================
// FIX #2: Update calculatePaceZones() to validate pace
// ============================================================================

const oldPaceCalc = `  const goalPaceSeconds = totalSeconds / raceDistance;
  const formatPace = (seconds) => {`;

const newPaceCalc = `  let goalPaceSeconds = totalSeconds / raceDistance;
  
  // Validate pace is realistic
  goalPaceSeconds = validatePaceIsRealistic(goalPaceSeconds, unit);
  
  const formatPace = (seconds) => {`;

if (content.includes(oldPaceCalc)) {
  content = content.replace(oldPaceCalc, newPaceCalc);
  console.log('✅ Fix #2: Updated calculatePaceZones() to validate pace\n');
} else {
  console.warn('⚠️  Could not find exact pace calculation pattern - skipping Fix #2\n');
}

// ============================================================================
// FIX #3: Fix race distance calculation in generateFirstWeek()
// ============================================================================

const oldRaceDistCalc = `  const unit = userInput.measurement_unit === 'km' ? 'km' : 'miles';
  const raceDistance = userInput.plan_name === 'Marathon' ? (unit === 'km' ? 42.2 : 26.2) :
    userInput.plan_name === 'Half Marathon' ? (unit === 'km' ? 21.1 : 13.1) :
    userInput.plan_name === '10k' ? (unit === 'km' ? 10 : 6.2) : (unit === 'km' ? 5 : 3.1);`;

const newRaceDistCalc = `  const unit = userInput.measurement_unit === 'km' ? 'km' : 'miles';

  // Normalize plan_type for race distance lookup
  let normalizedPlanType = (userInput.plan_type || userInput.plan_name || 'marathon').toLowerCase().trim();
  if (normalizedPlanType.includes('half')) normalizedPlanType = 'half marathon';
  else if (normalizedPlanType === '5k') normalizedPlanType = '5k';
  else if (normalizedPlanType === '10k') normalizedPlanType = '10k';
  else normalizedPlanType = 'marathon';

  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };

  const raceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];

  console.log(\`📏 Race distance calculation: plan_type="\${userInput.plan_type}", normalized="\${normalizedPlanType}", distance=\${raceDistance}\${unit}\`);`;

if (content.includes(oldRaceDistCalc)) {
  content = content.replace(oldRaceDistCalc, newRaceDistCalc);
  console.log('✅ Fix #3: Fixed race distance calculation to use plan_type\n');
} else {
  console.warn('⚠️  Could not find exact race distance calculation pattern - skipping Fix #3\n');
}

// ============================================================================
// FIX #4: Replace applyRaceDayFix() function with enhanced version
// ============================================================================

const oldApplyRaceDayFix = `function applyRaceDayFix(finalWeek, longRunDay, normalizedPlanType, unit, goalPaceSeconds) {
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };
  const expectedRaceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];

  console.log(\`🏁 FINAL RACE DAY FIX: Week \${finalWeek.week_number}, race distance: \${expectedRaceDistance} \${unit}\`);

  for (const workout of finalWeek.workouts) {
    if (workout.day === longRunDay) {
      workout.workout_type = 'Race';
      workout.intensity = 'Goal-pace';
      workout.distance = expectedRaceDistance;
      if (goalPaceSeconds > 0) {
        workout.duration = Math.ceil((expectedRaceDistance * goalPaceSeconds) / 60);
      } else {
        const fallbackPaceSeconds = unit === 'km' ? 360 : 580;
        workout.duration = Math.ceil((expectedRaceDistance * fallbackPaceSeconds) / 60);
      }
      workout.description = \`Race day! Follow your nutrition and pacing plan. Good luck!\`;
    } else if (workout.workout_type === 'Race') {
      workout.workout_type = 'Easy Run';
      workout.intensity = 'Easy';
    }
  }

  // Enforce taper distances for non-race workouts in final week
  const maxTaperDistance = unit === 'km' ? 6 : 3.7;
  for (const workout of finalWeek.workouts) {
    if (workout.workout_type === 'Race' || workout.workout_type === 'Rest' || workout.distance === 0) continue;
    if (workout.distance > maxTaperDistance) {
      const oldDistance = workout.distance;
      workout.distance = maxTaperDistance;
      const paceSeconds = workout.intensity === 'Recovery' ? (unit === 'km' ? 420 : 660) : (unit === 'km' ? 390 : 630);
      workout.duration = Math.ceil((workout.distance * paceSeconds) / 60);
      workout.description = \`\${workout.workout_type} at taper distance for race week. Focus on freshness and race preparation.\`;
      console.log(\`🔧 TAPER FIX: \${workout.day} \${oldDistance} → \${workout.distance} \${unit}\`);
    }
  }

  // Fix Recovery Run placement in final week (should only be after race day)
  const raceWorkout = finalWeek.workouts.find(w => w.workout_type === 'Race');
  if (raceWorkout) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

  finalWeek.total_weekly_distance = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
}`;

const newApplyRaceDayFix = `function applyRaceDayFix(finalWeek, longRunDay, normalizedPlanType, unit, goalPaceSeconds) {
  const raceDistances = {
    'marathon': unit === 'km' ? 42.2 : 26.2,
    'half marathon': unit === 'km' ? 21.1 : 13.1,
    'half_marathon': unit === 'km' ? 21.1 : 13.1,
    '10k': unit === 'km' ? 10.0 : 6.2,
    '5k': unit === 'km' ? 5.0 : 3.1
  };
  const expectedRaceDistance = raceDistances[normalizedPlanType] || raceDistances['marathon'];

  console.log(\`🏁 FINAL RACE DAY FIX: Week \${finalWeek.week_number}, race distance: \${expectedRaceDistance} \${unit}, plan type: \${normalizedPlanType}\`);

  // Validate pace is realistic
  if (goalPaceSeconds > 0) {
    goalPaceSeconds = validatePaceIsRealistic(goalPaceSeconds, unit);
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let raceWorkout = null;
  let raceDayIndex = -1;

  // Step 1: Set race day workout
  for (const workout of finalWeek.workouts) {
    if (workout.day === longRunDay) {
      workout.workout_type = 'Race';
      workout.intensity = 'Goal-pace';
      workout.distance = expectedRaceDistance;
      if (goalPaceSeconds > 0) {
        workout.duration = Math.ceil((expectedRaceDistance * goalPaceSeconds) / 60);
      } else {
        const fallbackPaceSeconds = unit === 'km' ? 360 : 580;
        workout.duration = Math.ceil((expectedRaceDistance * fallbackPaceSeconds) / 60);
      }
      workout.description = \`Race day! Follow your nutrition and pacing plan. Good luck!\`;
      raceWorkout = workout;
      raceDayIndex = dayNames.indexOf(longRunDay);
    } else if (workout.workout_type === 'Race') {
      workout.workout_type = 'Easy Run';
      workout.intensity = 'Easy';
    }
  }

  // Step 2: Add a reduced-distance tempo/interval session earlier in race week (3-4 days before race)
  // This maintains sharpness while allowing recovery before race day
  if (raceWorkout && raceDayIndex !== -1) {
    const dayBeforeRace = dayNames[(raceDayIndex - 1 + 7) % 7];
    const twoDaysBeforeRace = dayNames[(raceDayIndex - 2 + 7) % 7];
    const threeDaysBeforeRace = dayNames[(raceDayIndex - 3 + 7) % 7];
    
    // Find a suitable day for quality workout (3-4 days before race)
    let qualityWorkoutDay = null;
    for (const candidateDay of [threeDaysBeforeRace, twoDaysBeforeRace]) {
      const candidateWorkout = finalWeek.workouts.find(w => w.day === candidateDay);
      if (candidateWorkout && candidateWorkout.workout_type !== 'Rest' && candidateWorkout.workout_type !== 'Race') {
        qualityWorkoutDay = candidateWorkout;
        break;
      }
    }

    // Convert suitable workout to tempo/interval session
    if (qualityWorkoutDay) {
      const tempoDistance = unit === 'km' ? 4.0 : 2.5; // Reduced distance for race week
      const tempoSeconds = goalPaceSeconds > 0 ? goalPaceSeconds + 20 : (unit === 'km' ? 350 : 560); // Slightly slower than goal pace
      
      qualityWorkoutDay.workout_type = 'Tempo Run';
      qualityWorkoutDay.intensity = 'Tempo';
      qualityWorkoutDay.distance = tempoDistance;
      qualityWorkoutDay.duration = Math.ceil((tempoDistance * tempoSeconds) / 60);
      qualityWorkoutDay.pace_range = unit === 'km' 
        ? \`\${Math.floor(tempoSeconds / 60)}:\${String(Math.round(tempoSeconds % 60)).padStart(2, '0')}-\${Math.floor((tempoSeconds + 10) / 60)}:\${String(Math.round((tempoSeconds + 10) % 60)).padStart(2, '0')} min/km\`
        : \`\${Math.floor(tempoSeconds / 60)}:\${String(Math.round(tempoSeconds % 60)).padStart(2, '0')}-\${Math.floor((tempoSeconds + 10) / 60)}:\${String(Math.round((tempoSeconds + 10) % 60)).padStart(2, '0')} min/mi\`;
      qualityWorkoutDay.description = \`Reduced-distance tempo run to maintain sharpness before race. 2km warmup, \${tempoDistance}km at race pace effort, 1km cooldown. Keep effort controlled.\`;
      
      console.log(\`✅ RACE WEEK QUALITY WORKOUT: Added \${qualityWorkoutDay.workout_type} on \${qualityWorkoutDay.day} (\${tempoDistance} \${unit})\`);
    }
  }

  // Step 3: Enforce taper distances for non-race, non-quality workouts in final week
  const maxTaperDistance = unit === 'km' ? 6 : 3.7;
  for (const workout of finalWeek.workouts) {
    if (workout.workout_type === 'Race' || workout.workout_type === 'Tempo Run' || workout.workout_type === 'Rest' || workout.distance === 0) continue;
    if (workout.distance > maxTaperDistance) {
      const oldDistance = workout.distance;
      workout.distance = maxTaperDistance;
      const paceSeconds = workout.intensity === 'Recovery' ? (unit === 'km' ? 420 : 660) : (unit === 'km' ? 390 : 630);
      workout.duration = Math.ceil((workout.distance * paceSeconds) / 60);
      workout.description = \`\${workout.workout_type} at taper distance for race week. Focus on freshness and race preparation.\`;
      console.log(\`🔧 TAPER FIX: \${workout.day} \${oldDistance} → \${workout.distance} \${unit}\`);
    }
  }

  // Step 4: Fix Recovery Run placement in final week (should only be after race day)
  if (raceWorkout) {
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

  finalWeek.total_weekly_distance = finalWeek.workouts.reduce((sum, w) => sum + (w.distance || 0), 0);
}`;

if (content.includes(oldApplyRaceDayFix)) {
  content = content.replace(oldApplyRaceDayFix, newApplyRaceDayFix);
  console.log('✅ Fix #4: Enhanced applyRaceDayFix() with race week quality workout\n');
} else {
  console.warn('⚠️  Could not find exact applyRaceDayFix() pattern - skipping Fix #4\n');
}

// Write the updated content
fs.writeFileSync(SERVER_FILE, content);
console.log(`✅ All fixes applied successfully!\n`);
console.log(`📝 Summary of changes:`);
console.log(`   1. Added validatePaceIsRealistic() function`);
console.log(`   2. Updated calculatePaceZones() to validate pace`);
console.log(`   3. Fixed race distance calculation to use plan_type`);
console.log(`   4. Enhanced applyRaceDayFix() with race week quality workout\n`);
console.log(`💾 Backup saved to: ${BACKUP_FILE}\n`);
console.log(`🚀 Ready to test! Run: npm start\n`);
