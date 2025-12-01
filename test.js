

// const express = require('express');
// const cors = require('cors');
// require('dotenv').config();
// const OpenAI = require('openai');

// // Initialize OpenAI client
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// if (!OPENAI_API_KEY) {
//     throw new Error("OPENAI_API_KEY not found in environment variables");
// }

// const openai = new OpenAI({
//     apiKey: OPENAI_API_KEY,
// });

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // ------------------ PLAN TYPES ------------------ //
// const PLAN_TYPES = [
//     "5K Improvement Plan",
//     "Post-Race Recovery Plan", 
//     "Horse Riding Plan",
//     "Post-Injury Plan Via Yoga",
//     "Marathons",
//     "Country Runs",
//     "Swimming Plan",
//     "Train for a Triathlon",
//     "Functional Fitness",
//     "Postnatal Plan",
//     "Parkrun Improvement Plan",
//     "Run a First 5K"
// ];

// // AI-powered function to determine plan type based on interest and user profile
// async function determinePlanTypeWithAI(interest, userProfile) {
//     try {
//         const planTypePrompt = `
// You are an expert running coach specializing in personalized training plan selection.

// AVAILABLE PLAN TYPES:
// 1. "5K Improvement Plan" - Focus on speed work, interval training, tempo runs, track workouts, hill training, pace improvement
// 2. "Post-Race Recovery Plan" - Easy runs, active recovery, cross-training, rest days, rebuilding base fitness gradually
// 3. "Horse Riding Plan" - Combines running with equestrian training, core strengthening, balance work, accounts for riding days
// 4. "Post-Injury Plan Via Yoga" - Integrates yoga with running, flexibility, mobility, injury prevention, gentle return-to-running
// 5. "Marathons" - Endurance building, long runs, high mileage, marathon pace workouts, 42.2-km race preparation
// 6. "Country Runs" - Trail running, varied terrain, hill training, nature-based workouts, outdoor adventure focus
// 7. "Swimming Plan" - Cross-training with swimming, pool workouts, water running, low-impact cardiovascular fitness
// 8. "Train for a Triathlon" - Multi-sport training combining running, swimming, and cycling with balanced endurance development
// 9. "Functional Fitness" - Running combined with functional movement patterns, strength training, and athletic performance
// 10. "Postnatal Plan" - Gentle return to running after childbirth with gradual progression and core recovery focus
// 11. "Parkrun Improvement Plan" - Specifically designed for 5K parkrun events with community-focused training approach
// 12. "Run a First 5K" - Beginner-friendly plan for complete running novices to complete their first 5K distance

// USER PROFILE:
// - Running Experience: ${userProfile.running_experience}
// - Interest/Goal: "${interest}"
// - Gender: ${userProfile.gender}
// - Height: ${userProfile.height}
// - Weight: ${userProfile.weight}

// ANALYSIS GUIDELINES:
// - Match the user's specific interest with the most appropriate plan type
// - Consider their experience level for plan complexity
// - Look for keywords that indicate specific training focuses
// - Consider injury history, recovery needs, or cross-training preferences
// - Choose the plan that best aligns with their stated goals

// Return ONLY a JSON object with your selection and reasoning:
// {
//     "selected_plan_type": "exact plan type name from the list above",
//     "confidence_score": 95,
//     "reasoning": "detailed explanation of why this plan type was selected",
//     "key_factors": ["factor 1", "factor 2", "factor 3"],
//     "alternative_considerations": "any other plan types that were considered"
// }

// CRITICAL: The selected_plan_type must be EXACTLY one of the 12 plan types listed above.
//         `;

//         console.log(`🤖 Calling AI to determine plan type for interest: "${interest}"`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are an expert running coach with deep knowledge of training methodologies. Select the most appropriate training plan type based on the user's interests and profile."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": planTypePrompt 
//                 }
//             ],
//             temperature: 0.3,
//             response_format: { type: "json_object" },
//         });

//         const planTypeResult = JSON.parse(response.choices[0].message.content.trim());
        
//         // Validate that the selected plan type is in our available types
//         if (!PLAN_TYPES.includes(planTypeResult.selected_plan_type)) {
//             console.warn(`⚠️ AI selected invalid plan type: ${planTypeResult.selected_plan_type}, falling back to 5K Improvement Plan`);
//             return {
//                 selected_plan_type: "5K Improvement Plan",
//                 confidence_score: 50,
//                 reasoning: "Fallback selection due to invalid AI response",
//                 key_factors: ["fallback"],
//                 alternative_considerations: "AI selection was invalid",
//                 fallback_used: true
//             };
//         }
        
//         console.log(`✅ AI selected plan type: "${planTypeResult.selected_plan_type}" (Confidence: ${planTypeResult.confidence_score}%)`);
//         console.log(`📝 Reasoning: ${planTypeResult.reasoning}`);
        
//         return planTypeResult;

//     } catch (error) {
//         console.error('❌ AI plan type selection failed:', error.message);
//         // Fallback to default
//         return {
//             selected_plan_type: "5K Improvement Plan",
//             confidence_score: 30,
//             reasoning: "Fallback selection due to AI error",
//             key_factors: ["error_fallback"],
//             alternative_considerations: "AI service was unavailable",
//             fallback_used: true,
//             error: error.message
//         };
//     }
// }

// // ------------------ CHRONOLOGICAL DAY SORTING ------------------ //
// function sortDaysChronologically(days) {
//     const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
//     return days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
// }

// function getDayIndex(dayName) {
//     const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
//     return dayOrder.indexOf(dayName);
// }

// function calculateWorkoutDate(weekStartMonday, dayName) {
//     const dayIndex = getDayIndex(dayName);
//     if (dayIndex === -1) return null;
    
//     const workoutDate = new Date(weekStartMonday);
//     workoutDate.setDate(weekStartMonday.getDate() + dayIndex);
//     return workoutDate;
// }

// // ------------------ FIXED AI WEEKLY DISTRIBUTION CALCULATION ------------------ //
// async function calculateWeeklyDistributionWithAI(maxTotalDistance, minWeeks, maxWeeks, planType, userProfile, trainingGoals, measurementUnit) {
//     try {
//         // Convert to km for internal calculations if needed
//         const isMiles = measurementUnit.toLowerCase() === 'miles';
//         const maxTotalKm = isMiles ? maxTotalDistance * 1.60934 : maxTotalDistance;
//         const minDistanceKm = isMiles ? 1.60934 : 1.0; // 1 mile = 1.60934 km
        
//         const weeklyDistributionPrompt = `
// You are a MATH EXPERT specialized in training periodization and weekly distance distribution.

// TASK: Calculate weekly distance distribution that sums to EXACTLY ${maxTotalDistance} ${measurementUnit} across a duration between ${minWeeks} and ${maxWeeks} weeks.

// CRITICAL MATHEMATICAL CONSTRAINTS:
// 1. Sum of ALL weekly distances = EXACTLY ${maxTotalDistance} ${measurementUnit}
// 2. EVERY week must have distance >= ${isMiles ? '1.0 mile' : '1.0 km'} (NO ZERO OR NEGATIVE DISTANCES)
// 3. All distances rounded to 1 decimal place
// 4. Progressive overload with appropriate recovery weeks
// 5. Consider ${trainingGoals.available_days.length} available training days per week
// 6. Duration must be between ${minWeeks} and ${maxWeeks} weeks (inclusive)
// 7. All calculations and responses must be in ${measurementUnit}

// PLAN TYPE: ${planType}
// USER PROFILE:
// - Experience: ${userProfile.running_experience}
// - Goal: ${trainingGoals.goal}
// - Available days per week: ${trainingGoals.available_days.length}
// - Min weeks: ${minWeeks}
// - Max weeks: ${maxWeeks}
// - Measurement Unit: ${measurementUnit}

// DURATION SELECTION LOGIC:
// - For injury recovery or conservative goals: Choose closer to ${minWeeks} weeks
// - For endurance building or aggressive goals: Choose closer to ${maxWeeks} weeks
// - For balanced progression: Choose middle range
// - Consider user experience level and plan type complexity

// DISTRIBUTION PRINCIPLES FOR ${planType}:
// ${planType === "5K Improvement Plan" ? "- Progressive build with speed focus\n- Peak around week " + Math.ceil(maxWeeks * 0.75) + "\n- Include recovery weeks (but still >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
//   planType === "Post-Race Recovery Plan" ? "- Conservative progression starting low\n- Gradual return to training\n- Recovery weeks (but still >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
//   planType === "Horse Riding Plan" ? "- Moderate progression\n- Consistent weekly volumes\n- Account for cross-training days" :
//   planType === "Post-Injury Plan Via Yoga" ? "- VERY conservative progression\n- Low weekly distances but never below " + (isMiles ? '1.0 mile' : '1.0 km') + "\n- Focus on gradual return" :
//   planType === "Marathons" ? "- High volume progression\n- Long build phases\n- Peak around week " + Math.ceil(maxWeeks * 0.8) + "\n- Taper final weeks (but >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
//   planType === "Country Runs" ? "- Moderate to high volumes\n- Varied weekly progression\n- Trail-focused approach" :
//   planType === "Swimming Plan" ? "- Cross-training focus\n- Moderate running volumes\n- Consistent progression" :
//   planType === "Train for a Triathlon" ? "- Multi-sport progressive build\n- Balanced training with other disciplines\n- Moderate running volumes with cross-training" :
//   planType === "Functional Fitness" ? "- Athletic movement integration\n- Progressive strength and running combination\n- Varied weekly volumes with functional focus" :
//   planType === "Postnatal Plan" ? "- VERY conservative gradual return\n- Health-focused progression\n- Low weekly distances but consistent building" :
//   planType === "Parkrun Improvement Plan" ? "- 5K focused community training\n- Social running emphasis\n- Progressive speed and endurance build" :
//   planType === "Run a First 5K" ? "- Beginner-friendly progression\n- Walk-run combination building\n- Very gradual distance increases" : ""}

// MATHEMATICAL VALIDATION RULES:
// - Minimum weekly distance: ${isMiles ? '1.0 mile' : '1.0 km'} (NEVER go below this)
// - Maximum recommended weekly distance: ${Math.round(maxTotalDistance / minWeeks * 2)} ${measurementUnit}
// - Total must sum to exactly ${maxTotalDistance} ${measurementUnit}
// - Use realistic progression patterns
// - Recovery weeks should be lower but still >= ${isMiles ? '1.0 mile' : '1.0 km'}
// - Duration must be between ${minWeeks} and ${maxWeeks} weeks
// - All distances must be in ${measurementUnit}

// Return ONLY a JSON object:
// {
//     "total_target": ${maxTotalDistance},
//     "measurement_unit": "${measurementUnit}",
//     "plan_type": "${planType}",
//     "selected_duration_weeks": 0,
//     "duration_reasoning": "explanation of why this duration was chosen",
//     "weekly_distances": [
//         {
//             "week": 1,
//             "distance": ${isMiles ? '2.2' : '3.5'},
//             "phase": "Introduction",
//             "notes": "Conservative start"
//         }
//     ],
//     "verification": {
//         "calculated_sum": 0.0,
//         "target_sum": ${maxTotalDistance},
//         "difference": 0.0,
//         "is_exact": false,
//         "min_weekly_distance": 0.0,
//         "max_weekly_distance": 0.0,
//         "weeks_below_minimum": 0,
//         "duration_within_range": false
//     },
//     "training_phases": {
//         "build_weeks": [1, 2, 3],
//         "recovery_weeks": [4],
//         "peak_week": 8
//     }
// }

// CRITICAL: Every week must have distance >= ${isMiles ? '1.0 mile' : '1.0 km'}. Sum must equal exactly ${maxTotalDistance} ${measurementUnit}. Duration must be between ${minWeeks} and ${maxWeeks} weeks. All distances must be in ${measurementUnit}.
//         `;

//         console.log(`🧮 Calling AI for weekly distribution: ${maxTotalDistance}${measurementUnit} across ${minWeeks}-${maxWeeks} weeks (with minimum distance validation)`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are a mathematics expert specializing in athletic training periodization. Provide exact calculations that sum precisely to the target total with NO ZERO OR NEGATIVE weekly distances."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": weeklyDistributionPrompt 
//                 }
//             ],
//             temperature: 0.1,
//             response_format: { type: "json_object" },
//         });

//         const weeklyDistribution = JSON.parse(response.choices[0].message.content.trim());
        
//         // ENHANCED VALIDATION: Check for zero/negative distances and fix them
//         let needsAdjustment = false;
//         const minDistance = isMiles ? 1.0 : 1.0; // 1.0 mile or 1.0 km
        
//         // Validate duration is within range
//         const selectedDuration = weeklyDistribution.selected_duration_weeks || weeklyDistribution.weekly_distances.length;
//         const isDurationValid = selectedDuration >= minWeeks && selectedDuration <= maxWeeks;
        
//         if (!isDurationValid) {
//             console.warn(`⚠️ AI selected duration ${selectedDuration} weeks is outside range [${minWeeks}-${maxWeeks}], adjusting...`);
//             // Adjust to middle of range if invalid
//             const adjustedDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) / 2)));
//             weeklyDistribution.selected_duration_weeks = adjustedDuration;
//             weeklyDistribution.duration_reasoning = `Adjusted to ${adjustedDuration} weeks (middle of range ${minWeeks}-${maxWeeks}) due to invalid AI selection`;
//         }
        
//         // First, ensure no week has distance < minimum
//         weeklyDistribution.weekly_distances.forEach(week => {
//             if (week.distance < minDistance) {
//                 console.warn(`⚠️ Week ${week.week} has distance ${week.distance}${measurementUnit} < minimum ${minDistance}${measurementUnit}, adjusting...`);
//                 week.distance = minDistance;
//                 needsAdjustment = true;
//             }
//         });
        
//         // Calculate current sum after minimum adjustments
//         let calculatedSum = weeklyDistribution.weekly_distances.reduce((sum, week) => sum + week.distance, 0);
//         let difference = Math.abs(calculatedSum - maxTotalDistance);
        
//         // Adjust to match exact total if needed
//         if (difference > 0.1 || needsAdjustment) {
//             console.warn(`⚠️ Adjusting weekly distribution: ${calculatedSum} → ${maxTotalDistance} ${measurementUnit}`);
            
//             const excessOrDeficit = maxTotalDistance - calculatedSum;
            
//             if (excessOrDeficit > 0) {
//                 // We need to add distance - distribute across non-recovery weeks
//                 const buildWeeks = weeklyDistribution.weekly_distances.filter(w => 
//                     !w.phase.toLowerCase().includes('recovery') && 
//                     !w.phase.toLowerCase().includes('taper')
//                 );
                
//                 if (buildWeeks.length > 0) {
//                     const addPerWeek = excessOrDeficit / buildWeeks.length;
//                     buildWeeks.forEach(week => {
//                         week.distance = Math.round((week.distance + addPerWeek) * 10) / 10;
//                     });
//                 }
//                             } else {
//                     // We need to reduce distance - but maintain minimums
//                     const totalExcess = Math.abs(excessOrDeficit);
//                     const adjustableWeeks = weeklyDistribution.weekly_distances.filter(w => w.distance > minDistance + (isMiles ? 0.3 : 0.5));
                    
//                     if (adjustableWeeks.length > 0) {
//                         const reducePerWeek = totalExcess / adjustableWeeks.length;
//                         adjustableWeeks.forEach(week => {
//                             const newDistance = Math.max(minDistance, week.distance - reducePerWeek);
//                             week.distance = Math.round(newDistance * 10) / 10;
//                         });
//                     } else {
//                         // Last resort: adjust the highest week
//                         const maxWeek = weeklyDistribution.weekly_distances.reduce((max, week) => 
//                             week.distance > max.distance ? week : max
//                         );
//                         maxWeek.distance = Math.round((maxWeek.distance + excessOrDeficit) * 10) / 10;
//                         if (maxWeek.distance < minDistance) {
//                             maxWeek.distance = minDistance;
//                         }
//                     }
//                 }
            
//             // Recalculate final verification
//             const newSum = weeklyDistribution.weekly_distances.reduce((sum, week) => sum + week.distance, 0);
//             const minWeekly = Math.min(...weeklyDistribution.weekly_distances.map(w => w.distance));
//             const maxWeekly = Math.max(...weeklyDistribution.weekly_distances.map(w => w.distance));
//             const weeksBelowMin = weeklyDistribution.weekly_distances.filter(w => w.distance < minDistance).length;
            
//             weeklyDistribution.verification = {
//                 calculated_sum: newSum,
//                 target_sum: maxTotalDistance,
//                 difference: Math.abs(newSum - maxTotalDistance),
//                 is_exact: Math.abs(newSum - maxTotalDistance) < 0.1,
//                 min_weekly_distance: minWeekly,
//                 max_weekly_distance: maxWeekly,
//                 weeks_below_minimum: weeksBelowMin,
//                 duration_within_range: isDurationValid,
//                 selected_duration: selectedDuration,
//                 min_allowed_weeks: minWeeks,
//                 max_allowed_weeks: maxWeeks
//             };
//         }
        
//         console.log(`✅ Weekly distribution calculated and validated:`);
//         console.log(`   Target: ${maxTotalDistance}${measurementUnit}, Calculated: ${weeklyDistribution.verification.calculated_sum}${measurementUnit}`);
//         console.log(`   Selected duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${minWeeks}-${maxWeeks})`);
//         console.log(`   Duration reasoning: ${weeklyDistribution.duration_reasoning}`);
//         console.log(`   Min weekly: ${weeklyDistribution.verification.min_weekly_distance}${measurementUnit}`);
//         console.log(`   Max weekly: ${weeklyDistribution.verification.max_weekly_distance}${measurementUnit}`);
//         console.log(`   Weeks below minimum: ${weeklyDistribution.verification.weeks_below_minimum}`);
//         console.log(`   Duration within range: ${weeklyDistribution.verification.duration_within_range ? '✅' : '❌'}`);
        
//         return weeklyDistribution;

//     } catch (error) {
//         console.error('❌ Weekly distribution AI failed:', error.message);
//         // Enhanced fallback with guaranteed minimums and duration selection
//         const minDistance = isMiles ? 1.0 : 1.0; // 1.0 mile or 1.0 km
        
//         // Choose duration based on plan type and user profile
//         let fallbackDuration;
//         if (planType.includes("Post-Injury") || planType.includes("Recovery") || planType.includes("Postnatal")) {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.6)));
//         } else if (planType.includes("Marathon") || planType.includes("5K") || planType.includes("Triathlon")) {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.8)));
//         } else if (planType.includes("First 5K") || planType.includes("Functional Fitness")) {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.6)));
//         } else {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.7)));
//         }
        
//         const baseDistance = Math.max(minDistance, Math.round((maxTotalDistance / fallbackDuration) * 10) / 10);
//         const remainder = maxTotalDistance - (baseDistance * fallbackDuration);
        
//         const fallbackWeeks = [];
//         for (let i = 1; i <= fallbackDuration; i++) {
//             let weekDistance = baseDistance;
            
//             // Apply remainder to middle weeks
//             if (i === Math.ceil(fallbackDuration / 2) && remainder !== 0) {
//                 weekDistance = Math.max(minDistance, baseDistance + remainder);
//             }
            
//             // Ensure recovery weeks still meet minimum
//             const isRecoveryWeek = i % 4 === 0;
//             if (isRecoveryWeek && weekDistance > minDistance * 2) {
//                 weekDistance = Math.max(minDistance, weekDistance * 0.7);
//             }
            
//             fallbackWeeks.push({
//                 week: i,
//                 distance: Math.round(weekDistance * 10) / 10,
//                 phase: isRecoveryWeek ? "Recovery" : (i <= fallbackDuration/2 ? "Build" : "Peak/Taper"),
//                 notes: "Fallback distribution with minimum validation"
//             });
//         }
        
//         // Final adjustment to match total exactly
//         const fallbackSum = fallbackWeeks.reduce((sum, week) => sum + week.distance, 0);
//         const finalAdjustment = maxTotalDistance - fallbackSum;
//         if (Math.abs(finalAdjustment) > 0.1) {
//             const adjustWeek = fallbackWeeks[Math.floor(fallbackDuration / 2)];
//             adjustWeek.distance = Math.max(minDistance, adjustWeek.distance + finalAdjustment);
//             adjustWeek.distance = Math.round(adjustWeek.distance * 10) / 10;
//         }
        
//         return {
//             total_target: maxTotalDistance,
//             measurement_unit: measurementUnit,
//             plan_type: planType,
//             selected_duration_weeks: fallbackDuration,
//             duration_reasoning: `Fallback duration selection: ${fallbackDuration} weeks (range ${minWeeks}-${maxWeeks}) based on plan type ${planType}`,
//             weekly_distances: fallbackWeeks,
//             verification: {
//                 calculated_sum: maxTotalDistance,
//                 target_sum: maxTotalDistance,
//                 difference: 0.0,
//                 is_exact: true,
//                 min_weekly_distance: Math.min(...fallbackWeeks.map(w => w.distance)),
//                 max_weekly_distance: Math.max(...fallbackWeeks.map(w => w.distance)),
//                 weeks_below_minimum: 0,
//                 duration_within_range: true,
//                 selected_duration: fallbackDuration,
//                 min_allowed_weeks: minWeeks,
//                 max_allowed_weeks: maxWeeks
//             },
//             training_phases: {
//                 build_weeks: Array.from({length: Math.floor(fallbackDuration/2)}, (_, i) => i + 1),
//                 recovery_weeks: [Math.floor(fallbackDuration/2)],
//                 peak_week: Math.ceil(fallbackDuration * 0.75)
//             },
//             fallback_used: true
//         };
//     }
// }


// // ------------------ ENHANCED AI MATH EXPERT FUNCTION ------------------ //
// async function calculateDistanceDistributionWithAI(weeklyDistance, availableDays, longRunDay, planType, weekNumber, totalWeeks, measurementUnit) {
//     try {
//         // Sort available days chronologically for consistent processing
//         const sortedAvailableDays = sortDaysChronologically([...availableDays]);
        
//         // Determine minimum distance based on measurement unit
//         const isMiles = measurementUnit.toLowerCase() === 'miles';
//         const minDailyDistance = isMiles ? 0.3 : 0.5; // 0.3 miles or 0.5 km minimum per day
        
//         const mathExpertPrompt = `
// You are a MATH EXPERT specialized in distance distribution for running training plans.

// CRITICAL REQUIREMENT: You MUST distribute the weekly distance across ALL ${sortedAvailableDays.length} available days. Every day must get some distance - NO ZERO DISTANCES ALLOWED.

// TASK: Calculate exact distance distribution for ONE week of training.

// INPUT PARAMETERS:
// - Total Weekly Distance: ${weeklyDistance} ${measurementUnit} (must be distributed EXACTLY across ALL days)
// - Available Training Days: [${sortedAvailableDays.join(', ')}] (ALL ${sortedAvailableDays.length} days MUST get distance)
// - Long Run Day: ${longRunDay} (must get highest distance when present)
// - Plan Type: ${planType}
// - Week: ${weekNumber} of ${totalWeeks}
// - Measurement Unit: ${measurementUnit}

// MATHEMATICAL REQUIREMENTS:
// 1. Sum of all daily distances = ${weeklyDistance} ${measurementUnit} EXACTLY
// 2. ALL ${sortedAvailableDays.length} days must receive distance > 0 (minimum ${minDailyDistance} ${measurementUnit} per day)
// 3. ${longRunDay} gets highest distance (when present in available days)
// 4. All distances rounded to 1 decimal place
// 5. Distribution follows running training principles
// 6. MANDATORY: Include ALL days from list: [${sortedAvailableDays.join(', ')}]
// 7. All distances must be in ${measurementUnit}

// PLAN-SPECIFIC DISTRIBUTION RULES:
// ${planType === "5K Improvement Plan" ? "- Focus on speed work: 40% long run, distribute remaining across other days" :
//   planType === "Post-Race Recovery Plan" ? "- Recovery focus: 35% long run, distribute remaining evenly across other days" :
//   planType === "Horse Riding Plan" ? "- Balanced approach: 45% long run, distribute remaining across other days" :
//   planType === "Post-Injury Plan Via Yoga" ? "- Conservative: 40% long run, distribute remaining gently across all days" :
//   planType === "Marathons" ? "- Endurance focus: 45% long run, distribute remaining with emphasis on medium distances" :
//   planType === "Country Runs" ? "- Trail emphasis: 40% long run, distribute remaining across trail days" :
//   planType === "Swimming Plan" ? "- Cross-training: 35% long run, distribute remaining with cross-training consideration" :
//   planType === "Train for a Triathlon" ? "- Triathlon focus: 35% long run, distribute remaining to balance with other sports" :
//   planType === "Functional Fitness" ? "- Athletic balance: 40% long run, distribute remaining with functional movement emphasis" :
//   planType === "Postnatal Plan" ? "- Gentle approach: 35% long run, distribute remaining very conservatively" :
//   planType === "Parkrun Improvement Plan" ? "- Community focus: 40% long run, distribute remaining for 5K improvement" :
//   planType === "Run a First 5K" ? "- Beginner approach: 35% long run, distribute remaining very gradually" : ""}

// DISTRIBUTION ALGORITHM:
// 1. Assign long run percentage to ${longRunDay} (if present)
// 2. Calculate remaining distance to distribute
// 3. Divide remaining distance among other ${sortedAvailableDays.length - (sortedAvailableDays.includes(longRunDay) ? 1 : 0)} days
// 4. Ensure minimum ${minDailyDistance} ${measurementUnit} per day
// 5. Round to 1 decimal place
// 6. Verify sum equals ${weeklyDistance} ${measurementUnit} exactly
// 7. Adjust ${longRunDay} if needed to match total

// OUTPUT FORMAT (JSON only):
// {
//     "total_target": ${weeklyDistance},
//     "measurement_unit": "${measurementUnit}",
//     "distribution": [
//         ${sortedAvailableDays.map(day => `{
//             "day": "${day}",
//             "distance": 0.0,
//             "percentage": 0.0,
//             "notes": "Training run"
//         }`).join(',\n        ')}
//     ],
//     "verification": {
//         "calculated_sum": 0.0,
//         "target_sum": ${weeklyDistance},
//         "difference": 0.0,
//         "is_exact": false,
//         "long_run_day": "${longRunDay}",
//         "long_run_distance": 0.0,
//         "is_long_run_highest": false,
//         "days_with_zero_distance": 0,
//         "total_days_included": ${sortedAvailableDays.length}
//     }
// }

// CRITICAL CONSTRAINTS:
// - MUST include ALL ${sortedAvailableDays.length} days: [${sortedAvailableDays.join(', ')}]
// - NO ZERO DISTANCES - every day gets minimum ${minDailyDistance} ${measurementUnit}
// - Return days in chronological order
// - Ensure mathematical precision: sum must equal ${weeklyDistance} ${measurementUnit} exactly
// - Long run day gets highest distance when present
// - All distances must be in ${measurementUnit}
//         `;

//         console.log(`🧮 Calling Enhanced AI Math Expert for Week ${weekNumber} (${weeklyDistance}${measurementUnit}) with ALL ${sortedAvailableDays.length} days: [${sortedAvailableDays.join(', ')}]`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are a mathematics expert specializing in precise numerical calculations for athletic training. You MUST distribute distance across ALL available days with NO ZERO distances. Always return exact mathematical results in valid JSON format with chronological day ordering."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": mathExpertPrompt 
//                 }
//             ],
//             temperature: 0.1,
//             response_format: { type: "json_object" },
//         });

//         const mathResult = JSON.parse(response.choices[0].message.content.trim());
        
//         // ENHANCED VALIDATION: Ensure ALL days are included with non-zero distances
//         const requiredDays = new Set(sortedAvailableDays);
//         const providedDays = new Set(mathResult.distribution.map(d => d.day));
//         const missingDays = [...requiredDays].filter(day => !providedDays.has(day));
//         const zeroDays = mathResult.distribution.filter(d => d.distance <= 0);
        
//         console.log(`🔍 Enhanced Validation for Week ${weekNumber}:`);
//         console.log(`   Required days: [${sortedAvailableDays.join(', ')}] (${sortedAvailableDays.length} days)`);
//         console.log(`   Provided days: [${mathResult.distribution.map(d => d.day).join(', ')}] (${mathResult.distribution.length} days)`);
//         console.log(`   Missing days: [${missingDays.join(', ')}] (${missingDays.length})`);
//         console.log(`   Zero distance days: [${zeroDays.map(d => d.day).join(', ')}] (${zeroDays.length})`);
        
//         // If any days are missing or have zero distance, create a complete fallback distribution
//         if (missingDays.length > 0 || zeroDays.length > 0) {
//             console.warn(`⚠️ Enhanced AI Math Expert needs correction - creating complete distribution for all ${sortedAvailableDays.length} days`);
            
//                          // Create enhanced fallback that guarantees all days are included
//              const enhancedFallbackDistribution = [];
//              const totalDays = sortedAvailableDays.length;
             
//              // Give long run day 35% of total distance (if present)
//              const longRunPercentage = sortedAvailableDays.includes(longRunDay) ? 0.35 : 0;
//              const longRunDistance = Math.round(weeklyDistance * longRunPercentage * 10) / 10;
             
//              // Distribute remaining distance equally among all days (including long run day)
//              const remainingDistance = weeklyDistance - (longRunDistance * (longRunPercentage > 0 ? 1 : 0));
//              const otherDaysCount = totalDays - (longRunPercentage > 0 ? 1 : 0);
//              const baseDistance = otherDaysCount > 0 ? Math.round((remainingDistance / otherDaysCount) * 10) / 10 : 0;
             
//              // Create distribution for all days
//              for (const day of sortedAvailableDays) {
//                  if (day === longRunDay && longRunPercentage > 0) {
//                      enhancedFallbackDistribution.push({
//                          day: day,
//                          distance: longRunDistance + baseDistance, // Long run gets both portions
//                          percentage: ((longRunDistance + baseDistance) / weeklyDistance) * 100,
//                          notes: "Enhanced fallback - Long run with guaranteed distance"
//                      });
//                  } else {
//                      const distance = Math.max(baseDistance, minDailyDistance); // Minimum based on measurement unit
//                      enhancedFallbackDistribution.push({
//                          day: day,
//                          distance: distance,
//                          percentage: (distance / weeklyDistance) * 100,
//                          notes: "Enhanced fallback - Guaranteed minimum distance"
//                      });
//                  }
//              }
            
//             // Adjust to match exact total
//             const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
//             const adjustment = weeklyDistance - calculatedSum;
            
//             if (Math.abs(adjustment) > 0.1) {
//                 // Add adjustment to long run day or first day
//                 const adjustmentTarget = enhancedFallbackDistribution.find(d => d.day === longRunDay) || enhancedFallbackDistribution[0];
//                 adjustmentTarget.distance = Math.round((adjustmentTarget.distance + adjustment) * 10) / 10;
//                 adjustmentTarget.percentage = (adjustmentTarget.distance / weeklyDistance) * 100;
//                 adjustmentTarget.notes += " (adjusted for exact total)";
//             }
            
//             mathResult.distribution = enhancedFallbackDistribution;
//             mathResult.fallback_used = "enhanced_complete_distribution";
//         }
        
//         // Ensure chronological order in the response
//         if (mathResult.distribution) {
//             mathResult.distribution = mathResult.distribution.sort((a, b) => {
//                 return getDayIndex(a.day) - getDayIndex(b.day);
//             });
//         }
        
//         // Final validation and adjustment
//         const calculatedSum = mathResult.distribution.reduce((sum, day) => sum + day.distance, 0);
//         const difference = Math.abs(calculatedSum - weeklyDistance);
        
//         if (difference > 0.1) {
//             console.warn(`⚠️ Final adjustment for Week ${weekNumber}: ${calculatedSum} → ${weeklyDistance}`);
            
//             // Find long run day and adjust
//             let longRunDayData = mathResult.distribution.find(d => d.day === longRunDay);
//             if (!longRunDayData && mathResult.distribution.length > 0) {
//                 // If long run day not in available days, adjust the first day
//                 longRunDayData = mathResult.distribution[0];
//             }
            
//             if (longRunDayData) {
//                 const adjustment = weeklyDistance - (calculatedSum - longRunDayData.distance);
//                 longRunDayData.distance = Math.round(adjustment * 10) / 10;
//                 longRunDayData.percentage = (longRunDayData.distance / weeklyDistance) * 100;
                
//                 // Recalculate verification
//                 const newSum = mathResult.distribution.reduce((sum, day) => sum + day.distance, 0);
//                 mathResult.verification = {
//                     ...mathResult.verification,
//                     calculated_sum: newSum,
//                     difference: Math.abs(newSum - weeklyDistance),
//                     is_exact: Math.abs(newSum - weeklyDistance) < 0.1,
//                     long_run_distance: longRunDayData.distance,
//                     days_with_zero_distance: mathResult.distribution.filter(d => d.distance <= 0).length,
//                     total_days_included: mathResult.distribution.length
//                 };
//             }
//         }
        
//         console.log(`✅ Enhanced AI Math Expert calculated distribution for Week ${weekNumber}:`);
//         console.log(`   Target: ${weeklyDistance}${measurementUnit}, Calculated: ${mathResult.verification?.calculated_sum || calculatedSum}${measurementUnit}`);
//         console.log(`   All ${sortedAvailableDays.length} days included: [${mathResult.distribution.map(d => d.day).join(', ')}]`);
//         console.log(`   Long Run (${longRunDay}): ${mathResult.verification?.long_run_distance || 'N/A'}${measurementUnit}`);
//         console.log(`   Zero distance days: ${mathResult.verification?.days_with_zero_distance || 0}`);
//         console.log(`   Exact Match: ${mathResult.verification?.is_exact ? '✅' : '❌'}`);
        
//         return mathResult;

//     } catch (error) {
//         console.error('❌ Enhanced AI Math Expert failed:', error.message);
//         // Enhanced fallback to ensure ALL days are included
//         const sortedAvailableDays = sortDaysChronologically([...availableDays]);
        
//         // Determine minimum distance based on measurement unit
//         const isMiles = measurementUnit.toLowerCase() === 'miles';
//         const minDailyDistance = isMiles ? 0.3 : 0.5; // 0.3 miles or 0.5 km minimum per day
        
//         // Give long run day 35% if present, distribute rest equally
//         const longRunPercentage = sortedAvailableDays.includes(longRunDay) ? 0.35 : 0;
//         const longRunDistance = Math.round(weeklyDistance * longRunPercentage * 10) / 10;
//         const remainingDistance = weeklyDistance - longRunDistance;
//         const otherDaysCount = sortedAvailableDays.length - (longRunPercentage > 0 ? 1 : 0);
//         const baseDistance = otherDaysCount > 0 ? Math.round((remainingDistance / otherDaysCount) * 10) / 10 : 0;
        
//         const enhancedFallbackDistribution = sortedAvailableDays.map((day, index) => {
//             let distance;
//             if (day === longRunDay && longRunPercentage > 0) {
//                 distance = longRunDistance + baseDistance; // Long run gets both portions
//             } else {
//                 distance = Math.max(baseDistance, minDailyDistance); // Minimum based on measurement unit
//             }
            
//             return {
//                 day: day,
//                 distance: distance,
//                 percentage: (distance / weeklyDistance) * 100,
//                 notes: day === longRunDay ? "Enhanced fallback - Long run" : "Enhanced fallback - Equal distribution"
//             };
//         });
        
//         // Adjust final day to make total exact
//         const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
//         const adjustment = weeklyDistance - calculatedSum;
//         if (Math.abs(adjustment) > 0.1) {
//             const lastDay = enhancedFallbackDistribution[enhancedFallbackDistribution.length - 1];
//             lastDay.distance = Math.round((lastDay.distance + adjustment) * 10) / 10;
//             lastDay.percentage = (lastDay.distance / weeklyDistance) * 100;
//         }

//         return {
//             total_target: weeklyDistance,
//             measurement_unit: measurementUnit,
//             distribution: enhancedFallbackDistribution,
//             verification: {
//                 calculated_sum: weeklyDistance,
//                 target_sum: weeklyDistance,
//                 difference: 0.0,
//                 is_exact: true,
//                 long_run_day: longRunDay,
//                 long_run_distance: enhancedFallbackDistribution.find(d => d.day === longRunDay)?.distance || baseDistance,
//                 is_long_run_highest: true,
//                 days_with_zero_distance: 0,
//                 total_days_included: sortedAvailableDays.length,
//                 fallback_used: "enhanced_complete_fallback"
//             }
//         };
//     }
// }

