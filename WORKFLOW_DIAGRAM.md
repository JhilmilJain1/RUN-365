# Training Plan API v2.0 - Workflow Diagram

## 📊 Complete Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER SUBMITS REQUEST                         │
│  • Experience level, training days, race date, goal time, etc.  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  VALIDATION & PREPROCESSING                      │
│  ✓ Calculate pace zones from goal time                          │
│  ✓ Determine rest day requirements (experience-based)           │
│  ✓ Calculate plan duration from race date                       │
│  ✓ Validate input parameters                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              GENERATE FIRST WEEK (Fast Response)                 │
│  • AI generates Week 1 with:                                     │
│    - Intelligent workout sequencing                              │
│    - Rest day placement                                          │
│    - Pace recommendations                                        │
│    - No back-to-back hard efforts                               │
│  • Returns: plan_id, Week 1 data                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│           GENERATE COMPLETE PLAN (Detailed Response)             │
│  • AI generates all remaining weeks with:                        │
│    - Progressive training build                                  │
│    - Cutback weeks every 3-4 weeks                              │
│    - Tapering in final 1-3 weeks                                │
│    - Workout sequencing throughout                               │
│    - Pace recommendations for every workout                      │
│  • Returns: Complete plan with all weeks                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Feature Integration Flow

### 1. Workout Sequencing Logic

```
┌──────────────┐
│  Hard Workout│
│  (Tempo/     │
│  Intervals/  │
│  Long Run)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Easy/       │
│  Recovery    │
│  Day         │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Easy/       │
│  Recovery    │
│  Day         │
│  (optional)  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Next Hard   │
│  Workout     │
└──────────────┘

Rule: Minimum 1-2 days between hard efforts
```

---

### 2. Rest Day Placement Logic

```
Experience Level → Rest Requirements → Placement Strategy
     │                    │                    │
     ▼                    ▼                    ▼
┌──────────┐      ┌──────────────┐    ┌─────────────────┐
│ Beginner │ ───→ │ 1 Required   │ ──→│ After hardest   │
└──────────┘      │ Rest Day     │    │ workout         │
                  └──────────────┘    └─────────────────┘
                                              │
┌──────────────┐  ┌──────────────┐           │
│ Intermediate │─→│ 1 Recommended│ ──────────┤
└──────────────┘  │ Rest Day     │           │
                  └──────────────┘           │
                                              ▼
┌──────────┐      ┌──────────────┐    ┌─────────────────┐
│ Advanced │ ───→ │ 0-1 Optional │ ──→│ Never on long   │
└──────────┘      │ Rest Days    │    │ run day         │
                  └──────────────┘    └─────────────────┘
                                              │
┌──────────┐      ┌──────────────┐           │
│  Elite   │ ───→ │ 0 Rest Days  │ ──────────┘
└──────────┘      │ (Optional)   │
                  └──────────────┘

Training Days = Actual running days
Rest Days = Separate, automatic
```

---

### 3. Tapering Timeline

```
Week N-3        Week N-2        Week N-1        Week N
(Peak)          (Taper 1)       (Taper 2)       (Race)
   │                │               │              │
   ▼                ▼               ▼              ▼
┌──────┐       ┌──────┐        ┌──────┐       ┌──────┐
│ 100% │  ───→ │75-85%│  ───→  │60-70%│  ───→ │40-50%│
│Volume│       │Volume│        │Volume│       │Volume│
└──────┘       └──────┘        └──────┘       └──────┘
   │                │               │              │
   │                │               │              │
50 km           40 km           32 km          22 km
Long: 20km      Long: 15km      Long: 12km     Race: 42.2km

Maintains frequency, reduces distance
Includes sharpness work (strides/short tempo)
```

---

### 4. Race Date Calculation

