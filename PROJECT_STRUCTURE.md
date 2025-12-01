# Project Structure - Training Plan API v2.0

## 📁 Complete File Structure

```
365-run-api/
│
├── 📄 Core Files
│   ├── server.js                      ⭐ Main API server (UPDATED)
│   ├── package.json                   Dependencies configuration
│   ├── package-lock.json              Locked dependencies
│   ├── .env                           Environment variables (API key)
│   ├── newserver.js                   Backup/alternative server
│   ├── ser.js                         Old version (14k lines)
│   └── test.js                        Old test file (5k lines)
│
├── 📚 Documentation (NEW)
│   ├── README.md                      ⭐ Complete API documentation (UPDATED)
│   ├── CHANGELOG.md                   ⭐ Detailed change log
│   ├── QUICK_REFERENCE.md             ⭐ Quick usage guide
│   ├── IMPLEMENTATION_SUMMARY.md      ⭐ Technical implementation details
│   ├── WORKFLOW_DIAGRAM.md            ⭐ Visual workflow diagrams
│   ├── DEPLOYMENT_GUIDE.md            ⭐ Deployment instructions
│   ├── FINAL_SUMMARY.md               ⭐ Complete summary
│   └── PROJECT_STRUCTURE.md           ⭐ This file
│
├── 🧪 Testing
│   ├── test-new-features.js           ⭐ Comprehensive test suite (NEW)
│   └── sample-requests/               ⭐ Sample request files (NEW)
│       ├── README.md                  Sample requests documentation
│       ├── beginner-marathon.json     Beginner sample
│       ├── intermediate-marathon.json Intermediate sample
│       ├── advanced-half-marathon.json Advanced sample
│       └── elite-marathon.json        Elite sample
│
├── 📦 Dependencies
│   ├── node_modules/                  Installed packages
│   └── .package-lock.json             Package lock
│
└── 🔧 Git
    └── .git/                          Git repository

⭐ = New or significantly updated in v2.0
```

---

## 📄 File Descriptions

### Core Files

#### `server.js` ⭐ (UPDATED - Main Implementation)
**Purpose:** Main API server with all new features  
**Size:** ~1,600 lines  
**Key Components:**
- Express server setup
- 7 API endpoints (4 existing + 3 new)
- 3 new helper functions
- Enhanced AI prompts (1,300+ lines)
- Input validation and preprocessing
- OpenAI integration

**New Features:**
- `calculatePaceZones()` function
- `determineRestDayRequirements()` function
- `calculateDurationFromRaceDate()` function
- `/calculate-pace-zones` endpoint
- `/calculate-plan-duration` endpoint
- `/validate-rest-days` endpoint

---

#### `package.json`
**Purpose:** Project configuration and dependencies  
**Dependencies:**
- express: ^4.21.2
- cors: ^2.8.5
- dotenv: ^16.3.1
- openai: ^5.23.2
- uuid: ^13.0.0
- nodemon: ^3.0.2 (dev)

---

#### `.env`
**Purpose:** Environment configuration  
**Required Variables:**
```env
OPENAI_API_KEY=sk-proj-...
PORT=8000
```

**Optional Variables:**
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

---

### Documentation Files (All NEW)

#### `README.md` ⭐ (UPDATED)
**Purpose:** Complete API documentation  
**Size:** ~500 lines  
**Contents:**
- Feature overview
- API endpoint documentation
- Request/response examples
- Quick start guide
- Technical details

---

#### `CHANGELOG.md` ⭐
**Purpose:** Detailed change documentation  
**Size:** ~600 lines  
**Contents:**
- All 5 feature implementations
- Problem/solution format
- Code examples
- Migration guide
- Bug fixes

---

#### `QUICK_REFERENCE.md` ⭐
**Purpose:** Quick usage guide  
**Size:** ~400 lines  
**Contents:**
- Feature cheat sheet
- Quick examples
- Common issues
- Best practices
- Pro tips

---

#### `IMPLEMENTATION_SUMMARY.md` ⭐
**Purpose:** Technical implementation details  
**Size:** ~500 lines  
**Contents:**
- Requirement-by-requirement breakdown
- Code locations
- Function signatures
- Validation checklist
- Success metrics

---

#### `WORKFLOW_DIAGRAM.md` ⭐
**Purpose:** Visual workflow diagrams  
**Size:** ~400 lines  
**Contents:**
- Complete workflow diagram
- Feature integration flows
- Decision trees
- Data flow diagrams
- System architecture