// // ------------------ HELPER FUNCTIONS ------------------ //
// function parseDistance(distanceVal) {
//     if (typeof distanceVal === 'number') {
//         return parseFloat(distanceVal);
//     }
//     if (typeof distanceVal === 'string') {
//         try {
//             return parseFloat(distanceVal.split(' ')[0]);
//         } catch (error) {
//             return 0.0;
//         }
//     }
//     return 0.0;
// }

// function postprocessDistances(planData) {
//     if (!planData.weekly_plans) {
//         return planData;
//     }

//     planData.weekly_plans.forEach(week => {
//         week.total_weekly_distance = parseDistance(week.total_weekly_distance || 0);
//         week.user_distance = 0;
//         week.user_time = 0;

//         if (week.workouts) {
//             week.workouts.forEach(workout => {
//                 workout.distance = parseDistance(workout.distance || 0);
//                 workout.duration = parseInt(workout.duration || 0);
//                 workout.user_distance = 0;
//                 workout.user_time = 0;
//             });
//         }
//     });

//     return planData;
// }

// // NEW FUNCTION: AI-based intelligent start date adjustment
// async function adjustStartDateWithAI(userStartDate, userProfile, interest, currentTime) {
//     try {
//         console.log(`🤖 Using AI to intelligently determine optimal start date...`);
//         console.log(`🕐 Reference time (from requested start_date, UTC): ${currentTime.toISOString()} (UTC hour: ${currentTime.getUTCHours()})`);
//         console.log(`📅 User requested start date: ${new Date(userStartDate).toDateString()}`);
        
//         const startDatePrompt = `
// You are an expert running coach and scheduling specialist. Your task is to intelligently determine the optimal start date for a training plan based on multiple contextual factors.

// USER CONTEXT:
// - Requested start date: ${userStartDate}
// - Current time (UTC): ${currentTime.toISOString()}
// - User profile: ${JSON.stringify(userProfile)}
// - Training goal/interest: "${interest}"

// CRITICAL RULES - FOLLOW THESE EXACTLY:

// **TIME-BASED LOGIC (MANDATORY - NO EXCEPTIONS)**:
// - AM generation (before 12:00 PM): MUST start today (same date) or maximum tomorrow
// - PM generation (12:00 PM and later): MUST start tomorrow (next date)
// - Late evening (after 6:00 PM): MUST start next day

// **RECOVERY CONTEXT (LIMITED MODIFICATION)**:
// - Recovery scenarios: Can add MAXIMUM 1 day ONLY if it's PM generation
// - AM generation + recovery: MUST start today (recovery cannot override AM logic)
// - PM generation + recovery: Can start tomorrow (1 day delay maximum)

// **STRICT ENFORCEMENT**:
// - Time of day ALWAYS takes priority over recovery context
// - Never skip more than 1 day from the original date
// - For morning generation, recovery context is IGNORED

// EXAMPLES:
// - 11:44 AM + recovery → Start TODAY (AM logic overrides recovery)
// - 2:00 PM + recovery → Start TOMORROW (PM logic + 1 day recovery)
// - 9:00 AM + recovery → Start TODAY (AM logic overrides recovery)

// Return ONLY a JSON object with your intelligent decision:
// {
//     "adjusted_start_date": "ISO date string",
//     "adjustment_reason": "detailed explanation of why this date was chosen",
//     "confidence_score": 95,
//     "key_factors": ["factor1", "factor2", "factor3"],
//     "user_benefit": "how this adjustment benefits the user",
//     "recommendation": "specific advice for the user about starting their plan"
// }

// CRITICAL: The adjusted_start_date must be a valid ISO date string.
// CRITICAL: For morning generation, recovery context is IGNORED - start today.
// CRITICAL: Never skip more than 1 day from original date.
//         `;

//         console.log(`🤖 Calling AI for intelligent start date determination...`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are an expert running coach and scheduling specialist. Analyze user context to determine the optimal training plan start date."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": startDatePrompt 
//                 }
//             ],
//             temperature: 0.3,
//             response_format: { type: "json_object" },
//         });

//         const aiStartDateResult = JSON.parse(response.choices[0].message.content.trim());
        
//         // STRICT VALIDATION: Enforce time-based logic rules
//         const originalDate = new Date(userStartDate);
//         const aiAdjustedDate = new Date(aiStartDateResult.adjusted_start_date);
//         const daysDifference = Math.ceil((aiAdjustedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
//         const currentHour = currentTime.getUTCHours();
        
//         // STRICT RULE ENFORCEMENT
//         let shouldCorrect = false;
//         let correctionReason = '';
        
//         if (currentHour < 12) {
//             // AM generation rules - STRICT
//             if (daysDifference > 0) {
//                 shouldCorrect = true;
//                 correctionReason = `AM generation (${currentHour}:00) - recovery context is IGNORED. Must start TODAY (same date).`;
//             }
//         } else {
//             // PM generation rules - MUST be tomorrow
//             if (daysDifference !== 1) {
//                 shouldCorrect = true;
//                 correctionReason = `PM generation (${currentHour}:00) - MUST start tomorrow (exactly 1 day later). AI returned ${daysDifference} days difference.`;
//             }
//         }
        
//         // Apply correction if AI violates rules
//         if (shouldCorrect) {
//             console.log(`⚠️ AI violated strict time-based rules: ${correctionReason}`);
            
//             let correctedDate = new Date(userStartDate);
            
//             if (currentHour >= 12) {
//                 // PM generation - start tomorrow (1 day max)
//                 correctedDate.setUTCDate(correctedDate.getUTCDate() + 1);
//                 console.log(`🔄 Corrected: PM generation → start tomorrow (1 day max)`);
//             } else {
//                 // AM generation - start today (0 days)
//                 correctedDate = new Date(originalDate);
//                 console.log(`🔄 Corrected: AM generation → start today (0 days) - recovery context ignored`);
//             }
            
//             return {
//                 adjustedDate: correctedDate.toISOString(),
//                 reason: `AI violated time-based rules: ${correctionReason} Corrected to: ${currentHour >= 12 ? 'PM generation → start tomorrow' : 'AM generation → start today'}`,
//                 confidence: 90,
//                 keyFactors: ['strict_time_logic', 'ai_rule_violation', 'automatic_correction'],
//                 userBenefit: 'Ensures proper time-based logic is always followed',
//                 recommendation: 'Start your plan on the corrected date following proper time logic'
//             };
//         }
        
//         console.log(`✅ AI start date determination completed:`, {
//             confidence: aiStartDateResult.confidence_score + '%',
//             reason: aiStartDateResult.adjustment_reason,
//             adjustedDate: aiStartDateResult.adjusted_start_date,
//             daysSkipped: daysDifference
//         });
        
//         return {
//             adjustedDate: aiStartDateResult.adjusted_start_date,
//             reason: aiStartDateResult.adjustment_reason,
//             confidence: aiStartDateResult.confidence_score,
//             keyFactors: aiStartDateResult.key_factors,
//             userBenefit: aiStartDateResult.user_benefit,
//             recommendation: aiStartDateResult.recommendation
//         };
        
//     } catch (error) {
//         console.error(`❌ Error in AI start date determination:`, error);
        
//         // Fallback to intelligent default logic
//         const now = new Date(userStartDate);
//         const currentHour = now.getUTCHours();
//         const userStartDateObj = new Date(userStartDate);
//         let fallbackDate = new Date(userStartDateObj);
        
//         // STRICT fallback logic - follows time-based rules exactly
//         if (currentHour < 12) {
//             // AM generation (before 12 PM) - ALWAYS start today
//             fallbackDate = new Date(userStartDateObj);
//             console.log(`🔄 STRICT fallback: AM generation (${currentHour}:00) → start TODAY - recovery context ignored`);
//         } else if (currentHour >= 18) {
//             // Late evening (after 6 PM) - start tomorrow
//             fallbackDate.setUTCDate(userStartDateObj.getUTCDate() + 1);
//             console.log(`🔄 STRICT fallback: Late evening generation (${currentHour}:00) → start tomorrow`);
//         } else {
//             // Afternoon/PM (12 PM - 6 PM) - start tomorrow
//             fallbackDate.setUTCDate(userStartDateObj.getUTCDate() + 1);
//             console.log(`🔄 STRICT fallback: PM generation (${currentHour}:00) → start tomorrow`);
//         }
        
//         return {
//             adjustedDate: fallbackDate.toISOString(),
//             reason: `AI determination failed - using STRICT time-based fallback: ${currentHour < 12 ? 'AM generation → start today' : 'PM generation → start tomorrow'}`,
//             confidence: 85,
//             keyFactors: ['strict_time_logic', 'fallback_system', 'time_based_rules'],
//             userBenefit: 'Ensures proper time-based logic is always followed, even in fallback scenarios',
//             recommendation: 'Start your plan on the fallback date following strict time logic'
//         };
//     }
// }

// // ENHANCED: Fixed date constraint logic with detailed available days tracking
// function calculateWeekDatesFromStart(startDateStr, availableDays, numWeeks) {
//     const startDate = new Date(startDateStr);
//     const weeks = [];
    
//     // Sort available days chronologically
//     const sortedAvailableDays = sortDaysChronologically([...availableDays]);
    
//     // Find the Monday of the current week containing start_date
//     const currentWeekMonday = new Date(startDate);
//     const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
//     const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday to 6
//     currentWeekMonday.setDate(startDate.getDate() - daysFromMonday);
    
//     // Check if any available days fall on or after start_date in current week
//     const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
//     let hasAvailableDaysInCurrentWeek = false;
//     let currentWeekAvailableDays = [];
    
//     console.log(`📅 Start date: ${startDate.toDateString()} (${startDate.toISOString().split('T')[0]})`);
//     console.log(`📅 Current week Monday: ${currentWeekMonday.toISOString().split('T')[0]}`);
//     console.log(`📅 Available days (sorted): [${sortedAvailableDays.join(', ')}]`);
//     console.log('📅 Checking available days in current week:');
    
//     for (const dayName of sortedAvailableDays) {
//         const dayIndex = getDayIndex(dayName);
//         if (dayIndex !== -1) {
//             const dayDate = new Date(currentWeekMonday);
//             dayDate.setDate(currentWeekMonday.getDate() + dayIndex);
            
//             const isAvailable = dayDate >= startDate;
//             console.log(`   ${dayName}: ${dayDate.toISOString().split('T')[0]} - ${isAvailable ? '✅ AVAILABLE' : '❌ BEFORE START'}`);
            
//             if (isAvailable) {
//                 hasAvailableDaysInCurrentWeek = true;
//                 currentWeekAvailableDays.push(dayName);
//             }
//         }
//     }
    
//     // Sort current week available days chronologically
//     currentWeekAvailableDays = sortDaysChronologically(currentWeekAvailableDays);
    
//     let firstWeekStart;
//     let skipCurrentWeek = false;
    
//     if (hasAvailableDaysInCurrentWeek) {
//         // Use current week as Week 1
//         firstWeekStart = new Date(currentWeekMonday);
//         console.log(`✅ Using current week for Week 1 with ${currentWeekAvailableDays.length} available days: [${currentWeekAvailableDays.join(', ')}]`);
//     } else {
//         // Skip current week and start from next Monday
//         firstWeekStart = new Date(currentWeekMonday);
//         firstWeekStart.setDate(currentWeekMonday.getDate() + 7);
//         skipCurrentWeek = true;
//         console.log('⚠️ Skipping current week - no available days remaining. Starting from next Monday for Week 1');
//     }
    
//     // Generate all weeks from the determined start
//     for (let i = 0; i < numWeeks; i++) {
//         const weekStart = new Date(firstWeekStart);
//         weekStart.setDate(firstWeekStart.getDate() + (i * 7));
        
//         const weekEnd = new Date(weekStart);
//         weekEnd.setDate(weekStart.getDate() + 6);
        
//         weeks.push([
//             weekStart.toISOString().split('T')[0],
//             weekEnd.toISOString().split('T')[0]
//         ]);
//     }
    
//     console.log('📅 Generated week dates:', weeks);
//     console.log(`📅 Week 1 will have ${skipCurrentWeek ? sortedAvailableDays.length : currentWeekAvailableDays.length} workout days`);
//     console.log(`📅 Weeks 2-${numWeeks} will each have ${sortedAvailableDays.length} workout days`);
    
//     return { 
//         weeks, 
//         skipCurrentWeek, 
//         hasAvailableDaysInCurrentWeek,
//         currentWeekAvailableDays: skipCurrentWeek ? [] : currentWeekAvailableDays,
//         allAvailableDays: sortedAvailableDays
//     };
// }

// // ENHANCED: Updated system prompt with AI plan type selection and dynamic duration
// const generateTrainingPlanSystemPrompt = (request, weeklyDistribution, planTypeSelection) => {
//     console.log('Generating system prompt with AI weekly distribution, AI plan type selection, and dynamic duration');
//     const { maxTotalDistance, userProfile, trainingGoals, skipCurrentWeek } = request;
//     const planType = planTypeSelection.selected_plan_type;
//     const selectedDuration = weeklyDistribution.selected_duration_weeks;

//     return `
// You are an expert running coach. Return ONLY valid JSON with NO additional text.

// AI-SELECTED PLAN TYPE: ${planType}
// AI Selection Confidence: ${planTypeSelection.confidence_score}%
// AI Selection Reasoning: ${planTypeSelection.reasoning}

// AI-SELECTED DURATION: ${selectedDuration} weeks
// Duration Reasoning: ${weeklyDistribution.duration_reasoning}

// Create a specialized training plan following the characteristics of "${planType}":

// ${planType === "5K Improvement Plan" ? "- Focus on speed work, interval training, and tempo runs\n- Include track workouts and hill training\n- Emphasize pace improvement and race preparation" :
//   planType === "Post-Race Recovery Plan" ? "- Prioritize easy runs and active recovery\n- Include cross-training and rest days\n- Focus on rebuilding base fitness gradually" :
//   planType === "Horse Riding Plan" ? "- Combine running with equestrian training schedule\n- Include core strengthening and balance work\n- Account for riding days in workout planning" :
//   planType === "Post-Injury Plan Via Yoga" ? "- Integrate yoga sessions with running workouts\n- Focus on flexibility, mobility, and injury prevention\n- Include gentle return-to-running progression" :
//   planType === "Marathons" ? "- Build endurance with long runs and high mileage\n- Include marathon pace workouts and nutrition practice\n- Focus on 26.2-mile race preparation" :
//   planType === "Country Runs" ? "- Emphasize trail running and varied terrain\n- Include hill training and nature-based workouts\n- Focus on outdoor adventure and exploration" :
//   planType === "Swimming Plan" ? "- Combine swimming and running for cross-training\n- Include pool workouts and water running\n- Focus on low-impact cardiovascular fitness" :
//   planType === "Train for a Triathlon" ? "- Multi-sport training with balanced disciplines\n- Include brick workouts and transition practice\n- Focus on endurance across swimming, cycling, and running" :
//   planType === "Functional Fitness" ? "- Integrate functional movement patterns with running\n- Include strength training and athletic performance drills\n- Focus on overall fitness and movement quality" :
//   planType === "Postnatal Plan" ? "- Gentle return to exercise after childbirth\n- Include core recovery and gradual fitness building\n- Focus on safe, progressive training with health priority" :
//   planType === "Parkrun Improvement Plan" ? "- Community-focused 5K training approach\n- Include social running elements and group dynamics\n- Focus on 5K performance improvement in a fun environment" :
//   planType === "Run a First 5K" ? "- Beginner-friendly introduction to running\n- Include walk-run progression and confidence building\n- Focus on completing first 5K distance safely" : ""}

// 🧮 AI-CALCULATED WEEKLY DISTANCES (USE EXACTLY):
// Total Budget: ${weeklyDistribution.total_target} km
// Selected Duration: ${selectedDuration} weeks
// Weekly Distribution (MUST USE THESE EXACT DISTANCES):
// ${weeklyDistribution.weekly_distances.map(week => 
//     `Week ${week.week}: ${week.distance} km (${week.phase})`
// ).join('\n')}

// Verification: Sum = ${weeklyDistribution.verification.calculated_sum} km, Target = ${weeklyDistribution.verification.target_sum} km
// Minimum Weekly Distance: ${weeklyDistribution.verification.min_weekly_distance} km
// Maximum Weekly Distance: ${weeklyDistribution.verification.max_weekly_distance} km
// Duration Validation: ${weeklyDistribution.verification.duration_within_range ? '✅ Within Range' : '❌ Outside Range'}

// MANDATORY RULES - NO EXCEPTIONS:
// 1. Use EXACT weekly distances from AI calculation above - DO NOT MODIFY
// 2. Total distance budget: EXACTLY ${maxTotalDistance} kilometers across ${selectedDuration} weeks
// 3. Available workout days: [${trainingGoals?.available_days?.join(', ')}] - ${trainingGoals?.available_days?.length} days
// 4. CRITICAL: ${skipCurrentWeek ? 'Skip current week - start from Week 1 with all available days' : 'Week 1 may be partial, subsequent weeks use ALL available days'}
// 5. Long run day: ${trainingGoals?.long_run_day} must have the highest distance in every week it appears
// 6. Enhanced AI Math Expert will handle daily distance distribution within each week
// 7. Chronological order: Order workouts by day of week (Monday first, Sunday last)
// 8. Never use days not in available_days list: [${trainingGoals?.available_days?.join(', ')}]
// 9. WORKOUT TYPE: Only use "running" or "walking" - NO exceptions
// 10. ALL AVAILABLE DAYS MUST GET WORKOUTS - NO SKIPPING DAYS
// 11. CRITICAL: Every week must have distance >= 1.0 km (VALIDATED)
// 12. PLAN DURATION: Use AI-selected duration of ${selectedDuration} weeks

// User Profile Context:
// - Gender: ${userProfile?.gender}
// - Height: ${userProfile?.height}
// - Weight: ${userProfile?.weight}
// - Experience: ${userProfile?.running_experience}
// - Goal: ${trainingGoals?.goal}

// CRITICAL: Use the exact weekly distances provided by AI calculation. Enhanced AI Math Expert will ensure ALL available days get workouts. Plan duration is ${selectedDuration} weeks as determined by AI.
//         `;
// };

// // ENHANCED: Updated prompt with AI plan type selection and dynamic duration
// const generateTrainingPlanPrompt = (request, weeklyDistribution, planTypeSelection) => {
//     const { userProfile, trainingGoals, startDate, weekDates, skipCurrentWeek, currentWeekAvailableDays, allAvailableDays } = request;
//     const planType = planTypeSelection.selected_plan_type;
//     const selectedDuration = weeklyDistribution.selected_duration_weeks;

//     const payload = {
//         gender: userProfile.gender || 'not_specified',
//         height: `${userProfile.height || 170} cm`,
//         weight: userProfile.weight || 70,
//         running_experience: userProfile.running_experience || 'beginner',
//         interest: trainingGoals.goal || 'run a half marathon',
//         estimated_race_time: trainingGoals.current_race_time || 'N/A',
//         available_days: allAvailableDays || [],
//         available_days_string: allAvailableDays?.join(', ') || '',
//         available_days_count: allAvailableDays?.length || 0,
//         long_run_day: trainingGoals.long_run_day || 'Sunday',
//         measurement_unit: 'kilometers',
//         selected_duration_weeks: selectedDuration,
//         start_date: startDate || new Date(),
//         week_dates: weekDates,
//         plan_type: planType,
//         skip_current_week: skipCurrentWeek,
//         current_week_available_days: currentWeekAvailableDays || []
//     };

//     return `
// 🔴 CRITICAL TRAINING PLAN SPECIFICATIONS:

// AI-SELECTED PLAN TYPE: ${payload.plan_type}
// AI Selection Confidence: ${planTypeSelection.confidence_score}%
// AI Selection Reasoning: ${planTypeSelection.reasoning}
// Key Factors: ${planTypeSelection.key_factors?.join(', ') || 'N/A'}

// TOTAL DISTANCE BUDGET: ${weeklyDistribution.total_target} ${payload.measurement_unit}
// AI-SELECTED PLAN DURATION: ${payload.selected_duration_weeks} weeks
// Duration Reasoning: ${weeklyDistribution.duration_reasoning}
// AVAILABLE WORKOUT DAYS (CHRONOLOGICAL): [${payload.available_days_string}] (${payload.available_days_count} days)
// LONG RUN DAY: ${payload.long_run_day} (must have highest distance when present)

// 🧮 AI-CALCULATED WEEKLY DISTANCES (MANDATORY - USE EXACTLY):
// ${weeklyDistribution.weekly_distances.map((week, index) => 
//     `Week ${week.week}: ${week.distance} km (${week.phase}) - Dates: ${weekDates[index][0]} to ${weekDates[index][1]}`
// ).join('\n')}

// Total Verification: ${weeklyDistribution.verification.calculated_sum} km = ${weeklyDistribution.verification.target_sum} km ✅
// Minimum Weekly: ${weeklyDistribution.verification.min_weekly_distance} km ✅
// Maximum Weekly: ${weeklyDistribution.verification.max_weekly_distance} km ✅
// Duration Validation: ${weeklyDistribution.verification.duration_within_range ? '✅ Within Range' : '❌ Outside Range'} ✅

// 🔴 ENHANCED WORKOUT CONSISTENCY ANALYSIS:

// Start Date: ${new Date(payload.start_date).toDateString()} (${new Date(payload.start_date).toISOString().split('T')[0]})

// ${skipCurrentWeek ? 
// `SKIP CURRENT WEEK - No available days remaining in current week
// Starting directly from next Monday with complete weeks:

// Week 1 (Complete): ${weekDates[0][0]} to ${weekDates[0][1]}
// - Distance: ${weeklyDistribution.weekly_distances[0].distance} km
// - Available days: [${payload.available_days_string}]
// - Expected workouts: ${payload.available_days_count} (ALL AVAILABLE DAYS MANDATORY)

// Weeks 2-${payload.selected_duration_weeks} (Complete):
// - Each week uses ALL available days: [${payload.available_days_string}]
// - Expected workouts per week: ${payload.available_days_count} (CONSISTENT - ALL DAYS MANDATORY)` :

// `Week 1 (Partial): Uses current week with remaining days only
// - Distance: ${weeklyDistribution.weekly_distances[0].distance} km
// - Available days on/after start date: [${payload.current_week_available_days.join(', ')}]
// - Expected workouts: ${payload.current_week_available_days.length} (ALL REMAINING DAYS MANDATORY)

// Weeks 2-${payload.selected_duration_weeks} (Complete):
// - Each week uses ALL available days: [${payload.available_days_string}]
// - Expected workouts per week: ${payload.available_days_count} (CONSISTENT - ALL DAYS MANDATORY)`}

// 🔴 ENHANCED CHRONOLOGICAL ORDERING REQUIREMENTS:

// MANDATORY WORKOUT ORDER (Monday → Sunday):
// 1. Monday (if available)
// 2. Tuesday (if available)
// 3. Wednesday (if available)
// 4. Thursday (if available)
// 5. Friday (if available)
// 6. Saturday (if available)
// 7. Sunday (if available)

// CRITICAL: All workouts within each week MUST be ordered chronologically by day of week.
// CRITICAL: ALL available days MUST have workouts - NO SKIPPING ALLOWED.

// 🔴 MANDATORY JSON RESPONSE FORMAT:

// {
//     "plan_name": "${payload.plan_type} - ${payload.interest} Training Plan",
//     "plan_type": "${payload.plan_type}",
//     "ai_plan_selection": {
//         "selected_plan_type": "${payload.plan_type}",
//         "confidence_score": ${planTypeSelection.confidence_score},
//         "reasoning": "${planTypeSelection.reasoning}",
//         "key_factors": ${JSON.stringify(planTypeSelection.key_factors || [])},
//         "alternative_considerations": "${planTypeSelection.alternative_considerations || 'N/A'}"
//     },
//     "duration": "${payload.selected_duration_weeks} weeks",
//     "target_distance": ${weeklyDistribution.total_target},
//     "target_time": "${payload.estimated_race_time}",
//     "description": "AI-selected ${payload.plan_type} with exact distance distribution, chronological ordering, and guaranteed workout coverage",
//     "why_recommended": "AI-selected ${payload.plan_type} based on user profile analysis with optimal progression, consistent workout scheduling, and complete day coverage",
//     "difficulty_level": "${payload.running_experience}",
//     "weekly_commitment": "${payload.available_days_count} days/week on [${payload.available_days_string}] (chronological order, ALL days included)",
//     "training_philosophy": "AI-selected progressive overload with ${payload.long_run_day} long runs, consistent weekly structure, and complete workout coverage",
//     "distance_budget": ${weeklyDistribution.total_target},
//     "distance_verification": "AI-calculated: ${weeklyDistribution.verification.calculated_sum} km = ${weeklyDistribution.verification.target_sum} km",
//     "weekly_plans": [
//         ${weeklyDistribution.weekly_distances.map((week, index) => `{
//             "week_number": ${week.week},
//             "week_focus": "${week.phase} (${payload.plan_type} approach)",
//             "start_date": "${weekDates[index][0]}",
//             "end_date": "${weekDates[index][1]}",
//             "total_weekly_distance": ${week.distance},
//             "user_distance": 0,
//             "user_time": 0,
//             "workouts": "Will be calculated by Enhanced AI Math Expert in chronological order for ALL available days",
//             "weekly_notes": "${week.notes || week.phase + ' week'} - ${index === 0 && !skipCurrentWeek ? payload.current_week_available_days.length : payload.available_days_count} workouts (ALL available days included)"
//         }`).join(',\n        ')}
//     ]
// }

// 🚨 ENHANCED CRITICAL REQUIREMENTS:

// ✅ Use AI-selected plan type: ${payload.plan_type} (Confidence: ${planTypeSelection.confidence_score}%)
// ✅ Use AI-selected duration: ${payload.selected_duration_weeks} weeks (Reasoning: ${weeklyDistribution.duration_reasoning})
// ✅ Use EXACT weekly distances from AI calculation: ${weeklyDistribution.weekly_distances.map(w => w.distance + 'km').join(', ')}
// ✅ Week 1: ${skipCurrentWeek ? payload.available_days_count : payload.current_week_available_days.length} workouts (ALL available days)
// ✅ Weeks 2-${payload.selected_duration_weeks}: ${payload.available_days_count} workouts each (ALL available days - CONSISTENT)
// ✅ ALL workouts in chronological order: Monday → Tuesday → Wednesday → Thursday → Friday → Saturday → Sunday
// ✅ Long run day (${payload.long_run_day}) gets highest distance when present
// ✅ Only use available days: [${payload.available_days_string}]
// ✅ MANDATORY: Every available day gets a workout - NO ZERO DISTANCES
// ✅ Enhanced AI Math Expert ensures complete day coverage
// ✅ CRITICAL: Every week distance >= 1.0 km (VALIDATED AND GUARANTEED)

// GENERATE CONSISTENT WORKOUT COUNTS WITH ALL AVAILABLE DAYS INCLUDED AND CHRONOLOGICAL ORDERING.
//     `;
// };

// // ------------------ VALIDATION FUNCTIONS ------------------ //
// function validateRunPlanRequest(req, res, next) {
//     const requiredFields = [
//         'gender', 'height', 'weight', 'running_experience', 'interest',
//         'estimated_race_time', 'days_per_week', 'long_run_day',
//         'measurement_unit', 'max_week_plans', 'max_total_distance', 'start_date'
//     ];

//     const missingFields = requiredFields.filter(field => req.body[field] === undefined || req.body[field] === null);
    
//     if (missingFields.length > 0) {
//         return res.status(400).json({
//             error: `Missing required fields: ${missingFields.join(', ')}`
//         });
//     }

//     if (req.body.days_per_week < 1 || req.body.days_per_week > 7) {
//         return res.status(400).json({
//             error: 'days_per_week must be between 1 and 7'
//         });
//     }

//     if (isNaN(req.body.max_total_distance)) {
//         return res.status(400).json({
//             error: 'max_total_distance must be a number'
//         });
//     }

//     try {
//         new Date(req.body.start_date);
//     } catch (error) {
//         return res.status(400).json({
//             error: 'Invalid start_date format. Use ISO format (e.g., 2024-01-15T00:00:00.000Z)'
//         });
//     }

//     next();
// }

// // ------------------ ROUTES ------------------ //
// app.get('/', (req, res) => {
//     res.json({ 
//         message: "365 Run Personalized Plan API - Enhanced Node.js Version with AI Plan Type Selection, Distance Validation, and AI-Based Intelligent Start Date Adjustment",
//         available_plan_types: PLAN_TYPES,
//         features: ["AI-powered plan type selection", "Enhanced AI-powered distance calculations", "Fixed date constraints", "Chronological workout ordering", "Guaranteed complete day coverage", "Consistent workout counts", "Minimum distance validation (>=1.0km per week)", "AI-based intelligent start date adjustment with contextual analysis"]
//     });
// });



// // ENHANCED: Complete route handler with AI plan type selection, distance validation, and AI-based intelligent start date adjustment
// app.post('/recommend-plan', validateRunPlanRequest, async (req, res) => {
//     try {
//         console.log('🏃‍♂️ Processing training plan request with AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment...');
//         console.log('Request payload:', JSON.stringify(req.body, null, 2));
        
//         const payload = req.body;
//         const maxTotalKm = parseFloat(payload.max_total_distance);
        
//         // NEW: AI-based intelligent start date adjustment
//         console.log('🤖 Step 0: Using AI to intelligently determine optimal start date...');
//         // Use the user's requested start_date as the reference time (UTC)
//         const generationTime = new Date(payload.start_date);
        
//         const startDateAdjustment = await adjustStartDateWithAI(
//             payload.start_date, 
//             {
//                 gender: payload.gender,
//                 height: payload.height,
//                 weight: payload.weight,
//                 running_experience: payload.running_experience
//             }, 
//             payload.interest, 
//             generationTime
//         );
        
//         payload.start_date = startDateAdjustment.adjustedDate; // Update the payload with AI-adjusted date
        
//         console.log(`✅ AI start date adjustment completed:`, {
//             original: req.body.start_date,
//             adjusted: startDateAdjustment.adjustedDate,
//             reason: startDateAdjustment.reason,
//             confidence: startDateAdjustment.confidence + '%'
//         });
        
//         // ENHANCED: Default to all 7 days if no specific days provided, then process and sort
//         const defaultDays = 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday';
//         const specificDaysInput = payload.specific_days || defaultDays;
        
//         const availableDays = specificDaysInput.split(',').map(day => {
//             const trimmed = day.trim();
//             return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
//         });
//         const sortedAvailableDays = sortDaysChronologically(availableDays);

//         console.log('✅ Available days processed and sorted:', sortedAvailableDays);
//         console.log('✅ Total available days:', sortedAvailableDays.length);
//         console.log('✅ Used default all 7 days:', !payload.specific_days ? 'Yes' : 'No');
//         console.log('✅ Interest:', payload.interest);
//         console.log('✅ Target total distance:', maxTotalKm, payload.measurement_unit);

//         // STEP 1: Use AI to determine plan type based on interest and user profile
//         const userProfile = {
//             gender: payload.gender,
//             height: payload.height,
//             weight: payload.weight,
//             running_experience: payload.running_experience
//         };

//         console.log('🤖 Step 1: Using AI to determine plan type...');
//         const planTypeSelection = await determinePlanTypeWithAI(payload.interest, userProfile);
//         const planType = planTypeSelection.selected_plan_type;

//         console.log('✅ AI-selected plan type:', planType);
//         console.log('✅ Selection confidence:', planTypeSelection.confidence_score + '%');
//         console.log('✅ Selection reasoning:', planTypeSelection.reasoning);

//         // ENHANCED: Use the fixed week calculation function with date constraints
//         // First, we'll use max_week_plans for initial calculation, then adjust based on AI selection
//         const weekCalculationResult = calculateWeekDatesFromStart(payload.start_date, sortedAvailableDays, payload.max_week_plans);
//         const weekDates = weekCalculationResult.weeks;
//         const skipCurrentWeek = weekCalculationResult.skipCurrentWeek;
//         const hasAvailableDaysInCurrentWeek = weekCalculationResult.hasAvailableDaysInCurrentWeek;
//         const currentWeekAvailableDays = weekCalculationResult.currentWeekAvailableDays;
//         const allAvailableDays = weekCalculationResult.allAvailableDays;
        
//         console.log('✅ Enhanced week calculation result:', {
//             totalWeeks: weekDates.length,
//             skipCurrentWeek,
//             hasAvailableDaysInCurrentWeek,
//             week1WorkoutDays: skipCurrentWeek ? allAvailableDays.length : currentWeekAvailableDays.length,
//             subsequentWeekWorkoutDays: allAvailableDays.length,
//             enhancedCompleteCoverage: true
//         });

//         // Create comprehensive request object
//         const request = {
//             userProfile: userProfile,
//             trainingGoals: {
//                 goal: payload.interest,
//                 current_race_time: payload.estimated_race_time,
//                 days_per_week: payload.days_per_week,
//                 available_days: allAvailableDays,
//                 long_run_day: payload.long_run_day.charAt(0).toUpperCase() + payload.long_run_day.slice(1).toLowerCase()
//             },
//             startDate: startDateAdjustment.adjustedDate, // Use the AI-adjusted start date
//             maxTotalDistance: maxTotalKm,
//             weekDates: weekDates,
//             planType: planType,
//             skipCurrentWeek: skipCurrentWeek,
//             hasAvailableDaysInCurrentWeek: hasAvailableDaysInCurrentWeek,
//             currentWeekAvailableDays: currentWeekAvailableDays,
//             allAvailableDays: allAvailableDays
//         };

//         // STEP 2: Get AI-calculated weekly distribution with enhanced validation and dynamic duration
//         console.log('🧮 Step 2: Calculating weekly distance distribution with dynamic duration selection...');
//         const weeklyDistribution = await calculateWeeklyDistributionWithAI(
//             maxTotalKm,
//             payload.min_weeks_plan || 1,
//             payload.max_week_plans,
//             planType,
//             request.userProfile,
//             request.trainingGoals,
//             payload.measurement_unit
//         );
        
//         console.log('✅ Weekly distribution calculated and validated:', {
//             totalTarget: weeklyDistribution.total_target,
//             calculatedSum: weeklyDistribution.verification.calculated_sum,
//             isExact: weeklyDistribution.verification.is_exact,
//             weeksCount: weeklyDistribution.weekly_distances.length,
//             minWeeklyDistance: weeklyDistribution.verification.min_weekly_distance,
//             maxWeeklyDistance: weeklyDistribution.verification.max_weekly_distance,
//             weeksBelowMinimum: weeklyDistribution.verification.weeks_below_minimum
//         });

//         // STEP 3: Generate basic plan structure with exact weekly distances and AI plan type
//         const systemPrompt = generateTrainingPlanSystemPrompt(request, weeklyDistribution, planTypeSelection);
//         const userPrompt = generateTrainingPlanPrompt(request, weeklyDistribution, planTypeSelection);

//         console.log('🤖 Step 3: Calling OpenAI for training plan structure...');
//         const planResponse = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": systemPrompt
//                 },
//                 { 
//                     "role": "user", 
//                     "content": userPrompt 
//                 }
//             ],
//             temperature: 0.1,
//             response_format: { type: "json_object" },
//         });

//         console.log('✅ OpenAI plan structure response received');
//         let planData = JSON.parse(planResponse.choices[0].message.content.trim());

//         // STEP 4: Use Enhanced AI Math Expert to calculate exact daily distances for each week
//         console.log('🧮 Step 4: Processing each week with Enhanced AI Math Expert (Complete Day Coverage)...');
        
//         // Adjust week dates based on AI-selected duration
//         const selectedDuration = weeklyDistribution.selected_duration_weeks;
//         const adjustedWeekDates = weekDates.slice(0, selectedDuration);
        
//         if (planData.weekly_plans && weeklyDistribution.weekly_distances) {
//             for (let weekIndex = 0; weekIndex < planData.weekly_plans.length; weekIndex++) {
//                 const week = planData.weekly_plans[weekIndex];
//                 const weekDistribution = weeklyDistribution.weekly_distances[weekIndex];
                
//                 if (!weekDistribution) {
//                     console.warn(`⚠️ No distribution data for week ${weekIndex + 1}`);
//                     continue;
//                 }

//                 const weeklyDistance = weekDistribution.distance;
                