```
User Input:
┌─────────────────────────────────────────────────────┐
│ start_date: 2025-01-01                              │
│ race_date:  2025-04-15                              │
│ min_weeks:  12                                      │
│ max_weeks:  16                                      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
Calculate Duration:
┌─────────────────────────────────────────────────────┐
│ Weeks between dates = 15.4 weeks                    │
│ Round up to 16 weeks                                │
│ Check: 16 is within [12, 16] ✓                     │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
Generate Plan:
┌─────────────────────────────────────────────────────┐
│ Week 1:  Jan 1 - Jan 7                              │
│ Week 2:  Jan 8 - Jan 14                             │
│ ...                                                  │
│ Week 14: Apr 1 - Apr 7  (Peak)                      │
│ Week 15: Apr 8 - Apr 14 (Taper)                     │
│ Week 16: Apr 15         (Race Day)                  │
└─────────────────────────────────────────────────────┘
```

---

### 5. Pace Zone Calculation

```
Input: goal_race_time = "04:15:00" (marathon)
       race_distance = 42.2 km
       experience = "Intermediate"
       
       ▼
       
Calculate Goal Pace:
┌─────────────────────────────────────────────────────┐
│ Total seconds: 4 × 3600 + 15 × 60 = 15,300 sec     │
│ Goal pace: 15,300 / 42.2 = 362.6 sec/km            │
│ Formatted: 6:03 min/km                              │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
Calculate Zones (Intermediate):
┌─────────────────────────────────────────────────────┐
│ Easy:      6:03 + 60-75 sec  = 7:03-7:18 min/km    │
│ Long:      6:03 + 50-65 sec  = 6:53-7:08 min/km    │
│ Tempo:     6:03 + 20-25 sec  = 6:23-6:28 min/km    │
│ Threshold: 6:03 + 10-20 sec  = 6:13-6:23 min/km    │
│ Intervals: 6:03 - 15-20 sec  = 5:43-5:48 min/km    │
│ Recovery:  6:03 + 90-120 sec = 7:33-8:03 min/km    │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
Apply to Workouts:
┌─────────────────────────────────────────────────────┐
│ Monday: Easy Run @ 7:03-7:18 min/km                 │
│ Tuesday: Tempo Run @ 6:23-6:28 min/km              │
│ Wednesday: Easy Run @ 7:03-7:18 min/km             │
│ Thursday: Easy Run @ 7:03-7:18 min/km              │
│ Friday: Intervals @ 5:43-5:48 min/km               │
│ Saturday: Long Run @ 6:53-7:08 min/km              │
│ Sunday: Rest                                         │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 API Request Flow

### Complete Request Sequence

```
1. Validate Input
   ↓
2. Calculate Pace Zones
   ↓
3. Determine Rest Requirements
   ↓
4. Calculate Duration (if race_date provided)
   ↓
5. Generate First Week
   ↓
6. Return plan_id + Week 1
   ↓
7. User requests complete plan
   ↓
8. Generate Remaining Weeks
   ↓
9. Apply Tapering Logic
   ↓
10. Return Complete Plan
```

---

## 🎯 Decision Tree: Workout Sequencing

```
                    Start Week
                        │
                        ▼
                 ┌──────────────┐
                 │ Day 1: Easy  │
                 └──────┬───────┘
                        │
                        ▼
              ┌─────────────────┐
              │ Can schedule    │
              │ hard workout?   │
              └────┬────────┬───┘
                   │        │
              Yes  │        │ No
                   │        │
                   ▼        ▼
         ┌──────────────┐  ┌──────────────┐
         │ Day 2: Tempo │  │ Day 2: Easy  │
         └──────┬───────┘  └──────┬───────┘
                │                  │
                ▼                  │
         ┌──────────────┐         │
         │ Day 3: Easy  │◄────────┘
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Day 4: Easy  │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Day 5:       │
         │ Intervals    │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Day 6: Easy  │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Day 7:       │
         │ Long Run     │
         └──────────────┘

