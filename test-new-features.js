/**
 * Test script for new features in Training Plan API v2.0
 * 
 * Features tested:
 * 1. Pace zone calculation
 * 2. Plan duration calculation from race date
 * 3. Rest day validation
 * 4. Training plan generation with race date
 */

const API_BASE_URL = 'http://localhost:8000';

// Helper function to make API calls
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Test 1: Calculate Pace Zones
async function testPaceZones() {
  console.log('\n🏃 TEST 1: Calculate Pace Zones');
  console.log('=' .repeat(60));

  const testCases = [
    {
      name: 'Beginner Marathon Runner',
      body: {
        goal_race_time: '5:00:00',
        race_distance: 42.2,
        experience: 'Beginner',
        measurement_unit: 'km'
      }
    },
    {
      name: 'Intermediate Marathon Runner',
      body: {
        goal_race_time: '4:15:00',
        race_distance: 42.2,
        experience: 'Intermediate',
        measurement_unit: 'km'
      }
    },
    {
      name: 'Advanced Half Marathon Runner',
      body: {
        goal_race_time: '1:45:00',
        race_distance: 21.1,
        experience: 'Advanced',
        measurement_unit: 'km'
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📊 ${testCase.name}:`);
    const result = await apiCall('/calculate-pace-zones', 'POST', testCase.body);
    
    if (result.success) {
      console.log('✅ Success!');
      console.log('Pace Zones:');
      Object.entries(result.data.pace_zones).forEach(([zone, pace]) => {
        console.log(`  ${zone.padEnd(12)}: ${pace}`);
      });
    } else {
      console.log('❌ Failed:', result.data.error || result.error);
    }
  }
}

// Test 2: Calculate Plan Duration
async function testPlanDuration() {
  console.log('\n\n📅 TEST 2: Calculate Plan Duration from Race Date');
  console.log('=' .repeat(60));

  const testCases = [
    {
      name: '16-week plan (within range)',
      body: {
        start_date: '2025-01-01T06:00:00.000Z',
        race_date: '2025-04-23T09:00:00.000Z',
        min_weeks: 10,
        max_weeks: 20
      }
    },
    {
      name: 'Too short (will be clamped to minimum)',
      body: {
        start_date: '2025-04-01T06:00:00.000Z',
        race_date: '2025-04-23T09:00:00.000Z',
        min_weeks: 10,
        max_weeks: 20
      }
    },
    {
      name: 'Too long (will be capped to maximum)',
      body: {
        start_date: '2025-01-01T06:00:00.000Z',
        race_date: '2025-12-31T09:00:00.000Z',
        min_weeks: 10,
        max_weeks: 20
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📊 ${testCase.name}:`);
    const result = await apiCall('/calculate-plan-duration', 'POST', testCase.body);
    
    if (result.success) {
      console.log('✅ Success!');
      console.log(`  Duration: ${result.data.calculated_duration_weeks} weeks`);
      console.log(`  Total days: ${result.data.total_days}`);
      console.log(`  Note: ${result.data.notes}`);
    } else {
      console.log('❌ Failed:', result.data.error || result.error);
    }
  }
}

// Test 3: Validate Rest Days
async function testRestDayValidation() {
  console.log('\n\n🛌 TEST 3: Validate Rest Day Requirements');
  console.log('=' .repeat(60));

  const testCases = [
    {
      name: 'Beginner with 7 training days (should warn)',
      body: { experience: 'Beginner', training_days: 7 }
    },
    {
      name: 'Beginner with 6 training days (appropriate)',
      body: { experience: 'Beginner', training_days: 6 }
    },
    {
      name: 'Intermediate with 7 training days (acceptable)',
      body: { experience: 'Intermediate', training_days: 7 }
    },
    {
      name: 'Advanced with 7 training days (optimal)',
      body: { experience: 'Advanced', training_days: 7 }
    },
    {
      name: 'Elite with 7 training days (optimal)',
      body: { experience: 'Elite', training_days: 7 }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📊 ${testCase.name}:`);
    const result = await apiCall('/validate-rest-days', 'POST', testCase.body);
    
    if (result.success) {
      const req = result.data.rest_day_requirements;
      console.log('✅ Success!');
      console.log(`  Required rest days: ${req.required_rest_days}`);
      console.log(`  Recommended rest days: ${req.recommended_rest_days}`);
      console.log(`  Allow 7 days: ${req.allow_all_seven_days ? 'Yes' : 'No'}`);
      if (req.warning) {
        console.log(`  ⚠️  Warning: ${req.warning}`);
      }
    } else {
      console.log('❌ Failed:', result.data.error || result.error);
    }
  }
}

// Test 4: Generate Plan with Race Date
async function testPlanGenerationWithRaceDate() {
  console.log('\n\n🎯 TEST 4: Generate Training Plan with Race Date');
  console.log('=' .repeat(60));

  const planRequest = {
    gender: 'male',
    height: 175,
    weight: 70,
    plan_name: 'Marathon',
    measurement_unit: 'km',
    start_date: '2025-01-06T06:00:00.000Z',
    race_date: '2025-04-20T09:00:00.000Z',
    min_weeks_plan: 12,
    max_week_plans: 16,
    days_per_week: '6',
    specific_days: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
    long_run_day: 'Saturday',
    estimated_race_time: '4:00:00-4:30:00',
    weekly_mileage_past_4_weeks: '45-50',
    goal_race_time: '04:15:00',
    longest_run_past_4_weeks: '22 km',
    course_profile: 'Rolling Hills',
    running_experience: 'Intermediate'
  };

  console.log('\n📊 Generating plan with race date...');
  console.log(`  Start: ${planRequest.start_date}`);
  console.log(`  Race: ${planRequest.race_date}`);
  console.log(`  Experience: ${planRequest.running_experience}`);
  console.log(`  Training days: ${planRequest.days_per_week}`);

  const result = await apiCall('/generate-plan', 'POST', planRequest);
  
  if (result.success) {
    console.log('\n✅ Plan generated successfully!');
    console.log(`  Plan ID: ${result.data.plan_id}`);
    console.log(`  Duration: ${result.data.duration} weeks`);
    console.log(`  Total weeks: ${result.data.total_weeks}`);
    
    if (result.data.weekly_plans && result.data.weekly_plans.length > 0) {
      const week1 = result.data.weekly_plans[0];
      console.log(`\n  Week 1 Details:`);
      console.log(`    Start: ${week1.start_date}`);
      console.log(`    End: ${week1.end_date}`);
      console.log(`    Total distance: ${week1.total_weekly_distance} km`);
      console.log(`    Workouts: ${week1.workouts.length}`);
      
      console.log(`\n  Week 1 Workout Schedule:`);
      week1.workouts.forEach(workout => {
        const paceInfo = workout.pace_range ? ` @ ${workout.pace_range}` : '';
        console.log(`    ${workout.day}: ${workout.workout_type} - ${workout.distance} km${paceInfo}`);
        console.log(`      Intensity: ${workout.intensity}`);
        if (workout.description) {
          console.log(`      Note: ${workout.description}`);
        }
      });

      // Check for back-to-back hard workouts
      console.log(`\n  Workout Sequencing Check:`);
      const hardWorkouts = ['Tempo Run', 'Interval Run', 'Long Run'];
      let previousWasHard = false;
      let sequencingIssues = 0;

      week1.workouts.forEach((workout, index) => {
        const isHard = hardWorkouts.includes(workout.workout_type);
        if (isHard && previousWasHard) {
          console.log(`    ⚠️  Back-to-back hard workouts detected: ${week1.workouts[index-1].workout_type} → ${workout.workout_type}`);
          sequencingIssues++;
        }
        previousWasHard = isHard;
      });

      if (sequencingIssues === 0) {
        console.log(`    ✅ No back-to-back hard workouts detected`);
      }

      // Check for rest days
      const restDays = week1.workouts.filter(w => w.workout_type === 'Rest');
      console.log(`\n  Rest Days: ${restDays.length}`);
      if (restDays.length > 0) {
        restDays.forEach(rest => {
          console.log(`    ${rest.day}: Rest`);
        });
      }
    }
  } else {
    console.log('❌ Failed:', result.data?.error || result.error);
  }
}

// Test 5: Health Check
async function testHealthCheck() {
  console.log('\n\n💚 TEST 5: Health Check');
  console.log('=' .repeat(60));

  const result = await apiCall('/health', 'GET');
  
  if (result.success) {
    console.log('✅ API is healthy!');
    console.log(`  Status: ${result.data.status}`);
    console.log(`  Timestamp: ${result.data.timestamp}`);
  } else {
    console.log('❌ API is not responding');
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'Training Plan API v2.0 - Feature Tests' + ' '.repeat(9) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  try {
    // Check if API is running
    await testHealthCheck();

    // Run feature tests
    await testPaceZones();
    await testPlanDuration();
    await testRestDayValidation();
    await testPlanGenerationWithRaceDate();

    console.log('\n\n' + '═'.repeat(60));
    console.log('✅ All tests completed!');
    console.log('═'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error('Make sure the API server is running on', API_BASE_URL);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testPaceZones,
  testPlanDuration,
  testRestDayValidation,
  testPlanGenerationWithRaceDate,
  testHealthCheck,
  runAllTests
};