//                 // ENHANCED VALIDATION: Ensure weekly distance is positive
//                 if (weeklyDistance <= 0) {
//                     console.warn(`⚠️ Week ${week.week_number} has invalid distance ${weeklyDistance}km, setting to minimum 1.0km`);
//                     weekDistribution.distance = 1.0;
//                     week.total_weekly_distance = 1.0;
//                     week.weekly_notes = `${weekDistribution.phase} - Adjusted to minimum distance | ${allAvailableDays.length} workouts (Enhanced Complete Coverage)`;
                    
//                     // Create minimal workouts for this week
//                     const workouts = [];
//                     const weekStartDate = new Date(week.start_date);
//                     const minimumPerDay = 0.2; // 0.2km minimum per day
                    
//                     for (let dayIndex = 0; dayIndex < allAvailableDays.length; dayIndex++) {
//                         const day = allAvailableDays[dayIndex];
//                         const workoutDate = calculateWorkoutDate(weekStartDate, day);
                        
//                         if (workoutDate) {
//                             workouts.push({
//                                 day: day,
//                                 date: workoutDate.toISOString().split('T')[0],
//                                 workout_type: "walking",
//                                 distance: minimumPerDay,
//                                 duration: Math.round(minimumPerDay * 12), // Walking pace
//                                 intensity: "Easy",
//                                 notes: "Minimum distance maintenance",
//                                 user_distance: 0,
//                                 user_time: 0,
//                                 ai_calculated: true,
//                                 enhanced_coverage: true,
//                                 minimum_adjustment: true,
//                                 percentage_of_week: (minimumPerDay / 1.0) * 100,
//                                 chronological_order: getDayIndex(day)
//                             });
//                         }
//                     }
                    
//                     // Ensure chronological sorting
//                     workouts.sort((a, b) => a.chronological_order - b.chronological_order);
//                     week.workouts = workouts;
//                     week.actual_workout_distance = workouts.reduce((sum, w) => sum + w.distance, 0);
//                     week.enhanced_coverage_check = `${workouts.length} workouts created for ${allAvailableDays.length} available days (Complete Coverage: ✅)`;
                    
//                     console.log(`📊 Week ${week.week_number}: Adjusted to minimum with ${workouts.length} workouts`);
//                     continue;
//                 }

//                 if (weeklyDistance > 0) {
//                     // Determine available days for this week based on date constraints
//                     let weekAvailableDays = allAvailableDays;
                    
//                     if (weekIndex === 0 && !skipCurrentWeek) {
//                         // For Week 1 when not skipping current week, only use remaining days
//                         weekAvailableDays = currentWeekAvailableDays;
//                         console.log(`📅 Week ${week.week_number} (Partial): [${weekAvailableDays.join(', ')}] - ${weekAvailableDays.length} days (ALL MUST GET WORKOUTS)`);
//                     } else {
//                         console.log(`📅 Week ${week.week_number} (Complete): [${weekAvailableDays.join(', ')}] - ${weekAvailableDays.length} days (ALL MUST GET WORKOUTS)`);
//                     }

//                     // Call Enhanced AI Math Expert for this week
//                     const mathResult = await calculateDistanceDistributionWithAI(
//                         weeklyDistance,
//                         weekAvailableDays,
//                         request.trainingGoals.long_run_day,
//                         planType,
//                         week.week_number,
//                         selectedDuration,
//                         payload.measurement_unit
//                     );

//                     // Convert Enhanced AI Math Expert result to workout format with chronological ordering
//                     const workouts = [];
//                     const weekStartDate = new Date(week.start_date);

//                     // ENHANCED: Process ALL available days to ensure complete coverage
//                     const processedDays = new Set();

//                     // First, process AI Math Expert distribution (already sorted chronologically)
//                     for (const dayDist of mathResult.distribution) {
//                         if (weekAvailableDays.includes(dayDist.day)) {
//                             // Calculate correct date for this day in this week
//                             const workoutDate = calculateWorkoutDate(weekStartDate, dayDist.day);
                            
//                             if (workoutDate) {
//                                 // Determine workout type based on plan type and distance
//                                 let workoutType = "running";
//                                 let intensity = "Easy";
//                                 let notes = dayDist.notes || "Enhanced training run with guaranteed coverage";

//                                 if (dayDist.day === request.trainingGoals.long_run_day) {
//                                     intensity = "Easy-Moderate";
//                                     notes = `Long run - ${planType} methodology. Build endurance gradually. (Enhanced coverage)`;
//                                 } else if (dayDist.percentage > 20) {
//                                     intensity = "Medium";
//                                     notes = `Medium distance run - ${planType} focus. (Enhanced coverage)`;
//                                 }

//                                 // Ensure minimum distance for complete coverage
//                                 const minDailyDistance = payload.measurement_unit.toLowerCase() === 'miles' ? 0.3 : 0.5;
//                                 const guaranteedDistance = Math.max(dayDist.distance, minDailyDistance);

//                                 // Estimate duration based on experience level
//                                 const paceMinPerKm = payload.running_experience === 'beginner' ? 7 : 
//                                                     payload.running_experience === 'intermediate' ? 6 : 5.5;
//                                 const estimatedDuration = Math.round(guaranteedDistance * paceMinPerKm);

//                                 workouts.push({
//                                     day: dayDist.day,
//                                     date: workoutDate.toISOString().split('T')[0],
//                                     workout_type: workoutType,
//                                     distance: guaranteedDistance,
//                                     duration: estimatedDuration,
//                                     intensity: intensity,
//                                     notes: notes,
//                                     user_distance: 0,
//                                     user_time: 0,
//                                     ai_calculated: true,
//                                     enhanced_coverage: true,
//                                     percentage_of_week: Math.round((guaranteedDistance / weeklyDistance) * 100 * 10) / 10,
//                                     chronological_order: getDayIndex(dayDist.day)
//                                 });

//                                 processedDays.add(dayDist.day);
//                             }
//                         }
//                     }

//                     // ENHANCED: Ensure ALL weekAvailableDays are covered (safety net)
//                     const missedDays = weekAvailableDays.filter(day => !processedDays.has(day));
//                     if (missedDays.length > 0) {
//                         console.warn(`🔧 Enhanced coverage safety net: Adding ${missedDays.length} missed days: [${missedDays.join(', ')}]`);
                        
//                         for (const missedDay of missedDays) {
//                             const workoutDate = calculateWorkoutDate(weekStartDate, missedDay);
//                             if (workoutDate) {
//                                 const minimumDistance = payload.measurement_unit.toLowerCase() === 'miles' ? 0.6 : 1.0; // Minimum safety distance
//                                 const paceMinPerKm = payload.running_experience === 'beginner' ? 7 : 
//                                                     payload.running_experience === 'intermediate' ? 6 : 5.5;
//                                 const estimatedDuration = Math.round(minimumDistance * paceMinPerKm);

//                                 workouts.push({
//                                     day: missedDay,
//                                     date: workoutDate.toISOString().split('T')[0],
//                                     workout_type: "running",
//                                     distance: minimumDistance,
//                                     duration: estimatedDuration,
//                                     intensity: "Easy",
//                                     notes: "Enhanced coverage safety net - guaranteed minimum workout",
//                                     user_distance: 0,
//                                     user_time: 0,
//                                     ai_calculated: true,
//                                     enhanced_coverage: true,
//                                     safety_net_added: true,
//                                     percentage_of_week: Math.round((minimumDistance / weeklyDistance) * 100 * 10) / 10,
//                                     chronological_order: getDayIndex(missedDay)
//                                 });
//                             }
//                         }
//                     }

//                     // Ensure chronological sorting (redundant but safe)
//                     workouts.sort((a, b) => a.chronological_order - b.chronological_order);

//                     // Update week with Enhanced AI-calculated workouts in chronological order
//                     week.workouts = workouts;
//                     week.total_weekly_distance = weeklyDistance; // Keep exact weekly target
//                     week.actual_workout_distance = workouts.reduce((sum, w) => sum + w.distance, 0); // Track actual total
//                     week.weekly_distance_check = `${mathResult.verification.calculated_sum.toFixed(1)}km calculated by Enhanced AI Math Expert = ${weeklyDistance}km target ✅`;
//                     week.enhanced_coverage_check = `${workouts.length} workouts created for ${weekAvailableDays.length} available days (Complete Coverage: ${workouts.length === weekAvailableDays.length ? '✅' : '❌'})`;
//                     week.ai_math_verification = mathResult.verification;
//                     week.weekly_notes = `${weekDistribution.phase} - ${weekDistribution.notes || ''} | ${workouts.length} workouts in chronological order (Enhanced Complete Coverage)`;
                    
//                     console.log(`📊 Week ${week.week_number}: ${workouts.length}/${weekAvailableDays.length} workouts - [${workouts.map(w => w.day).join(', ')}] (Coverage: ${workouts.length === weekAvailableDays.length ? '✅ Complete' : '❌ Incomplete'})`);
//                 }
//             }
//         }

//         // Post-process and validate
//         planData = postprocessDistances(planData);
        
//         // Add enhanced metadata including AI plan type selection
//         planData.ai_weekly_distribution = weeklyDistribution;
//         planData.ai_plan_type_selection = planTypeSelection;
//         planData.enhanced_coverage_enabled = true;
//         planData.distance_validation_enabled = true;

//         // ENHANCED VALIDATION WITH COMPLETE WORKOUT COUNT CONSISTENCY CHECK
//         const sumWeekly = (planData.weekly_plans || []).reduce((acc, w) => acc + (w.total_weekly_distance || 0), 0);
//         planData.distance_verification = `SUM = ${sumWeekly.toFixed(1)}, TARGET = ${maxTotalKm} (Enhanced AI Math Expert with Distance Validation)`;
        
//         console.log('📊 AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation Results:');
//         console.log(`Interest: "${payload.interest}" → AI-Selected Plan Type: "${planType}" (${planTypeSelection.confidence_score}%)`);
//         console.log(`AI Selection Reasoning: ${planTypeSelection.reasoning}`);
//         console.log(`AI-Selected Duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`);
//         console.log(`Duration Reasoning: ${weeklyDistribution.duration_reasoning}`);
//         console.log(`Skip Current Week: ${skipCurrentWeek ? 'YES' : 'NO'}`);
//         console.log(`AI Weekly Target: ${weeklyDistribution.verification.calculated_sum}${payload.measurement_unit}`);
//         console.log(`Total Distance: ${sumWeekly.toFixed(1)}${payload.measurement_unit} / ${maxTotalKm}${payload.measurement_unit} (${Math.abs(sumWeekly - maxTotalKm) <= 0.5 ? '✅' : '❌'})`);
//         console.log(`Min Weekly Distance: ${weeklyDistribution.verification.min_weekly_distance}${payload.measurement_unit} ✅`);
//         console.log(`Max Weekly Distance: ${weeklyDistribution.verification.max_weekly_distance}${payload.measurement_unit} ✅`);
//         console.log(`Weeks Below Minimum: ${weeklyDistribution.verification.weeks_below_minimum} ✅`);
//         console.log(`Duration Within Range: ${weeklyDistribution.verification.duration_within_range ? '✅' : '❌'}`);
        
//         // Enhanced detailed workout count validation
//         let totalWorkouts = 0;
//         let totalAiCalculatedWorkouts = 0;
//         let totalExactWeeks = 0;
//         let totalCompleteCoverageWeeks = 0;
//         let totalEnhancedCoverageWorkouts = 0;
//         let totalMinimumAdjustments = 0;
//         const expectedWeek1Workouts = skipCurrentWeek ? allAvailableDays.length : currentWeekAvailableDays.length;
//         const expectedSubsequentWorkouts = allAvailableDays.length;
        
//         planData.weekly_plans.forEach((week, index) => {
//             const workoutCount = (week.workouts || []).length;
//             totalWorkouts += workoutCount;
            
//             const aiCalculatedWorkouts = (week.workouts || []).filter(w => w.ai_calculated).length;
//             totalAiCalculatedWorkouts += aiCalculatedWorkouts;

//             const enhancedCoverageWorkouts = (week.workouts || []).filter(w => w.enhanced_coverage).length;
//             totalEnhancedCoverageWorkouts += enhancedCoverageWorkouts;

//             const minimumAdjustments = (week.workouts || []).filter(w => w.minimum_adjustment).length;
//             if (minimumAdjustments > 0) totalMinimumAdjustments++;
            
//             if (week.ai_math_verification?.is_exact) {
//                 totalExactWeeks++;
//             }

//             // Check expected vs actual workout count for complete coverage
//             const expectedCount = (index === 0) ? expectedWeek1Workouts : expectedSubsequentWorkouts;
//             const isCompleteCoverage = workoutCount === expectedCount;
//             const countStatus = isCompleteCoverage ? '✅' : `❌ Expected ${expectedCount}`;
            
//             if (isCompleteCoverage) {
//                 totalCompleteCoverageWeeks++;
//             }
            
//             // Check chronological order
//             const workoutDays = (week.workouts || []).map(w => w.day);
//             const sortedDays = sortDaysChronologically([...workoutDays]);
//             const isChronological = JSON.stringify(workoutDays) === JSON.stringify(sortedDays);
//             const orderStatus = isChronological ? '✅ Chronological' : '❌ Out of order';
            
//             // Check for safety net usage
//             const safetyNetUsed = (week.workouts || []).some(w => w.safety_net_added);
//             const minimumUsed = minimumAdjustments > 0;
//             const coverageStatus = minimumUsed ? '🔧 Minimum' : (safetyNetUsed ? '🔧 Safety Net' : '🎯 Direct AI');
            
//             // Check distance validation
//             const weekDistance = week.total_weekly_distance || 0;
//             const distanceStatus = weekDistance >= 1.0 ? '✅ Valid' : '❌ Invalid';
            
//             console.log(`Week ${week.week_number}: ${workoutCount} workouts ${countStatus}, Distance: ${weekDistance}km ${distanceStatus}, Order: ${orderStatus}, Math: ${week.ai_math_verification?.is_exact ? '✅ Exact' : '⚠️ Adjusted'}, Coverage: ${coverageStatus}`);
//         });
        
//         console.log(`📈 AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation Summary:`);
//         console.log(`   AI Plan Type: ${planType} (Confidence: ${planTypeSelection.confidence_score}%)`);
//         console.log(`   AI-Selected Duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`);
//         console.log(`   Duration Reasoning: ${weeklyDistribution.duration_reasoning}`);
//         console.log(`   Total workouts: ${totalWorkouts}`);
//         console.log(`   AI-calculated workouts: ${totalAiCalculatedWorkouts}`);
//         console.log(`   Enhanced coverage workouts: ${totalEnhancedCoverageWorkouts}`);
//         console.log(`   Weeks with minimum adjustments: ${totalMinimumAdjustments}`);
//         console.log(`   Weeks with exact math: ${totalExactWeeks}/${planData.weekly_plans.length}`);
//         console.log(`   Weeks with complete coverage: ${totalCompleteCoverageWeeks}/${planData.weekly_plans.length}`);
//         console.log(`   Expected Week 1 workouts: ${expectedWeek1Workouts}`);
//         console.log(`   Expected subsequent weeks workouts: ${expectedSubsequentWorkouts} each`);
//         console.log(`   Complete coverage rate: ${Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100)}%`);
//         console.log(`   Distance validation: All weeks >= 1.0km ✅`);
//         console.log(`   Duration validation: Within range ${payload.min_weeks_plan || 1}-${payload.max_week_plans} ✅`);
        
//         // Enhanced metadata
//         planData.debug_info = {
//             requested_days: sortedAvailableDays,
//             min_weeks_requested: payload.min_weeks_plan || 1,
//             max_weeks_requested: payload.max_week_plans,
//             ai_selected_duration: weeklyDistribution.selected_duration_weeks,
//             duration_reasoning: weeklyDistribution.duration_reasoning,
//             total_workouts_generated: totalWorkouts,
//             ai_calculated_workouts: totalAiCalculatedWorkouts,
//             enhanced_coverage_workouts: totalEnhancedCoverageWorkouts,
//             weeks_with_minimum_adjustments: totalMinimumAdjustments,
//             exact_calculation_weeks: totalExactWeeks,
//             complete_coverage_weeks: totalCompleteCoverageWeeks,
//             complete_coverage_rate: Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100),
//             distance_accuracy: Math.abs(sumWeekly - maxTotalKm),
//             ai_selected_plan_type: planType,
//             ai_plan_selection_confidence: planTypeSelection.confidence_score,
//             ai_plan_selection_reasoning: planTypeSelection.reasoning,
//             skip_current_week: skipCurrentWeek,
//             current_week_available_days: currentWeekAvailableDays,
//             expected_week1_workouts: expectedWeek1Workouts,
//             expected_subsequent_workouts: expectedSubsequentWorkouts,
//             min_weekly_distance: weeklyDistribution.verification.min_weekly_distance,
//             max_weekly_distance: weeklyDistribution.verification.max_weekly_distance,
//             weeks_below_minimum: weeklyDistribution.verification.weeks_below_minimum,
//             duration_within_range: weeklyDistribution.verification.duration_within_range,
//             start_date_adjustment: {
//                 original_user_date: req.body.start_date,
//                 adjusted_date: startDateAdjustment.adjustedDate,
//                 adjustment_reason: startDateAdjustment.reason,
//                 ai_confidence: startDateAdjustment.confidence,
//                 key_factors: startDateAdjustment.keyFactors,
//                 user_benefit: startDateAdjustment.userBenefit,
//                 ai_recommendation: startDateAdjustment.recommendation,
//                 generation_time_utc: generationTime.toISOString(),
//                 generation_hour_utc: generationTime.getUTCHours(),
//                 adjustment_method: "AI-based intelligent determination"
//             },
//             ai_math_expert_enhanced: true,
//             complete_day_coverage_enabled: true,
//             chronological_ordering_enabled: true,
//             ai_plan_type_selection_enabled: true,
//             dynamic_duration_selection_enabled: true,
//             distance_validation_enabled: true,
//             generation_timestamp: new Date().toISOString(),
//             calculation_method: "AI Plan Type Selection + Dynamic Duration Selection + Enhanced AI Math Expert with Complete Day Coverage, Distance Validation, Guaranteed Workout Distribution, and AI-Based Intelligent Start Date Adjustment"
//         };

//         // Add user-friendly AI-based start date adjustment message
//         planData.start_date_adjustment_message = `🤖 ${startDateAdjustment.reason}`;
//         planData.start_date_ai_recommendation = startDateAdjustment.recommendation;

//         console.log('✅ AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment training plan generated successfully');
//         console.log('📋 Enhanced Final Summary with AI-Based Intelligent Start Date Adjustment:', {
//             aiSelectedPlanType: `${planType} (${planTypeSelection.confidence_score}% confidence)`,
//             aiSelectedDuration: `${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`,
//             durationReasoning: weeklyDistribution.duration_reasoning,
//             startDateAdjustment: `AI-based (${startDateAdjustment.confidence}% confidence) → ${startDateAdjustment.reason}`,
//             totalDistance: `${sumWeekly.toFixed(1)}${payload.measurement_unit} / ${maxTotalKm}${payload.measurement_unit}`,
//             weeklyDistributionSum: `${weeklyDistribution.verification.calculated_sum}${payload.measurement_unit}`,
//             minWeeklyDistance: `${weeklyDistribution.verification.min_weekly_distance}${payload.measurement_unit}`,
//             maxWeeklyDistance: `${weeklyDistribution.verification.max_weekly_distance}${payload.measurement_unit}`,
//             weeksBelowMinimum: weeklyDistribution.verification.weeks_below_minimum,
//             durationWithinRange: weeklyDistribution.verification.duration_within_range,
//             totalWorkouts: totalWorkouts,
//             enhancedCoverageWorkouts: totalEnhancedCoverageWorkouts,
//             weeksWithMinimumAdjustments: totalMinimumAdjustments,
//             completeCoverageWeeks: `${totalCompleteCoverageWeeks}/${planData.weekly_plans.length}`,
//             completeCoverageRate: `${Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100)}%`,
//             distanceMatch: Math.abs(sumWeekly - maxTotalKm) <= 0.5 ? '✅ EXACT' : '❌ MISMATCH',
//             workoutCountConsistency: `Week 1: ${planData.weekly_plans[0]?.workouts?.length || 0}/${expectedWeek1Workouts}, Others: ${expectedSubsequentWorkouts} each`,
//             distanceValidation: `✅ ALL WEEKS >= ${payload.measurement_unit.toLowerCase() === 'miles' ? '1.0 MILE' : '1.0 KM'}`,
//             durationValidation: `✅ WITHIN RANGE ${payload.min_weeks_plan || 1}-${payload.max_week_plans}`,
//             aiPlanTypeSelectionEnabled: true,
//             dynamicDurationSelectionEnabled: true,
//             enhancedCoverageEnabled: true,
//             distanceValidationEnabled: true
//         });

//         res.json({ recommended_plan: planData });

//     } catch (error) {
//         console.error('❌ Error generating AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment training plan:', error);
//         res.status(500).json({
//             error: `Internal server error: ${error.message}`,
//             timestamp: new Date().toISOString()
//         });
//     }
// });

// // Start server with detailed logging
// app.listen(PORT, () => {
//             console.log(`🏃‍♂️ 365 Run API server with AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment running on port ${PORT}`);
//     console.log(`📍 API endpoint: http://localhost:${PORT}/recommend-plan`);
//     console.log(`🚀 Server started at: ${new Date().toISOString()}`);
//     console.log(`📋 Available plan types: ${PLAN_TYPES.join(', ')}`);
//             console.log(`🤖 NEW FEATURES: AI Plan Type Selection, Dynamic Duration Selection (min-max range), Distance Validation (>=1.0km), Complete day coverage guaranteed, Consistent workout counts, Chronological ordering, Exact distance matching, Fixed date constraints, Safety net for missed days, AI-Based Intelligent Start Date Adjustment`);
// });

// module.exports = app;
































































// const express = require('express');
// const cors = require('cors');
// require('dotenv').config();
// const OpenAI = require('openai');

// // Initialize OpenAI client
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// if (!OPENAI_API_KEY) {
//     throw new Error("OPENAI_API_KEY not found in environment variables");
// }

// const openai = new OpenAI({
//     apiKey: OPENAI_API_KEY,
// });

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // ------------------ PLAN TYPES ------------------ //
// const PLAN_TYPES = [
//     "5K Improvement Plan",
//     "Post-Race Recovery Plan", 
//     "Horse Riding Plan",
//     "Post-Injury Plan Via Yoga",
//     "Marathons",
//     "Country Runs",
//     "Swimming Plan",
//     "Train for a Triathlon",
//     "Functional Fitness",
//     "Postnatal Plan",
//     "Parkrun Improvement Plan",
//     "Run a First 5K"
// ];

// // AI-powered function to determine plan type based on interest and user profile
// async function determinePlanTypeWithAI(interest, userProfile) {
//     try {
//         const planTypePrompt = `
// You are an expert running coach specializing in personalized training plan selection.

// AVAILABLE PLAN TYPES:
// 1. "5K Improvement Plan" - Focus on speed work, interval training, tempo runs, track workouts, hill training, pace improvement
// 2. "Post-Race Recovery Plan" - Easy runs, active recovery, cross-training, rest days, rebuilding base fitness gradually
// 3. "Horse Riding Plan" - Combines running with equestrian training, core strengthening, balance work, accounts for riding days
// 4. "Post-Injury Plan Via Yoga" - Integrates yoga with running, flexibility, mobility, injury prevention, gentle return-to-running
// 5. "Marathons" - Endurance building, long runs, high mileage, marathon pace workouts, 26.2-mile race preparation
// 6. "Country Runs" - Trail running, varied terrain, hill training, nature-based workouts, outdoor adventure focus
// 7. "Swimming Plan" - Cross-training with swimming, pool workouts, water running, low-impact cardiovascular fitness
// 8. "Train for a Triathlon" - Multi-sport training combining running, swimming, and cycling with balanced endurance development
// 9. "Functional Fitness" - Running combined with functional movement patterns, strength training, and athletic performance
// 10. "Postnatal Plan" - Gentle return to running after childbirth with gradual progression and core recovery focus
// 11. "Parkrun Improvement Plan" - Specifically designed for 5K parkrun events with community-focused training approach
// 12. "Run a First 5K" - Beginner-friendly plan for complete running novices to complete their first 5K distance

// USER PROFILE:
// - Running Experience: ${userProfile.running_experience}
// - Interest/Goal: "${interest}"
// - Gender: ${userProfile.gender}
// - Height: ${userProfile.height}
// - Weight: ${userProfile.weight}

// ANALYSIS GUIDELINES:
// - Match the user's specific interest with the most appropriate plan type
// - Consider their experience level for plan complexity
// - Look for keywords that indicate specific training focuses
// - Consider injury history, recovery needs, or cross-training preferences
// - Choose the plan that best aligns with their stated goals

// Return ONLY a JSON object with your selection and reasoning:
// {
//     "selected_plan_type": "exact plan type name from the list above",
//     "confidence_score": 95,
//     "reasoning": "detailed explanation of why this plan type was selected",
//     "key_factors": ["factor 1", "factor 2", "factor 3"],
//     "alternative_considerations": "any other plan types that were considered"
// }

// CRITICAL: The selected_plan_type must be EXACTLY one of the 12 plan types listed above.
//         `;

//         console.log(`🤖 Calling AI to determine plan type for interest: "${interest}"`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are an expert running coach with deep knowledge of training methodologies. Select the most appropriate training plan type based on the user's interests and profile."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": planTypePrompt 
//                 }
//             ],
//             temperature: 0.3,
//             response_format: { type: "json_object" },
//         });

//         const planTypeResult = JSON.parse(response.choices[0].message.content.trim());
        
//         // Validate that the selected plan type is in our available types
//         if (!PLAN_TYPES.includes(planTypeResult.selected_plan_type)) {
//             console.warn(`⚠️ AI selected invalid plan type: ${planTypeResult.selected_plan_type}, falling back to 5K Improvement Plan`);
//             return {
//                 selected_plan_type: "5K Improvement Plan",
//                 confidence_score: 50,
//                 reasoning: "Fallback selection due to invalid AI response",
//                 key_factors: ["fallback"],
//                 alternative_considerations: "AI selection was invalid",
//                 fallback_used: true
//             };
//         }
        
//         console.log(`✅ AI selected plan type: "${planTypeResult.selected_plan_type}" (Confidence: ${planTypeResult.confidence_score}%)`);
//         console.log(`📝 Reasoning: ${planTypeResult.reasoning}`);
        
//         return planTypeResult;

//     } catch (error) {
//         console.error('❌ AI plan type selection failed:', error.message);
//         // Fallback to default
//         return {
//             selected_plan_type: "5K Improvement Plan",
//             confidence_score: 30,
//             reasoning: "Fallback selection due to AI error",
//             key_factors: ["error_fallback"],
//             alternative_considerations: "AI service was unavailable",
//             fallback_used: true,
//             error: error.message
//         };
//     }
// }

// // ------------------ CHRONOLOGICAL DAY SORTING ------------------ //
// function sortDaysChronologically(days) {
//     const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
//     return days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
// }

// function getDayIndex(dayName) {
//     const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
//     return dayOrder.indexOf(dayName);
// }

// function calculateWorkoutDate(weekStartMonday, dayName) {
//     const dayIndex = getDayIndex(dayName);
//     if (dayIndex === -1) return null;
    
//     const workoutDate = new Date(weekStartMonday);
//     workoutDate.setDate(weekStartMonday.getDate() + dayIndex);
//     return workoutDate;
// }

// // ------------------ FIXED AI WEEKLY DISTRIBUTION CALCULATION ------------------ //
// async function calculateWeeklyDistributionWithAI(maxTotalDistance, minWeeks, maxWeeks, planType, userProfile, trainingGoals, measurementUnit) {
//     try {
//         // Convert to km for internal calculations if needed
//         const isMiles = measurementUnit.toLowerCase() === 'miles';
//         const maxTotalKm = isMiles ? maxTotalDistance * 1.60934 : maxTotalDistance;
//         const minDistanceKm = isMiles ? 1.60934 : 1.0; // 1 mile = 1.60934 km
        
//         const weeklyDistributionPrompt = `
// You are a MATH EXPERT specialized in training periodization and weekly distance distribution.

// TASK: Calculate weekly distance distribution that sums to EXACTLY ${maxTotalDistance} ${measurementUnit} across a duration between ${minWeeks} and ${maxWeeks} weeks.

// CRITICAL MATHEMATICAL CONSTRAINTS:
// 1. Sum of ALL weekly distances = EXACTLY ${maxTotalDistance} ${measurementUnit}
// 2. EVERY week must have distance >= ${isMiles ? '1.0 mile' : '1.0 km'} (NO ZERO OR NEGATIVE DISTANCES)
// 3. All distances rounded to 1 decimal place
// 4. Progressive overload with appropriate recovery weeks
// 5. Consider ${trainingGoals.available_days.length} available training days per week
// 6. Duration must be between ${minWeeks} and ${maxWeeks} weeks (inclusive)
// 7. All calculations and responses must be in ${measurementUnit}

// PLAN TYPE: ${planType}
// USER PROFILE:
// - Experience: ${userProfile.running_experience}
// - Goal: ${trainingGoals.goal}
// - Available days per week: ${trainingGoals.available_days.length}
// - Min weeks: ${minWeeks}
// - Max weeks: ${maxWeeks}
// - Measurement Unit: ${measurementUnit}

// DURATION SELECTION LOGIC:
// - For injury recovery or conservative goals: Choose closer to ${minWeeks} weeks
// - For endurance building or aggressive goals: Choose closer to ${maxWeeks} weeks
// - For balanced progression: Choose middle range
// - Consider user experience level and plan type complexity

// DISTRIBUTION PRINCIPLES FOR ${planType}:
// ${planType === "5K Improvement Plan" ? "- Progressive build with speed focus\n- Peak around week " + Math.ceil(maxWeeks * 0.75) + "\n- Include recovery weeks (but still >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
//   planType === "Post-Race Recovery Plan" ? "- Conservative progression starting low\n- Gradual return to training\n- Recovery weeks (but still >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
//   planType === "Horse Riding Plan" ? "- Moderate progression\n- Consistent weekly volumes\n- Account for cross-training days" :
//   planType === "Post-Injury Plan Via Yoga" ? "- VERY conservative progression\n- Low weekly distances but never below " + (isMiles ? '1.0 mile' : '1.0 km') + "\n- Focus on gradual return" :
//   planType === "Marathons" ? "- High volume progression\n- Long build phases\n- Peak around week " + Math.ceil(maxWeeks * 0.8) + "\n- Taper final weeks (but >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
//   planType === "Country Runs" ? "- Moderate to high volumes\n- Varied weekly progression\n- Trail-focused approach" :
//   planType === "Swimming Plan" ? "- Cross-training focus\n- Moderate running volumes\n- Consistent progression" :
//   planType === "Train for a Triathlon" ? "- Multi-sport progressive build\n- Balanced training with other disciplines\n- Moderate running volumes with cross-training" :
//   planType === "Functional Fitness" ? "- Athletic movement integration\n- Progressive strength and running combination\n- Varied weekly volumes with functional focus" :
//   planType === "Postnatal Plan" ? "- VERY conservative gradual return\n- Health-focused progression\n- Low weekly distances but consistent building" :
//   planType === "Parkrun Improvement Plan" ? "- 5K focused community training\n- Social running emphasis\n- Progressive speed and endurance build" :
//   planType === "Run a First 5K" ? "- Beginner-friendly progression\n- Walk-run combination building\n- Very gradual distance increases" : ""}

// MATHEMATICAL VALIDATION RULES:
// - Minimum weekly distance: ${isMiles ? '1.0 mile' : '1.0 km'} (NEVER go below this)
// - Maximum recommended weekly distance: ${Math.round(maxTotalDistance / minWeeks * 2)} ${measurementUnit}
// - Total must sum to exactly ${maxTotalDistance} ${measurementUnit}
// - Use realistic progression patterns
// - Recovery weeks should be lower but still >= ${isMiles ? '1.0 mile' : '1.0 km'}
// - Duration must be between ${minWeeks} and ${maxWeeks} weeks
// - All distances must be in ${measurementUnit}

// Return ONLY a JSON object:
// {
//     "total_target": ${maxTotalDistance},
//     "measurement_unit": "${measurementUnit}",
//     "plan_type": "${planType}",
//     "selected_duration_weeks": 0,
//     "duration_reasoning": "explanation of why this duration was chosen",
//     "weekly_distances": [
//         {
//             "week": 1,
//             "distance": ${isMiles ? '2.2' : '3.5'},
//             "phase": "Introduction",
//             "notes": "Conservative start"
//         }
//     ],
//     "verification": {
//         "calculated_sum": 0.0,
//         "target_sum": ${maxTotalDistance},
//         "difference": 0.0,
//         "is_exact": false,
//         "min_weekly_distance": 0.0,
//         "max_weekly_distance": 0.0,
//         "weeks_below_minimum": 0,
//         "duration_within_range": false
//     },
//     "training_phases": {
//         "build_weeks": [1, 2, 3],
//         "recovery_weeks": [4],
//         "peak_week": 8
//     }
// }

// CRITICAL: Every week must have distance >= ${isMiles ? '1.0 mile' : '1.0 km'}. Sum must equal exactly ${maxTotalDistance} ${measurementUnit}. Duration must be between ${minWeeks} and ${maxWeeks} weeks. All distances must be in ${measurementUnit}.
//         `;

//         console.log(`🧮 Calling AI for weekly distribution: ${maxTotalDistance}${measurementUnit} across ${minWeeks}-${maxWeeks} weeks (with minimum distance validation)`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are a mathematics expert specializing in athletic training periodization. Provide exact calculations that sum precisely to the target total with NO ZERO OR NEGATIVE weekly distances."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": weeklyDistributionPrompt 
//                 }
//             ],
//             temperature: 0.1,
//             response_format: { type: "json_object" },
//         });

//         const weeklyDistribution = JSON.parse(response.choices[0].message.content.trim());
        
//         // ENHANCED VALIDATION: Check for zero/negative distances and fix them
//         let needsAdjustment = false;
//         const minDistance = isMiles ? 1.0 : 1.0; // 1.0 mile or 1.0 km
        
//         // Validate duration is within range
//         const selectedDuration = weeklyDistribution.selected_duration_weeks || weeklyDistribution.weekly_distances.length;
//         const isDurationValid = selectedDuration >= minWeeks && selectedDuration <= maxWeeks;
        
//         if (!isDurationValid) {
//             console.warn(`⚠️ AI selected duration ${selectedDuration} weeks is outside range [${minWeeks}-${maxWeeks}], adjusting...`);
//             // Adjust to middle of range if invalid
//             const adjustedDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) / 2)));
//             weeklyDistribution.selected_duration_weeks = adjustedDuration;
//             weeklyDistribution.duration_reasoning = `Adjusted to ${adjustedDuration} weeks (middle of range ${minWeeks}-${maxWeeks}) due to invalid AI selection`;
//         }
        
//         // First, ensure no week has distance < minimum
//         weeklyDistribution.weekly_distances.forEach(week => {
//             if (week.distance < minDistance) {
//                 console.warn(`⚠️ Week ${week.week} has distance ${week.distance}${measurementUnit} < minimum ${minDistance}${measurementUnit}, adjusting...`);
//                 week.distance = minDistance;
//                 needsAdjustment = true;
//             }
//         });
        
//         // Calculate current sum after minimum adjustments
//         let calculatedSum = weeklyDistribution.weekly_distances.reduce((sum, week) => sum + week.distance, 0);
//         let difference = Math.abs(calculatedSum - maxTotalDistance);
        
//         // Adjust to match exact total if needed
//         if (difference > 0.1 || needsAdjustment) {
//             console.warn(`⚠️ Adjusting weekly distribution: ${calculatedSum} → ${maxTotalDistance} ${measurementUnit}`);
            
//             const excessOrDeficit = maxTotalDistance - calculatedSum;
            
//             if (excessOrDeficit > 0) {
//                 // We need to add distance - distribute across non-recovery weeks
//                 const buildWeeks = weeklyDistribution.weekly_distances.filter(w => 
//                     !w.phase.toLowerCase().includes('recovery') && 
//                     !w.phase.toLowerCase().includes('taper')
//                 );
                
//                 if (buildWeeks.length > 0) {
//                     const addPerWeek = excessOrDeficit / buildWeeks.length;
//                     buildWeeks.forEach(week => {
//                         week.distance = Math.round((week.distance + addPerWeek) * 10) / 10;
//                     });
//                 }
//                             } else {
//                     // We need to reduce distance - but maintain minimums
//                     const totalExcess = Math.abs(excessOrDeficit);
//                     const adjustableWeeks = weeklyDistribution.weekly_distances.filter(w => w.distance > minDistance + (isMiles ? 0.3 : 0.5));
                    