Rules Applied:
✓ No back-to-back hard workouts
✓ Easy days between quality sessions
✓ No hard workout before long run
✓ 2-3 days between hard efforts
```

---

## 📊 Data Flow Diagram

```
┌─────────────┐
│   User      │
│   Input     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Input Validation & Preprocessing       │
│  ┌────────────────────────────────────┐ │
│  │ • Parse dates and times            │ │
│  │ • Validate experience level        │ │
│  │ • Check training day count         │ │
│  │ • Normalize measurement units      │ │
│  └────────────────────────────────────┘ │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Helper Functions                        │
│  ┌────────────────────────────────────┐ │
│  │ calculatePaceZones()               │ │
│  │ determineRestDayRequirements()     │ │
│  │ calculateDurationFromRaceDate()    │ │
│  └────────────────────────────────────┘ │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  AI Prompt Construction                  │
│  ┌────────────────────────────────────┐ │
│  │ • Inject user data                 │ │
│  │ • Add pace zones                   │ │
│  │ • Add rest requirements            │ │
│  │ • Add sequencing rules             │ │
│  │ • Add tapering instructions        │ │
│  └────────────────────────────────────┘ │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  OpenAI API Call                         │
│  ┌────────────────────────────────────┐ │
│  │ Model: gpt-5-nano (Week 1)         │ │
│  │ Model: gpt-5-mini (Complete)       │ │
│  └────────────────────────────────────┘ │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Response Processing                     │
│  ┌────────────────────────────────────┐ │
│  │ • Parse JSON response              │ │
│  │ • Validate workout intensities     │ │
│  │ • Update weekly totals             │ │
│  │ • Store plan in memory             │ │
│  └────────────────────────────────────┘ │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────┐
│  Return to  │
│    User     │
└─────────────┘
```

---

## 🔧 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Express.js Server                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              API Endpoints                          │ │
│  │  • POST /generate-plan                             │ │
│  │  • POST /get-remaining-plan                        │ │
│  │  • POST /calculate-pace-zones          (NEW)       │ │
│  │  • POST /calculate-plan-duration       (NEW)       │ │
│  │  • POST /validate-rest-days            (NEW)       │ │
│  │  • GET  /health                                    │ │
│  │  • GET  /plan-status/:plan_id                      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Helper Functions                       │ │
│  │  • calculatePaceZones()                (NEW)       │ │
│  │  • determineRestDayRequirements()      (NEW)       │ │
│  │  • calculateDurationFromRaceDate()     (NEW)       │ │
│  │  • adjustStartDate()                               │ │
│  │  • validateAndFixIntensity()                       │ │
│  │  • parseGoalPace()                                 │ │
│  │  • updateWeeklyTotals()                            │ │
│  │  • validateTrainingPlan()                          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              In-Memory Storage                      │ │
│  │  • planStorage = {}                                │ │
│  │  • TTL: 24 hours                                   │ │
│  │  • Auto-cleanup every hour                         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              OpenAI Integration                     │ │
│  │  • Client initialization                           │ │
│  │  • API key validation                              │ │
│  │  • Model selection (gpt-5-nano/mini)               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 📈 Feature Interaction Matrix

```
┌──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│   Feature    │ Workout  │   Rest   │ Tapering │   Race   │   Pace   │
│              │Sequencing│   Days   │          │   Date   │   Zones  │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Workout      │    ✓     │    ✓     │    ✓     │    -     │    ✓     │
│ Sequencing   │          │          │          │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Rest Days    │    ✓     │    ✓     │    -     │    -     │    -     │
│              │          │          │          │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Tapering     │    ✓     │    -     │    ✓     │    ✓     │    ✓     │
│              │          │          │          │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Race Date    │    -     │    -     │    ✓     │    ✓     │    -     │
│              │          │          │          │          │          │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Pace Zones   │    ✓     │    -     │    ✓     │    -     │    ✓     │
│              │          │          │          │          │          │
└──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

Legend:
✓ = Features interact/depend on each other
- = Features are independent
```

---

**Version:** 2.0.0  
**Last Updated:** December 2025