---

#### `DEPLOYMENT_GUIDE.md` ⭐
**Purpose:** Deployment instructions  
**Size:** ~500 lines  
**Contents:**
- Pre-deployment checklist
- Installation steps
- Testing procedures
- Common issues & solutions
- Performance benchmarks
- Security checklist
- Post-deployment verification

---

#### `FINAL_SUMMARY.md` ⭐
**Purpose:** Complete project summary  
**Size:** ~400 lines  
**Contents:**
- Implementation overview
- All deliverables
- Feature summaries
- Code statistics
- Quick start guide
- Success metrics

---

#### `PROJECT_STRUCTURE.md` ⭐
**Purpose:** Project structure documentation  
**This file**

---

### Testing Files

#### `test-new-features.js` ⭐ (NEW)
**Purpose:** Comprehensive test suite  
**Size:** ~400 lines  
**Test Coverage:**
- Pace zone calculation (3 tests)
- Plan duration calculation (3 tests)
- Rest day validation (5 tests)
- Full plan generation (1 test)
- Workout sequencing validation
- Health check

**Usage:**
```bash
node test-new-features.js
```

---

#### `sample-requests/` ⭐ (NEW)
**Purpose:** Sample request files for testing  
**Files:**
1. `README.md` - Sample documentation
2. `beginner-marathon.json` - Beginner scenario
3. `intermediate-marathon.json` - Intermediate scenario
4. `advanced-half-marathon.json` - Advanced scenario
5. `elite-marathon.json` - Elite scenario

**Usage:**
```bash
curl -X POST http://localhost:8000/generate-plan \
  -H "Content-Type: application/json" \
  -d @sample-requests/intermediate-marathon.json
```

---

## 🔍 Code Organization

### Main Server (`server.js`)

```javascript
// Structure:
├── Imports & Setup (lines 1-50)
│   ├── Express, CORS, OpenAI
│   ├── Middleware configuration
│   └── OpenAI client initialization
│
├── Storage & Cleanup (lines 51-100)
│   ├── In-memory plan storage
│   └── Automatic cleanup (24hr TTL)
│
├── AI Prompts (lines 101-900)
│   ├── FIRST_WEEK_PROMPT (500 lines)
│   └── REMAINING_WEEKS_PROMPT (800 lines)
│
├── Helper Functions (lines 901-1200)
│   ├── validateAndFixIntensity()
│   ├── parseGoalPace()
│   ├── adjustStartDate()
│   ├── calculateDurationFromRaceDate() ⭐ NEW
│   ├── calculatePaceZones() ⭐ NEW
│   ├── determineRestDayRequirements() ⭐ NEW
│   ├── updateWeeklyTotals()
│   └── validateTrainingPlan()
│
├── Core Functions (lines 1201-1500)
│   ├── generateFirstWeek()
│   └── generateRemainingWeeks()
│
├── API Endpoints (lines 1501-1700)
│   ├── POST /generate-plan
│   ├── POST /get-remaining-plan
│   ├── POST /calculate-pace-zones ⭐ NEW
│   ├── POST /calculate-plan-duration ⭐ NEW
│   ├── POST /validate-rest-days ⭐ NEW
│   ├── GET /health
│   └── GET /plan-status/:plan_id
│
└── Server Startup (lines 1701-1720)
    └── app.listen()
```

---

## 📊 File Size Comparison

### Before v2.0
```
server.js:     ~1,200 lines
README.md:     ~100 lines
Total docs:    ~100 lines
Total files:   ~5 files
```

### After v2.0
```
server.js:     ~1,600 lines (+400)
README.md:     ~500 lines (+400)
Total docs:    ~3,500 lines (+3,400)
Total files:   ~15 files (+10)
```

**Growth:**
- Code: +33% (400 lines)
- Documentation: +3,400% (3,400 lines)
- Files: +200% (10 files)

---

## 🎯 Key Directories

### `/` (Root)
**Purpose:** Main application files  
**Key Files:**
- server.js (main server)
- package.json (dependencies)
- .env (configuration)

### `/sample-requests/`
**Purpose:** Test data and examples  
**Key Files:**
- 4 JSON sample files
- README.md (documentation)

### `/node_modules/`
**Purpose:** Installed dependencies  
**Size:** ~150 packages