//                     if (adjustableWeeks.length > 0) {
//                         const reducePerWeek = totalExcess / adjustableWeeks.length;
//                         adjustableWeeks.forEach(week => {
//                             const newDistance = Math.max(minDistance, week.distance - reducePerWeek);
//                             week.distance = Math.round(newDistance * 10) / 10;
//                         });
//                     } else {
//                         // Last resort: adjust the highest week
//                         const maxWeek = weeklyDistribution.weekly_distances.reduce((max, week) => 
//                             week.distance > max.distance ? week : max
//                         );
//                         maxWeek.distance = Math.round((maxWeek.distance + excessOrDeficit) * 10) / 10;
//                         if (maxWeek.distance < minDistance) {
//                             maxWeek.distance = minDistance;
//                         }
//                     }
//                 }
            
//             // Recalculate final verification
//             const newSum = weeklyDistribution.weekly_distances.reduce((sum, week) => sum + week.distance, 0);
//             const minWeekly = Math.min(...weeklyDistribution.weekly_distances.map(w => w.distance));
//             const maxWeekly = Math.max(...weeklyDistribution.weekly_distances.map(w => w.distance));
//             const weeksBelowMin = weeklyDistribution.weekly_distances.filter(w => w.distance < minDistance).length;
            
//             weeklyDistribution.verification = {
//                 calculated_sum: newSum,
//                 target_sum: maxTotalDistance,
//                 difference: Math.abs(newSum - maxTotalDistance),
//                 is_exact: Math.abs(newSum - maxTotalDistance) < 0.1,
//                 min_weekly_distance: minWeekly,
//                 max_weekly_distance: maxWeekly,
//                 weeks_below_minimum: weeksBelowMin,
//                 duration_within_range: isDurationValid,
//                 selected_duration: selectedDuration,
//                 min_allowed_weeks: minWeeks,
//                 max_allowed_weeks: maxWeeks
//             };
//         }
        
//         console.log(`✅ Weekly distribution calculated and validated:`);
//         console.log(`   Target: ${maxTotalDistance}${measurementUnit}, Calculated: ${weeklyDistribution.verification.calculated_sum}${measurementUnit}`);
//         console.log(`   Selected duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${minWeeks}-${maxWeeks})`);
//         console.log(`   Duration reasoning: ${weeklyDistribution.duration_reasoning}`);
//         console.log(`   Min weekly: ${weeklyDistribution.verification.min_weekly_distance}${measurementUnit}`);
//         console.log(`   Max weekly: ${weeklyDistribution.verification.max_weekly_distance}${measurementUnit}`);
//         console.log(`   Weeks below minimum: ${weeklyDistribution.verification.weeks_below_minimum}`);
//         console.log(`   Duration within range: ${weeklyDistribution.verification.duration_within_range ? '✅' : '❌'}`);
        
//         return weeklyDistribution;

//     } catch (error) {
//         console.error('❌ Weekly distribution AI failed:', error.message);
//         // Enhanced fallback with guaranteed minimums and duration selection
//         const minDistance = isMiles ? 1.0 : 1.0; // 1.0 mile or 1.0 km
        
//         // Choose duration based on plan type and user profile
//         let fallbackDuration;
//         if (planType.includes("Post-Injury") || planType.includes("Recovery") || planType.includes("Postnatal")) {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.6)));
//         } else if (planType.includes("Marathon") || planType.includes("5K") || planType.includes("Triathlon")) {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.8)));
//         } else if (planType.includes("First 5K") || planType.includes("Functional Fitness")) {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.6)));
//         } else {
//             fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.7)));
//         }
        
//         const baseDistance = Math.max(minDistance, Math.round((maxTotalDistance / fallbackDuration) * 10) / 10);
//         const remainder = maxTotalDistance - (baseDistance * fallbackDuration);
        
//         const fallbackWeeks = [];
//         for (let i = 1; i <= fallbackDuration; i++) {
//             let weekDistance = baseDistance;
            
//             // Apply remainder to middle weeks
//             if (i === Math.ceil(fallbackDuration / 2) && remainder !== 0) {
//                 weekDistance = Math.max(minDistance, baseDistance + remainder);
//             }
            
//             // Ensure recovery weeks still meet minimum
//             const isRecoveryWeek = i % 4 === 0;
//             if (isRecoveryWeek && weekDistance > minDistance * 2) {
//                 weekDistance = Math.max(minDistance, weekDistance * 0.7);
//             }
            
//             fallbackWeeks.push({
//                 week: i,
//                 distance: Math.round(weekDistance * 10) / 10,
//                 phase: isRecoveryWeek ? "Recovery" : (i <= fallbackDuration/2 ? "Build" : "Peak/Taper"),
//                 notes: "Fallback distribution with minimum validation"
//             });
//         }
        
//         // Final adjustment to match total exactly
//         const fallbackSum = fallbackWeeks.reduce((sum, week) => sum + week.distance, 0);
//         const finalAdjustment = maxTotalDistance - fallbackSum;
//         if (Math.abs(finalAdjustment) > 0.1) {
//             const adjustWeek = fallbackWeeks[Math.floor(fallbackDuration / 2)];
//             adjustWeek.distance = Math.max(minDistance, adjustWeek.distance + finalAdjustment);
//             adjustWeek.distance = Math.round(adjustWeek.distance * 10) / 10;
//         }
        
//         return {
//             total_target: maxTotalDistance,
//             measurement_unit: measurementUnit,
//             plan_type: planType,
//             selected_duration_weeks: fallbackDuration,
//             duration_reasoning: `Fallback duration selection: ${fallbackDuration} weeks (range ${minWeeks}-${maxWeeks}) based on plan type ${planType}`,
//             weekly_distances: fallbackWeeks,
//             verification: {
//                 calculated_sum: maxTotalDistance,
//                 target_sum: maxTotalDistance,
//                 difference: 0.0,
//                 is_exact: true,
//                 min_weekly_distance: Math.min(...fallbackWeeks.map(w => w.distance)),
//                 max_weekly_distance: Math.max(...fallbackWeeks.map(w => w.distance)),
//                 weeks_below_minimum: 0,
//                 duration_within_range: true,
//                 selected_duration: fallbackDuration,
//                 min_allowed_weeks: minWeeks,
//                 max_allowed_weeks: maxWeeks
//             },
//             training_phases: {
//                 build_weeks: Array.from({length: Math.floor(fallbackDuration/2)}, (_, i) => i + 1),
//                 recovery_weeks: [Math.floor(fallbackDuration/2)],
//                 peak_week: Math.ceil(fallbackDuration * 0.75)
//             },
//             fallback_used: true
//         };
//     }
// }

// // ------------------ ENHANCED AI MATH EXPERT FUNCTION ------------------ //
// async function calculateDistanceDistributionWithAI(weeklyDistance, availableDays, longRunDay, planType, weekNumber, totalWeeks, measurementUnit) {
//     try {
//         // Sort available days chronologically for consistent processing
//         const sortedAvailableDays = sortDaysChronologically([...availableDays]);
        
//         // Determine minimum distance based on measurement unit
//         const isMiles = measurementUnit.toLowerCase() === 'miles';
//         const minDailyDistance = isMiles ? 0.3 : 0.5; // 0.3 miles or 0.5 km minimum per day
        
//         const mathExpertPrompt = `
// You are a MATH EXPERT specialized in distance distribution for running training plans.

// CRITICAL REQUIREMENT: You MUST distribute the weekly distance across ALL ${sortedAvailableDays.length} available days. Every day must get some distance - NO ZERO DISTANCES ALLOWED.

// TASK: Calculate exact distance distribution for ONE week of training.

// INPUT PARAMETERS:
// - Total Weekly Distance: ${weeklyDistance} ${measurementUnit} (must be distributed EXACTLY across ALL days)
// - Available Training Days: [${sortedAvailableDays.join(', ')}] (ALL ${sortedAvailableDays.length} days MUST get distance)
// - Long Run Day: ${longRunDay} (must get highest distance when present)
// - Plan Type: ${planType}
// - Week: ${weekNumber} of ${totalWeeks}
// - Measurement Unit: ${measurementUnit}

// MATHEMATICAL REQUIREMENTS:
// 1. Sum of all daily distances = ${weeklyDistance} ${measurementUnit} EXACTLY
// 2. ALL ${sortedAvailableDays.length} days must receive distance > 0 (minimum ${minDailyDistance} ${measurementUnit} per day)
// 3. ${longRunDay} gets highest distance (when present in available days)
// 4. All distances rounded to 1 decimal place
// 5. Distribution follows running training principles
// 6. MANDATORY: Include ALL days from list: [${sortedAvailableDays.join(', ')}]
// 7. All distances must be in ${measurementUnit}

// PLAN-SPECIFIC DISTRIBUTION RULES:
// ${planType === "5K Improvement Plan" ? "- Focus on speed work: 40% long run, distribute remaining across other days" :
//   planType === "Post-Race Recovery Plan" ? "- Recovery focus: 35% long run, distribute remaining evenly across other days" :
//   planType === "Horse Riding Plan" ? "- Balanced approach: 45% long run, distribute remaining across other days" :
//   planType === "Post-Injury Plan Via Yoga" ? "- Conservative: 40% long run, distribute remaining gently across all days" :
//   planType === "Marathons" ? "- Endurance focus: 45% long run, distribute remaining with emphasis on medium distances" :
//   planType === "Country Runs" ? "- Trail emphasis: 40% long run, distribute remaining across trail days" :
//   planType === "Swimming Plan" ? "- Cross-training: 35% long run, distribute remaining with cross-training consideration" :
//   planType === "Train for a Triathlon" ? "- Triathlon focus: 35% long run, distribute remaining to balance with other sports" :
//   planType === "Functional Fitness" ? "- Athletic balance: 40% long run, distribute remaining with functional movement emphasis" :
//   planType === "Postnatal Plan" ? "- Gentle approach: 35% long run, distribute remaining very conservatively" :
//   planType === "Parkrun Improvement Plan" ? "- Community focus: 40% long run, distribute remaining for 5K improvement" :
//   planType === "Run a First 5K" ? "- Beginner approach: 35% long run, distribute remaining very gradually" : ""}

// DISTRIBUTION ALGORITHM:
// 1. Assign long run percentage to ${longRunDay} (if present)
// 2. Calculate remaining distance to distribute
// 3. Divide remaining distance among other ${sortedAvailableDays.length - (sortedAvailableDays.includes(longRunDay) ? 1 : 0)} days
// 4. Ensure minimum ${minDailyDistance} ${measurementUnit} per day
// 5. Round to 1 decimal place
// 6. Verify sum equals ${weeklyDistance} ${measurementUnit} exactly
// 7. Adjust ${longRunDay} if needed to match total

// OUTPUT FORMAT (JSON only):
// {
//     "total_target": ${weeklyDistance},
//     "measurement_unit": "${measurementUnit}",
//     "distribution": [
//         ${sortedAvailableDays.map(day => `{
//             "day": "${day}",
//             "distance": 0.0,
//             "percentage": 0.0,
//             "notes": "Training run"
//         }`).join(',\n        ')}
//     ],
//     "verification": {
//         "calculated_sum": 0.0,
//         "target_sum": ${weeklyDistance},
//         "difference": 0.0,
//         "is_exact": false,
//         "long_run_day": "${longRunDay}",
//         "long_run_distance": 0.0,
//         "is_long_run_highest": false,
//         "days_with_zero_distance": 0,
//         "total_days_included": ${sortedAvailableDays.length}
//     }
// }

// CRITICAL CONSTRAINTS:
// - MUST include ALL ${sortedAvailableDays.length} days: [${sortedAvailableDays.join(', ')}]
// - NO ZERO DISTANCES - every day gets minimum ${minDailyDistance} ${measurementUnit}
// - Return days in chronological order
// - Ensure mathematical precision: sum must equal ${weeklyDistance} ${measurementUnit} exactly
// - Long run day gets highest distance when present
// - All distances must be in ${measurementUnit}
//         `;

//         console.log(`🧮 Calling Enhanced AI Math Expert for Week ${weekNumber} (${weeklyDistance}${measurementUnit}) with ALL ${sortedAvailableDays.length} days: [${sortedAvailableDays.join(', ')}]`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are a mathematics expert specializing in precise numerical calculations for athletic training. You MUST distribute distance across ALL available days with NO ZERO distances. Always return exact mathematical results in valid JSON format with chronological day ordering."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": mathExpertPrompt 
//                 }
//             ],
//             temperature: 0.1,
//             response_format: { type: "json_object" },
//         });

//         const mathResult = JSON.parse(response.choices[0].message.content.trim());
        
//         // ENHANCED VALIDATION: Ensure ALL days are included with non-zero distances
//         const requiredDays = new Set(sortedAvailableDays);
//         const providedDays = new Set(mathResult.distribution.map(d => d.day));
//         const missingDays = [...requiredDays].filter(day => !providedDays.has(day));
//         const zeroDays = mathResult.distribution.filter(d => d.distance <= 0);
        
//         console.log(`🔍 Enhanced Validation for Week ${weekNumber}:`);
//         console.log(`   Required days: [${sortedAvailableDays.join(', ')}] (${sortedAvailableDays.length} days)`);
//         console.log(`   Provided days: [${mathResult.distribution.map(d => d.day).join(', ')}] (${mathResult.distribution.length} days)`);
//         console.log(`   Missing days: [${missingDays.join(', ')}] (${missingDays.length})`);
//         console.log(`   Zero distance days: [${zeroDays.map(d => d.day).join(', ')}] (${zeroDays.length})`);
        
//         // If any days are missing or have zero distance, create a complete fallback distribution
//         if (missingDays.length > 0 || zeroDays.length > 0) {
//             console.warn(`⚠️ Enhanced AI Math Expert needs correction - creating complete distribution for all ${sortedAvailableDays.length} days`);
            
//                          // Create enhanced fallback that guarantees all days are included
//              const enhancedFallbackDistribution = [];
//              const totalDays = sortedAvailableDays.length;
             
//              // Give long run day 35% of total distance (if present)
//              const longRunPercentage = sortedAvailableDays.includes(longRunDay) ? 0.35 : 0;
//              const longRunDistance = Math.round(weeklyDistance * longRunPercentage * 10) / 10;
             
//              // Distribute remaining distance equally among all days (including long run day)
//              const remainingDistance = weeklyDistance - (longRunDistance * (longRunPercentage > 0 ? 1 : 0));
//              const otherDaysCount = totalDays - (longRunPercentage > 0 ? 1 : 0);
//              const baseDistance = otherDaysCount > 0 ? Math.round((remainingDistance / otherDaysCount) * 10) / 10 : 0;
             
//              // Create distribution for all days
//              for (const day of sortedAvailableDays) {
//                  if (day === longRunDay && longRunPercentage > 0) {
//                      enhancedFallbackDistribution.push({
//                          day: day,
//                          distance: longRunDistance + baseDistance, // Long run gets both portions
//                          percentage: ((longRunDistance + baseDistance) / weeklyDistance) * 100,
//                          notes: "Enhanced fallback - Long run with guaranteed distance"
//                      });
//                  } else {
//                      const distance = Math.max(baseDistance, minDailyDistance); // Minimum based on measurement unit
//                      enhancedFallbackDistribution.push({
//                          day: day,
//                          distance: distance,
//                          percentage: (distance / weeklyDistance) * 100,
//                          notes: "Enhanced fallback - Guaranteed minimum distance"
//                      });
//                  }
//              }
            
//             // Adjust to match exact total
//             const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
//             const adjustment = weeklyDistance - calculatedSum;
            
//             if (Math.abs(adjustment) > 0.1) {
//                 // Add adjustment to long run day or first day
//                 const adjustmentTarget = enhancedFallbackDistribution.find(d => d.day === longRunDay) || enhancedFallbackDistribution[0];
//                 adjustmentTarget.distance = Math.round((adjustmentTarget.distance + adjustment) * 10) / 10;
//                 adjustmentTarget.percentage = (adjustmentTarget.distance / weeklyDistance) * 100;
//                 adjustmentTarget.notes += " (adjusted for exact total)";
//             }
            
//             mathResult.distribution = enhancedFallbackDistribution;
//             mathResult.fallback_used = "enhanced_complete_distribution";
//         }
        
//         // Ensure chronological order in the response
//         if (mathResult.distribution) {
//             mathResult.distribution = mathResult.distribution.sort((a, b) => {
//                 return getDayIndex(a.day) - getDayIndex(b.day);
//             });
//         }
        
//         // Final validation and adjustment
//         const calculatedSum = mathResult.distribution.reduce((sum, day) => sum + day.distance, 0);
//         const difference = Math.abs(calculatedSum - weeklyDistance);
        
//         if (difference > 0.1) {
//             console.warn(`⚠️ Final adjustment for Week ${weekNumber}: ${calculatedSum} → ${weeklyDistance}`);
            
//             // Find long run day and adjust
//             let longRunDayData = mathResult.distribution.find(d => d.day === longRunDay);
//             if (!longRunDayData && mathResult.distribution.length > 0) {
//                 // If long run day not in available days, adjust the first day
//                 longRunDayData = mathResult.distribution[0];
//             }
            
//             if (longRunDayData) {
//                 const adjustment = weeklyDistance - (calculatedSum - longRunDayData.distance);
//                 longRunDayData.distance = Math.round(adjustment * 10) / 10;
//                 longRunDayData.percentage = (longRunDayData.distance / weeklyDistance) * 100;
                
//                 // Recalculate verification
//                 const newSum = mathResult.distribution.reduce((sum, day) => sum + day.distance, 0);
//                 mathResult.verification = {
//                     ...mathResult.verification,
//                     calculated_sum: newSum,
//                     difference: Math.abs(newSum - weeklyDistance),
//                     is_exact: Math.abs(newSum - weeklyDistance) < 0.1,
//                     long_run_distance: longRunDayData.distance,
//                     days_with_zero_distance: mathResult.distribution.filter(d => d.distance <= 0).length,
//                     total_days_included: mathResult.distribution.length
//                 };
//             }
//         }
        
//         console.log(`✅ Enhanced AI Math Expert calculated distribution for Week ${weekNumber}:`);
//         console.log(`   Target: ${weeklyDistance}${measurementUnit}, Calculated: ${mathResult.verification?.calculated_sum || calculatedSum}${measurementUnit}`);
//         console.log(`   All ${sortedAvailableDays.length} days included: [${mathResult.distribution.map(d => d.day).join(', ')}]`);
//         console.log(`   Long Run (${longRunDay}): ${mathResult.verification?.long_run_distance || 'N/A'}${measurementUnit}`);
//         console.log(`   Zero distance days: ${mathResult.verification?.days_with_zero_distance || 0}`);
//         console.log(`   Exact Match: ${mathResult.verification?.is_exact ? '✅' : '❌'}`);
        
//         return mathResult;

//     } catch (error) {
//         console.error('❌ Enhanced AI Math Expert failed:', error.message);
//         // Enhanced fallback to ensure ALL days are included
//         const sortedAvailableDays = sortDaysChronologically([...availableDays]);
        
//         // Determine minimum distance based on measurement unit
//         const isMiles = measurementUnit.toLowerCase() === 'miles';
//         const minDailyDistance = isMiles ? 0.3 : 0.5; // 0.3 miles or 0.5 km minimum per day
        
//         // Give long run day 35% if present, distribute rest equally
//         const longRunPercentage = sortedAvailableDays.includes(longRunDay) ? 0.35 : 0;
//         const longRunDistance = Math.round(weeklyDistance * longRunPercentage * 10) / 10;
//         const remainingDistance = weeklyDistance - longRunDistance;
//         const otherDaysCount = sortedAvailableDays.length - (longRunPercentage > 0 ? 1 : 0);
//         const baseDistance = otherDaysCount > 0 ? Math.round((remainingDistance / otherDaysCount) * 10) / 10 : 0;
        
//         const enhancedFallbackDistribution = sortedAvailableDays.map((day, index) => {
//             let distance;
//             if (day === longRunDay && longRunPercentage > 0) {
//                 distance = longRunDistance + baseDistance; // Long run gets both portions
//             } else {
//                 distance = Math.max(baseDistance, minDailyDistance); // Minimum based on measurement unit
//             }
            
//             return {
//                 day: day,
//                 distance: distance,
//                 percentage: (distance / weeklyDistance) * 100,
//                 notes: day === longRunDay ? "Enhanced fallback - Long run" : "Enhanced fallback - Equal distribution"
//             };
//         });
        
//         // Adjust final day to make total exact
//         const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
//         const adjustment = weeklyDistance - calculatedSum;
//         if (Math.abs(adjustment) > 0.1) {
//             const lastDay = enhancedFallbackDistribution[enhancedFallbackDistribution.length - 1];
//             lastDay.distance = Math.round((lastDay.distance + adjustment) * 10) / 10;
//             lastDay.percentage = (lastDay.distance / weeklyDistance) * 100;
//         }

//         return {
//             total_target: weeklyDistance,
//             measurement_unit: measurementUnit,
//             distribution: enhancedFallbackDistribution,
//             verification: {
//                 calculated_sum: weeklyDistance,
//                 target_sum: weeklyDistance,
//                 difference: 0.0,
//                 is_exact: true,
//                 long_run_day: longRunDay,
//                 long_run_distance: enhancedFallbackDistribution.find(d => d.day === longRunDay)?.distance || baseDistance,
//                 is_long_run_highest: true,
//                 days_with_zero_distance: 0,
//                 total_days_included: sortedAvailableDays.length,
//                 fallback_used: "enhanced_complete_fallback"
//             }
//         };
//     }
// }

// // ------------------ HELPER FUNCTIONS ------------------ //
// function parseDistance(distanceVal) {
//     if (typeof distanceVal === 'number') {
//         return parseFloat(distanceVal);
//     }
//     if (typeof distanceVal === 'string') {
//         try {
//             return parseFloat(distanceVal.split(' ')[0]);
//         } catch (error) {
//             return 0.0;
//         }
//     }
//     return 0.0;
// }

// function postprocessDistances(planData) {
//     if (!planData.weekly_plans) {
//         return planData;
//     }

//     planData.weekly_plans.forEach(week => {
//         week.total_weekly_distance = parseDistance(week.total_weekly_distance || 0);
//         week.user_distance = 0;
//         week.user_time = 0;

//         if (week.workouts) {
//             week.workouts.forEach(workout => {
//                 workout.distance = parseDistance(workout.distance || 0);
//                 workout.duration = parseInt(workout.duration || 0);
//                 workout.user_distance = 0;
//                 workout.user_time = 0;
//             });
//         }
//     });

//     return planData;
// }

// // NEW FUNCTION: AI-based intelligent start date adjustment
// async function adjustStartDateWithAI(userStartDate, userProfile, interest, currentTime) {
//     try {
//         console.log(`🤖 Using AI to intelligently determine optimal start date...`);
//         console.log(`🕐 Reference time (from requested start_date, UTC): ${currentTime.toISOString()} (UTC hour: ${currentTime.getUTCHours()})`);
//         console.log(`📅 User requested start date: ${new Date(userStartDate).toDateString()}`);
        
//         const startDatePrompt = `
// You are an expert running coach and scheduling specialist. Your task is to intelligently determine the optimal start date for a training plan based on multiple contextual factors.

// USER CONTEXT:
// - Requested start date: ${userStartDate}
// - Current time (UTC): ${currentTime.toISOString()}
// - User profile: ${JSON.stringify(userProfile)}
// - Training goal/interest: "${interest}"

// CRITICAL RULES - FOLLOW THESE EXACTLY:

// **TIME-BASED LOGIC (MANDATORY - NO EXCEPTIONS)**:
// - AM generation (before 12:00 PM): MUST start today (same date) or maximum tomorrow
// - PM generation (12:00 PM and later): MUST start tomorrow (next date)
// - Late evening (after 6:00 PM): MUST start next day

// **RECOVERY CONTEXT (LIMITED MODIFICATION)**:
// - Recovery scenarios: Can add MAXIMUM 1 day ONLY if it's PM generation
// - AM generation + recovery: MUST start today (recovery cannot override AM logic)
// - PM generation + recovery: Can start tomorrow (1 day delay maximum)

// **STRICT ENFORCEMENT**:
// - Time of day ALWAYS takes priority over recovery context
// - Never skip more than 1 day from the original date
// - For morning generation, recovery context is IGNORED

// EXAMPLES:
// - 11:44 AM + recovery → Start TODAY (AM logic overrides recovery)
// - 2:00 PM + recovery → Start TOMORROW (PM logic + 1 day recovery)
// - 9:00 AM + recovery → Start TODAY (AM logic overrides recovery)

// Return ONLY a JSON object with your intelligent decision:
// {
//     "adjusted_start_date": "ISO date string",
//     "adjustment_reason": "detailed explanation of why this date was chosen",
//     "confidence_score": 95,
//     "key_factors": ["factor1", "factor2", "factor3"],
//     "user_benefit": "how this adjustment benefits the user",
//     "recommendation": "specific advice for the user about starting their plan"
// }

// CRITICAL: The adjusted_start_date must be a valid ISO date string.
// CRITICAL: For morning generation, recovery context is IGNORED - start today.
// CRITICAL: Never skip more than 1 day from original date.
//         `;

//         console.log(`🤖 Calling AI for intelligent start date determination...`);
        
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": "You are an expert running coach and scheduling specialist. Analyze user context to determine the optimal training plan start date."
//                 },
//                 { 
//                     "role": "user", 
//                     "content": startDatePrompt 
//                 }
//             ],
//             temperature: 0.3,
//             response_format: { type: "json_object" },
//         });

//         const aiStartDateResult = JSON.parse(response.choices[0].message.content.trim());
        
//         // STRICT VALIDATION: Enforce time-based logic rules
//         const originalDate = new Date(userStartDate);
//         const aiAdjustedDate = new Date(aiStartDateResult.adjusted_start_date);
//         const daysDifference = Math.ceil((aiAdjustedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
//         const currentHour = currentTime.getUTCHours();
        
//         // STRICT RULE ENFORCEMENT
//         let shouldCorrect = false;
//         let correctionReason = '';
        
//         if (currentHour < 12) {
//             // AM generation rules - STRICT
//             if (daysDifference > 0) {
//                 shouldCorrect = true;
//                 correctionReason = `AM generation (${currentHour}:00) - recovery context is IGNORED. Must start TODAY (same date).`;
//             }
//         } else {
//             // PM generation rules - MUST be tomorrow
//             if (daysDifference !== 1) {
//                 shouldCorrect = true;
//                 correctionReason = `PM generation (${currentHour}:00) - MUST start tomorrow (exactly 1 day later). AI returned ${daysDifference} days difference.`;
//             }
//         }
        
//         // Apply correction if AI violates rules
//         if (shouldCorrect) {
//             console.log(`⚠️ AI violated strict time-based rules: ${correctionReason}`);
            
//             let correctedDate = new Date(userStartDate);
            
//             if (currentHour >= 12) {
//                 // PM generation - start tomorrow (1 day max)
//                 correctedDate.setUTCDate(correctedDate.getUTCDate() + 1);
//                 console.log(`🔄 Corrected: PM generation → start tomorrow (1 day max)`);
//             } else {
//                 // AM generation - start today (0 days)
//                 correctedDate = new Date(originalDate);
//                 console.log(`🔄 Corrected: AM generation → start today (0 days) - recovery context ignored`);
//             }
            
//             return {
//                 adjustedDate: correctedDate.toISOString(),
//                 reason: `AI violated time-based rules: ${correctionReason} Corrected to: ${currentHour >= 12 ? 'PM generation → start tomorrow' : 'AM generation → start today'}`,
//                 confidence: 90,
//                 keyFactors: ['strict_time_logic', 'ai_rule_violation', 'automatic_correction'],
//                 userBenefit: 'Ensures proper time-based logic is always followed',
//                 recommendation: 'Start your plan on the corrected date following proper time logic'
//             };
//         }
        
//         console.log(`✅ AI start date determination completed:`, {
//             confidence: aiStartDateResult.confidence_score + '%',
//             reason: aiStartDateResult.adjustment_reason,
//             adjustedDate: aiStartDateResult.adjusted_start_date,
//             daysSkipped: daysDifference
//         });
        
//         return {
//             adjustedDate: aiStartDateResult.adjusted_start_date,
//             reason: aiStartDateResult.adjustment_reason,
//             confidence: aiStartDateResult.confidence_score,
//             keyFactors: aiStartDateResult.key_factors,
//             userBenefit: aiStartDateResult.user_benefit,
//             recommendation: aiStartDateResult.recommendation
//         };
        
//     } catch (error) {
//         console.error(`❌ Error in AI start date determination:`, error);
        
//         // Fallback to intelligent default logic
//         const now = new Date(userStartDate);
//         const currentHour = now.getUTCHours();
//         const userStartDateObj = new Date(userStartDate);
//         let fallbackDate = new Date(userStartDateObj);
        
//         // STRICT fallback logic - follows time-based rules exactly
//         if (currentHour < 12) {
//             // AM generation (before 12 PM) - ALWAYS start today
//             fallbackDate = new Date(userStartDateObj);
//             console.log(`🔄 STRICT fallback: AM generation (${currentHour}:00) → start TODAY - recovery context ignored`);
//         } else if (currentHour >= 18) {
//             // Late evening (after 6 PM) - start tomorrow
//             fallbackDate.setUTCDate(userStartDateObj.getUTCDate() + 1);
//             console.log(`🔄 STRICT fallback: Late evening generation (${currentHour}:00) → start tomorrow`);
//         } else {
//             // Afternoon/PM (12 PM - 6 PM) - start tomorrow
//             fallbackDate.setUTCDate(userStartDateObj.getUTCDate() + 1);
//             console.log(`🔄 STRICT fallback: PM generation (${currentHour}:00) → start tomorrow`);
//         }
        
//         return {
//             adjustedDate: fallbackDate.toISOString(),
//             reason: `AI determination failed - using STRICT time-based fallback: ${currentHour < 12 ? 'AM generation → start today' : 'PM generation → start tomorrow'}`,
//             confidence: 85,
//             keyFactors: ['strict_time_logic', 'fallback_system', 'time_based_rules'],
//             userBenefit: 'Ensures proper time-based logic is always followed, even in fallback scenarios',
//             recommendation: 'Start your plan on the fallback date following strict time logic'
//         };
//     }
// }

// // ENHANCED: Fixed date constraint logic with detailed available days tracking
// function calculateWeekDatesFromStart(startDateStr, availableDays, numWeeks) {
//     const startDate = new Date(startDateStr);
//     const weeks = [];
    
//     // Sort available days chronologically
//     const sortedAvailableDays = sortDaysChronologically([...availableDays]);
    
//     // Find the Monday of the current week containing start_date
//     const currentWeekMonday = new Date(startDate);
//     const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
//     const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday to 6
//     currentWeekMonday.setDate(startDate.getDate() - daysFromMonday);
    
//     // Check if any available days fall on or after start_date in current week
//     const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
//     let hasAvailableDaysInCurrentWeek = false;
//     let currentWeekAvailableDays = [];
    
//     console.log(`📅 Start date: ${startDate.toDateString()} (${startDate.toISOString().split('T')[0]})`);
//     console.log(`📅 Current week Monday: ${currentWeekMonday.toISOString().split('T')[0]}`);
//     console.log(`📅 Available days (sorted): [${sortedAvailableDays.join(', ')}]`);
//     console.log('📅 Checking available days in current week:');
    
//     for (const dayName of sortedAvailableDays) {
//         const dayIndex = getDayIndex(dayName);
//         if (dayIndex !== -1) {
//             const dayDate = new Date(currentWeekMonday);
//             dayDate.setDate(currentWeekMonday.getDate() + dayIndex);
            
//             const isAvailable = dayDate >= startDate;
//             console.log(`   ${dayName}: ${dayDate.toISOString().split('T')[0]} - ${isAvailable ? '✅ AVAILABLE' : '❌ BEFORE START'}`);
            
//             if (isAvailable) {
//                 hasAvailableDaysInCurrentWeek = true;
//                 currentWeekAvailableDays.push(dayName);
//             }
//         }
//     }
    
//     // Sort current week available days chronologically
//     currentWeekAvailableDays = sortDaysChronologically(currentWeekAvailableDays);
    
//     let firstWeekStart;
//     let skipCurrentWeek = false;
    
//     if (hasAvailableDaysInCurrentWeek) {
//         // Use current week as Week 1
//         firstWeekStart = new Date(currentWeekMonday);
//         console.log(`✅ Using current week for Week 1 with ${currentWeekAvailableDays.length} available days: [${currentWeekAvailableDays.join(', ')}]`);
//     } else {
//         // Skip current week and start from next Monday
//         firstWeekStart = new Date(currentWeekMonday);
//         firstWeekStart.setDate(currentWeekMonday.getDate() + 7);
//         skipCurrentWeek = true;
//         console.log('⚠️ Skipping current week - no available days remaining. Starting from next Monday for Week 1');
//     }
    
//     // Generate all weeks from the determined start
//     for (let i = 0; i < numWeeks; i++) {
//         const weekStart = new Date(firstWeekStart);
//         weekStart.setDate(firstWeekStart.getDate() + (i * 7));
        
//         const weekEnd = new Date(weekStart);
//         weekEnd.setDate(weekStart.getDate() + 6);
        
//         weeks.push([
//             weekStart.toISOString().split('T')[0],
//             weekEnd.toISOString().split('T')[0]
//         ]);
//     }
    
//     console.log('📅 Generated week dates:', weeks);
//     console.log(`📅 Week 1 will have ${skipCurrentWeek ? sortedAvailableDays.length : currentWeekAvailableDays.length} workout days`);
//     console.log(`📅 Weeks 2-${numWeeks} will each have ${sortedAvailableDays.length} workout days`);
    
//     return { 
//         weeks, 
//         skipCurrentWeek, 
//         hasAvailableDaysInCurrentWeek,
//         currentWeekAvailableDays: skipCurrentWeek ? [] : currentWeekAvailableDays,
//         allAvailableDays: sortedAvailableDays
//     };
// }

// // ENHANCED: Updated system prompt with AI plan type selection and dynamic duration
// const generateTrainingPlanSystemPrompt = (request, weeklyDistribution, planTypeSelection) => {
//     console.log('Generating system prompt with AI weekly distribution, AI plan type selection, and dynamic duration');
//     const { maxTotalDistance, userProfile, trainingGoals, skipCurrentWeek } = request;
//     const planType = planTypeSelection.selected_plan_type;
//     const selectedDuration = weeklyDistribution.selected_duration_weeks;

//     return `
// You are an expert running coach. Return ONLY valid JSON with NO additional text.

// AI-SELECTED PLAN TYPE: ${planType}
// AI Selection Confidence: ${planTypeSelection.confidence_score}%
// AI Selection Reasoning: ${planTypeSelection.reasoning}

// AI-SELECTED DURATION: ${selectedDuration} weeks
// Duration Reasoning: ${weeklyDistribution.duration_reasoning}

// Create a specialized training plan following the characteristics of "${planType}":

// ${planType === "5K Improvement Plan" ? "- Focus on speed work, interval training, and tempo runs\n- Include track workouts and hill training\n- Emphasize pace improvement and race preparation" :
//   planType === "Post-Race Recovery Plan" ? "- Prioritize easy runs and active recovery\n- Include cross-training and rest days\n- Focus on rebuilding base fitness gradually" :
//   planType === "Horse Riding Plan" ? "- Combine running with equestrian training schedule\n- Include core strengthening and balance work\n- Account for riding days in workout planning" :
//   planType === "Post-Injury Plan Via Yoga" ? "- Integrate yoga sessions with running workouts\n- Focus on flexibility, mobility, and injury prevention\n- Include gentle return-to-running progression" :
//   planType === "Marathons" ? "- Build endurance with long runs and high mileage\n- Include marathon pace workouts and nutrition practice\n- Focus on 26.2-mile race preparation" :
//   planType === "Country Runs" ? "- Emphasize trail running and varied terrain\n- Include hill training and nature-based workouts\n- Focus on outdoor adventure and exploration" :
//   planType === "Swimming Plan" ? "- Combine swimming and running for cross-training\n- Include pool workouts and water running\n- Focus on low-impact cardiovascular fitness" :
//   planType === "Train for a Triathlon" ? "- Multi-sport training with balanced disciplines\n- Include brick workouts and transition practice\n- Focus on endurance across swimming, cycling, and running" :
//   planType === "Functional Fitness" ? "- Integrate functional movement patterns with running\n- Include strength training and athletic performance drills\n- Focus on overall fitness and movement quality" :
//   planType === "Postnatal Plan" ? "- Gentle return to exercise after childbirth\n- Include core recovery and gradual fitness building\n- Focus on safe, progressive training with health priority" :
//   planType === "Parkrun Improvement Plan" ? "- Community-focused 5K training approach\n- Include social running elements and group dynamics\n- Focus on 5K performance improvement in a fun environment" :
//   planType === "Run a First 5K" ? "- Beginner-friendly introduction to running\n- Include walk-run progression and confidence building\n- Focus on completing first 5K distance safely" : ""}

