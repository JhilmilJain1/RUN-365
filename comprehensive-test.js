#!/usr/bin/env node

/**
 * Comprehensive Test Suite for 365 Run API
 * Tests all plan types with different payloads and scenarios
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const OUTPUT_DIR = './test-results';
const TIMEOUT = 60000; // 60 seconds timeout for API calls

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Test results tracking
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  details: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📝',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪'
  }[type] || '📝';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function saveTestResult(testName, payload, response, error = null) {
  const result = {
    testName,
    timestamp: new Date().toISOString(),
    payload,
    response: error ? null : response,
    error: error ? error.message : null,
    success: !error
  };
  
  testResults.details.push(result);
  
  // Save individual test result
  const filename = `${testName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
  fs.writeFileSync(
    path.join(OUTPUT_DIR, filename),
    JSON.stringify(result, null, 2)
  );
  
  return result;
}

async function makeRequest(endpoint, payload, testName) {
  try {
    log(`Making request to ${endpoint} for ${testName}`, 'test');
    
    const response = await axios({
      method: 'POST',
      url: `${BASE_URL}${endpoint}`,
      data: payload,
      timeout: TIMEOUT,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('No response received from server');
    } else {
      throw new Error(error.message);
    }
  }
}

async function testHealthCheck() {
  try {
    log('Testing health check endpoint', 'test');
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    
    if (response.data.status === 'healthy') {
      log('Health check passed', 'success');
      return true;
    } else {
      log('Health check failed - unexpected response', 'error');
      return false;
    }
  } catch (error) {
    log(`Health check failed: ${error.message}`, 'error');
    return false;
  }
}

async function runFullPlanTest(testName, payload) {
  testResults.total++;
  
  try {
    log(`Starting full plan test: ${testName}`, 'test');
    
    // Step 1: Generate first week
    const firstWeekResponse = await makeRequest('/generate-plan', payload, `${testName} - First Week`);
    
    if (!firstWeekResponse.success || !firstWeekResponse.plan_id) {
      throw new Error('First week generation failed or missing plan_id');
    }
    
    log(`First week generated successfully (Plan ID: ${firstWeekResponse.plan_id})`, 'success');
    
    // Step 2: Get remaining weeks
    const remainingWeeksPayload = { plan_id: firstWeekResponse.plan_id };
    const fullPlanResponse = await makeRequest('/get-remaining-plan', remainingWeeksPayload, `${testName} - Full Plan`);
    
    if (!fullPlanResponse.success || !fullPlanResponse.recommended_plan) {
      throw new Error('Full plan generation failed');
    }
    
    log(`Full plan generated successfully (${fullPlanResponse.recommended_plan.weekly_plans.length} weeks)`, 'success');
    
    // Validate the plan
    const validationResult = validatePlan(fullPlanResponse.recommended_plan, payload);
    
    if (!validationResult.valid) {
      log(`Plan validation failed: ${validationResult.errors.join(', ')}`, 'warning');
    } else {
      log('Plan validation passed', 'success');
    }
    
    // Save results
    const combinedResponse = {
      firstWeek: firstWeekResponse,
      fullPlan: fullPlanResponse,
      validation: validationResult
    };
    
    saveTestResult(testName, payload, combinedResponse);
    testResults.passed++;
    
    return combinedResponse;
    
  } catch (error) {
    log(`Test failed: ${testName} - ${error.message}`, 'error');
    saveTestResult(testName, payload, null, error);
    testResults.failed++;
    testResults.errors.push({ testName, error: error.message });
    return null;
  }
}

function validatePlan(plan, originalPayload) {
  const errors = [];
  const warnings = [];
  
  try {
    // Basic structure validation
    if (!plan.weekly_plans || !Array.isArray(plan.weekly_plans)) {
      errors.push('Missing or invalid weekly_plans array');
      return { valid: false, errors, warnings };
    }
    
    if (plan.weekly_plans.length === 0) {
      errors.push('Empty weekly_plans array');
      return { valid: false, errors, warnings };
    }
    
    // Plan type validation
    const expectedPlanTypes = ['marathon', 'half marathon', '5k', '10k'];
    if (!expectedPlanTypes.includes(plan.plan_type)) {
      errors.push(`Invalid plan_type: ${plan.plan_type}`);
    }
    
    // Distance limits validation
    const maxDistances = {
      '5k': originalPayload.measurement_unit === 'km' ? 5.0 : 3.1,
      '10k': originalPayload.measurement_unit === 'km' ? 10.0 : 6.2
    };
    
    if (maxDistances[plan.plan_type]) {
      const maxDistance = maxDistances[plan.plan_type];
      
      for (const week of plan.weekly_plans) {
        for (const workout of week.workouts || []) {
          if (workout.distance > maxDistance) {
            errors.push(`Week ${week.week_number} ${workout.day}: Distance ${workout.distance} exceeds ${plan.plan_type} limit of ${maxDistance}`);
          }
        }
      }
    }
    
    // Duplicate distance validation within weeks
    for (const week of plan.weekly_plans) {
      const distances = {};
      const nonRestWorkouts = (week.workouts || []).filter(w => w.workout_type !== 'Rest' && w.distance > 0);
      
      for (const workout of nonRestWorkouts) {
        if (distances[workout.distance]) {
          warnings.push(`Week ${week.week_number}: Duplicate distance ${workout.distance} on ${workout.day} and ${distances[workout.distance]}`);
        } else {
          distances[workout.distance] = workout.day;
        }
      }
    }
    
    // Long run validation
    const longRunDay = originalPayload.long_run_day;
    if (longRunDay) {
      for (const week of plan.weekly_plans) {
        const longRunWorkout = (week.workouts || []).find(w => w.day === longRunDay);
        if (longRunWorkout && longRunWorkout.workout_type !== 'Long Run' && longRunWorkout.workout_type !== 'Race') {
          warnings.push(`Week ${week.week_number}: ${longRunDay} is not a Long Run or Race as expected`);
        }
      }
    }
    
    // Progression validation
    const weeklyDistances = plan.weekly_plans.map(w => w.total_weekly_distance);
    let hasProgression = false;
    
    for (let i = 1; i < weeklyDistances.length - 2; i++) { // Exclude last 2 weeks (taper)
      if (weeklyDistances[i] > weeklyDistances[0]) {
        hasProgression = true;
        break;
      }
    }
    
    if (!hasProgression) {
      warnings.push('No clear progression detected in weekly distances');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalWeeks: plan.weekly_plans.length,
        totalWorkouts: plan.weekly_plans.reduce((sum, w) => sum + (w.workouts?.length || 0), 0),
        peakWeeklyDistance: Math.max(...weeklyDistances),
        finalWeekDistance: weeklyDistances[weeklyDistances.length - 1]
      }
    };
    
  } catch (error) {
    errors.push(`Validation error: ${error.message}`);
    return { valid: false, errors, warnings };
  }
}

// Test data definitions
const testCases = [
  // Marathon Tests
  {
    name: 'Marathon - Beginner - 7 Days - KM',
    payload: {
      plan_name: 'Marathon',
      plan_type: 'marathon',
      measurement_unit: 'km',
      running_experience: 'Beginner',
      start_date: '2025-02-01T09:00:00Z',
      specific_days: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 7,
      min_weeks_plan: 12,
      max_week_plans: 16,
      estimated_race_time: '4:30:00',
      weekly_mileage_past_4_weeks: '30-40',
      longest_run_past_4_weeks: '12',
      course_profile: 'Flat',
      age: 30,
      gender: 'male',
      height: '175',
      weight: '70'
    }
  },
  {
    name: 'Marathon - Intermediate - 6 Days - Miles',
    payload: {
      plan_name: 'Marathon',
      plan_type: 'marathon',
      measurement_unit: 'miles',
      running_experience: 'Intermediate',
      start_date: '2025-02-03T07:00:00Z',
      specific_days: 'Monday,Tuesday,Thursday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 6,
      min_weeks_plan: 10,
      max_week_plans: 14,
      estimated_race_time: '3:45:00',
      weekly_mileage_past_4_weeks: '40-50',
      longest_run_past_4_weeks: '16',
      course_profile: 'Rolling Hills',
      age: 28,
      gender: 'female',
      height: '5\'6"',
      weight: '140 lbs'
    }
  },
  {
    name: 'Marathon - Advanced - 5 Days - Hilly',
    payload: {
      plan_name: 'Marathon',
      plan_type: 'marathon',
      measurement_unit: 'km',
      running_experience: 'Advanced',
      start_date: '2025-02-05T06:30:00Z',
      specific_days: 'Tuesday,Wednesday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 5,
      min_weeks_plan: 8,
      max_week_plans: 12,
      estimated_race_time: '3:15:00',
      weekly_mileage_past_4_weeks: '60-70',
      longest_run_past_4_weeks: '25',
      course_profile: 'Hilly',
      age: 35,
      gender: 'male',
      height: '180',
      weight: '75'
    }
  },
  {
    name: 'Marathon - Elite - 7 Days - Zero Mileage',
    payload: {
      plan_name: 'Marathon',
      plan_type: 'marathon',
      measurement_unit: 'km',
      running_experience: 'Elite',
      start_date: '2025-02-01T05:00:00Z',
      specific_days: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
      long_run_day: 'Saturday',
      days_per_week: 7,
      min_weeks_plan: 8,
      max_week_plans: 10,
      estimated_race_time: '2:45:00',
      weekly_mileage_past_4_weeks: '0',
      longest_run_past_4_weeks: '0',
      course_profile: 'Flat',
      age: 26,
      gender: 'male',
      height: '175',
      weight: '65'
    }
  },
  
  // Half Marathon Tests
  {
    name: 'Half Marathon - Beginner - 5 Days - High BMI',
    payload: {
      plan_name: 'Half Marathon',
      plan_type: 'half marathon',
      measurement_unit: 'km',
      running_experience: 'Beginner',
      start_date: '2025-02-01T08:00:00Z',
      specific_days: 'Monday,Wednesday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 5,
      min_weeks_plan: 10,
      max_week_plans: 14,
      estimated_race_time: '2:15:00',
      weekly_mileage_past_4_weeks: '15-20',
      longest_run_past_4_weeks: '8',
      course_profile: 'Flat',
      age: 45,
      gender: 'female',
      height: '160',
      weight: '85'
    }
  },
  {
    name: 'Half Marathon - Intermediate - 6 Days - Miles',
    payload: {
      plan_name: 'Half Marathon',
      plan_type: 'half marathon',
      measurement_unit: 'miles',
      running_experience: 'Intermediate',
      start_date: '2025-02-01T09:00:00Z',
      specific_days: 'Monday,Wednesday,Thursday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 6,
      min_weeks_plan: 10,
      max_week_plans: 14,
      estimated_race_time: '1:45:00',
      weekly_mileage_past_4_weeks: '25-30',
      longest_run_past_4_weeks: '10',
      course_profile: 'Rolling Hills',
      age: 32,
      gender: 'female',
      height: '66',
      weight: '130'
    }
  },
  {
    name: 'Half Marathon - Advanced - 7 Days - Race Date',
    payload: {
      plan_name: 'Half Marathon',
      plan_type: 'half marathon',
      measurement_unit: 'km',
      running_experience: 'Advanced',
      start_date: '2025-02-01T07:00:00Z',
      race_date: '2025-04-13T09:00:00Z',
      specific_days: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 7,
      min_weeks_plan: 8,
      max_week_plans: 12,
      estimated_race_time: '1:25:00',
      weekly_mileage_past_4_weeks: '50-60',
      longest_run_past_4_weeks: '18',
      course_profile: 'Hilly',
      age: 29,
      gender: 'male',
      height: '178',
      weight: '68'
    }
  },
  
  // 5K Tests
  {
    name: '5K - Beginner - 4 Days - True Beginner',
    payload: {
      plan_name: '5k',
      plan_type: '5k',
      measurement_unit: 'km',
      running_experience: 'Beginner',
      start_date: '2025-02-01T18:00:00Z',
      specific_days: 'Tuesday,Thursday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 4,
      min_weeks_plan: 8,
      max_week_plans: 12,
      estimated_race_time: '30:00',
      weekly_mileage_past_4_weeks: '0',
      longest_run_past_4_weeks: '0',
      course_profile: 'Flat',
      age: 25,
      gender: 'female',
      height: '165',
      weight: '60'
    }
  },
  {
    name: '5K - Intermediate - 5 Days - Miles',
    payload: {
      plan_name: '5k',
      plan_type: '5k',
      measurement_unit: 'miles',
      running_experience: 'Intermediate',
      start_date: '2025-02-03T17:30:00Z',
      specific_days: 'Monday,Tuesday,Thursday,Friday,Saturday',
      long_run_day: 'Saturday',
      days_per_week: 5,
      min_weeks_plan: 6,
      max_week_plans: 10,
      estimated_race_time: '22:30',
      weekly_mileage_past_4_weeks: '15-20',
      longest_run_past_4_weeks: '4',
      course_profile: 'Rolling Hills',
      age: 27,
      gender: 'male',
      height: '5\'10"',
      weight: '160 lbs'
    }
  },
  {
    name: '5K - Advanced - 6 Days - First Day Long Run',
    payload: {
      plan_name: '5k',
      plan_type: '5k',
      measurement_unit: 'km',
      running_experience: 'Advanced',
      start_date: '2025-02-02T06:00:00Z', // Sunday
      specific_days: 'Sunday,Monday,Tuesday,Thursday,Friday,Saturday',
      long_run_day: 'Sunday',
      days_per_week: 6,
      min_weeks_plan: 6,
      max_week_plans: 8,
      estimated_race_time: '18:00',
      weekly_mileage_past_4_weeks: '25-30',
      longest_run_past_4_weeks: '5',
      course_profile: 'Flat',
      age: 24,
      gender: 'male',
      height: '172',
      weight: '62'
    }
  },
  
  // 10K Tests
  {
    name: '10K - Beginner - 5 Days - Overweight',
    payload: {
      plan_name: '10k',
      plan_type: '10k',
      measurement_unit: 'km',
      running_experience: 'Beginner',
      start_date: '2025-02-01T07:30:00Z',
      specific_days: 'Monday,Wednesday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 5,
      min_weeks_plan: 10,
      max_week_plans: 14,
      estimated_race_time: '55:00',
      weekly_mileage_past_4_weeks: '10-15',
      longest_run_past_4_weeks: '5',
      course_profile: 'Flat',
      age: 38,
      gender: 'female',
      height: '162',
      weight: '78'
    }
  },
  {
    name: '10K - Intermediate - 6 Days - Miles',
    payload: {
      plan_name: '10k',
      plan_type: '10k',
      measurement_unit: 'miles',
      running_experience: 'Intermediate',
      start_date: '2025-02-01T06:45:00Z',
      specific_days: 'Monday,Tuesday,Wednesday,Friday,Saturday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 6,
      min_weeks_plan: 8,
      max_week_plans: 12,
      estimated_race_time: '42:00',
      weekly_mileage_past_4_weeks: '20-25',
      longest_run_past_4_weeks: '6',
      course_profile: 'Rolling Hills',
      age: 31,
      gender: 'male',
      height: '5\'8"',
      weight: '155 lbs'
    }
  },
  {
    name: '10K - Elite - 7 Days - Range Race Time',
    payload: {
      plan_name: '10k',
      plan_type: '10k',
      measurement_unit: 'km',
      running_experience: 'Elite',
      start_date: '2025-02-01T05:30:00Z',
      specific_days: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
      long_run_day: 'Saturday',
      days_per_week: 7,
      min_weeks_plan: 6,
      max_week_plans: 8,
      estimated_race_time: '32:00-34:00',
      weekly_mileage_past_4_weeks: '40-50',
      longest_run_past_4_weeks: '10',
      course_profile: 'Hilly',
      age: 23,
      gender: 'female',
      height: '168',
      weight: '52'
    }
  },
  
  // Edge Cases
  {
    name: 'Edge Case - No Age/Gender',
    payload: {
      plan_name: 'Marathon',
      plan_type: 'marathon',
      measurement_unit: 'km',
      running_experience: 'Intermediate',
      start_date: '2025-02-01T09:00:00Z',
      specific_days: 'Monday,Wednesday,Friday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 4,
      min_weeks_plan: 12,
      max_week_plans: 16,
      estimated_race_time: '4:00:00',
      weekly_mileage_past_4_weeks: '35',
      longest_run_past_4_weeks: '15',
      course_profile: 'Flat',
      height: '170',
      weight: '70'
    }
  },
  {
    name: 'Edge Case - Invalid Longest Run',
    payload: {
      plan_name: 'Half Marathon',
      plan_type: 'half marathon',
      measurement_unit: 'km',
      running_experience: 'Beginner',
      start_date: '2025-02-01T09:00:00Z',
      specific_days: 'Monday,Wednesday,Friday,Sunday',
      long_run_day: 'Sunday',
      days_per_week: 4,
      min_weeks_plan: 12,
      max_week_plans: 16,
      estimated_race_time: '2:00:00',
      weekly_mileage_past_4_weeks: '20',
      longest_run_past_4_weeks: 'Test',
      course_profile: 'Flat',
      age: 30,
      gender: 'male',
      height: '175',
      weight: '70'
    }
  }
];

// Utility endpoint tests
const utilityTests = [
  {
    name: 'Calculate Pace Zones - Marathon',
    endpoint: '/calculate-pace-zones',
    payload: {
      goal_race_time: '3:30:00',
      race_distance: 42.2,
      experience: 'Intermediate',
      measurement_unit: 'km'
    }
  },
  {
    name: 'Calculate Pace Zones - 5K Miles',
    endpoint: '/calculate-pace-zones',
    payload: {
      goal_race_time: '20:00',
      race_distance: 3.1,
      experience: 'Advanced',
      measurement_unit: 'miles'
    }
  },
  {
    name: 'Calculate Plan Duration',
    endpoint: '/calculate-plan-duration',
    payload: {
      start_date: '2025-02-01',
      race_date: '2025-05-01',
      min_weeks: 8,
      max_weeks: 16
    }
  },
  {
    name: 'Validate Rest Days - Beginner',
    endpoint: '/validate-rest-days',
    payload: {
      experience: 'Beginner',
      training_days: 5
    }
  },
  {
    name: 'Validate Rest Days - Elite',
    endpoint: '/validate-rest-days',
    payload: {
      experience: 'Elite',
      training_days: 7
    }
  }
];

async function runUtilityTests() {
  log('Running utility endpoint tests', 'test');
  
  for (const test of utilityTests) {
    testResults.total++;
    
    try {
      const response = await makeRequest(test.endpoint, test.payload, test.name);
      
      if (response.success !== false) { // Some endpoints don't return success field
        log(`Utility test passed: ${test.name}`, 'success');
        saveTestResult(test.name, test.payload, response);
        testResults.passed++;
      } else {
        throw new Error('Response indicated failure');
      }
      
    } catch (error) {
      log(`Utility test failed: ${test.name} - ${error.message}`, 'error');
      saveTestResult(test.name, test.payload, null, error);
      testResults.failed++;
      testResults.errors.push({ testName: test.name, error: error.message });
    }
  }
}

async function main() {
  log('Starting comprehensive test suite for 365 Run API', 'info');
  log(`Base URL: ${BASE_URL}`, 'info');
  log(`Output directory: ${OUTPUT_DIR}`, 'info');
  
  // Health check
  const isHealthy = await testHealthCheck();
  if (!isHealthy) {
    log('Server health check failed. Exiting.', 'error');
    process.exit(1);
  }
  
  // Run utility tests
  await runUtilityTests();
  
  // Run full plan tests
  log('Running full plan generation tests', 'test');
  
  for (const testCase of testCases) {
    await runFullPlanTest(testCase.name, testCase.payload);
    
    // Add delay between tests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate summary report
  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    results: testResults,
    testCases: testCases.length,
    utilityTests: utilityTests.length
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'test-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  // Print final results
  log('='.repeat(60), 'info');
  log('TEST SUITE COMPLETED', 'info');
  log('='.repeat(60), 'info');
  log(`Total tests: ${testResults.total}`, 'info');
  log(`Passed: ${testResults.passed}`, 'success');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
  log(`Success rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`, 'info');
  
  if (testResults.errors.length > 0) {
    log('Failed tests:', 'error');
    testResults.errors.forEach(error => {
      log(`  - ${error.testName}: ${error.error}`, 'error');
    });
  }
  
  log(`Detailed results saved to: ${OUTPUT_DIR}`, 'info');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
  process.exit(1);
});

// Run the test suite
if (require.main === module) {
  main();
}

module.exports = {
  runFullPlanTest,
  validatePlan,
  testCases,
  utilityTests
};