### `/.git/`
**Purpose:** Git version control  
**Contents:** Git repository data

---

## 📈 Code Distribution

### By Type
```
JavaScript:    ~2,000 lines (server.js + tests)
Markdown:      ~3,500 lines (documentation)
JSON:          ~100 lines (samples + config)
Total:         ~5,600 lines
```

### By Purpose
```
Core Logic:    ~1,600 lines (server.js)
Testing:       ~400 lines (test suite)
Documentation: ~3,500 lines (8 files)
Samples:       ~100 lines (4 files)
```

### By Feature
```
Workout Sequencing:     ~200 lines
Rest Day Logic:         ~200 lines
Tapering:               ~150 lines
Race Date Support:      ~150 lines
Pace Recommendations:   ~200 lines
Other (existing):       ~700 lines
```

---

## 🔄 File Dependencies

```
server.js
├── Depends on:
│   ├── express
│   ├── cors
│   ├── openai
│   ├── uuid
│   └── dotenv
│
├── Used by:
│   ├── test-new-features.js
│   └── sample-requests/*.json
│
└── Documented in:
    ├── README.md
    ├── QUICK_REFERENCE.md
    └── DEPLOYMENT_GUIDE.md

test-new-features.js
├── Depends on:
│   └── server.js (running)
│
└── Documented in:
    ├── DEPLOYMENT_GUIDE.md
    └── FINAL_SUMMARY.md

sample-requests/*.json
├── Used by:
│   ├── server.js
│   └── test-new-features.js
│
└── Documented in:
    └── sample-requests/README.md
```

---

## 🚀 Quick Navigation

### For Development
- **Main code:** `server.js`
- **Tests:** `test-new-features.js`
- **Samples:** `sample-requests/`

### For Documentation
- **Getting started:** `README.md`
- **Quick reference:** `QUICK_REFERENCE.md`
- **Changes:** `CHANGELOG.md`

### For Deployment
- **Deployment:** `DEPLOYMENT_GUIDE.md`
- **Summary:** `FINAL_SUMMARY.md`
- **Structure:** `PROJECT_STRUCTURE.md` (this file)

### For Understanding
- **Implementation:** `IMPLEMENTATION_SUMMARY.md`
- **Workflows:** `WORKFLOW_DIAGRAM.md`
- **Complete overview:** `FINAL_SUMMARY.md`

---

## 📝 File Naming Conventions

### Documentation Files
- ALL_CAPS.md for major documents
- lowercase.md for supporting files
- README.md for directory documentation

### Code Files
- lowercase.js for JavaScript files
- kebab-case.json for JSON files

### Sample Files
- descriptive-name.json
- experience-level-race-type.json

---

## 🎯 File Priorities

### Must Read (Priority 1)
1. `README.md` - Start here
2. `QUICK_REFERENCE.md` - Quick usage
3. `DEPLOYMENT_GUIDE.md` - How to deploy

### Should Read (Priority 2)
4. `CHANGELOG.md` - What changed
5. `FINAL_SUMMARY.md` - Complete overview
6. `sample-requests/README.md` - Test examples

### Nice to Read (Priority 3)
7. `IMPLEMENTATION_SUMMARY.md` - Technical details
8. `WORKFLOW_DIAGRAM.md` - Visual workflows
9. `PROJECT_STRUCTURE.md` - This file

---

## ✅ File Checklist

### Core Files
- [x] server.js (updated)
- [x] package.json (unchanged)
- [x] .env (configured)

### Documentation
- [x] README.md (updated)
- [x] CHANGELOG.md (new)
- [x] QUICK_REFERENCE.md (new)
- [x] IMPLEMENTATION_SUMMARY.md (new)
- [x] WORKFLOW_DIAGRAM.md (new)
- [x] DEPLOYMENT_GUIDE.md (new)
- [x] FINAL_SUMMARY.md (new)
- [x] PROJECT_STRUCTURE.md (new)

### Testing
- [x] test-new-features.js (new)
- [x] sample-requests/ (new)
  - [x] README.md
  - [x] beginner-marathon.json
  - [x] intermediate-marathon.json
  - [x] advanced-half-marathon.json
  - [x] elite-marathon.json

---

**Version:** 2.0.0  
**Last Updated:** December 2025  
**Total Files:** 15 (5 core + 8 docs + 2 test)  
**Total Lines:** ~5,600 lines