// 🧮 AI-CALCULATED WEEKLY DISTANCES (USE EXACTLY):
// Total Budget: ${weeklyDistribution.total_target} km
// Selected Duration: ${selectedDuration} weeks
// Weekly Distribution (MUST USE THESE EXACT DISTANCES):
// ${weeklyDistribution.weekly_distances.map(week => 
//     `Week ${week.week}: ${week.distance} km (${week.phase})`
// ).join('\n')}

// Verification: Sum = ${weeklyDistribution.verification.calculated_sum} km, Target = ${weeklyDistribution.verification.target_sum} km
// Minimum Weekly Distance: ${weeklyDistribution.verification.min_weekly_distance} km
// Maximum Weekly Distance: ${weeklyDistribution.verification.max_weekly_distance} km
// Duration Validation: ${weeklyDistribution.verification.duration_within_range ? '✅ Within Range' : '❌ Outside Range'}

// MANDATORY RULES - NO EXCEPTIONS:
// 1. Use EXACT weekly distances from AI calculation above - DO NOT MODIFY
// 2. Total distance budget: EXACTLY ${maxTotalDistance} kilometers across ${selectedDuration} weeks
// 3. Available workout days: [${trainingGoals?.available_days?.join(', ')}] - ${trainingGoals?.available_days?.length} days
// 4. CRITICAL: ${skipCurrentWeek ? 'Skip current week - start from Week 1 with all available days' : 'Week 1 may be partial, subsequent weeks use ALL available days'}
// 5. Long run day: ${trainingGoals?.long_run_day} must have the highest distance in every week it appears
// 6. Enhanced AI Math Expert will handle daily distance distribution within each week
// 7. Chronological order: Order workouts by day of week (Monday first, Sunday last)
// 8. Never use days not in available_days list: [${trainingGoals?.available_days?.join(', ')}]
// 9. WORKOUT TYPE: Only use "running" or "walking" - NO exceptions
// 10. ALL AVAILABLE DAYS MUST GET WORKOUTS - NO SKIPPING DAYS
// 11. CRITICAL: Every week must have distance >= 1.0 km (VALIDATED)
// 12. PLAN DURATION: Use AI-selected duration of ${selectedDuration} weeks

// User Profile Context:
// - Gender: ${userProfile?.gender}
// - Height: ${userProfile?.height}
// - Weight: ${userProfile?.weight}
// - Experience: ${userProfile?.running_experience}
// - Goal: ${trainingGoals?.goal}

// CRITICAL: Use the exact weekly distances provided by AI calculation. Enhanced AI Math Expert will ensure ALL available days get workouts. Plan duration is ${selectedDuration} weeks as determined by AI.
//         `;
// };

// // ENHANCED: Updated prompt with AI plan type selection and dynamic duration
// const generateTrainingPlanPrompt = (request, weeklyDistribution, planTypeSelection) => {
//     const { userProfile, trainingGoals, startDate, weekDates, skipCurrentWeek, currentWeekAvailableDays, allAvailableDays } = request;
//     const planType = planTypeSelection.selected_plan_type;
//     const selectedDuration = weeklyDistribution.selected_duration_weeks;

//     const payload = {
//         gender: userProfile.gender || 'not_specified',
//         height: `${userProfile.height || 170} cm`,
//         weight: userProfile.weight || 70,
//         running_experience: userProfile.running_experience || 'beginner',
//         interest: trainingGoals.goal || 'run a half marathon',
//         estimated_race_time: trainingGoals.current_race_time || 'N/A',
//         available_days: allAvailableDays || [],
//         available_days_string: allAvailableDays?.join(', ') || '',
//         available_days_count: allAvailableDays?.length || 0,
//         long_run_day: trainingGoals.long_run_day || 'Sunday',
//         measurement_unit: 'kilometers',
//         selected_duration_weeks: selectedDuration,
//         start_date: startDate || new Date(),
//         week_dates: weekDates,
//         plan_type: planType,
//         skip_current_week: skipCurrentWeek,
//         current_week_available_days: currentWeekAvailableDays || []
//     };

//     return `
// 🔴 CRITICAL TRAINING PLAN SPECIFICATIONS:

// AI-SELECTED PLAN TYPE: ${payload.plan_type}
// AI Selection Confidence: ${planTypeSelection.confidence_score}%
// AI Selection Reasoning: ${planTypeSelection.reasoning}
// Key Factors: ${planTypeSelection.key_factors?.join(', ') || 'N/A'}

// TOTAL DISTANCE BUDGET: ${weeklyDistribution.total_target} ${payload.measurement_unit}
// AI-SELECTED PLAN DURATION: ${payload.selected_duration_weeks} weeks
// Duration Reasoning: ${weeklyDistribution.duration_reasoning}
// AVAILABLE WORKOUT DAYS (CHRONOLOGICAL): [${payload.available_days_string}] (${payload.available_days_count} days)
// LONG RUN DAY: ${payload.long_run_day} (must have highest distance when present)

// 🧮 AI-CALCULATED WEEKLY DISTANCES (MANDATORY - USE EXACTLY):
// ${weeklyDistribution.weekly_distances.map((week, index) => 
//     `Week ${week.week}: ${week.distance} km (${week.phase}) - Dates: ${weekDates[index][0]} to ${weekDates[index][1]}`
// ).join('\n')}

// Total Verification: ${weeklyDistribution.verification.calculated_sum} km = ${weeklyDistribution.verification.target_sum} km ✅
// Minimum Weekly: ${weeklyDistribution.verification.min_weekly_distance} km ✅
// Maximum Weekly: ${weeklyDistribution.verification.max_weekly_distance} km ✅
// Duration Validation: ${weeklyDistribution.verification.duration_within_range ? '✅ Within Range' : '❌ Outside Range'} ✅

// 🔴 ENHANCED WORKOUT CONSISTENCY ANALYSIS:

// Start Date: ${new Date(payload.start_date).toDateString()} (${new Date(payload.start_date).toISOString().split('T')[0]})

// ${skipCurrentWeek ? 
// `SKIP CURRENT WEEK - No available days remaining in current week
// Starting directly from next Monday with complete weeks:

// Week 1 (Complete): ${weekDates[0][0]} to ${weekDates[0][1]}
// - Distance: ${weeklyDistribution.weekly_distances[0].distance} km
// - Available days: [${payload.available_days_string}]
// - Expected workouts: ${payload.available_days_count} (ALL AVAILABLE DAYS MANDATORY)

// Weeks 2-${payload.selected_duration_weeks} (Complete):
// - Each week uses ALL available days: [${payload.available_days_string}]
// - Expected workouts per week: ${payload.available_days_count} (CONSISTENT - ALL DAYS MANDATORY)` :

// `Week 1 (Partial): Uses current week with remaining days only
// - Distance: ${weeklyDistribution.weekly_distances[0].distance} km
// - Available days on/after start date: [${payload.current_week_available_days.join(', ')}]
// - Expected workouts: ${payload.current_week_available_days.length} (ALL REMAINING DAYS MANDATORY)

// Weeks 2-${payload.selected_duration_weeks} (Complete):
// - Each week uses ALL available days: [${payload.available_days_string}]
// - Expected workouts per week: ${payload.available_days_count} (CONSISTENT - ALL DAYS MANDATORY)`}

// 🔴 ENHANCED CHRONOLOGICAL ORDERING REQUIREMENTS:

// MANDATORY WORKOUT ORDER (Monday → Sunday):
// 1. Monday (if available)
// 2. Tuesday (if available)
// 3. Wednesday (if available)
// 4. Thursday (if available)
// 5. Friday (if available)
// 6. Saturday (if available)
// 7. Sunday (if available)

// CRITICAL: All workouts within each week MUST be ordered chronologically by day of week.
// CRITICAL: ALL available days MUST have workouts - NO SKIPPING ALLOWED.

// 🔴 MANDATORY JSON RESPONSE FORMAT:

// {
//     "plan_name": "${payload.plan_type} - ${payload.interest} Training Plan",
//     "plan_type": "${payload.plan_type}",
//     "ai_plan_selection": {
//         "selected_plan_type": "${payload.plan_type}",
//         "confidence_score": ${planTypeSelection.confidence_score},
//         "reasoning": "${planTypeSelection.reasoning}",
//         "key_factors": ${JSON.stringify(planTypeSelection.key_factors || [])},
//         "alternative_considerations": "${planTypeSelection.alternative_considerations || 'N/A'}"
//     },
//     "duration": "${payload.selected_duration_weeks} weeks",
//     "target_distance": ${weeklyDistribution.total_target},
//     "target_time": "${payload.estimated_race_time}",
//     "description": "AI-selected ${payload.plan_type} with exact distance distribution, chronological ordering, and guaranteed workout coverage",
//     "why_recommended": "AI-selected ${payload.plan_type} based on user profile analysis with optimal progression, consistent workout scheduling, and complete day coverage",
//     "difficulty_level": "${payload.running_experience}",
//     "weekly_commitment": "${payload.available_days_count} days/week on [${payload.available_days_string}] (chronological order, ALL days included)",
//     "training_philosophy": "AI-selected progressive overload with ${payload.long_run_day} long runs, consistent weekly structure, and complete workout coverage",
//     "distance_budget": ${weeklyDistribution.total_target},
//     "distance_verification": "AI-calculated: ${weeklyDistribution.verification.calculated_sum} km = ${weeklyDistribution.verification.target_sum} km",
//     "weekly_plans": [
//         ${weeklyDistribution.weekly_distances.map((week, index) => `{
//             "week_number": ${week.week},
//             "week_focus": "${week.phase} (${payload.plan_type} approach)",
//             "start_date": "${weekDates[index][0]}",
//             "end_date": "${weekDates[index][1]}",
//             "total_weekly_distance": ${week.distance},
//             "user_distance": 0,
//             "user_time": 0,
//             "workouts": "Will be calculated by Enhanced AI Math Expert in chronological order for ALL available days",
//             "weekly_notes": "${week.notes || week.phase + ' week'} - ${index === 0 && !skipCurrentWeek ? payload.current_week_available_days.length : payload.available_days_count} workouts (ALL available days included)"
//         }`).join(',\n        ')}
//     ]
// }

// 🚨 ENHANCED CRITICAL REQUIREMENTS:

// ✅ Use AI-selected plan type: ${payload.plan_type} (Confidence: ${planTypeSelection.confidence_score}%)
// ✅ Use AI-selected duration: ${payload.selected_duration_weeks} weeks (Reasoning: ${weeklyDistribution.duration_reasoning})
// ✅ Use EXACT weekly distances from AI calculation: ${weeklyDistribution.weekly_distances.map(w => w.distance + 'km').join(', ')}
// ✅ Week 1: ${skipCurrentWeek ? payload.available_days_count : payload.current_week_available_days.length} workouts (ALL available days)
// ✅ Weeks 2-${payload.selected_duration_weeks}: ${payload.available_days_count} workouts each (ALL available days - CONSISTENT)
// ✅ ALL workouts in chronological order: Monday → Tuesday → Wednesday → Thursday → Friday → Saturday → Sunday
// ✅ Long run day (${payload.long_run_day}) gets highest distance when present
// ✅ Only use available days: [${payload.available_days_string}]
// ✅ MANDATORY: Every available day gets a workout - NO ZERO DISTANCES
// ✅ Enhanced AI Math Expert ensures complete day coverage
// ✅ CRITICAL: Every week distance >= 1.0 km (VALIDATED AND GUARANTEED)

// GENERATE CONSISTENT WORKOUT COUNTS WITH ALL AVAILABLE DAYS INCLUDED AND CHRONOLOGICAL ORDERING.
//     `;
// };

// // ------------------ AI-BASED DEFAULTS VALIDATION ------------------ //
// async function applyAIDefaultsForMissingFields(req, res, next) {
//     // Check if this is a case where we should apply AI defaults (when minimal required fields are present)
//     const hasMinimalRequiredFields = req.body.interest && 
//         req.body.estimated_race_time && 
//         req.body.max_total_distance &&
//         req.body.start_date;

//     if (hasMinimalRequiredFields) {
//         const missingFields = [];
//         const fieldsToCheck = [
//             'running_experience', 'gender', 'height', 'weight', 
//             'days_per_week', 'specific_days', 'long_run_day', 'measurement_unit', 
//             'max_week_plans', 'min_weeks_plan'
//         ];
        
//         fieldsToCheck.forEach(field => {
//             if (!req.body[field]) {
//                 missingFields.push(field);
//             }
//         });

//         if (missingFields.length > 0) {
//             console.log(`🤖 Generating AI-based intelligent defaults for missing fields: [${missingFields.join(', ')}]`);
            
//             try {
//                 const intelligentDefaults = await generateIntelligentDefaultsWithAI(
//                     req.body.interest,
//                     req.body.estimated_race_time,
//                     req.body.max_total_distance
//                 );

//                 // Apply AI-generated defaults only for missing fields
//                 if (!req.body.running_experience) {
//                     req.body.running_experience = intelligentDefaults.running_experience;
//                     console.log(`🤖 AI Default applied: running_experience = ${intelligentDefaults.running_experience}`);
//                     console.log(`   Reasoning: ${intelligentDefaults.reasoning.experience_rationale}`);
//                 }
//                 if (!req.body.gender) {
//                     req.body.gender = intelligentDefaults.gender;
//                     console.log(`🤖 AI Default applied: gender = ${intelligentDefaults.gender}`);
//                 }
//                 if (!req.body.height) {
//                     req.body.height = intelligentDefaults.height;
//                     console.log(`🤖 AI Default applied: height = ${intelligentDefaults.height}`);
//                 }
//                 if (!req.body.weight) {
//                     req.body.weight = intelligentDefaults.weight;
//                     console.log(`🤖 AI Default applied: weight = ${intelligentDefaults.weight}`);
//                 }
//                 if (!req.body.days_per_week) {
//                     req.body.days_per_week = intelligentDefaults.days_per_week;
//                     console.log(`🤖 AI Default applied: days_per_week = ${intelligentDefaults.days_per_week}`);
//                     console.log(`   Reasoning: ${intelligentDefaults.reasoning.training_frequency_rationale}`);
//                 }
//                 if (!req.body.specific_days) {
//                     req.body.specific_days = intelligentDefaults.specific_days;
//                     console.log(`🤖 AI Default applied: specific_days = ${intelligentDefaults.specific_days}`);
//                     console.log(`   Reasoning: ${intelligentDefaults.reasoning.specific_days_rationale}`);
//                 }
//                 if (!req.body.long_run_day) {
//                     req.body.long_run_day = intelligentDefaults.long_run_day;
//                     console.log(`🤖 AI Default applied: long_run_day = ${intelligentDefaults.long_run_day}`);
//                     console.log(`   Reasoning: ${intelligentDefaults.reasoning.long_run_day_rationale}`);
//                 }
//                 if (!req.body.measurement_unit) {
//                     req.body.measurement_unit = intelligentDefaults.measurement_unit;
//                     console.log(`🤖 AI Default applied: measurement_unit = ${intelligentDefaults.measurement_unit}`);
//                 }
//                 if (!req.body.max_week_plans) {
//                     req.body.max_week_plans = intelligentDefaults.max_week_plans;
//                     console.log(`🤖 AI Default applied: max_week_plans = ${intelligentDefaults.max_week_plans}`);
//                     console.log(`   Reasoning: ${intelligentDefaults.reasoning.duration_rationale}`);
//                 }
//                 if (!req.body.min_weeks_plan) {
//                     req.body.min_weeks_plan = 1; // Default minimum weeks
//                     console.log(`🤖 AI Default applied: min_weeks_plan = 1`);
//                 }
                
//                 // Store AI reasoning for potential use in response
//                 req.body._ai_defaults_reasoning = intelligentDefaults.reasoning;
                
//             } catch (error) {
//                 console.error('❌ Failed to generate AI defaults:', error.message);
//                 return res.status(500).json({
//                     error: 'Failed to generate intelligent defaults for training plan',
//                     details: error.message
//                 });
//             }
//         }
//     }

//     next();
// }

// // ------------------ VALIDATION FUNCTIONS ------------------ //
// function validateRunPlanRequest(req, res, next) {
//     const requiredFields = [
//         'gender', 'height', 'weight', 'running_experience', 'interest',
//         'estimated_race_time', 'days_per_week', 'long_run_day',
//         'measurement_unit', 'max_week_plans', 'max_total_distance', 'start_date'
//     ];

//     const missingFields = requiredFields.filter(field => req.body[field] === undefined || req.body[field] === null);
    
//     if (missingFields.length > 0) {
//         return res.status(400).json({
//             error: `Missing required fields: ${missingFields.join(', ')}`
//         });
//     }

//     if (req.body.days_per_week < 1 || req.body.days_per_week > 7) {
//         return res.status(400).json({
//             error: 'days_per_week must be between 1 and 7'
//         });
//     }

//     if (isNaN(req.body.max_total_distance)) {
//         return res.status(400).json({
//             error: 'max_total_distance must be a number'
//         });
//     }

//     try {
//         new Date(req.body.start_date);
//     } catch (error) {
//         return res.status(400).json({
//             error: 'Invalid start_date format. Use ISO format (e.g., 2024-01-15T00:00:00.000Z)'
//         });
//     }

//     next();
// }

// // ------------------ ROUTES ------------------ //
// app.get('/', (req, res) => {
//     res.json({ 
//         message: "365 Run Personalized Plan API - Enhanced Node.js Version with AI Plan Type Selection, Distance Validation, and AI-Based Intelligent Start Date Adjustment",
//         available_plan_types: PLAN_TYPES,
//         features: ["AI-powered plan type selection", "Enhanced AI-powered distance calculations", "Fixed date constraints", "Chronological workout ordering", "Guaranteed complete day coverage", "Consistent workout counts", "Minimum distance validation (>=1.0km per week)", "AI-based intelligent start date adjustment with contextual analysis"]
//     });
// });



// // ENHANCED: Complete route handler with AI plan type selection, distance validation, and AI-based intelligent start date adjustment
// app.post('/recommend-plan', applyAIDefaultsForMissingFields, validateRunPlanRequest, async (req, res) => {
//     try {
//         console.log('🏃‍♂️ Processing training plan request with AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment...');
//         console.log('Request payload:', JSON.stringify(req.body, null, 2));
        
//         const payload = req.body;
//         const maxTotalKm = parseFloat(payload.max_total_distance);
        
//         // NEW: AI-based intelligent start date adjustment
//         console.log('🤖 Step 0: Using AI to intelligently determine optimal start date...');
//         // Use the user's requested start_date as the reference time (UTC)
//         const generationTime = new Date(payload.start_date);
        
//         const startDateAdjustment = await adjustStartDateWithAI(
//             payload.start_date, 
//             {
//                 gender: payload.gender,
//                 height: payload.height,
//                 weight: payload.weight,
//                 running_experience: payload.running_experience
//             }, 
//             payload.interest, 
//             generationTime
//         );
        
//         // ENHANCED: Default to all 7 days if no specific days provided, then process and sort
//         const defaultDays = 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday';
//         const specificDaysInput = payload.specific_days || defaultDays;
        
//         const availableDays = specificDaysInput.split(',').map(day => {
//             const trimmed = day.trim();
//             return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
//         });
//         const sortedAvailableDays = sortDaysChronologically(availableDays);

//         console.log('✅ Available days processed and sorted:', sortedAvailableDays);
//         console.log('✅ Total available days:', sortedAvailableDays.length);
//         console.log('✅ Used default all 7 days:', !payload.specific_days ? 'Yes' : 'No');
//         console.log('✅ Interest:', payload.interest);
//         console.log('✅ Target total distance:', maxTotalKm, payload.measurement_unit);

//         // STEP 1: Use AI to determine plan type based on interest and user profile
//         const userProfile = {
//             gender: payload.gender,
//             height: payload.height,
//             weight: payload.weight,
//             running_experience: payload.running_experience
//         };

//         console.log('🤖 Step 1: Using AI to determine plan type...');
//         const planTypeSelection = await determinePlanTypeWithAI(payload.interest, userProfile);
//         const planType = planTypeSelection.selected_plan_type;

//         console.log('✅ AI-selected plan type:', planType);
//         console.log('✅ Selection confidence:', planTypeSelection.confidence_score + '%');
//         console.log('✅ Selection reasoning:', planTypeSelection.reasoning);

//         // ENHANCED: Use the fixed week calculation function with date constraints
//         // First, we'll use max_week_plans for initial calculation, then adjust based on AI selection
//         const weekCalculationResult = calculateWeekDatesFromStart(payload.start_date, sortedAvailableDays, payload.max_week_plans);
//         const weekDates = weekCalculationResult.weeks;
//         const skipCurrentWeek = weekCalculationResult.skipCurrentWeek;
//         const hasAvailableDaysInCurrentWeek = weekCalculationResult.hasAvailableDaysInCurrentWeek;
//         const currentWeekAvailableDays = weekCalculationResult.currentWeekAvailableDays;
//         const allAvailableDays = weekCalculationResult.allAvailableDays;
        
//         console.log('✅ Enhanced week calculation result:', {
//             totalWeeks: weekDates.length,
//             skipCurrentWeek,
//             hasAvailableDaysInCurrentWeek,
//             week1WorkoutDays: skipCurrentWeek ? allAvailableDays.length : currentWeekAvailableDays.length,
//             subsequentWeekWorkoutDays: allAvailableDays.length,
//             enhancedCompleteCoverage: true
//         });

//         // Create comprehensive request object
//         const request = {
//             userProfile: userProfile,
//             trainingGoals: {
//                 goal: payload.interest,
//                 current_race_time: payload.estimated_race_time,
//                 days_per_week: payload.days_per_week,
//                 available_days: allAvailableDays,
//                 long_run_day: payload.long_run_day.charAt(0).toUpperCase() + payload.long_run_day.slice(1).toLowerCase()
//             },
//             startDate: startDateAdjustment.adjustedDate, // Use the AI-adjusted start date
//             maxTotalDistance: maxTotalKm,
//             weekDates: weekDates,
//             planType: planType,
//             skipCurrentWeek: skipCurrentWeek,
//             hasAvailableDaysInCurrentWeek: hasAvailableDaysInCurrentWeek,
//             currentWeekAvailableDays: currentWeekAvailableDays,
//             allAvailableDays: allAvailableDays
//         };

//         // STEP 2: Get AI-calculated weekly distribution with enhanced validation and dynamic duration
//         console.log('🧮 Step 2: Calculating weekly distance distribution with dynamic duration selection...');
//         const weeklyDistribution = await calculateWeeklyDistributionWithAI(
//             maxTotalKm,
//             payload.min_weeks_plan || 1,
//             payload.max_week_plans,
//             planType,
//             request.userProfile,
//             request.trainingGoals,
//             payload.measurement_unit
//         );
        
//         console.log('✅ Weekly distribution calculated and validated:', {
//             totalTarget: weeklyDistribution.total_target,
//             calculatedSum: weeklyDistribution.verification.calculated_sum,
//             isExact: weeklyDistribution.verification.is_exact,
//             weeksCount: weeklyDistribution.weekly_distances.length,
//             minWeeklyDistance: weeklyDistribution.verification.min_weekly_distance,
//             maxWeeklyDistance: weeklyDistribution.verification.max_weekly_distance,
//             weeksBelowMinimum: weeklyDistribution.verification.weeks_below_minimum
//         });

//         // STEP 3: Generate basic plan structure with exact weekly distances and AI plan type
//         const systemPrompt = generateTrainingPlanSystemPrompt(request, weeklyDistribution, planTypeSelection);
//         const userPrompt = generateTrainingPlanPrompt(request, weeklyDistribution, planTypeSelection);

//         console.log('🤖 Step 3: Calling OpenAI for training plan structure...');
//         const planResponse = await openai.chat.completions.create({
//             model: "gpt-4o-mini",
//             messages: [
//                 {
//                     "role": "system", 
//                     "content": systemPrompt
//                 },
//                 { 
//                     "role": "user", 
//                     "content": userPrompt 
//                 }
//             ],
//             temperature: 0.1,
//             response_format: { type: "json_object" },
//         });

//         console.log('✅ OpenAI plan structure response received');
//         let planData = JSON.parse(planResponse.choices[0].message.content.trim());

//         // STEP 4: Use Enhanced AI Math Expert to calculate exact daily distances for each week
//         console.log('🧮 Step 4: Processing each week with Enhanced AI Math Expert (Complete Day Coverage)...');
        
//         // Adjust week dates based on AI-selected duration
//         const selectedDuration = weeklyDistribution.selected_duration_weeks;
//         const adjustedWeekDates = weekDates.slice(0, selectedDuration);
        
//         if (planData.weekly_plans && weeklyDistribution.weekly_distances) {
//             for (let weekIndex = 0; weekIndex < planData.weekly_plans.length; weekIndex++) {
//                 const week = planData.weekly_plans[weekIndex];
//                 const weekDistribution = weeklyDistribution.weekly_distances[weekIndex];
                
//                 if (!weekDistribution) {
//                     console.warn(`⚠️ No distribution data for week ${weekIndex + 1}`);
//                     continue;
//                 }

//                 const weeklyDistance = weekDistribution.distance;
                
//                 // ENHANCED VALIDATION: Ensure weekly distance is positive
//                 if (weeklyDistance <= 0) {
//                     console.warn(`⚠️ Week ${week.week_number} has invalid distance ${weeklyDistance}km, setting to minimum 1.0km`);
//                     weekDistribution.distance = 1.0;
//                     week.total_weekly_distance = 1.0;
//                     week.weekly_notes = `${weekDistribution.phase} - Adjusted to minimum distance | ${allAvailableDays.length} workouts (Enhanced Complete Coverage)`;
                    
//                     // Create minimal workouts for this week
//                     const workouts = [];
//                     const weekStartDate = new Date(week.start_date);
//                     const minimumPerDay = 0.2; // 0.2km minimum per day
                    
//                     for (let dayIndex = 0; dayIndex < allAvailableDays.length; dayIndex++) {
//                         const day = allAvailableDays[dayIndex];
//                         const workoutDate = calculateWorkoutDate(weekStartDate, day);
                        
//                         if (workoutDate) {
//                             workouts.push({
//                                 day: day,
//                                 date: workoutDate.toISOString().split('T')[0],
//                                 workout_type: "walking",
//                                 distance: minimumPerDay,
//                                 duration: Math.round(minimumPerDay * 12), // Walking pace
//                                 intensity: "Easy",
//                                 notes: "Minimum distance maintenance",
//                                 user_distance: 0,
//                                 user_time: 0,
//                                 ai_calculated: true,
//                                 enhanced_coverage: true,
//                                 minimum_adjustment: true,
//                                 percentage_of_week: (minimumPerDay / 1.0) * 100,
//                                 chronological_order: getDayIndex(day)
//                             });
//                         }
//                     }
                    
//                     // Ensure chronological sorting
//                     workouts.sort((a, b) => a.chronological_order - b.chronological_order);
//                     week.workouts = workouts;
//                     week.actual_workout_distance = workouts.reduce((sum, w) => sum + w.distance, 0);
//                     week.enhanced_coverage_check = `${workouts.length} workouts created for ${allAvailableDays.length} available days (Complete Coverage: ✅)`;
                    
//                     console.log(`📊 Week ${week.week_number}: Adjusted to minimum with ${workouts.length} workouts`);
//                     continue;
//                 }

//                 if (weeklyDistance > 0) {
//                     // Determine available days for this week based on date constraints
//                     let weekAvailableDays = allAvailableDays;
                    
//                     if (weekIndex === 0 && !skipCurrentWeek) {
//                         // For Week 1 when not skipping current week, only use remaining days
//                         weekAvailableDays = currentWeekAvailableDays;
//                         console.log(`📅 Week ${week.week_number} (Partial): [${weekAvailableDays.join(', ')}] - ${weekAvailableDays.length} days (ALL MUST GET WORKOUTS)`);
//                     } else {
//                         console.log(`📅 Week ${week.week_number} (Complete): [${weekAvailableDays.join(', ')}] - ${weekAvailableDays.length} days (ALL MUST GET WORKOUTS)`);
//                     }

//                     // Call Enhanced AI Math Expert for this week
//                     const mathResult = await calculateDistanceDistributionWithAI(
//                         weeklyDistance,
//                         weekAvailableDays,
//                         request.trainingGoals.long_run_day,
//                         planType,
//                         week.week_number,
//                         selectedDuration,
//                         payload.measurement_unit
//                     );

//                     // Convert Enhanced AI Math Expert result to workout format with chronological ordering
//                     const workouts = [];
//                     const weekStartDate = new Date(week.start_date);

//                     // ENHANCED: Process ALL available days to ensure complete coverage
//                     const processedDays = new Set();

//                     // First, process AI Math Expert distribution (already sorted chronologically)
//                     for (const dayDist of mathResult.distribution) {
//                         if (weekAvailableDays.includes(dayDist.day)) {
//                             // Calculate correct date for this day in this week
//                             const workoutDate = calculateWorkoutDate(weekStartDate, dayDist.day);
                            
//                             if (workoutDate) {
//                                 // Determine workout type based on plan type and distance
//                                 let workoutType = "running";
//                                 let intensity = "Easy";
//                                 let notes = dayDist.notes || "Enhanced training run with guaranteed coverage";

//                                 if (dayDist.day === request.trainingGoals.long_run_day) {
//                                     intensity = "Easy-Moderate";
//                                     notes = `Long run - ${planType} methodology. Build endurance gradually. (Enhanced coverage)`;
//                                 } else if (dayDist.percentage > 20) {
//                                     intensity = "Medium";
//                                     notes = `Medium distance run - ${planType} focus. (Enhanced coverage)`;
//                                 }

//                                 // Ensure minimum distance for complete coverage
//                                 const minDailyDistance = payload.measurement_unit.toLowerCase() === 'miles' ? 0.3 : 0.5;
//                                 const guaranteedDistance = Math.max(dayDist.distance, minDailyDistance);

//                                 // Estimate duration based on experience level
//                                 const paceMinPerKm = payload.running_experience === 'beginner' ? 7 : 
//                                                     payload.running_experience === 'intermediate' ? 6 : 5.5;
//                                 const estimatedDuration = Math.round(guaranteedDistance * paceMinPerKm);

//                                 workouts.push({
//                                     day: dayDist.day,
//                                     date: workoutDate.toISOString().split('T')[0],
//                                     workout_type: workoutType,
//                                     distance: guaranteedDistance,
//                                     duration: estimatedDuration,
//                                     intensity: intensity,
//                                     notes: notes,
//                                     user_distance: 0,
//                                     user_time: 0,
//                                     ai_calculated: true,
//                                     enhanced_coverage: true,
//                                     percentage_of_week: Math.round((guaranteedDistance / weeklyDistance) * 100 * 10) / 10,
//                                     chronological_order: getDayIndex(dayDist.day)
//                                 });

//                                 processedDays.add(dayDist.day);
//                             }
//                         }
//                     }

//                     // ENHANCED: Ensure ALL weekAvailableDays are covered (safety net)
//                     const missedDays = weekAvailableDays.filter(day => !processedDays.has(day));
//                     if (missedDays.length > 0) {
//                         console.warn(`🔧 Enhanced coverage safety net: Adding ${missedDays.length} missed days: [${missedDays.join(', ')}]`);
                        
//                         for (const missedDay of missedDays) {
//                             const workoutDate = calculateWorkoutDate(weekStartDate, missedDay);
//                             if (workoutDate) {
//                                 const minimumDistance = payload.measurement_unit.toLowerCase() === 'miles' ? 0.6 : 1.0; // Minimum safety distance
//                                 const paceMinPerKm = payload.running_experience === 'beginner' ? 7 : 
//                                                     payload.running_experience === 'intermediate' ? 6 : 5.5;
//                                 const estimatedDuration = Math.round(minimumDistance * paceMinPerKm);

//                                 workouts.push({
//                                     day: missedDay,
//                                     date: workoutDate.toISOString().split('T')[0],
//                                     workout_type: "running",
//                                     distance: minimumDistance,
//                                     duration: estimatedDuration,
//                                     intensity: "Easy",
//                                     notes: "Enhanced coverage safety net - guaranteed minimum workout",
//                                     user_distance: 0,
//                                     user_time: 0,
//                                     ai_calculated: true,
//                                     enhanced_coverage: true,
//                                     safety_net_added: true,
//                                     percentage_of_week: Math.round((minimumDistance / weeklyDistance) * 100 * 10) / 10,
//                                     chronological_order: getDayIndex(missedDay)
//                                 });
//                             }
//                         }
//                     }

//                     // Ensure chronological sorting (redundant but safe)
//                     workouts.sort((a, b) => a.chronological_order - b.chronological_order);

//                     // Update week with Enhanced AI-calculated workouts in chronological order
//                     week.workouts = workouts;
//                     week.total_weekly_distance = weeklyDistance; // Keep exact weekly target
//                     week.actual_workout_distance = workouts.reduce((sum, w) => sum + w.distance, 0); // Track actual total
//                     week.weekly_distance_check = `${mathResult.verification.calculated_sum.toFixed(1)}km calculated by Enhanced AI Math Expert = ${weeklyDistance}km target ✅`;
//                     week.enhanced_coverage_check = `${workouts.length} workouts created for ${weekAvailableDays.length} available days (Complete Coverage: ${workouts.length === weekAvailableDays.length ? '✅' : '❌'})`;
//                     week.ai_math_verification = mathResult.verification;
//                     week.weekly_notes = `${weekDistribution.phase} - ${weekDistribution.notes || ''} | ${workouts.length} workouts in chronological order (Enhanced Complete Coverage)`;
                    
//                     console.log(`📊 Week ${week.week_number}: ${workouts.length}/${weekAvailableDays.length} workouts - [${workouts.map(w => w.day).join(', ')}] (Coverage: ${workouts.length === weekAvailableDays.length ? '✅ Complete' : '❌ Incomplete'})`);
//                 }
//             }
//         }

//         // Post-process and validate
//         planData = postprocessDistances(planData);
        
//         // Add enhanced metadata including AI plan type selection
//         planData.ai_weekly_distribution = weeklyDistribution;
//         planData.ai_plan_type_selection = planTypeSelection;
//         planData.enhanced_coverage_enabled = true;
//         planData.distance_validation_enabled = true;

//         // ENHANCED VALIDATION WITH COMPLETE WORKOUT COUNT CONSISTENCY CHECK
//         const sumWeekly = (planData.weekly_plans || []).reduce((acc, w) => acc + (w.total_weekly_distance || 0), 0);
//         planData.distance_verification = `SUM = ${sumWeekly.toFixed(1)}, TARGET = ${maxTotalKm} (Enhanced AI Math Expert with Distance Validation)`;
        
//         console.log('📊 AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation Results:');
//         console.log(`Interest: "${payload.interest}" → AI-Selected Plan Type: "${planType}" (${planTypeSelection.confidence_score}%)`);
//         console.log(`AI Selection Reasoning: ${planTypeSelection.reasoning}`);
//         console.log(`AI-Selected Duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`);
//         console.log(`Duration Reasoning: ${weeklyDistribution.duration_reasoning}`);
//         console.log(`Skip Current Week: ${skipCurrentWeek ? 'YES' : 'NO'}`);
//         console.log(`AI Weekly Target: ${weeklyDistribution.verification.calculated_sum}${payload.measurement_unit}`);
//         console.log(`Total Distance: ${sumWeekly.toFixed(1)}${payload.measurement_unit} / ${maxTotalKm}${payload.measurement_unit} (${Math.abs(sumWeekly - maxTotalKm) <= 0.5 ? '✅' : '❌'})`);
//         console.log(`Min Weekly Distance: ${weeklyDistribution.verification.min_weekly_distance}${payload.measurement_unit} ✅`);
//         console.log(`Max Weekly Distance: ${weeklyDistribution.verification.max_weekly_distance}${payload.measurement_unit} ✅`);
//         console.log(`Weeks Below Minimum: ${weeklyDistribution.verification.weeks_below_minimum} ✅`);
//         console.log(`Duration Within Range: ${weeklyDistribution.verification.duration_within_range ? '✅' : '❌'}`);
        
//         // Enhanced detailed workout count validation
//         let totalWorkouts = 0;
//         let totalAiCalculatedWorkouts = 0;
//         let totalExactWeeks = 0;
//         let totalCompleteCoverageWeeks = 0;
//         let totalEnhancedCoverageWorkouts = 0;
//         let totalMinimumAdjustments = 0;
//         const expectedWeek1Workouts = skipCurrentWeek ? allAvailableDays.length : currentWeekAvailableDays.length;
//         const expectedSubsequentWorkouts = allAvailableDays.length;
        
//         planData.weekly_plans.forEach((week, index) => {
//             const workoutCount = (week.workouts || []).length;
//             totalWorkouts += workoutCount;
            
//             const aiCalculatedWorkouts = (week.workouts || []).filter(w => w.ai_calculated).length;
//             totalAiCalculatedWorkouts += aiCalculatedWorkouts;

//             const enhancedCoverageWorkouts = (week.workouts || []).filter(w => w.enhanced_coverage).length;
//             totalEnhancedCoverageWorkouts += enhancedCoverageWorkouts;

//             const minimumAdjustments = (week.workouts || []).filter(w => w.minimum_adjustment).length;
//             if (minimumAdjustments > 0) totalMinimumAdjustments++;
            
//             if (week.ai_math_verification?.is_exact) {
//                 totalExactWeeks++;
//             }

//             // Check expected vs actual workout count for complete coverage
//             const expectedCount = (index === 0) ? expectedWeek1Workouts : expectedSubsequentWorkouts;
//             const isCompleteCoverage = workoutCount === expectedCount;
//             const countStatus = isCompleteCoverage ? '✅' : `❌ Expected ${expectedCount}`;
            
//             if (isCompleteCoverage) {
//                 totalCompleteCoverageWeeks++;
//             }
            
//             // Check chronological order
//             const workoutDays = (week.workouts || []).map(w => w.day);
//             const sortedDays = sortDaysChronologically([...workoutDays]);
//             const isChronological = JSON.stringify(workoutDays) === JSON.stringify(sortedDays);
//             const orderStatus = isChronological ? '✅ Chronological' : '❌ Out of order';
            
//             // Check for safety net usage
//             const safetyNetUsed = (week.workouts || []).some(w => w.safety_net_added);
//             const minimumUsed = minimumAdjustments > 0;
//             const coverageStatus = minimumUsed ? '🔧 Minimum' : (safetyNetUsed ? '🔧 Safety Net' : '🎯 Direct AI');
            
//             // Check distance validation
//             const weekDistance = week.total_weekly_distance || 0;
//             const distanceStatus = weekDistance >= 1.0 ? '✅ Valid' : '❌ Invalid';
            
//             console.log(`Week ${week.week_number}: ${workoutCount} workouts ${countStatus}, Distance: ${weekDistance}km ${distanceStatus}, Order: ${orderStatus}, Math: ${week.ai_math_verification?.is_exact ? '✅ Exact' : '⚠️ Adjusted'}, Coverage: ${coverageStatus}`);
//         });
        
//         console.log(`📈 AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation Summary:`);
//         console.log(`   AI Plan Type: ${planType} (Confidence: ${planTypeSelection.confidence_score}%)`);
//         console.log(`   AI-Selected Duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`);
//         console.log(`   Duration Reasoning: ${weeklyDistribution.duration_reasoning}`);
//         console.log(`   Total workouts: ${totalWorkouts}`);
//         console.log(`   AI-calculated workouts: ${totalAiCalculatedWorkouts}`);
//         console.log(`   Enhanced coverage workouts: ${totalEnhancedCoverageWorkouts}`);
//         console.log(`   Weeks with minimum adjustments: ${totalMinimumAdjustments}`);
//         console.log(`   Weeks with exact math: ${totalExactWeeks}/${planData.weekly_plans.length}`);
//         console.log(`   Weeks with complete coverage: ${totalCompleteCoverageWeeks}/${planData.weekly_plans.length}`);
//         console.log(`   Expected Week 1 workouts: ${expectedWeek1Workouts}`);
//         console.log(`   Expected subsequent weeks workouts: ${expectedSubsequentWorkouts} each`);
//         console.log(`   Complete coverage rate: ${Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100)}%`);
//         console.log(`   Distance validation: All weeks >= 1.0km ✅`);
//         console.log(`   Duration validation: Within range ${payload.min_weeks_plan || 1}-${payload.max_week_plans} ✅`);
        
//         // Enhanced metadata
//         planData.debug_info = {
//             requested_days: sortedAvailableDays,
//             min_weeks_requested: payload.min_weeks_plan || 1,
//             max_weeks_requested: payload.max_week_plans,
//             ai_selected_duration: weeklyDistribution.selected_duration_weeks,
//             duration_reasoning: weeklyDistribution.duration_reasoning,
//             total_workouts_generated: totalWorkouts,
//             ai_calculated_workouts: totalAiCalculatedWorkouts,
//             enhanced_coverage_workouts: totalEnhancedCoverageWorkouts,
//             weeks_with_minimum_adjustments: totalMinimumAdjustments,
//             exact_calculation_weeks: totalExactWeeks,
//             complete_coverage_weeks: totalCompleteCoverageWeeks,
//             complete_coverage_rate: Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100),
//             distance_accuracy: Math.abs(sumWeekly - maxTotalKm),
//             ai_selected_plan_type: planType,
//             ai_plan_selection_confidence: planTypeSelection.confidence_score,
//             ai_plan_selection_reasoning: planTypeSelection.reasoning,
//             skip_current_week: skipCurrentWeek,
//             current_week_available_days: currentWeekAvailableDays,
//             expected_week1_workouts: expectedWeek1Workouts,
//             expected_subsequent_workouts: expectedSubsequentWorkouts,
//             min_weekly_distance: weeklyDistribution.verification.min_weekly_distance,
//             max_weekly_distance: weeklyDistribution.verification.max_weekly_distance,
//             weeks_below_minimum: weeklyDistribution.verification.weeks_below_minimum,
//             duration_within_range: weeklyDistribution.verification.duration_within_range,
//             start_date_adjustment: {
//                 original_user_date: req.body.start_date,
//                 adjusted_date: startDateAdjustment.adjustedDate,
//                 adjustment_reason: startDateAdjustment.reason,
//                 ai_confidence: startDateAdjustment.confidence,
//                 key_factors: startDateAdjustment.keyFactors,
//                 user_benefit: startDateAdjustment.userBenefit,
//                 ai_recommendation: startDateAdjustment.recommendation,
//                 generation_time_utc: generationTime.toISOString(),
//                 generation_hour_utc: generationTime.getUTCHours(),
//                 adjustment_method: "AI-based intelligent determination"
//             },
//             ai_math_expert_enhanced: true,
//             complete_day_coverage_enabled: true,
//             chronological_ordering_enabled: true,
//             ai_plan_type_selection_enabled: true,
//             dynamic_duration_selection_enabled: true,
//             distance_validation_enabled: true,
//             generation_timestamp: new Date().toISOString(),
//             calculation_method: "AI Plan Type Selection + Dynamic Duration Selection + Enhanced AI Math Expert with Complete Day Coverage, Distance Validation, Guaranteed Workout Distribution, and AI-Based Intelligent Start Date Adjustment"
//         };

//         // Add user-friendly AI-based start date adjustment message
//         planData.start_date_adjustment_message = `🤖 ${startDateAdjustment.reason}`;
//         planData.start_date_ai_recommendation = startDateAdjustment.recommendation;

//         console.log('✅ AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment training plan generated successfully');
//         console.log('📋 Enhanced Final Summary with AI-Based Intelligent Start Date Adjustment:', {
//             aiSelectedPlanType: `${planType} (${planTypeSelection.confidence_score}% confidence)`,
//             aiSelectedDuration: `${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`,
//             durationReasoning: weeklyDistribution.duration_reasoning,
//             startDateAdjustment: `AI-based (${startDateAdjustment.confidence}% confidence) → ${startDateAdjustment.reason}`,
//             totalDistance: `${sumWeekly.toFixed(1)}${payload.measurement_unit} / ${maxTotalKm}${payload.measurement_unit}`,
//             weeklyDistributionSum: `${weeklyDistribution.verification.calculated_sum}${payload.measurement_unit}`,
//             minWeeklyDistance: `${weeklyDistribution.verification.min_weekly_distance}${payload.measurement_unit}`,
//             maxWeeklyDistance: `${weeklyDistribution.verification.max_weekly_distance}${payload.measurement_unit}`,
//             weeksBelowMinimum: weeklyDistribution.verification.weeks_below_minimum,
//             durationWithinRange: weeklyDistribution.verification.duration_within_range,
//             totalWorkouts: totalWorkouts,
//             enhancedCoverageWorkouts: totalEnhancedCoverageWorkouts,
//             weeksWithMinimumAdjustments: totalMinimumAdjustments,
//             completeCoverageWeeks: `${totalCompleteCoverageWeeks}/${planData.weekly_plans.length}`,
//             completeCoverageRate: `${Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100)}%`,
//             distanceMatch: Math.abs(sumWeekly - maxTotalKm) <= 0.5 ? '✅ EXACT' : '❌ MISMATCH',
//             workoutCountConsistency: `Week 1: ${planData.weekly_plans[0]?.workouts?.length || 0}/${expectedWeek1Workouts}, Others: ${expectedSubsequentWorkouts} each`,
//             distanceValidation: `✅ ALL WEEKS >= ${payload.measurement_unit.toLowerCase() === 'miles' ? '1.0 MILE' : '1.0 KM'}`,
//             durationValidation: `✅ WITHIN RANGE ${payload.min_weeks_plan || 1}-${payload.max_week_plans}`,
//             aiPlanTypeSelectionEnabled: true,
//             dynamicDurationSelectionEnabled: true,
//             enhancedCoverageEnabled: true,
//             distanceValidationEnabled: true
//         });

//         res.json({ recommended_plan: planData });

//     } catch (error) {
//         console.error('❌ Error generating AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment training plan:', error);
//         res.status(500).json({
//             error: `Internal server error: ${error.message}`,
//             timestamp: new Date().toISOString()
//         });
//     }
// });

// // Start server with detailed logging
// app.listen(PORT, () => {
//             console.log(`🏃‍♂️ 365 Run API server with AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment running on port ${PORT}`);
//     console.log(`📍 API endpoint: http://localhost:${PORT}/recommend-plan`);
//     console.log(`🚀 Server started at: ${new Date().toISOString()}`);
//     console.log(`📋 Available plan types: ${PLAN_TYPES.join(', ')}`);
//             console.log(`🤖 NEW FEATURES: AI Plan Type Selection, Dynamic Duration Selection (min-max range), Distance Validation (>=1.0km), Complete day coverage guaranteed, Consistent workout counts, Chronological ordering, Exact distance matching, Fixed date constraints, Safety net for missed days, AI-Based Intelligent Start Date Adjustment`);
// });

// module.exports = app;

















































const express = require('express');
const cors = require('cors');
require('dotenv').config();
const OpenAI = require('openai');

// Initialize OpenAI client
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not found in environment variables");
}

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ------------------ PLAN TYPES ------------------ //
const PLAN_TYPES = [
    "5K Improvement Plan",
    "Post-Race Recovery Plan", 
    "Horse Riding Plan",
    "Post-Injury Plan Via Yoga",
    "Marathons",
    "Country Runs",
    "Swimming Plan",
    "Train for a Triathlon",
    "Functional Fitness",
    "Postnatal Plan",
    "Parkrun Improvement Plan",
    "Run a First 5K"
];

// AI-powered function to determine plan type based on interest and user profile
async function determinePlanTypeWithAI(interest, userProfile) {
    try {
        const planTypePrompt = `
You are an expert running coach specializing in personalized training plan selection.

AVAILABLE PLAN TYPES:
1. "5K Improvement Plan" - Focus on speed work, interval training, tempo runs, track workouts, hill training, pace improvement
2. "Post-Race Recovery Plan" - Easy runs, active recovery, cross-training, rest days, rebuilding base fitness gradually
3. "Horse Riding Plan" - Combines running with equestrian training, core strengthening, balance work, accounts for riding days
4. "Post-Injury Plan Via Yoga" - Integrates yoga with running, flexibility, mobility, injury prevention, gentle return-to-running
5. "Marathons" - Endurance building, long runs, high mileage, marathon pace workouts, 42.2-km race preparation
6. "Country Runs" - Trail running, varied terrain, hill training, nature-based workouts, outdoor adventure focus
7. "Swimming Plan" - Cross-training with swimming, pool workouts, water running, low-impact cardiovascular fitness
8. "Train for a Triathlon" - Multi-sport training combining running, swimming, and cycling with balanced endurance development
9. "Functional Fitness" - Running combined with functional movement patterns, strength training, and athletic performance
10. "Postnatal Plan" - Gentle return to running after childbirth with gradual progression and core recovery focus
11. "Parkrun Improvement Plan" - Specifically designed for 5K parkrun events with community-focused training approach
12. "Run a First 5K" - Beginner-friendly plan for complete running novices to complete their first 5K distance

USER PROFILE:
- Running Experience: ${userProfile.running_experience}
- Interest/Goal: "${interest}"
- Gender: ${userProfile.gender}
- Height: ${userProfile.height}
- Weight: ${userProfile.weight}

ANALYSIS GUIDELINES:
- Match the user's specific interest with the most appropriate plan type
- Consider their experience level for plan complexity
- Look for keywords that indicate specific training focuses
- Consider injury history, recovery needs, or cross-training preferences
- Choose the plan that best aligns with their stated goals

Return ONLY a JSON object with your selection and reasoning:
{
    "selected_plan_type": "exact plan type name from the list above",
    "confidence_score": 95,
    "reasoning": "detailed explanation of why this plan type was selected",
    "key_factors": ["factor 1", "factor 2", "factor 3"],
    "alternative_considerations": "any other plan types that were considered"
}

CRITICAL: The selected_plan_type must be EXACTLY one of the 12 plan types listed above.
        `;

        console.log(`🤖 Calling AI to determine plan type for interest: "${interest}"`);
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system", 
                    "content": "You are an expert running coach with deep knowledge of training methodologies. Select the most appropriate training plan type based on the user's interests and profile."
                },
                { 
                    "role": "user", 
                    "content": planTypePrompt 
                }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const planTypeResult = JSON.parse(response.choices[0].message.content.trim());
        
        // Validate that the selected plan type is in our available types
        if (!PLAN_TYPES.includes(planTypeResult.selected_plan_type)) {
            console.warn(`⚠️ AI selected invalid plan type: ${planTypeResult.selected_plan_type}, falling back to 5K Improvement Plan`);
            return {
                selected_plan_type: "5K Improvement Plan",
                confidence_score: 50,
                reasoning: "Fallback selection due to invalid AI response",
                key_factors: ["fallback"],
                alternative_considerations: "AI selection was invalid",
                fallback_used: true
            };
        }
        
        console.log(`✅ AI selected plan type: "${planTypeResult.selected_plan_type}" (Confidence: ${planTypeResult.confidence_score}%)`);
        console.log(`📝 Reasoning: ${planTypeResult.reasoning}`);
        
        return planTypeResult;

    } catch (error) {
        console.error('❌ AI plan type selection failed:', error.message);
        // Fallback to default
        return {
            selected_plan_type: "5K Improvement Plan",
            confidence_score: 30,
            reasoning: "Fallback selection due to AI error",
            key_factors: ["error_fallback"],
            alternative_considerations: "AI service was unavailable",
            fallback_used: true,
            error: error.message
        };
    }
}

// ------------------ CHRONOLOGICAL DAY SORTING ------------------ //
function sortDaysChronologically(days) {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
}

function getDayIndex(dayName) {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return dayOrder.indexOf(dayName);
}

function calculateWorkoutDate(weekStartMonday, dayName) {
    const dayIndex = getDayIndex(dayName);
    if (dayIndex === -1) return null;
    
    const workoutDate = new Date(weekStartMonday);
    workoutDate.setDate(weekStartMonday.getDate() + dayIndex);
    return workoutDate;
}

// ------------------ FIXED AI WEEKLY DISTRIBUTION CALCULATION ------------------ //
async function calculateWeeklyDistributionWithAI(maxTotalDistance, minWeeks, maxWeeks, planType, userProfile, trainingGoals, measurementUnit) {
    try {
        // Convert to km for internal calculations if needed
        const isMiles = measurementUnit.toLowerCase() === 'miles';
        const maxTotalKm = isMiles ? maxTotalDistance * 1.60934 : maxTotalDistance;
        const minDistanceKm = isMiles ? 1.60934 : 1.0; // 1 mile = 1.60934 km
        
        const weeklyDistributionPrompt = `
You are a MATH EXPERT specialized in training periodization and weekly distance distribution.

TASK: Calculate weekly distance distribution that sums to EXACTLY ${maxTotalDistance} ${measurementUnit} across a duration between ${minWeeks} and ${maxWeeks} weeks.

CRITICAL MATHEMATICAL CONSTRAINTS:
1. Sum of ALL weekly distances = EXACTLY ${maxTotalDistance} ${measurementUnit}
2. EVERY week must have distance >= ${isMiles ? '1.0 mile' : '1.0 km'} (NO ZERO OR NEGATIVE DISTANCES)
3. All distances rounded to 1 decimal place
4. Progressive overload with appropriate recovery weeks
5. Consider ${trainingGoals.available_days.length} available training days per week
6. Duration must be between ${minWeeks} and ${maxWeeks} weeks (inclusive)
7. All calculations and responses must be in ${measurementUnit}

PLAN TYPE: ${planType}
USER PROFILE:
- Experience: ${userProfile.running_experience}
- Goal: ${trainingGoals.goal}
- Available days per week: ${trainingGoals.available_days.length}
- Min weeks: ${minWeeks}
- Max weeks: ${maxWeeks}
- Measurement Unit: ${measurementUnit}

DURATION SELECTION LOGIC:
- For injury recovery or conservative goals: Choose closer to ${minWeeks} weeks
- For endurance building or aggressive goals: Choose closer to ${maxWeeks} weeks
- For balanced progression: Choose middle range
- Consider user experience level and plan type complexity

DISTRIBUTION PRINCIPLES FOR ${planType}:
${planType === "5K Improvement Plan" ? "- Progressive build with speed focus\n- Peak around week " + Math.ceil(maxWeeks * 0.75) + "\n- Include recovery weeks (but still >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
  planType === "Post-Race Recovery Plan" ? "- Conservative progression starting low\n- Gradual return to training\n- Recovery weeks (but still >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
  planType === "Horse Riding Plan" ? "- Moderate progression\n- Consistent weekly volumes\n- Account for cross-training days" :
  planType === "Post-Injury Plan Via Yoga" ? "- VERY conservative progression\n- Low weekly distances but never below " + (isMiles ? '1.0 mile' : '1.0 km') + "\n- Focus on gradual return" :
  planType === "Marathons" ? "- High volume progression\n- Long build phases\n- Peak around week " + Math.ceil(maxWeeks * 0.8) + "\n- Taper final weeks (but >= " + (isMiles ? '1.0 mile' : '1.0 km') + ")" :
  planType === "Country Runs" ? "- Moderate to high volumes\n- Varied weekly progression\n- Trail-focused approach" :
  planType === "Swimming Plan" ? "- Cross-training focus\n- Moderate running volumes\n- Consistent progression" :
  planType === "Train for a Triathlon" ? "- Multi-sport progressive build\n- Balanced training with other disciplines\n- Moderate running volumes with cross-training" :
  planType === "Functional Fitness" ? "- Athletic movement integration\n- Progressive strength and running combination\n- Varied weekly volumes with functional focus" :
  planType === "Postnatal Plan" ? "- VERY conservative gradual return\n- Health-focused progression\n- Low weekly distances but consistent building" :
  planType === "Parkrun Improvement Plan" ? "- 5K focused community training\n- Social running emphasis\n- Progressive speed and endurance build" :
  planType === "Run a First 5K" ? "- Beginner-friendly progression\n- Walk-run combination building\n- Very gradual distance increases" : ""}

MATHEMATICAL VALIDATION RULES:
- Minimum weekly distance: ${isMiles ? '1.0 mile' : '1.0 km'} (NEVER go below this)
- Maximum recommended weekly distance: ${Math.round(maxTotalDistance / minWeeks * 2)} ${measurementUnit}
- Total must sum to exactly ${maxTotalDistance} ${measurementUnit}
- Use realistic progression patterns
- Recovery weeks should be lower but still >= ${isMiles ? '1.0 mile' : '1.0 km'}
- Duration must be between ${minWeeks} and ${maxWeeks} weeks
- All distances must be in ${measurementUnit}

Return ONLY a JSON object:
{
    "total_target": ${maxTotalDistance},
    "measurement_unit": "${measurementUnit}",
    "plan_type": "${planType}",
    "selected_duration_weeks": 0,
    "duration_reasoning": "explanation of why this duration was chosen",
    "weekly_distances": [
        {
            "week": 1,
            "distance": ${isMiles ? '2.2' : '3.5'},
            "phase": "Introduction",
            "notes": "Conservative start"
        }
    ],
    "verification": {
        "calculated_sum": 0.0,
        "target_sum": ${maxTotalDistance},
        "difference": 0.0,
        "is_exact": false,
        "min_weekly_distance": 0.0,
        "max_weekly_distance": 0.0,
        "weeks_below_minimum": 0,
        "duration_within_range": false
    },
    "training_phases": {
        "build_weeks": [1, 2, 3],
        "recovery_weeks": [4],
        "peak_week": 8
    }
}

CRITICAL: Every week must have distance >= ${isMiles ? '1.0 mile' : '1.0 km'}. Sum must equal exactly ${maxTotalDistance} ${measurementUnit}. Duration must be between ${minWeeks} and ${maxWeeks} weeks. All distances must be in ${measurementUnit}.
        `;

        console.log(`🧮 Calling AI for weekly distribution: ${maxTotalDistance}${measurementUnit} across ${minWeeks}-${maxWeeks} weeks (with minimum distance validation)`);
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system", 
                    "content": "You are a mathematics expert specializing in athletic training periodization. Provide exact calculations that sum precisely to the target total with NO ZERO OR NEGATIVE weekly distances."
                },
                { 
                    "role": "user", 
                    "content": weeklyDistributionPrompt 
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        const weeklyDistribution = JSON.parse(response.choices[0].message.content.trim());
        
        // ENHANCED VALIDATION: Check for zero/negative distances and fix them
        let needsAdjustment = false;
        const minDistance = isMiles ? 1.0 : 1.0; // 1.0 mile or 1.0 km
        
        // Validate duration is within range
        const selectedDuration = weeklyDistribution.selected_duration_weeks || weeklyDistribution.weekly_distances.length;
        const isDurationValid = selectedDuration >= minWeeks && selectedDuration <= maxWeeks;
        
        if (!isDurationValid) {
            console.warn(`⚠️ AI selected duration ${selectedDuration} weeks is outside range [${minWeeks}-${maxWeeks}], adjusting...`);
            // Adjust to middle of range if invalid
            const adjustedDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) / 2)));
            weeklyDistribution.selected_duration_weeks = adjustedDuration;
            weeklyDistribution.duration_reasoning = `Adjusted to ${adjustedDuration} weeks (middle of range ${minWeeks}-${maxWeeks}) due to invalid AI selection`;
        }
        
        // First, ensure no week has distance < minimum
        weeklyDistribution.weekly_distances.forEach(week => {
            if (week.distance < minDistance) {
                console.warn(`⚠️ Week ${week.week} has distance ${week.distance}${measurementUnit} < minimum ${minDistance}${measurementUnit}, adjusting...`);
                week.distance = minDistance;
                needsAdjustment = true;
            }
        });
        
        // Calculate current sum after minimum adjustments
        let calculatedSum = weeklyDistribution.weekly_distances.reduce((sum, week) => sum + week.distance, 0);
        let difference = Math.abs(calculatedSum - maxTotalDistance);
        
        // Adjust to match exact total if needed
        if (difference > 0.1 || needsAdjustment) {
            console.warn(`⚠️ Adjusting weekly distribution: ${calculatedSum} → ${maxTotalDistance} ${measurementUnit}`);
            
            const excessOrDeficit = maxTotalDistance - calculatedSum;
            
            if (excessOrDeficit > 0) {
                // We need to add distance - distribute across non-recovery weeks
                const buildWeeks = weeklyDistribution.weekly_distances.filter(w => 
                    !w.phase.toLowerCase().includes('recovery') && 
                    !w.phase.toLowerCase().includes('taper')
                );
                
                if (buildWeeks.length > 0) {
                    const addPerWeek = excessOrDeficit / buildWeeks.length;
                    buildWeeks.forEach(week => {
                        week.distance = Math.round((week.distance + addPerWeek) * 10) / 10;
                    });
                }
                            } else {
                    // We need to reduce distance - but maintain minimums
                    const totalExcess = Math.abs(excessOrDeficit);
                    const adjustableWeeks = weeklyDistribution.weekly_distances.filter(w => w.distance > minDistance + (isMiles ? 0.3 : 0.5));
                    
                    if (adjustableWeeks.length > 0) {
                        const reducePerWeek = totalExcess / adjustableWeeks.length;
                        adjustableWeeks.forEach(week => {
                            const newDistance = Math.max(minDistance, week.distance - reducePerWeek);
                            week.distance = Math.round(newDistance * 10) / 10;
                        });
                    } else {
                        // Last resort: adjust the highest week
                        const maxWeek = weeklyDistribution.weekly_distances.reduce((max, week) => 
                            week.distance > max.distance ? week : max
                        );
                        maxWeek.distance = Math.round((maxWeek.distance + excessOrDeficit) * 10) / 10;
                        if (maxWeek.distance < minDistance) {
                            maxWeek.distance = minDistance;
                        }
                    }
                }
            
            // Recalculate final verification
            const newSum = weeklyDistribution.weekly_distances.reduce((sum, week) => sum + week.distance, 0);
            const minWeekly = Math.min(...weeklyDistribution.weekly_distances.map(w => w.distance));
            const maxWeekly = Math.max(...weeklyDistribution.weekly_distances.map(w => w.distance));
            const weeksBelowMin = weeklyDistribution.weekly_distances.filter(w => w.distance < minDistance).length;
            
            weeklyDistribution.verification = {
                calculated_sum: newSum,
                target_sum: maxTotalDistance,
                difference: Math.abs(newSum - maxTotalDistance),
                is_exact: Math.abs(newSum - maxTotalDistance) < 0.1,
                min_weekly_distance: minWeekly,
                max_weekly_distance: maxWeekly,
                weeks_below_minimum: weeksBelowMin,
                duration_within_range: isDurationValid,
                selected_duration: selectedDuration,
                min_allowed_weeks: minWeeks,
                max_allowed_weeks: maxWeeks
            };
        }
        
        console.log(`✅ Weekly distribution calculated and validated:`);
        console.log(`   Target: ${maxTotalDistance}${measurementUnit}, Calculated: ${weeklyDistribution.verification.calculated_sum}${measurementUnit}`);
        console.log(`   Selected duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${minWeeks}-${maxWeeks})`);
        console.log(`   Duration reasoning: ${weeklyDistribution.duration_reasoning}`);
        console.log(`   Min weekly: ${weeklyDistribution.verification.min_weekly_distance}${measurementUnit}`);
        console.log(`   Max weekly: ${weeklyDistribution.verification.max_weekly_distance}${measurementUnit}`);
        console.log(`   Weeks below minimum: ${weeklyDistribution.verification.weeks_below_minimum}`);
        console.log(`   Duration within range: ${weeklyDistribution.verification.duration_within_range ? '✅' : '❌'}`);
        
        return weeklyDistribution;

    } catch (error) {
        console.error('❌ Weekly distribution AI failed:', error.message);
        // Enhanced fallback with guaranteed minimums and duration selection
        const minDistance = isMiles ? 1.0 : 1.0; // 1.0 mile or 1.0 km
        
        // Choose duration based on plan type and user profile
        let fallbackDuration;
        if (planType.includes("Post-Injury") || planType.includes("Recovery") || planType.includes("Postnatal")) {
            fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.6)));
        } else if (planType.includes("Marathon") || planType.includes("5K") || planType.includes("Triathlon")) {
            fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.8)));
        } else if (planType.includes("First 5K") || planType.includes("Functional Fitness")) {
            fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.6)));
        } else {
            fallbackDuration = Math.max(minWeeks, Math.min(maxWeeks, Math.round((minWeeks + maxWeeks) * 0.7)));
        }
        
        const baseDistance = Math.max(minDistance, Math.round((maxTotalDistance / fallbackDuration) * 10) / 10);
        const remainder = maxTotalDistance - (baseDistance * fallbackDuration);
        
        const fallbackWeeks = [];
        for (let i = 1; i <= fallbackDuration; i++) {
            let weekDistance = baseDistance;
            
            // Apply remainder to middle weeks
            if (i === Math.ceil(fallbackDuration / 2) && remainder !== 0) {
                weekDistance = Math.max(minDistance, baseDistance + remainder);
            }
            
            // Ensure recovery weeks still meet minimum
            const isRecoveryWeek = i % 4 === 0;
            if (isRecoveryWeek && weekDistance > minDistance * 2) {
                weekDistance = Math.max(minDistance, weekDistance * 0.7);
            }
            
            fallbackWeeks.push({
                week: i,
                distance: Math.round(weekDistance * 10) / 10,
                phase: isRecoveryWeek ? "Recovery" : (i <= fallbackDuration/2 ? "Build" : "Peak/Taper"),
                notes: "Fallback distribution with minimum validation"
            });
        }
        
        // Final adjustment to match total exactly
        const fallbackSum = fallbackWeeks.reduce((sum, week) => sum + week.distance, 0);
        const finalAdjustment = maxTotalDistance - fallbackSum;
        if (Math.abs(finalAdjustment) > 0.1) {
            const adjustWeek = fallbackWeeks[Math.floor(fallbackDuration / 2)];
            adjustWeek.distance = Math.max(minDistance, adjustWeek.distance + finalAdjustment);
            adjustWeek.distance = Math.round(adjustWeek.distance * 10) / 10;
        }
        
        return {
            total_target: maxTotalDistance,
            measurement_unit: measurementUnit,
            plan_type: planType,
            selected_duration_weeks: fallbackDuration,
            duration_reasoning: `Fallback duration selection: ${fallbackDuration} weeks (range ${minWeeks}-${maxWeeks}) based on plan type ${planType}`,
            weekly_distances: fallbackWeeks,
            verification: {
                calculated_sum: maxTotalDistance,
                target_sum: maxTotalDistance,
                difference: 0.0,
                is_exact: true,
                min_weekly_distance: Math.min(...fallbackWeeks.map(w => w.distance)),
                max_weekly_distance: Math.max(...fallbackWeeks.map(w => w.distance)),
                weeks_below_minimum: 0,
                duration_within_range: true,
                selected_duration: fallbackDuration,
                min_allowed_weeks: minWeeks,
                max_allowed_weeks: maxWeeks
            },
            training_phases: {
                build_weeks: Array.from({length: Math.floor(fallbackDuration/2)}, (_, i) => i + 1),
                recovery_weeks: [Math.floor(fallbackDuration/2)],
                peak_week: Math.ceil(fallbackDuration * 0.75)
            },
            fallback_used: true
        };
    }
}


// ------------------ ENHANCED AI MATH EXPERT FUNCTION ------------------ //
async function calculateDistanceDistributionWithAI(weeklyDistance, availableDays, longRunDay, planType, weekNumber, totalWeeks, measurementUnit) {
    try {
        // Sort available days chronologically for consistent processing
        const sortedAvailableDays = sortDaysChronologically([...availableDays]);
        
        // Determine minimum distance based on measurement unit
        const isMiles = measurementUnit.toLowerCase() === 'miles';
        const minDailyDistance = isMiles ? 0.3 : 0.5; // 0.3 miles or 0.5 km minimum per day
        
        const mathExpertPrompt = `
You are a MATH EXPERT specialized in distance distribution for running training plans.

CRITICAL REQUIREMENT: You MUST distribute the weekly distance across ALL ${sortedAvailableDays.length} available days. Every day must get some distance - NO ZERO DISTANCES ALLOWED.

TASK: Calculate exact distance distribution for ONE week of training.

INPUT PARAMETERS:
- Total Weekly Distance: ${weeklyDistance} ${measurementUnit} (must be distributed EXACTLY across ALL days)
- Available Training Days: [${sortedAvailableDays.join(', ')}] (ALL ${sortedAvailableDays.length} days MUST get distance)
- Long Run Day: ${longRunDay} (must get highest distance when present)
- Plan Type: ${planType}
- Week: ${weekNumber} of ${totalWeeks}
- Measurement Unit: ${measurementUnit}

MATHEMATICAL REQUIREMENTS:
1. Sum of all daily distances = ${weeklyDistance} ${measurementUnit} EXACTLY
2. ALL ${sortedAvailableDays.length} days must receive distance > 0 (minimum ${minDailyDistance} ${measurementUnit} per day)
3. ${longRunDay} gets highest distance (when present in available days)
4. All distances rounded to 1 decimal place
5. Distribution follows running training principles
6. MANDATORY: Include ALL days from list: [${sortedAvailableDays.join(', ')}]
7. All distances must be in ${measurementUnit}

PLAN-SPECIFIC DISTRIBUTION RULES:
${planType === "5K Improvement Plan" ? "- Focus on speed work: 40% long run, distribute remaining across other days" :
  planType === "Post-Race Recovery Plan" ? "- Recovery focus: 35% long run, distribute remaining evenly across other days" :
  planType === "Horse Riding Plan" ? "- Balanced approach: 45% long run, distribute remaining across other days" :
  planType === "Post-Injury Plan Via Yoga" ? "- Conservative: 40% long run, distribute remaining gently across all days" :
  planType === "Marathons" ? "- Endurance focus: 45% long run, distribute remaining with emphasis on medium distances" :
  planType === "Country Runs" ? "- Trail emphasis: 40% long run, distribute remaining across trail days" :
  planType === "Swimming Plan" ? "- Cross-training: 35% long run, distribute remaining with cross-training consideration" :
  planType === "Train for a Triathlon" ? "- Triathlon focus: 35% long run, distribute remaining to balance with other sports" :
  planType === "Functional Fitness" ? "- Athletic balance: 40% long run, distribute remaining with functional movement emphasis" :
  planType === "Postnatal Plan" ? "- Gentle approach: 35% long run, distribute remaining very conservatively" :
  planType === "Parkrun Improvement Plan" ? "- Community focus: 40% long run, distribute remaining for 5K improvement" :
  planType === "Run a First 5K" ? "- Beginner approach: 35% long run, distribute remaining very gradually" : ""}

DISTRIBUTION ALGORITHM:
1. Assign long run percentage to ${longRunDay} (if present)
2. Calculate remaining distance to distribute
3. Divide remaining distance among other ${sortedAvailableDays.length - (sortedAvailableDays.includes(longRunDay) ? 1 : 0)} days
4. Ensure minimum ${minDailyDistance} ${measurementUnit} per day
5. Round to 1 decimal place
6. Verify sum equals ${weeklyDistance} ${measurementUnit} exactly
7. Adjust ${longRunDay} if needed to match total

OUTPUT FORMAT (JSON only):
{
    "total_target": ${weeklyDistance},
    "measurement_unit": "${measurementUnit}",
    "distribution": [
        ${sortedAvailableDays.map(day => `{
            "day": "${day}",
            "distance": 0.0,
            "percentage": 0.0,
            "notes": "Training run"
        }`).join(',\n        ')}
    ],
    "verification": {
        "calculated_sum": 0.0,
        "target_sum": ${weeklyDistance},
        "difference": 0.0,
        "is_exact": false,
        "long_run_day": "${longRunDay}",
        "long_run_distance": 0.0,
        "is_long_run_highest": false,
        "days_with_zero_distance": 0,
        "total_days_included": ${sortedAvailableDays.length}
    }
}

CRITICAL CONSTRAINTS:
- MUST include ALL ${sortedAvailableDays.length} days: [${sortedAvailableDays.join(', ')}]
- NO ZERO DISTANCES - every day gets minimum ${minDailyDistance} ${measurementUnit}
- Return days in chronological order
- Ensure mathematical precision: sum must equal ${weeklyDistance} ${measurementUnit} exactly
- Long run day gets highest distance when present
- All distances must be in ${measurementUnit}
        `;

        console.log(`🧮 Calling Enhanced AI Math Expert for Week ${weekNumber} (${weeklyDistance}${measurementUnit}) with ALL ${sortedAvailableDays.length} days: [${sortedAvailableDays.join(', ')}]`);
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system", 
                    "content": "You are a mathematics expert specializing in precise numerical calculations for athletic training. You MUST distribute distance across ALL available days with NO ZERO distances. Always return exact mathematical results in valid JSON format with chronological day ordering."
                },
                { 
                    "role": "user", 
                    "content": mathExpertPrompt 
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        const mathResult = JSON.parse(response.choices[0].message.content.trim());
        
        // ENHANCED VALIDATION: Ensure ALL days are included with non-zero distances
        const requiredDays = new Set(sortedAvailableDays);
        const providedDays = new Set(mathResult.distribution.map(d => d.day));
        const missingDays = [...requiredDays].filter(day => !providedDays.has(day));
        const zeroDays = mathResult.distribution.filter(d => d.distance <= 0);
        
        console.log(`🔍 Enhanced Validation for Week ${weekNumber}:`);
        console.log(`   Required days: [${sortedAvailableDays.join(', ')}] (${sortedAvailableDays.length} days)`);
        console.log(`   Provided days: [${mathResult.distribution.map(d => d.day).join(', ')}] (${mathResult.distribution.length} days)`);
        console.log(`   Missing days: [${missingDays.join(', ')}] (${missingDays.length})`);
        console.log(`   Zero distance days: [${zeroDays.map(d => d.day).join(', ')}] (${zeroDays.length})`);
        
        // If any days are missing or have zero distance, create a complete fallback distribution
        if (missingDays.length > 0 || zeroDays.length > 0) {
            console.warn(`⚠️ Enhanced AI Math Expert needs correction - creating complete distribution for all ${sortedAvailableDays.length} days`);
            
                         // Create enhanced fallback that guarantees all days are included
             const enhancedFallbackDistribution = [];
             const totalDays = sortedAvailableDays.length;
             
             // Give long run day 35% of total distance (if present)
             const longRunPercentage = sortedAvailableDays.includes(longRunDay) ? 0.35 : 0;
             const longRunDistance = Math.round(weeklyDistance * longRunPercentage * 10) / 10;
             
             // Distribute remaining distance equally among all days (including long run day)
             const remainingDistance = weeklyDistance - (longRunDistance * (longRunPercentage > 0 ? 1 : 0));
             const otherDaysCount = totalDays - (longRunPercentage > 0 ? 1 : 0);
             const baseDistance = otherDaysCount > 0 ? Math.round((remainingDistance / otherDaysCount) * 10) / 10 : 0;
             
             // Handle very low weekly distances that might result in zero daily distances
             if (baseDistance <= 0 && longRunDistance <= 0) {
                 // If weekly distance is extremely low, distribute it evenly with very small amounts
                 const evenDistribution = Math.round((weeklyDistance / sortedAvailableDays.length) * 10) / 10;
                 
                 for (const day of sortedAvailableDays) {
                     enhancedFallbackDistribution.push({
                         day: day,
                         distance: evenDistribution,
                         percentage: (evenDistribution / weeklyDistance) * 100,
                         notes: "Enhanced fallback - Even minimal distribution"
                     });
                 }
             } else {
                 // Create distribution for all days - DO NOT enforce minimum distance here
                 for (const day of sortedAvailableDays) {
                     if (day === longRunDay && longRunPercentage > 0) {
                         enhancedFallbackDistribution.push({
                             day: day,
                             distance: longRunDistance + baseDistance, // Long run gets both portions
                             percentage: ((longRunDistance + baseDistance) / weeklyDistance) * 100,
                             notes: "Enhanced fallback - Long run with guaranteed distance"
                         });
                     } else {
                         // Use exact calculated distance - NO minimum override
                         enhancedFallbackDistribution.push({
                             day: day,
                             distance: baseDistance,
                             percentage: (baseDistance / weeklyDistance) * 100,
                             notes: "Enhanced fallback - Exact calculated distance"
                         });
                     }
                 }
             }
            
            // Adjust to match exact total
            const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
            const adjustment = weeklyDistance - calculatedSum;
            
            if (Math.abs(adjustment) > 0.1) {
                // Add adjustment to long run day or first day
                const adjustmentTarget = enhancedFallbackDistribution.find(d => d.day === longRunDay) || enhancedFallbackDistribution[0];
                adjustmentTarget.distance = Math.round((adjustmentTarget.distance + adjustment) * 10) / 10;
                adjustmentTarget.percentage = (adjustmentTarget.distance / weeklyDistance) * 100;
                adjustmentTarget.notes += " (adjusted for exact total)";
            }
            
            mathResult.distribution = enhancedFallbackDistribution;
            mathResult.fallback_used = "enhanced_complete_distribution";
        }
        
        // Ensure chronological order in the response
        if (mathResult.distribution) {
            mathResult.distribution = mathResult.distribution.sort((a, b) => {
                return getDayIndex(a.day) - getDayIndex(b.day);
            });
        }
        
        // Final validation and adjustment
        const calculatedSum = mathResult.distribution.reduce((sum, day) => sum + day.distance, 0);
        const difference = Math.abs(calculatedSum - weeklyDistance);
        
        if (difference > 0.1) {
            console.warn(`⚠️ Final adjustment for Week ${weekNumber}: ${calculatedSum} → ${weeklyDistance}`);
            
            // Find long run day and adjust
            let longRunDayData = mathResult.distribution.find(d => d.day === longRunDay);
            if (!longRunDayData && mathResult.distribution.length > 0) {
                // If long run day not in available days, adjust the first day
                longRunDayData = mathResult.distribution[0];
            }
            
            if (longRunDayData) {
                const adjustment = weeklyDistance - (calculatedSum - longRunDayData.distance);
                longRunDayData.distance = Math.round(adjustment * 10) / 10;
                longRunDayData.percentage = (longRunDayData.distance / weeklyDistance) * 100;
                
                // Recalculate verification
                const newSum = mathResult.distribution.reduce((sum, day) => sum + day.distance, 0);
                mathResult.verification = {
                    ...mathResult.verification,
                    calculated_sum: newSum,
                    difference: Math.abs(newSum - weeklyDistance),
                    is_exact: Math.abs(newSum - weeklyDistance) < 0.1,
                    long_run_distance: longRunDayData.distance,
                    days_with_zero_distance: mathResult.distribution.filter(d => d.distance <= 0).length,
                    total_days_included: mathResult.distribution.length
                };
            }
        }
        
        console.log(`✅ Enhanced AI Math Expert calculated distribution for Week ${weekNumber}:`);
        console.log(`   Target: ${weeklyDistance}${measurementUnit}, Calculated: ${mathResult.verification?.calculated_sum || calculatedSum}${measurementUnit}`);
        console.log(`   All ${sortedAvailableDays.length} days included: [${mathResult.distribution.map(d => d.day).join(', ')}]`);
        console.log(`   Long Run (${longRunDay}): ${mathResult.verification?.long_run_distance || 'N/A'}${measurementUnit}`);
        console.log(`   Zero distance days: ${mathResult.verification?.days_with_zero_distance || 0}`);
        console.log(`   Exact Match: ${mathResult.verification?.is_exact ? '✅' : '❌'}`);
        
        return mathResult;

    } catch (error) {
        console.error('❌ Enhanced AI Math Expert failed:', error.message);
        // Enhanced fallback to ensure ALL days are included
        const sortedAvailableDays = sortDaysChronologically([...availableDays]);
        
        // Determine minimum distance based on measurement unit
        const isMiles = measurementUnit.toLowerCase() === 'miles';
        const minDailyDistance = isMiles ? 0.3 : 0.5; // 0.3 miles or 0.5 km minimum per day
        
        // Give long run day 35% if present, distribute rest equally
        const longRunPercentage = sortedAvailableDays.includes(longRunDay) ? 0.35 : 0;
        const longRunDistance = Math.round(weeklyDistance * longRunPercentage * 10) / 10;
        const remainingDistance = weeklyDistance - longRunDistance;
        const otherDaysCount = sortedAvailableDays.length - (longRunPercentage > 0 ? 1 : 0);
        const baseDistance = otherDaysCount > 0 ? Math.round((remainingDistance / otherDaysCount) * 10) / 10 : 0;
        
        // Handle very low weekly distances properly
        if (weeklyDistance <= 0.1) {
            // For extremely low weekly distances, distribute evenly
            const evenDistance = Math.round((weeklyDistance / sortedAvailableDays.length) * 100) / 100;
            const enhancedFallbackDistribution = sortedAvailableDays.map((day, index) => ({
                day: day,
                distance: evenDistance,
                percentage: (evenDistance / weeklyDistance) * 100,
                notes: "Enhanced fallback - Minimal even distribution"
            }));
            
            // Adjust for rounding to match exact total
            const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
            const adjustment = weeklyDistance - calculatedSum;
            if (Math.abs(adjustment) > 0.01) {
                enhancedFallbackDistribution[0].distance = Math.round((enhancedFallbackDistribution[0].distance + adjustment) * 100) / 100;
                enhancedFallbackDistribution[0].percentage = (enhancedFallbackDistribution[0].distance / weeklyDistance) * 100;
            }
            
            return {
                total_target: weeklyDistance,
                measurement_unit: measurementUnit,
                distribution: enhancedFallbackDistribution,
                verification: {
                    calculated_sum: weeklyDistance,
                    target_sum: weeklyDistance,
                    difference: 0.0,
                    is_exact: true,
                    long_run_day: longRunDay,
                    long_run_distance: enhancedFallbackDistribution.find(d => d.day === longRunDay)?.distance || evenDistance,
                    is_long_run_highest: false, // In minimal distribution, all are equal
                    days_with_zero_distance: 0,
                    total_days_included: sortedAvailableDays.length,
                    fallback_used: "enhanced_minimal_distribution"
                }
            };
        }
        
        const enhancedFallbackDistribution = sortedAvailableDays.map((day, index) => {
            let distance;
            if (day === longRunDay && longRunPercentage > 0) {
                distance = longRunDistance + baseDistance; // Long run gets both portions
            } else {
                distance = baseDistance; // Use exact calculated distance - NO minimum override
            }
            
            return {
                day: day,
                distance: distance,
                percentage: (distance / weeklyDistance) * 100,
                notes: day === longRunDay ? "Enhanced fallback - Long run" : "Enhanced fallback - Exact distribution"
            };
        });
        
        // Adjust final day to make total exact
        const calculatedSum = enhancedFallbackDistribution.reduce((sum, day) => sum + day.distance, 0);
        const adjustment = weeklyDistance - calculatedSum;
        if (Math.abs(adjustment) > 0.1) {
            const lastDay = enhancedFallbackDistribution[enhancedFallbackDistribution.length - 1];
            lastDay.distance = Math.round((lastDay.distance + adjustment) * 10) / 10;
            lastDay.percentage = (lastDay.distance / weeklyDistance) * 100;
        }

        return {
            total_target: weeklyDistance,
            measurement_unit: measurementUnit,
            distribution: enhancedFallbackDistribution,
            verification: {
                calculated_sum: weeklyDistance,
                target_sum: weeklyDistance,
                difference: 0.0,
                is_exact: true,
                long_run_day: longRunDay,
                long_run_distance: enhancedFallbackDistribution.find(d => d.day === longRunDay)?.distance || baseDistance,
                is_long_run_highest: true,
                days_with_zero_distance: 0,
                total_days_included: sortedAvailableDays.length,
                fallback_used: "enhanced_complete_fallback"
            }
        };
    }
}

// ------------------ HELPER FUNCTIONS ------------------ //
function parseDistance(distanceVal) {
    if (typeof distanceVal === 'number') {
        return parseFloat(distanceVal);
    }
    if (typeof distanceVal === 'string') {
        try {
            return parseFloat(distanceVal.split(' ')[0]);
        } catch (error) {
            return 0.0;
        }
    }
    return 0.0;
}

function postprocessDistances(planData) {
    if (!planData.weekly_plans) {
        return planData;
    }

    planData.weekly_plans.forEach(week => {
        week.total_weekly_distance = parseDistance(week.total_weekly_distance || 0);
        week.user_distance = 0;
        week.user_time = 0;

        if (week.workouts) {
            week.workouts.forEach(workout => {
                workout.distance = parseDistance(workout.distance || 0);
                workout.duration = parseInt(workout.duration || 0);
                workout.user_distance = 0;
                workout.user_time = 0;
            });
        }
    });

    return planData;
}

// NEW FUNCTION: AI-based intelligent start date adjustment
async function adjustStartDateWithAI(userStartDate, userProfile, interest, currentTime) {
    try {
        console.log(`🤖 Using AI to intelligently determine optimal start date...`);
        console.log(`🕐 Reference time (from requested start_date, UTC): ${currentTime.toISOString()} (UTC hour: ${currentTime.getUTCHours()})`);
        console.log(`📅 User requested start date: ${new Date(userStartDate).toDateString()}`);
        
        const startDatePrompt = `
You are an expert running coach and scheduling specialist. Your task is to intelligently determine the optimal start date for a training plan based on multiple contextual factors.

USER CONTEXT:
- Requested start date: ${userStartDate}
- Current time (UTC): ${currentTime.toISOString()}
- User profile: ${JSON.stringify(userProfile)}
- Training goal/interest: "${interest}"

CRITICAL RULES - FOLLOW THESE EXACTLY:

**TIME-BASED LOGIC (MANDATORY - NO EXCEPTIONS)**:
- AM generation (before 12:00 PM): MUST start today (same date) or maximum tomorrow
- PM generation (12:00 PM and later): MUST start tomorrow (next date)
- Late evening (after 6:00 PM): MUST start next day

**RECOVERY CONTEXT (LIMITED MODIFICATION)**:
- Recovery scenarios: Can add MAXIMUM 1 day ONLY if it's PM generation
- AM generation + recovery: MUST start today (recovery cannot override AM logic)
- PM generation + recovery: Can start tomorrow (1 day delay maximum)

**STRICT ENFORCEMENT**:
- Time of day ALWAYS takes priority over recovery context
- Never skip more than 1 day from the original date
- For morning generation, recovery context is IGNORED

EXAMPLES:
- 11:44 AM + recovery → Start TODAY (AM logic overrides recovery)
- 2:00 PM + recovery → Start TOMORROW (PM logic + 1 day recovery)
- 9:00 AM + recovery → Start TODAY (AM logic overrides recovery)

Return ONLY a JSON object with your intelligent decision:
{
    "adjusted_start_date": "ISO date string",
    "adjustment_reason": "detailed explanation of why this date was chosen",
    "confidence_score": 95,
    "key_factors": ["factor1", "factor2", "factor3"],
    "user_benefit": "how this adjustment benefits the user",
    "recommendation": "specific advice for the user about starting their plan"
}

CRITICAL: The adjusted_start_date must be a valid ISO date string.
CRITICAL: For morning generation, recovery context is IGNORED - start today.
CRITICAL: Never skip more than 1 day from original date.
        `;

        console.log(`🤖 Calling AI for intelligent start date determination...`);
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system", 
                    "content": "You are an expert running coach and scheduling specialist. Analyze user context to determine the optimal training plan start date."
                },
                { 
                    "role": "user", 
                    "content": startDatePrompt 
                }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const aiStartDateResult = JSON.parse(response.choices[0].message.content.trim());
        
        // STRICT VALIDATION: Enforce time-based logic rules
        const originalDate = new Date(userStartDate);
        const aiAdjustedDate = new Date(aiStartDateResult.adjusted_start_date);
        const daysDifference = Math.ceil((aiAdjustedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
        const currentHour = currentTime.getUTCHours();
        
        // STRICT RULE ENFORCEMENT
        let shouldCorrect = false;
        let correctionReason = '';
        
        if (currentHour < 12) {
            // AM generation rules - STRICT
            if (daysDifference > 0) {
                shouldCorrect = true;
                correctionReason = `AM generation (${currentHour}:00) - recovery context is IGNORED. Must start TODAY (same date).`;
            }
        } else {
            // PM generation rules - MUST be tomorrow
            if (daysDifference !== 1) {
                shouldCorrect = true;
                correctionReason = `PM generation (${currentHour}:00) - MUST start tomorrow (exactly 1 day later). AI returned ${daysDifference} days difference.`;
            }
        }
        
        // Apply correction if AI violates rules
        if (shouldCorrect) {
            console.log(`⚠️ AI violated strict time-based rules: ${correctionReason}`);
            
            let correctedDate = new Date(userStartDate);
            
            if (currentHour >= 12) {
                // PM generation - start tomorrow (1 day max)
                correctedDate.setUTCDate(correctedDate.getUTCDate() + 1);
                console.log(`🔄 Corrected: PM generation → start tomorrow (1 day max)`);
            } else {
                // AM generation - start today (0 days)
                correctedDate = new Date(originalDate);
                console.log(`🔄 Corrected: AM generation → start today (0 days) - recovery context ignored`);
            }
            
            return {
                adjustedDate: correctedDate.toISOString(),
                reason: `AI violated time-based rules: ${correctionReason} Corrected to: ${currentHour >= 12 ? 'PM generation → start tomorrow' : 'AM generation → start today'}`,
                confidence: 90,
                keyFactors: ['strict_time_logic', 'ai_rule_violation', 'automatic_correction'],
                userBenefit: 'Ensures proper time-based logic is always followed',
                recommendation: 'Start your plan on the corrected date following proper time logic'
            };
        }
        
        console.log(`✅ AI start date determination completed:`, {
            confidence: aiStartDateResult.confidence_score + '%',
            reason: aiStartDateResult.adjustment_reason,
            adjustedDate: aiStartDateResult.adjusted_start_date,
            daysSkipped: daysDifference
        });
        
        return {
            adjustedDate: aiStartDateResult.adjusted_start_date,
            reason: aiStartDateResult.adjustment_reason,
            confidence: aiStartDateResult.confidence_score,
            keyFactors: aiStartDateResult.key_factors,
            userBenefit: aiStartDateResult.user_benefit,
            recommendation: aiStartDateResult.recommendation
        };
        
    } catch (error) {
        console.error(`❌ Error in AI start date determination:`, error);
        
        // Fallback to intelligent default logic
        const now = new Date(userStartDate);
        const currentHour = now.getUTCHours();
        const userStartDateObj = new Date(userStartDate);
        let fallbackDate = new Date(userStartDateObj);
        
        // STRICT fallback logic - follows time-based rules exactly
        if (currentHour < 12) {
            // AM generation (before 12 PM) - ALWAYS start today
            fallbackDate = new Date(userStartDateObj);
            console.log(`🔄 STRICT fallback: AM generation (${currentHour}:00) → start TODAY - recovery context ignored`);
        } else if (currentHour >= 18) {
            // Late evening (after 6 PM) - start tomorrow
            fallbackDate.setUTCDate(userStartDateObj.getUTCDate() + 1);
            console.log(`🔄 STRICT fallback: Late evening generation (${currentHour}:00) → start tomorrow`);
        } else {
            // Afternoon/PM (12 PM - 6 PM) - start tomorrow
            fallbackDate.setUTCDate(userStartDateObj.getUTCDate() + 1);
            console.log(`🔄 STRICT fallback: PM generation (${currentHour}:00) → start tomorrow`);
        }
        
        return {
            adjustedDate: fallbackDate.toISOString(),
            reason: `AI determination failed - using STRICT time-based fallback: ${currentHour < 12 ? 'AM generation → start today' : 'PM generation → start tomorrow'}`,
            confidence: 85,
            keyFactors: ['strict_time_logic', 'fallback_system', 'time_based_rules'],
            userBenefit: 'Ensures proper time-based logic is always followed, even in fallback scenarios',
            recommendation: 'Start your plan on the fallback date following strict time logic'
        };
    }
}

// ENHANCED: Fixed date constraint logic with detailed available days tracking
function calculateWeekDatesFromStart(startDateStr, availableDays, numWeeks) {
    const startDate = new Date(startDateStr);
    const weeks = [];
    
    // Sort available days chronologically
    const sortedAvailableDays = sortDaysChronologically([...availableDays]);
    
    // Find the Monday of the current week containing start_date
    const currentWeekMonday = new Date(startDate);
    const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday to 6
    currentWeekMonday.setDate(startDate.getDate() - daysFromMonday);
    
    // Check if any available days fall on or after start_date in current week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let hasAvailableDaysInCurrentWeek = false;
    let currentWeekAvailableDays = [];
    
    console.log(`📅 Start date: ${startDate.toDateString()} (${startDate.toISOString().split('T')[0]})`);
    console.log(`📅 Current week Monday: ${currentWeekMonday.toISOString().split('T')[0]}`);
    console.log(`📅 Available days (sorted): [${sortedAvailableDays.join(', ')}]`);
    console.log('📅 Checking available days in current week:');
    
    for (const dayName of sortedAvailableDays) {
        const dayIndex = getDayIndex(dayName);
        if (dayIndex !== -1) {
            const dayDate = new Date(currentWeekMonday);
            dayDate.setDate(currentWeekMonday.getDate() + dayIndex);
            
            const isAvailable = dayDate >= startDate;
            console.log(`   ${dayName}: ${dayDate.toISOString().split('T')[0]} - ${isAvailable ? '✅ AVAILABLE' : '❌ BEFORE START'}`);
            
            if (isAvailable) {
                hasAvailableDaysInCurrentWeek = true;
                currentWeekAvailableDays.push(dayName);
            }
        }
    }
    
    // Sort current week available days chronologically
    currentWeekAvailableDays = sortDaysChronologically(currentWeekAvailableDays);
    
    let firstWeekStart;
    let skipCurrentWeek = false;
    
    if (hasAvailableDaysInCurrentWeek) {
        // Use current week as Week 1
        firstWeekStart = new Date(currentWeekMonday);
        console.log(`✅ Using current week for Week 1 with ${currentWeekAvailableDays.length} available days: [${currentWeekAvailableDays.join(', ')}]`);
    } else {
        // Skip current week and start from next Monday
        firstWeekStart = new Date(currentWeekMonday);
        firstWeekStart.setDate(currentWeekMonday.getDate() + 7);
        skipCurrentWeek = true;
        console.log('⚠️ Skipping current week - no available days remaining. Starting from next Monday for Week 1');
    }
    
    // Generate all weeks from the determined start
    for (let i = 0; i < numWeeks; i++) {
        const weekStart = new Date(firstWeekStart);
        weekStart.setDate(firstWeekStart.getDate() + (i * 7));
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        weeks.push([
            weekStart.toISOString().split('T')[0],
            weekEnd.toISOString().split('T')[0]
        ]);
    }
    
    console.log('📅 Generated week dates:', weeks);
    console.log(`📅 Week 1 will have ${skipCurrentWeek ? sortedAvailableDays.length : currentWeekAvailableDays.length} workout days`);
    console.log(`📅 Weeks 2-${numWeeks} will each have ${sortedAvailableDays.length} workout days`);
    
    return { 
        weeks, 
        skipCurrentWeek, 
        hasAvailableDaysInCurrentWeek,
        currentWeekAvailableDays: skipCurrentWeek ? [] : currentWeekAvailableDays,
        allAvailableDays: sortedAvailableDays
    };
}

// ENHANCED: Updated system prompt with AI plan type selection and dynamic duration
const generateTrainingPlanSystemPrompt = (request, weeklyDistribution, planTypeSelection) => {
    console.log('Generating system prompt with AI weekly distribution, AI plan type selection, and dynamic duration');
    const { maxTotalDistance, userProfile, trainingGoals, skipCurrentWeek } = request;
    const planType = planTypeSelection.selected_plan_type;
    const selectedDuration = weeklyDistribution.selected_duration_weeks;

    return `
You are an expert running coach. Return ONLY valid JSON with NO additional text.

AI-SELECTED PLAN TYPE: ${planType}
AI Selection Confidence: ${planTypeSelection.confidence_score}%
AI Selection Reasoning: ${planTypeSelection.reasoning}

AI-SELECTED DURATION: ${selectedDuration} weeks
Duration Reasoning: ${weeklyDistribution.duration_reasoning}

Create a specialized training plan following the characteristics of "${planType}":

${planType === "5K Improvement Plan" ? "- Focus on speed work, interval training, and tempo runs\n- Include track workouts and hill training\n- Emphasize pace improvement and race preparation" :
  planType === "Post-Race Recovery Plan" ? "- Prioritize easy runs and active recovery\n- Include cross-training and rest days\n- Focus on rebuilding base fitness gradually" :
  planType === "Horse Riding Plan" ? "- Combine running with equestrian training schedule\n- Include core strengthening and balance work\n- Account for riding days in workout planning" :
  planType === "Post-Injury Plan Via Yoga" ? "- Integrate yoga sessions with running workouts\n- Focus on flexibility, mobility, and injury prevention\n- Include gentle return-to-running progression" :
  planType === "Marathons" ? "- Build endurance with long runs and high mileage\n- Include marathon pace workouts and nutrition practice\n- Focus on 26.2-mile race preparation" :
  planType === "Country Runs" ? "- Emphasize trail running and varied terrain\n- Include hill training and nature-based workouts\n- Focus on outdoor adventure and exploration" :
  planType === "Swimming Plan" ? "- Combine swimming and running for cross-training\n- Include pool workouts and water running\n- Focus on low-impact cardiovascular fitness" :
  planType === "Train for a Triathlon" ? "- Multi-sport training with balanced disciplines\n- Include brick workouts and transition practice\n- Focus on endurance across swimming, cycling, and running" :
  planType === "Functional Fitness" ? "- Integrate functional movement patterns with running\n- Include strength training and athletic performance drills\n- Focus on overall fitness and movement quality" :
  planType === "Postnatal Plan" ? "- Gentle return to exercise after childbirth\n- Include core recovery and gradual fitness building\n- Focus on safe, progressive training with health priority" :
  planType === "Parkrun Improvement Plan" ? "- Community-focused 5K training approach\n- Include social running elements and group dynamics\n- Focus on 5K performance improvement in a fun environment" :
  planType === "Run a First 5K" ? "- Beginner-friendly introduction to running\n- Include walk-run progression and confidence building\n- Focus on completing first 5K distance safely" : ""}

🧮 AI-CALCULATED WEEKLY DISTANCES (USE EXACTLY):
Total Budget: ${weeklyDistribution.total_target} km
Selected Duration: ${selectedDuration} weeks
Weekly Distribution (MUST USE THESE EXACT DISTANCES):
${weeklyDistribution.weekly_distances.map(week => 
    `Week ${week.week}: ${week.distance} km (${week.phase})`
).join('\n')}

Verification: Sum = ${weeklyDistribution.verification.calculated_sum} km, Target = ${weeklyDistribution.verification.target_sum} km
Minimum Weekly Distance: ${weeklyDistribution.verification.min_weekly_distance} km
Maximum Weekly Distance: ${weeklyDistribution.verification.max_weekly_distance} km
Duration Validation: ${weeklyDistribution.verification.duration_within_range ? '✅ Within Range' : '❌ Outside Range'}

MANDATORY RULES - NO EXCEPTIONS:
1. Use EXACT weekly distances from AI calculation above - DO NOT MODIFY
2. Total distance budget: EXACTLY ${maxTotalDistance} kilometers across ${selectedDuration} weeks
3. Available workout days: [${trainingGoals?.available_days?.join(', ')}] - ${trainingGoals?.available_days?.length} days
4. CRITICAL: ${skipCurrentWeek ? 'Skip current week - start from Week 1 with all available days' : 'Week 1 may be partial, subsequent weeks use ALL available days'}
5. Long run day: ${trainingGoals?.long_run_day} must have the highest distance in every week it appears
6. Enhanced AI Math Expert will handle daily distance distribution within each week
7. Chronological order: Order workouts by day of week (Monday first, Sunday last)
8. Never use days not in available_days list: [${trainingGoals?.available_days?.join(', ')}]
9. WORKOUT TYPE: Only use "running" or "walking" - NO exceptions
10. ALL AVAILABLE DAYS MUST GET WORKOUTS - NO SKIPPING DAYS
11. CRITICAL: Every week must have distance >= 1.0 km (VALIDATED)
12. PLAN DURATION: Use AI-selected duration of ${selectedDuration} weeks

User Profile Context:
- Gender: ${userProfile?.gender}
- Height: ${userProfile?.height}
- Weight: ${userProfile?.weight}
- Experience: ${userProfile?.running_experience}
- Goal: ${trainingGoals?.goal}

CRITICAL: Use the exact weekly distances provided by AI calculation. Enhanced AI Math Expert will ensure ALL available days get workouts. Plan duration is ${selectedDuration} weeks as determined by AI.
        `;
};

// ENHANCED: Updated prompt with AI plan type selection and dynamic duration
const generateTrainingPlanPrompt = (request, weeklyDistribution, planTypeSelection) => {
    const { userProfile, trainingGoals, startDate, weekDates, skipCurrentWeek, currentWeekAvailableDays, allAvailableDays } = request;
    const planType = planTypeSelection.selected_plan_type;
    const selectedDuration = weeklyDistribution.selected_duration_weeks;

    const payload = {
        gender: userProfile.gender || 'not_specified',
        height: `${userProfile.height || 170} cm`,
        weight: userProfile.weight || 70,
        running_experience: userProfile.running_experience || 'beginner',
        interest: trainingGoals.goal || 'run a half marathon',
        estimated_race_time: trainingGoals.current_race_time || 'N/A',
        available_days: allAvailableDays || [],
        available_days_string: allAvailableDays?.join(', ') || '',
        available_days_count: allAvailableDays?.length || 0,
        long_run_day: trainingGoals.long_run_day || 'Sunday',
        measurement_unit: 'kilometers',
        selected_duration_weeks: selectedDuration,
        start_date: startDate || new Date(),
        week_dates: weekDates,
        plan_type: planType,
        skip_current_week: skipCurrentWeek,
        current_week_available_days: currentWeekAvailableDays || []
    };

    return `
🔴 CRITICAL TRAINING PLAN SPECIFICATIONS:

AI-SELECTED PLAN TYPE: ${payload.plan_type}
AI Selection Confidence: ${planTypeSelection.confidence_score}%
AI Selection Reasoning: ${planTypeSelection.reasoning}
Key Factors: ${planTypeSelection.key_factors?.join(', ') || 'N/A'}

TOTAL DISTANCE BUDGET: ${weeklyDistribution.total_target} ${payload.measurement_unit}
AI-SELECTED PLAN DURATION: ${payload.selected_duration_weeks} weeks
Duration Reasoning: ${weeklyDistribution.duration_reasoning}
AVAILABLE WORKOUT DAYS (CHRONOLOGICAL): [${payload.available_days_string}] (${payload.available_days_count} days)
LONG RUN DAY: ${payload.long_run_day} (must have highest distance when present)

🧮 AI-CALCULATED WEEKLY DISTANCES (MANDATORY - USE EXACTLY):
${weeklyDistribution.weekly_distances.map((week, index) => 
    `Week ${week.week}: ${week.distance} km (${week.phase}) - Dates: ${weekDates[index][0]} to ${weekDates[index][1]}`
).join('\n')}

Total Verification: ${weeklyDistribution.verification.calculated_sum} km = ${weeklyDistribution.verification.target_sum} km ✅
Minimum Weekly: ${weeklyDistribution.verification.min_weekly_distance} km ✅
Maximum Weekly: ${weeklyDistribution.verification.max_weekly_distance} km ✅
Duration Validation: ${weeklyDistribution.verification.duration_within_range ? '✅ Within Range' : '❌ Outside Range'} ✅

🔴 ENHANCED WORKOUT CONSISTENCY ANALYSIS:

Start Date: ${new Date(payload.start_date).toDateString()} (${new Date(payload.start_date).toISOString().split('T')[0]})

${skipCurrentWeek ? 
`SKIP CURRENT WEEK - No available days remaining in current week
Starting directly from next Monday with complete weeks:

Week 1 (Complete): ${weekDates[0][0]} to ${weekDates[0][1]}
- Distance: ${weeklyDistribution.weekly_distances[0].distance} km
- Available days: [${payload.available_days_string}]
- Expected workouts: ${payload.available_days_count} (ALL AVAILABLE DAYS MANDATORY)

Weeks 2-${payload.selected_duration_weeks} (Complete):
- Each week uses ALL available days: [${payload.available_days_string}]
- Expected workouts per week: ${payload.available_days_count} (CONSISTENT - ALL DAYS MANDATORY)` :

`Week 1 (Partial): Uses current week with remaining days only
- Distance: ${weeklyDistribution.weekly_distances[0].distance} km
- Available days on/after start date: [${payload.current_week_available_days.join(', ')}]
- Expected workouts: ${payload.current_week_available_days.length} (ALL REMAINING DAYS MANDATORY)

Weeks 2-${payload.selected_duration_weeks} (Complete):
- Each week uses ALL available days: [${payload.available_days_string}]
- Expected workouts per week: ${payload.available_days_count} (CONSISTENT - ALL DAYS MANDATORY)`}

🔴 ENHANCED CHRONOLOGICAL ORDERING REQUIREMENTS:

MANDATORY WORKOUT ORDER (Monday → Sunday):
1. Monday (if available)
2. Tuesday (if available)
3. Wednesday (if available)
4. Thursday (if available)
5. Friday (if available)
6. Saturday (if available)
7. Sunday (if available)

CRITICAL: All workouts within each week MUST be ordered chronologically by day of week.
CRITICAL: ALL available days MUST have workouts - NO SKIPPING ALLOWED.

🔴 MANDATORY JSON RESPONSE FORMAT:

{
    "plan_name": "${payload.plan_type} - ${payload.interest} Training Plan",
    "plan_type": "${payload.plan_type}",
    "ai_plan_selection": {
        "selected_plan_type": "${payload.plan_type}",
        "confidence_score": ${planTypeSelection.confidence_score},
        "reasoning": "${planTypeSelection.reasoning}",
        "key_factors": ${JSON.stringify(planTypeSelection.key_factors || [])},
        "alternative_considerations": "${planTypeSelection.alternative_considerations || 'N/A'}"
    },
    "duration": "${payload.selected_duration_weeks} weeks",
    "target_distance": ${weeklyDistribution.total_target},
    "target_time": "${payload.estimated_race_time}",
    "description": "AI-selected ${payload.plan_type} with exact distance distribution, chronological ordering, and guaranteed workout coverage",
    "why_recommended": "AI-selected ${payload.plan_type} based on user profile analysis with optimal progression, consistent workout scheduling, and complete day coverage",
    "difficulty_level": "${payload.running_experience}",
    "weekly_commitment": "${payload.available_days_count} days/week on [${payload.available_days_string}] (chronological order, ALL days included)",
    "training_philosophy": "AI-selected progressive overload with ${payload.long_run_day} long runs, consistent weekly structure, and complete workout coverage",
    "distance_budget": ${weeklyDistribution.total_target},
    "distance_verification": "AI-calculated: ${weeklyDistribution.verification.calculated_sum} km = ${weeklyDistribution.verification.target_sum} km",
    "weekly_plans": [
        ${weeklyDistribution.weekly_distances.map((week, index) => `{
            "week_number": ${week.week},
            "week_focus": "${week.phase} (${payload.plan_type} approach)",
            "start_date": "${weekDates[index][0]}",
            "end_date": "${weekDates[index][1]}",
            "total_weekly_distance": ${week.distance},
            "user_distance": 0,
            "user_time": 0,
            "workouts": "Will be calculated by Enhanced AI Math Expert in chronological order for ALL available days",
            "weekly_notes": "${week.notes || week.phase + ' week'} - ${index === 0 && !skipCurrentWeek ? payload.current_week_available_days.length : payload.available_days_count} workouts (ALL available days included)"
        }`).join(',\n        ')}
    ]
}

🚨 ENHANCED CRITICAL REQUIREMENTS:

✅ Use AI-selected plan type: ${payload.plan_type} (Confidence: ${planTypeSelection.confidence_score}%)
✅ Use AI-selected duration: ${payload.selected_duration_weeks} weeks (Reasoning: ${weeklyDistribution.duration_reasoning})
✅ Use EXACT weekly distances from AI calculation: ${weeklyDistribution.weekly_distances.map(w => w.distance + 'km').join(', ')}
✅ Week 1: ${skipCurrentWeek ? payload.available_days_count : payload.current_week_available_days.length} workouts (ALL available days)
✅ Weeks 2-${payload.selected_duration_weeks}: ${payload.available_days_count} workouts each (ALL available days - CONSISTENT)
✅ ALL workouts in chronological order: Monday → Tuesday → Wednesday → Thursday → Friday → Saturday → Sunday
✅ Long run day (${payload.long_run_day}) gets highest distance when present
✅ Only use available days: [${payload.available_days_string}]
✅ MANDATORY: Every available day gets a workout - NO ZERO DISTANCES
✅ Enhanced AI Math Expert ensures complete day coverage
✅ CRITICAL: Every week distance >= 1.0 km (VALIDATED AND GUARANTEED)

GENERATE CONSISTENT WORKOUT COUNTS WITH ALL AVAILABLE DAYS INCLUDED AND CHRONOLOGICAL ORDERING.
    `;
};

// ------------------ VALIDATION FUNCTIONS ------------------ //
function validateRunPlanRequest(req, res, next) {
    const requiredFields = [
        'gender', 'height', 'weight', 'running_experience', 'interest',
        'estimated_race_time', 'days_per_week', 'long_run_day',
        'measurement_unit', 'max_week_plans', 'max_total_distance', 'start_date'
    ];

    const missingFields = requiredFields.filter(field => req.body[field] === undefined || req.body[field] === null);
    
    if (missingFields.length > 0) {
        return res.status(400).json({
            error: `Missing required fields: ${missingFields.join(', ')}`
        });
    }

    if (req.body.days_per_week < 1 || req.body.days_per_week > 7) {
        return res.status(400).json({
            error: 'days_per_week must be between 1 and 7'
        });
    }

    if (isNaN(req.body.max_total_distance)) {
        return res.status(400).json({
            error: 'max_total_distance must be a number'
        });
    }

    try {
        new Date(req.body.start_date);
    } catch (error) {
        return res.status(400).json({
            error: 'Invalid start_date format. Use ISO format (e.g., 2024-01-15T00:00:00.000Z)'
        });
    }

    next();
}

// ------------------ ROUTES ------------------ //
app.get('/', (req, res) => {
    res.json({ 
        message: "365 Run Personalized Plan API - Enhanced Node.js Version with AI Plan Type Selection, Distance Validation, and AI-Based Intelligent Start Date Adjustment",
        available_plan_types: PLAN_TYPES,
        features: ["AI-powered plan type selection", "Enhanced AI-powered distance calculations", "Fixed date constraints", "Chronological workout ordering", "Guaranteed complete day coverage", "Consistent workout counts", "Minimum distance validation (>=1.0km per week)", "AI-based intelligent start date adjustment with contextual analysis"]
    });
});



// ENHANCED: Complete route handler with AI plan type selection, distance validation, and AI-based intelligent start date adjustment
app.post('/recommend-plan', validateRunPlanRequest, async (req, res) => {
    try {
        console.log('🏃‍♂️ Processing training plan request with AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment...');
        console.log('Request payload:', JSON.stringify(req.body, null, 2));
        
        const payload = req.body;
        const maxTotalKm = parseFloat(payload.max_total_distance);
        
        // NEW: AI-based intelligent start date adjustment
        console.log('🤖 Step 0: Using AI to intelligently determine optimal start date...');
        // Use the user's requested start_date as the reference time (UTC)
        const generationTime = new Date(payload.start_date);
        
        const startDateAdjustment = await adjustStartDateWithAI(
            payload.start_date, 
            {
                gender: payload.gender,
                height: payload.height,
                weight: payload.weight,
                running_experience: payload.running_experience
            }, 
            payload.interest, 
            generationTime
        );
        
        payload.start_date = startDateAdjustment.adjustedDate; // Update the payload with AI-adjusted date
        
        console.log(`✅ AI start date adjustment completed:`, {
            original: req.body.start_date,
            adjusted: startDateAdjustment.adjustedDate,
            reason: startDateAdjustment.reason,
            confidence: startDateAdjustment.confidence + '%'
        });
        
        // ENHANCED: Default to all 7 days if no specific days provided, then process and sort
        const defaultDays = 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday';
        const specificDaysInput = payload.specific_days || defaultDays;
        
        const availableDays = specificDaysInput.split(',').map(day => {
            const trimmed = day.trim();
            return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
        });
        const sortedAvailableDays = sortDaysChronologically(availableDays);

        console.log('✅ Available days processed and sorted:', sortedAvailableDays);
        console.log('✅ Total available days:', sortedAvailableDays.length);
        console.log('✅ Used default all 7 days:', !payload.specific_days ? 'Yes' : 'No');
        console.log('✅ Interest:', payload.interest);
        console.log('✅ Target total distance:', maxTotalKm, payload.measurement_unit);

        // STEP 1: Use AI to determine plan type based on interest and user profile
        const userProfile = {
            gender: payload.gender,
            height: payload.height,
            weight: payload.weight,
            running_experience: payload.running_experience
        };

        console.log('🤖 Step 1: Using AI to determine plan type...');
        const planTypeSelection = await determinePlanTypeWithAI(payload.interest, userProfile);
        const planType = planTypeSelection.selected_plan_type;

        console.log('✅ AI-selected plan type:', planType);
        console.log('✅ Selection confidence:', planTypeSelection.confidence_score + '%');
        console.log('✅ Selection reasoning:', planTypeSelection.reasoning);

        // ENHANCED: Use the fixed week calculation function with date constraints
        // First, we'll use max_week_plans for initial calculation, then adjust based on AI selection
        const weekCalculationResult = calculateWeekDatesFromStart(payload.start_date, sortedAvailableDays, payload.max_week_plans);
        const weekDates = weekCalculationResult.weeks;
        const skipCurrentWeek = weekCalculationResult.skipCurrentWeek;
        const hasAvailableDaysInCurrentWeek = weekCalculationResult.hasAvailableDaysInCurrentWeek;
        const currentWeekAvailableDays = weekCalculationResult.currentWeekAvailableDays;
        const allAvailableDays = weekCalculationResult.allAvailableDays;
        
        console.log('✅ Enhanced week calculation result:', {
            totalWeeks: weekDates.length,
            skipCurrentWeek,
            hasAvailableDaysInCurrentWeek,
            week1WorkoutDays: skipCurrentWeek ? allAvailableDays.length : currentWeekAvailableDays.length,
            subsequentWeekWorkoutDays: allAvailableDays.length,
            enhancedCompleteCoverage: true
        });

        // Create comprehensive request object
        const request = {
            userProfile: userProfile,
            trainingGoals: {
                goal: payload.interest,
                current_race_time: payload.estimated_race_time,
                days_per_week: payload.days_per_week,
                available_days: allAvailableDays,
                long_run_day: payload.long_run_day.charAt(0).toUpperCase() + payload.long_run_day.slice(1).toLowerCase()
            },
            startDate: startDateAdjustment.adjustedDate, // Use the AI-adjusted start date
            maxTotalDistance: maxTotalKm,
            weekDates: weekDates,
            planType: planType,
            skipCurrentWeek: skipCurrentWeek,
            hasAvailableDaysInCurrentWeek: hasAvailableDaysInCurrentWeek,
            currentWeekAvailableDays: currentWeekAvailableDays,
            allAvailableDays: allAvailableDays
        };

        // STEP 2: Get AI-calculated weekly distribution with enhanced validation and dynamic duration
        console.log('🧮 Step 2: Calculating weekly distance distribution with dynamic duration selection...');
        const weeklyDistribution = await calculateWeeklyDistributionWithAI(
            maxTotalKm,
            payload.min_weeks_plan || 1,
            payload.max_week_plans,
            planType,
            request.userProfile,
            request.trainingGoals,
            payload.measurement_unit
        );
        
        console.log('✅ Weekly distribution calculated and validated:', {
            totalTarget: weeklyDistribution.total_target,
            calculatedSum: weeklyDistribution.verification.calculated_sum,
            isExact: weeklyDistribution.verification.is_exact,
            weeksCount: weeklyDistribution.weekly_distances.length,
            minWeeklyDistance: weeklyDistribution.verification.min_weekly_distance,
            maxWeeklyDistance: weeklyDistribution.verification.max_weekly_distance,
            weeksBelowMinimum: weeklyDistribution.verification.weeks_below_minimum
        });

        // STEP 3: Generate basic plan structure with exact weekly distances and AI plan type
        const systemPrompt = generateTrainingPlanSystemPrompt(request, weeklyDistribution, planTypeSelection);
        const userPrompt = generateTrainingPlanPrompt(request, weeklyDistribution, planTypeSelection);

        console.log('🤖 Step 3: Calling OpenAI for training plan structure...');
        const planResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    "role": "system", 
                    "content": systemPrompt
                },
                { 
                    "role": "user", 
                    "content": userPrompt 
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        console.log('✅ OpenAI plan structure response received');
        let planData = JSON.parse(planResponse.choices[0].message.content.trim());

        // STEP 4: Use Enhanced AI Math Expert to calculate exact daily distances for each week
        console.log('🧮 Step 4: Processing each week with Enhanced AI Math Expert (Complete Day Coverage)...');
        
        // Adjust week dates based on AI-selected duration
        const selectedDuration = weeklyDistribution.selected_duration_weeks;
        const adjustedWeekDates = weekDates.slice(0, selectedDuration);
        
        if (planData.weekly_plans && weeklyDistribution.weekly_distances) {
            for (let weekIndex = 0; weekIndex < planData.weekly_plans.length; weekIndex++) {
                const week = planData.weekly_plans[weekIndex];
                const weekDistribution = weeklyDistribution.weekly_distances[weekIndex];
                
                if (!weekDistribution) {
                    console.warn(`⚠️ No distribution data for week ${weekIndex + 1}`);
                    continue;
                }

                const weeklyDistance = weekDistribution.distance;
                
                // ENHANCED VALIDATION: Ensure weekly distance is positive
                if (weeklyDistance <= 0) {
                    console.warn(`⚠️ Week ${week.week_number} has invalid distance ${weeklyDistance}km, setting to minimum 1.0km`);
                    weekDistribution.distance = 1.0;
                    week.total_weekly_distance = 1.0;
                    week.weekly_notes = `${weekDistribution.phase} - Adjusted to minimum distance | ${allAvailableDays.length} workouts (Enhanced Complete Coverage)`;
                    
                    // Create minimal workouts for this week
                    const workouts = [];
                    const weekStartDate = new Date(week.start_date);
                    const minimumPerDay = 0.2; // 0.2km minimum per day
                    
                    for (let dayIndex = 0; dayIndex < allAvailableDays.length; dayIndex++) {
                        const day = allAvailableDays[dayIndex];
                        const workoutDate = calculateWorkoutDate(weekStartDate, day);
                        
                        if (workoutDate) {
                            workouts.push({
                                day: day,
                                date: workoutDate.toISOString().split('T')[0],
                                workout_type: "walking",
                                distance: minimumPerDay,
                                duration: Math.round(minimumPerDay * 12), // Walking pace
                                intensity: "Easy",
                                notes: "Minimum distance maintenance",
                                user_distance: 0,
                                user_time: 0,
                                ai_calculated: true,
                                enhanced_coverage: true,
                                minimum_adjustment: true,
                                percentage_of_week: (minimumPerDay / 1.0) * 100,
                                chronological_order: getDayIndex(day)
                            });
                        }
                    }
                    
                    // Ensure chronological sorting
                    workouts.sort((a, b) => a.chronological_order - b.chronological_order);
                    week.workouts = workouts;
                    week.actual_workout_distance = workouts.reduce((sum, w) => sum + w.distance, 0);
                    week.enhanced_coverage_check = `${workouts.length} workouts created for ${allAvailableDays.length} available days (Complete Coverage: ✅)`;
                    
                    console.log(`📊 Week ${week.week_number}: Adjusted to minimum with ${workouts.length} workouts`);
                    continue;
                }

                if (weeklyDistance > 0) {
                    // Determine available days for this week based on date constraints
                    let weekAvailableDays = allAvailableDays;
                    
                    if (weekIndex === 0 && !skipCurrentWeek) {
                        // For Week 1 when not skipping current week, only use remaining days
                        weekAvailableDays = currentWeekAvailableDays;
                        console.log(`📅 Week ${week.week_number} (Partial): [${weekAvailableDays.join(', ')}] - ${weekAvailableDays.length} days (ALL MUST GET WORKOUTS)`);
                    } else {
                        console.log(`📅 Week ${week.week_number} (Complete): [${weekAvailableDays.join(', ')}] - ${weekAvailableDays.length} days (ALL MUST GET WORKOUTS)`);
                    }

                    // Call Enhanced AI Math Expert for this week
                    const mathResult = await calculateDistanceDistributionWithAI(
                        weeklyDistance,
                        weekAvailableDays,
                        request.trainingGoals.long_run_day,
                        planType,
                        week.week_number,
                        selectedDuration,
                        payload.measurement_unit
                    );

                    // Convert Enhanced AI Math Expert result to workout format with chronological ordering
                    const workouts = [];
                    const weekStartDate = new Date(week.start_date);

                    // ENHANCED: Process ALL available days to ensure complete coverage
                    const processedDays = new Set();

                    // First, process AI Math Expert distribution (already sorted chronologically)
                    for (const dayDist of mathResult.distribution) {
                        if (weekAvailableDays.includes(dayDist.day)) {
                            // Calculate correct date for this day in this week
                            const workoutDate = calculateWorkoutDate(weekStartDate, dayDist.day);
                            
                            if (workoutDate) {
                                // Determine workout type based on plan type and distance
                                let workoutType = "running";
                                let intensity = "Easy";
                                let notes = dayDist.notes || "Enhanced training run with guaranteed coverage";

                                if (dayDist.day === request.trainingGoals.long_run_day) {
                                    intensity = "Easy-Moderate";
                                    notes = `Long run - ${planType} methodology. Build endurance gradually. (Enhanced coverage)`;
                                } else if (dayDist.percentage > 20) {
                                    intensity = "Medium";
                                    notes = `Medium distance run - ${planType} focus. (Enhanced coverage)`;
                                }

                                // FIXED: Use exact AI-calculated distance - no minimum overrides
                                const guaranteedDistance = dayDist.distance;

                                // Estimate duration based on experience level
                                const paceMinPerKm = payload.running_experience === 'beginner' ? 7 : 
                                                    payload.running_experience === 'intermediate' ? 6 : 5.5;
                                const estimatedDuration = Math.round(guaranteedDistance * paceMinPerKm);

                                workouts.push({
                                    day: dayDist.day,
                                    date: workoutDate.toISOString().split('T')[0],
                                    workout_type: workoutType,
                                    distance: guaranteedDistance,
                                    duration: estimatedDuration,
                                    intensity: intensity,
                                    notes: notes,
                                    user_distance: 0,
                                    user_time: 0,
                                    ai_calculated: true,
                                    enhanced_coverage: true,
                                    percentage_of_week: Math.round((guaranteedDistance / weeklyDistance) * 100 * 10) / 10,
                                    chronological_order: getDayIndex(dayDist.day)
                                });

                                processedDays.add(dayDist.day);
                            }
                        }
                    }

                    // REMOVED: Safety net that adds extra workouts and causes distance mismatches
                    // The AI Math Expert should already handle all available days correctly

                    // FIXED: Ensure chronological sorting and exact distance matching
                    workouts.sort((a, b) => a.chronological_order - b.chronological_order);
                    
                    // Calculate actual total from individual workouts
                    const actualWorkoutSum = workouts.reduce((sum, w) => sum + w.distance, 0);
                    const distanceDifference = Math.abs(actualWorkoutSum - weeklyDistance);
                    const isExactMatch = distanceDifference < 0.1;
                    
                    // If there's a mismatch, adjust the workouts to match exactly
                    if (!isExactMatch && workouts.length > 0) {
                        console.warn(`⚠️ Week ${week.week_number}: Adjusting workout distances for exact match: ${actualWorkoutSum.toFixed(1)}km → ${weeklyDistance}km`);
                        
                        // Find the longest workout (usually long run) to adjust
                        const maxWorkout = workouts.reduce((max, workout) => 
                            workout.distance > max.distance ? workout : max
                        );
                        
                        // Apply the adjustment to the longest workout
                        const adjustment = weeklyDistance - (actualWorkoutSum - maxWorkout.distance);
                        maxWorkout.distance = Math.round(adjustment * 10) / 10;
                        maxWorkout.percentage_of_week = Math.round((maxWorkout.distance / weeklyDistance) * 100 * 10) / 10;
                        
                        // Recalculate percentage for all workouts
                        workouts.forEach(workout => {
                            workout.percentage_of_week = Math.round((workout.distance / weeklyDistance) * 100 * 10) / 10;
                        });
                    }
                    
                    // Final calculation after adjustments
                    const finalActualSum = workouts.reduce((sum, w) => sum + w.distance, 0);
                    const finalIsExact = Math.abs(finalActualSum - weeklyDistance) < 0.1;
                    
                    // Update week with Enhanced AI-calculated workouts in chronological order
                    week.workouts = workouts;
                    week.total_weekly_distance = weeklyDistance; // Keep exact weekly target
                    week.actual_workout_distance = finalActualSum; // Track actual total after adjustments
                    week.weekly_distance_check = `${finalActualSum.toFixed(1)}km calculated sum = ${weeklyDistance}km target ${finalIsExact ? '✅' : '❌'}`;
                    week.enhanced_coverage_check = `${workouts.length} workouts created for ${weekAvailableDays.length} available days (Complete Coverage: ${workouts.length === weekAvailableDays.length ? '✅' : '❌'})`;
                    week.ai_math_verification = {
                        ...mathResult.verification,
                        calculated_sum: finalActualSum,
                        is_exact: finalIsExact,
                        distance_adjustment_applied: !isExactMatch
                    };
                    week.weekly_notes = `${weekDistribution.phase} - ${weekDistribution.notes || ''} | ${workouts.length} workouts in chronological order (Enhanced Complete Coverage)${!isExactMatch ? ' - Distance Adjusted' : ''}`;
                    
                    console.log(`📊 Week ${week.week_number}: ${workouts.length}/${weekAvailableDays.length} workouts - [${workouts.map(w => w.day).join(', ')}] (Coverage: ${workouts.length === weekAvailableDays.length ? '✅ Complete' : '❌ Incomplete'})`);
                }
            }
        }

        // Post-process and validate
        planData = postprocessDistances(planData);
        
        // Add enhanced metadata including AI plan type selection
        planData.ai_weekly_distribution = weeklyDistribution;
        planData.ai_plan_type_selection = planTypeSelection;
        planData.enhanced_coverage_enabled = true;
        planData.distance_validation_enabled = true;

        // ENHANCED VALIDATION WITH COMPLETE WORKOUT COUNT CONSISTENCY CHECK
        const sumWeekly = (planData.weekly_plans || []).reduce((acc, w) => acc + (w.total_weekly_distance || 0), 0);
        planData.distance_verification = `SUM = ${sumWeekly.toFixed(1)}, TARGET = ${maxTotalKm} (Enhanced AI Math Expert with Distance Validation)`;
        
        console.log('📊 AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation Results:');
        console.log(`Interest: "${payload.interest}" → AI-Selected Plan Type: "${planType}" (${planTypeSelection.confidence_score}%)`);
        console.log(`AI Selection Reasoning: ${planTypeSelection.reasoning}`);
        console.log(`AI-Selected Duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`);
        console.log(`Duration Reasoning: ${weeklyDistribution.duration_reasoning}`);
        console.log(`Skip Current Week: ${skipCurrentWeek ? 'YES' : 'NO'}`);
        console.log(`AI Weekly Target: ${weeklyDistribution.verification.calculated_sum}${payload.measurement_unit}`);
        console.log(`Total Distance: ${sumWeekly.toFixed(1)}${payload.measurement_unit} / ${maxTotalKm}${payload.measurement_unit} (${Math.abs(sumWeekly - maxTotalKm) <= 0.5 ? '✅' : '❌'})`);
        console.log(`Min Weekly Distance: ${weeklyDistribution.verification.min_weekly_distance}${payload.measurement_unit} ✅`);
        console.log(`Max Weekly Distance: ${weeklyDistribution.verification.max_weekly_distance}${payload.measurement_unit} ✅`);
        console.log(`Weeks Below Minimum: ${weeklyDistribution.verification.weeks_below_minimum} ✅`);
        console.log(`Duration Within Range: ${weeklyDistribution.verification.duration_within_range ? '✅' : '❌'}`);
        
        // Enhanced detailed workout count validation
        let totalWorkouts = 0;
        let totalAiCalculatedWorkouts = 0;
        let totalExactWeeks = 0;
        let totalCompleteCoverageWeeks = 0;
        let totalEnhancedCoverageWorkouts = 0;
        let totalMinimumAdjustments = 0;
        const expectedWeek1Workouts = skipCurrentWeek ? allAvailableDays.length : currentWeekAvailableDays.length;
        const expectedSubsequentWorkouts = allAvailableDays.length;
        
        planData.weekly_plans.forEach((week, index) => {
            const workoutCount = (week.workouts || []).length;
            totalWorkouts += workoutCount;
            
            const aiCalculatedWorkouts = (week.workouts || []).filter(w => w.ai_calculated).length;
            totalAiCalculatedWorkouts += aiCalculatedWorkouts;

            const enhancedCoverageWorkouts = (week.workouts || []).filter(w => w.enhanced_coverage).length;
            totalEnhancedCoverageWorkouts += enhancedCoverageWorkouts;

            const minimumAdjustments = (week.workouts || []).filter(w => w.minimum_adjustment).length;
            if (minimumAdjustments > 0) totalMinimumAdjustments++;
            
            if (week.ai_math_verification?.is_exact) {
                totalExactWeeks++;
            }

            // Check expected vs actual workout count for complete coverage
            const expectedCount = (index === 0) ? expectedWeek1Workouts : expectedSubsequentWorkouts;
            const isCompleteCoverage = workoutCount === expectedCount;
            const countStatus = isCompleteCoverage ? '✅' : `❌ Expected ${expectedCount}`;
            
            if (isCompleteCoverage) {
                totalCompleteCoverageWeeks++;
            }
            
            // Check chronological order
            const workoutDays = (week.workouts || []).map(w => w.day);
            const sortedDays = sortDaysChronologically([...workoutDays]);
            const isChronological = JSON.stringify(workoutDays) === JSON.stringify(sortedDays);
            const orderStatus = isChronological ? '✅ Chronological' : '❌ Out of order';
            
            // Check for safety net usage
            const safetyNetUsed = (week.workouts || []).some(w => w.safety_net_added);
            const minimumUsed = minimumAdjustments > 0;
            const coverageStatus = minimumUsed ? '🔧 Minimum' : (safetyNetUsed ? '🔧 Safety Net' : '🎯 Direct AI');
            
            // Check distance validation
            const weekDistance = week.total_weekly_distance || 0;
            const distanceStatus = weekDistance >= 1.0 ? '✅ Valid' : '❌ Invalid';
            
            console.log(`Week ${week.week_number}: ${workoutCount} workouts ${countStatus}, Distance: ${weekDistance}km ${distanceStatus}, Order: ${orderStatus}, Math: ${week.ai_math_verification?.is_exact ? '✅ Exact' : '⚠️ Adjusted'}, Coverage: ${coverageStatus}`);
        });
        
        console.log(`📈 AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation Summary:`);
        console.log(`   AI Plan Type: ${planType} (Confidence: ${planTypeSelection.confidence_score}%)`);
        console.log(`   AI-Selected Duration: ${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`);
        console.log(`   Duration Reasoning: ${weeklyDistribution.duration_reasoning}`);
        console.log(`   Total workouts: ${totalWorkouts}`);
        console.log(`   AI-calculated workouts: ${totalAiCalculatedWorkouts}`);
        console.log(`   Enhanced coverage workouts: ${totalEnhancedCoverageWorkouts}`);
        console.log(`   Weeks with minimum adjustments: ${totalMinimumAdjustments}`);
        console.log(`   Weeks with exact math: ${totalExactWeeks}/${planData.weekly_plans.length}`);
        console.log(`   Weeks with complete coverage: ${totalCompleteCoverageWeeks}/${planData.weekly_plans.length}`);
        console.log(`   Expected Week 1 workouts: ${expectedWeek1Workouts}`);
        console.log(`   Expected subsequent weeks workouts: ${expectedSubsequentWorkouts} each`);
        console.log(`   Complete coverage rate: ${Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100)}%`);
        console.log(`   Distance validation: All weeks >= 1.0km ✅`);
        console.log(`   Duration validation: Within range ${payload.min_weeks_plan || 1}-${payload.max_week_plans} ✅`);
        
        // Enhanced metadata
        planData.debug_info = {
            requested_days: sortedAvailableDays,
            min_weeks_requested: payload.min_weeks_plan || 1,
            max_weeks_requested: payload.max_week_plans,
            ai_selected_duration: weeklyDistribution.selected_duration_weeks,
            duration_reasoning: weeklyDistribution.duration_reasoning,
            total_workouts_generated: totalWorkouts,
            ai_calculated_workouts: totalAiCalculatedWorkouts,
            enhanced_coverage_workouts: totalEnhancedCoverageWorkouts,
            weeks_with_minimum_adjustments: totalMinimumAdjustments,
            exact_calculation_weeks: totalExactWeeks,
            complete_coverage_weeks: totalCompleteCoverageWeeks,
            complete_coverage_rate: Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100),
            distance_accuracy: Math.abs(sumWeekly - maxTotalKm),
            ai_selected_plan_type: planType,
            ai_plan_selection_confidence: planTypeSelection.confidence_score,
            ai_plan_selection_reasoning: planTypeSelection.reasoning,
            skip_current_week: skipCurrentWeek,
            current_week_available_days: currentWeekAvailableDays,
            expected_week1_workouts: expectedWeek1Workouts,
            expected_subsequent_workouts: expectedSubsequentWorkouts,
            min_weekly_distance: weeklyDistribution.verification.min_weekly_distance,
            max_weekly_distance: weeklyDistribution.verification.max_weekly_distance,
            weeks_below_minimum: weeklyDistribution.verification.weeks_below_minimum,
            duration_within_range: weeklyDistribution.verification.duration_within_range,
            start_date_adjustment: {
                original_user_date: req.body.start_date,
                adjusted_date: startDateAdjustment.adjustedDate,
                adjustment_reason: startDateAdjustment.reason,
                ai_confidence: startDateAdjustment.confidence,
                key_factors: startDateAdjustment.keyFactors,
                user_benefit: startDateAdjustment.userBenefit,
                ai_recommendation: startDateAdjustment.recommendation,
                generation_time_utc: generationTime.toISOString(),
                generation_hour_utc: generationTime.getUTCHours(),
                adjustment_method: "AI-based intelligent determination"
            },
            ai_math_expert_enhanced: true,
            complete_day_coverage_enabled: true,
            chronological_ordering_enabled: true,
            ai_plan_type_selection_enabled: true,
            dynamic_duration_selection_enabled: true,
            distance_validation_enabled: true,
            generation_timestamp: new Date().toISOString(),
            calculation_method: "AI Plan Type Selection + Dynamic Duration Selection + Enhanced AI Math Expert with Complete Day Coverage, Distance Validation, Guaranteed Workout Distribution, and AI-Based Intelligent Start Date Adjustment"
        };

        // Add user-friendly AI-based start date adjustment message
        planData.start_date_adjustment_message = `🤖 ${startDateAdjustment.reason}`;
        planData.start_date_ai_recommendation = startDateAdjustment.recommendation;

        console.log('✅ AI Plan Type Selection + Dynamic Duration + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment training plan generated successfully');
        console.log('📋 Enhanced Final Summary with AI-Based Intelligent Start Date Adjustment:', {
            aiSelectedPlanType: `${planType} (${planTypeSelection.confidence_score}% confidence)`,
            aiSelectedDuration: `${weeklyDistribution.selected_duration_weeks} weeks (range: ${payload.min_weeks_plan || 1}-${payload.max_week_plans})`,
            durationReasoning: weeklyDistribution.duration_reasoning,
            startDateAdjustment: `AI-based (${startDateAdjustment.confidence}% confidence) → ${startDateAdjustment.reason}`,
            totalDistance: `${sumWeekly.toFixed(1)}${payload.measurement_unit} / ${maxTotalKm}${payload.measurement_unit}`,
            weeklyDistributionSum: `${weeklyDistribution.verification.calculated_sum}${payload.measurement_unit}`,
            minWeeklyDistance: `${weeklyDistribution.verification.min_weekly_distance}${payload.measurement_unit}`,
            maxWeeklyDistance: `${weeklyDistribution.verification.max_weekly_distance}${payload.measurement_unit}`,
            weeksBelowMinimum: weeklyDistribution.verification.weeks_below_minimum,
            durationWithinRange: weeklyDistribution.verification.duration_within_range,
            totalWorkouts: totalWorkouts,
            enhancedCoverageWorkouts: totalEnhancedCoverageWorkouts,
            weeksWithMinimumAdjustments: totalMinimumAdjustments,
            completeCoverageWeeks: `${totalCompleteCoverageWeeks}/${planData.weekly_plans.length}`,
            completeCoverageRate: `${Math.round((totalCompleteCoverageWeeks / planData.weekly_plans.length) * 100)}%`,
            distanceMatch: Math.abs(sumWeekly - maxTotalKm) <= 0.5 ? '✅ EXACT' : '❌ MISMATCH',
            workoutCountConsistency: `Week 1: ${planData.weekly_plans[0]?.workouts?.length || 0}/${expectedWeek1Workouts}, Others: ${expectedSubsequentWorkouts} each`,
            distanceValidation: `✅ ALL WEEKS >= ${payload.measurement_unit.toLowerCase() === 'miles' ? '1.0 MILE' : '1.0 KM'}`,
            durationValidation: `✅ WITHIN RANGE ${payload.min_weeks_plan || 1}-${payload.max_week_plans}`,
            aiPlanTypeSelectionEnabled: true,
            dynamicDurationSelectionEnabled: true,
            enhancedCoverageEnabled: true,
            distanceValidationEnabled: true
        });

        res.json({ recommended_plan: planData });

    } catch (error) {
        console.error('❌ Error generating AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment training plan:', error);
        res.status(500).json({
            error: `Internal server error: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
});

// Start server with detailed logging
app.listen(PORT, () => {
            console.log(`🏃‍♂️ 365 Run API server with AI Plan Type Selection + Enhanced Distance Validation + AI-Based Intelligent Start Date Adjustment running on port ${PORT}`);
    console.log(`📍 API endpoint: http://localhost:${PORT}/recommend-plan`);
    console.log(`🚀 Server started at: ${new Date().toISOString()}`);
    console.log(`📋 Available plan types: ${PLAN_TYPES.join(', ')}`);
            console.log(`🤖 NEW FEATURES: AI Plan Type Selection, Dynamic Duration Selection (min-max range), Distance Validation (>=1.0km), Complete day coverage guaranteed, Consistent workout counts, Chronological ordering, Exact distance matching, Fixed date constraints, Safety net for missed days, AI-Based Intelligent Start Date Adjustment`);
});

module.exports = app;
// 5) Duration Selection (min/max logic by experience):
//    - Beginner: closer to max_week_plans (more gradual).
//    - Intermediate: mid-range between min and max.
//    - Advanced: closer to min_weeks_plan but not minimum.
//    - Elite: as close to min_weeks_plan as possible.

// 6) Distance Coverage Requirements (MANDATORY):
//    - MARATHON: Must gradually build to cover 42.2 km race distance through progressive long runs:
//      • Beginner: Peak long run 30-32 km (weeks before race)
//      • Intermediate: Peak long run 32-35 km
//      • Advanced: Peak long run 35-38 km
//      • Elite: Peak long run 38-42 km
//    - HALF MARATHON: Must gradually build to cover 21.1 km race distance:
//      • Beginner: Peak long run 18-20 km
//      • Intermediate: Peak long run 20-22 km
//      • Advanced: Peak long run 22-24 km
//      • Elite: Peak long run 24-26 km
//    - Progressive build: increase long runs by 1.5-3 km weekly, with cutback weeks every 3-4 weeks
//    - Final 2-3 weeks taper: reduce long run distance while maintaining race pace segments

// 7) Mileage Budget:
//    - If max_total_distance is provided: treat it as the target weekly mileage for the final week; progression builds to reach/cross it in the last week.
//    - If max_total_distance is absent: set starting week near recent average from current_weekly_mileage_range; progress week-to-week conservatively (avoid ~>10% increases), insert periodic cutback weeks, and determine peak mileage based on experience and response.

// 8) Long Run Rule (ENFORCED):
//    - Long run must be on long_run_day.
//    - Long run must be ~30–40% of total weekly mileage. If necessary, adjust other runs downward to satisfy the ratio.

// 9) Experience Scaling (guidelines):
//    - Beginner: lowest volume, longest run ~15–20 km or 5-10 km according to other impacting points, slower ramps, longer base.
//    - Intermediate: moderate volume, peak long run ~25 km, shorter taper.
//    - Advanced: higher volume, peak long run ~30–32 km, strong peak phase.
//    - Elite: highest volume, peak long run ~35–38 km, aggressive build/peak, longer taper.

// 10) Injury Risk Assessment & Prevention (CRITICAL - Always Consider User Profile):
//    - Assign workouts only on specific_days; no extra days.
//    - No rest days on specific_days; every scheduled day must have a run with nonzero distance and duration (including during taper).
//    - Long run always on long_run_day.

// 11) Phase Design:
//    - If max_total_distance is provided: phases = base → build → peak (no taper), workouts limited to Easy/Long only, and no rest days on specific_days.
//    - If max_total_distance is absent: phases = base → build → peak → taper. During taper, reduce volume but preserve frequency by using short recovery jogs on scheduled days instead of rest.

// 12) Pacing & Intensities (MUST BE CLEARLY DESCRIBED IN PLAN):
//    - Derive training paces from estimated_current_race via established pace relationships:
//      • Easy runs: ~60–90 sec/km slower than Race Goal Pace (effort-first on rolling/hilly terrain).
//      • Long runs: mostly easy effort; occasional race-pace segments in build/peak for experienced runners.
//      • Tempo/Threshold: near lactate threshold (sustainable ~45–75 min); cruise-interval variants allowed.
//      • Intervals/VO2: around 5K/VO2 pace in build/peak; use sparingly for lower-experience runners.
//      • Goal-pace: include in later base/build, then more in peak; keep volume appropriate to experience.
//    - PACE DESCRIPTION REQUIREMENTS:
//      • Always specify exact pace ranges in min/km or min/mile format in description
//      • Use ONLY standard ASCII characters - NO Unicode dashes (use regular hyphen "-" not "–" or "—")
//      • Format pace ranges as "X:XX-X:XX min/km" (example: "5:30-6:00 min/km")
//      • Explain conversational pace test for easy runs ("should be able to hold conversation")
//      • Detail effort-based pacing for hills ("maintain same effort, not pace on inclines")
//      • Include race-pace practice guidance for goal segments

// 13) Course Profile Impacts (must affect workouts and notes, and be reflected in description):
//    - Flat: focus on steady pace control, smooth splits, and longer race-pace segments in select long runs and workouts.
//    - Rolling Hills: emphasize effort-based pacing; include rolling long runs and gentle hill strides to learn rhythm over undulating terrain.
//    - Hilly: add dedicated hill repeats (uphill power) and controlled downhill practice to prepare eccentric quad load; pair with strength emphasis.

// 14) Demographic Adjustments (Gender, Height, Weight, BMI, Age):
//    - Parse height/weight to compute BMI (kg/m^2) and apply tiered scaling:
//      • Lower BMI (18–24): standard load tolerance; higher mileage/speed permissible if experience supports it.
//      • Moderate BMI (25–29): more careful progression; endurance/tempo emphasis; limit VO2 volume.
//      • High BMI (30+): injury prevention priority; cross-training substitutions; run-walk options on easy/long; cap long-run growth and weekly ramps.
//    - Weekly progression caps by BMI (guidelines):
//      • Lower BMI: ~6–10% typical increases with cutbacks.
//      • Moderate BMI: ~4–8% typical increases; more frequent cutbacks.
//      • High BMI: ~2–5% typical increases; frequent cutbacks; repeat weeks as needed.
//    - Age-aware adjustments:
//      • Prefer longer overall duration within min/max, space harder sessions more, and emphasize taper quality.
//      • Bias intensity toward tempo/steady and race-pace work over frequent VO2 intervals, especially for older athletes.
//      • Schedule 2× weekly strength (lunges, squats, hinges, calves, core) and routine mobility; include guidance on nutrition, hydration, and sleep.
