# CoachKit — Multi-Sport Coaching App (Starting with Kids Ice Hockey)

## Product Requirements Document

**Version:** 1.0
**Date:** 2026-04-23
**Author:** Product Manager (AI-assisted)
**Status:** Draft — Awaiting Stakeholder Approval

---

## 1. Product Vision

**CoachKit** is an iPhone app that gives youth sports coaches a single, focused tool to manage their team — roster, practice plans, game schedule, and lineups — without the bloat of enterprise team-management platforms.

**Why now:** Existing apps fall into two camps: (1) broad team-management tools like TeamSnap that are heavy on communication/logistics but weak on coaching workflow, and (2) niche drill libraries like CoachThem that nail practice planning but ignore roster and game management. No app combines coaching-centric features (AI-assisted practice plans, position tracking, line management) with lightweight team management in a single, hockey-optimized experience.

**Differentiator:** AI-powered practice plan generation that adapts to the team's age group, skill level, available ice time, and coaching objectives — something no competitor offers today.

**Multi-sport architecture:** The data model and UI are designed sport-agnostically from day one. Hockey is the launch sport; the same app shell supports soccer, lacrosse, basketball, etc. via sport-specific configuration modules (positions, formations, drill libraries, terminology).

---

## 2. Target Users

### Primary Persona: Coach Mike

| Attribute | Detail |
|-----------|--------|
| **Role** | Head coach, Mite/Squirt-level ice hockey (ages 6-12) |
| **Tech comfort** | Uses iPhone daily; not a power user; wants things simple |
| **Pain points** | Spends 30+ min planning each practice on paper; loses track of which kids played which position; juggles texts/emails for parent contact info |
| **Goal** | Spend less time on admin, more time coaching |

### Secondary Persona: Assistant Coach / Team Manager

- Needs read access to roster, schedule, and practice plans
- May help build lineups on game day
- Needs to be able to share practice plans with head coach

### Out of Scope (v1): Parents, Players, League Admins

---

## 3. User Stories

### 3.1 Roster & Contact Info (Must Have)

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| R-1 | As a coach, I want to add a player to my roster so that I can track who is on my team. | Coach can enter: player name, jersey number, photo (optional), date of birth, preferred position(s). Player appears in roster list sorted by jersey number. |
| R-2 | As a coach, I want to store parent/guardian contact info for each player so that I can reach families quickly. | Each player supports 1-2 guardians with name, phone, and email. Tapping phone/email launches native dialer/mail. |
| R-3 | As a coach, I want to edit or remove a player from my roster so that I can keep it current. | Swipe-to-delete with confirmation. Edit opens pre-filled form. Changes persist immediately. |
| R-4 | As a coach, I want to see my full roster at a glance so that I know team size and composition. | Roster screen shows player cards (photo, name, number, position) with a count header ("15 Players"). |
| R-5 | As a coach, I want to export my roster as a CSV/PDF so that I can share it with league officials. | Share sheet produces a formatted PDF or CSV attachment. |

### 3.2 AI-Assisted Practice Plans (Must Have)

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| P-1 | As a coach, I want to create a practice plan by specifying duration, focus areas, and age group so that I get a structured plan fast. | Coach selects: duration (30/45/60/75/90 min), focus areas (skating, passing, shooting, checking, goaltending, game situations), age group. AI generates a time-boxed plan with warm-up, drills, scrimmage, and cool-down segments. |
| P-2 | As a coach, I want each drill in the plan to include a name, description, duration, diagram, and coaching tips so that I can run it without guessing. | Each drill block shows: title, time allocation, text description, a simple rink diagram (optional), and 1-3 coaching cues. |
| P-3 | As a coach, I want to swap, reorder, or remove drills from a generated plan so that I can customize it to my needs. | Drag-to-reorder, swipe-to-delete, and a "Replace Drill" action that suggests alternatives with the same focus area. |
| P-4 | As a coach, I want to save practice plans to a library so that I can reuse or reference them later. | Plans are saved with date and title. Library is searchable by date and focus area. |
| P-5 | As a coach, I want to share a practice plan with my assistant coach so that we're aligned before hitting the ice. | Share sheet exports plan as PDF or deep link (if recipient has the app). |
| P-6 | As a coach, I want the AI to learn from my preferences over time so that suggestions get better. | App tracks which drills the coach keeps vs. removes and weights future suggestions accordingly (local preference model). |

### 3.3 Game Schedule (Must Have)

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| S-1 | As a coach, I want to add a game to my schedule with date, time, location, and opponent so that I can see upcoming games. | Form captures: date/time, rink name, rink address (with MapKit autocomplete), opponent name. |
| S-2 | As a coach, I want to view my schedule as a chronological list so that I know what's coming up. | Schedule screen shows upcoming games sorted by date with a "past games" toggle. Today's game (if any) is highlighted. |
| S-3 | As a coach, I want to record the result of a game (win/loss/tie, score) so that I can track the season. | After game time passes, a "Record Result" prompt appears. Coach enters score. Season record (W-L-T) displays on schedule header. |
| S-4 | As a coach, I want to get a reminder before game day so that I don't forget to prepare. | Local notification 24 hours and 2 hours before game time (configurable in settings). |
| S-5 | As a coach, I want to import a schedule from a CSV or iCal file so that I don't have to enter games manually. | Import accepts .csv and .ics files via share sheet or file picker. Parsed games appear for confirmation before saving. |

### 3.4 Positions & Lineups (Must Have)

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| L-1 | As a coach, I want to define lines (e.g., Line 1, Line 2, Line 3) and assign players to positions (C, LW, RW, LD, RD, G) so that I have my game-day lineup ready. | Lineup builder shows a rink diagram with position slots. Coach drags players from roster strip into slots. Supports multiple lines plus defensive pairs and goalies. |
| L-2 | As a coach, I want to save a lineup for a specific game so that I can reference it on game day. | Lineup is linked to a game in the schedule. Opening a game shows its saved lineup. |
| L-3 | As a coach, I want to see which positions each player has played across the season so that I can ensure fair rotation (important for youth hockey). | Player detail screen shows a position history: a simple bar chart of games at each position. |
| L-4 | As a coach, I want the app to suggest balanced lineups based on position history so that every kid gets equal opportunity. | "Auto-balance" button generates a lineup that minimizes position-repetition variance across the roster. Coach can accept or adjust. |
| L-5 | As a coach, I want to mark players as absent for a specific game so that lineups adjust accordingly. | Attendance toggle per player per game. Absent players are greyed out and excluded from auto-balance. |
| L-6 | As a coach, I want to duplicate a previous game's lineup as a starting point so that I save time. | "Copy from…" action lists past games. Selected lineup is duplicated and editable. |

---

## 4. MoSCoW Prioritization (v1 Scope)

| Priority | Features |
|----------|----------|
| **Must** | Roster CRUD, contact info, practice plan generation (AI), practice plan library, game schedule CRUD, lineup builder, position tracking |
| **Should** | Schedule import (CSV/iCal), roster export, practice plan sharing, game reminders, auto-balance lineups, drill preference learning |
| **Could** | Season stats dashboard, multi-team support, assistant coach sharing (collaborative edit), dark mode, Apple Watch companion |
| **Won't (v1)** | Parent-facing portal, in-app messaging/chat, video analysis, live game tracking/shifts, league integration API, Android version |

---

## 5. Information Architecture

```
CoachKit
├── Teams (tab)
│   └── [Team Name]
│       ├── Roster
│       │   ├── Player List
│       │   └── Player Detail (contact info, position history)
│       ├── Schedule
│       │   ├── Game List (upcoming / past)
│       │   └── Game Detail (opponent, location, result, lineup)
│       ├── Practice Plans
│       │   ├── Plan Library
│       │   ├── New Plan (AI wizard)
│       │   └── Plan Detail (drill list, timeline)
│       └── Lineups
│           ├── Lineup Builder (rink diagram)
│           └── Position History
├── Settings (tab)
│   ├── Profile
│   ├── Sport Configuration
│   ├── Notifications
│   └── Data Export / Import
└── AI Assistant (floating action / sheet)
    └── "Build me a practice plan…"
```

---

## 6. Data Model (Conceptual)

### Core Entities

```
Sport
  id: UUID
  name: String (e.g., "Ice Hockey")
  positions: [Position]          // C, LW, RW, LD, RD, G
  formationTemplates: [Formation]
  terminology: [String: String]  // e.g., "period" vs "half"

Team
  id: UUID
  name: String
  sport: Sport
  season: String                 // e.g., "2026-2027"
  ageGroup: AgeGroup             // Mite, Squirt, PeeWee, Bantam, Midget
  createdAt: Date

Player
  id: UUID
  teamId: UUID → Team
  firstName: String
  lastName: String
  jerseyNumber: Int
  dateOfBirth: Date
  photoURL: String?
  preferredPositions: [Position]
  guardians: [Guardian]

Guardian
  id: UUID
  playerId: UUID → Player
  name: String
  relationship: String           // Mother, Father, Guardian
  phone: String
  email: String

Game
  id: UUID
  teamId: UUID → Team
  date: Date
  rinkName: String
  rinkAddress: String
  opponentName: String
  result: GameResult?            // { homeScore: Int, awayScore: Int, outcome: W/L/T }
  notes: String?

Lineup
  id: UUID
  gameId: UUID → Game
  assignments: [LineAssignment]

LineAssignment
  id: UUID
  lineupId: UUID → Lineup
  lineNumber: Int                // 1, 2, 3, 4
  position: Position             // C, LW, RW, LD, RD, G
  playerId: UUID → Player

PracticePlan
  id: UUID
  teamId: UUID → Team
  title: String
  date: Date
  durationMinutes: Int
  focusAreas: [FocusArea]
  ageGroup: AgeGroup
  segments: [PlanSegment]
  createdAt: Date
  isAIGenerated: Bool

PlanSegment
  id: UUID
  planId: UUID → PracticePlan
  order: Int
  type: SegmentType              // warmup, drill, scrimmage, cooldown
  title: String
  description: String
  durationMinutes: Int
  coachingCues: [String]
  diagramData: Data?             // rink diagram overlay

Attendance
  id: UUID
  gameId: UUID → Game
  playerId: UUID → Player
  isPresent: Bool
```

### Multi-Sport Extension Points

- `Sport` entity holds position definitions, formation templates, and terminology
- `PlanSegment.diagramData` is sport-agnostic (rink → field → court)
- `FocusArea` enum is defined per sport configuration
- `AgeGroup` is sport-specific (Mite/Squirt for hockey → U8/U10 for soccer)

---

## 7. Technical Requirements & Constraints

### Platform & Language
- **Platform:** iPhone (iOS 17+)
- **Language:** Swift 6 with strict concurrency
- **UI Framework:** SwiftUI (no UIKit unless required for specific components)
- **Architecture:** MVVM with Swift Observation framework (`@Observable`)
- **Minimum deployment target:** iOS 17.0

### Data Persistence
- **Local storage:** SwiftData (Core Data successor, native to Swift/SwiftUI)
- **No backend required for v1** — all data lives on-device
- **Future sync:** CloudKit for multi-device sync (designed for but not implemented in v1)
- **Export formats:** CSV, PDF (via UIKit print renderer), iCal

### AI Integration
- **Practice plan generation:** Claude API (Anthropic) via on-device HTTPS calls
- **API key management:** Stored in iOS Keychain, never hardcoded
- **Prompt engineering:** Structured prompts that include age group, duration, focus areas, and coach preference history
- **Offline fallback:** Cached drill library with local template-based plan generation when offline
- **Rate limiting:** Client-side throttle to prevent excessive API calls

### Key Frameworks & Libraries
| Framework | Purpose |
|-----------|---------|
| SwiftUI | All UI |
| SwiftData | Persistence |
| MapKit | Rink location autocomplete |
| EventKit | iCal import |
| UserNotifications | Game reminders |
| PDFKit | PDF export |
| Charts (Swift Charts) | Position history visualization |
| KeychainAccess (SPM) | Secure API key storage |

### Performance & UX Constraints
- App launch to roster screen: < 1 second
- AI practice plan generation: < 10 seconds (show streaming progress)
- Roster supports up to 30 players per team
- Offline-first: all features except AI generation work without connectivity
- Accessibility: VoiceOver support, Dynamic Type, minimum 44pt touch targets

### Security & Privacy
- No user accounts in v1 (single-coach, single-device)
- Player PII (names, DOBs, guardian contacts) stored only in local SwiftData
- No analytics or tracking SDKs
- API key stored in Keychain, not UserDefaults or plist
- Photo storage: local app sandbox only
- Privacy policy required for App Store (collects no data from device)

---

## 8. Screen Inventory (v1)

| # | Screen | Key Elements |
|---|--------|-------------|
| 1 | **Team List** | List of teams + "Add Team" button |
| 2 | **Team Dashboard** | Tabs/sections for Roster, Schedule, Practice Plans, Lineups |
| 3 | **Roster List** | Player cards with photo, name, number, position |
| 4 | **Player Detail / Edit** | Player info form + guardian contacts + position history chart |
| 5 | **Add/Edit Player** | Form: name, number, DOB, photo, positions, guardians |
| 6 | **Schedule List** | Chronological game list with W-L-T header |
| 7 | **Game Detail** | Opponent, date/time, location (map), result, linked lineup |
| 8 | **Add/Edit Game** | Form: date, time, rink, opponent |
| 9 | **Practice Plan Library** | List of saved plans, searchable by date/focus |
| 10 | **New Practice Plan (AI Wizard)** | Step 1: Duration + Focus + Age → Step 2: Review generated plan → Step 3: Customize & save |
| 11 | **Practice Plan Detail** | Timeline view of segments with drill details |
| 12 | **Lineup Builder** | Rink diagram with draggable player chips + line tabs |
| 13 | **Attendance** | Player list with present/absent toggles |
| 14 | **Settings** | Sport config, notifications, export, about |

---

## 9. Open Questions

| # | Question | Impact | Proposed Default |
|---|----------|--------|-----------------|
| 1 | Should we support multiple teams per coach in v1? | Data model (already supports it), but adds UI complexity | Yes — minimal extra effort since data model is multi-team from the start |
| 2 | Where do drill diagrams come from? AI-generated SVG? Static library? | Affects AI prompt complexity and plan richness | Start with a static library of ~50 common hockey drills with pre-made diagrams; AI references them by ID |
| 3 | Should the AI use Claude API directly from the device or go through a lightweight proxy? | Security (API key on device) vs. simplicity | Direct API call with key in Keychain for v1; proxy in v2 when we add accounts |
| 4 | What's the monetization model? | Impacts what's free vs. gated | Freemium: roster + schedule free, AI practice plans + auto-balance lineups require subscription ($4.99/mo or $29.99/yr) |
| 5 | Do we need iPad support in v1? | Additional layout work | No — iPhone only for v1, iPad in v2 |

---

## 10. Out of Scope (v1)

- Parent/player-facing features (viewing schedules, RSVPs)
- In-app messaging or team chat
- Video upload, tagging, or analysis
- Live shift tracking during games
- League/tournament management
- Android version
- Web dashboard
- Integration with third-party platforms (TeamSnap, GameChanger)
- Multi-coach real-time collaboration (sharing is export-only in v1)

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Practice plan generation time | < 10 seconds | In-app timing |
| Plans generated per coach per week | ≥ 2 | Local analytics (opt-in) |
| Roster completion rate | 80% of coaches fill full roster within first week | Local analytics (opt-in) |
| App Store rating | ≥ 4.5 stars | App Store Connect |
| Week-1 retention | ≥ 60% | App Store Connect |
| Monthly active coaches (6 months post-launch) | 1,000 | App Store Connect |

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI-generated practice plans are low quality or unsafe for age group | Medium | High | Curated drill library as guardrails; age-appropriate safety instructions in system prompt; coach always reviews before saving |
| API costs for Claude exceed revenue | Medium | Medium | Client-side rate limiting; cache common plan templates; freemium gate on AI features |
| Coaches find the app too simple (vs. TeamSnap) | Low | Medium | Intentional — position as "coaching tool, not team admin tool"; add features incrementally based on feedback |
| Data loss (no cloud sync in v1) | Medium | High | Prominent "Export Roster" and "Export Plans" features; design CloudKit sync architecture now for v2 |
| App Store rejection | Low | Low | Follow HIG strictly; no private APIs; privacy policy in place |

---

## 13. Release Plan

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Alpha** | Roster + Schedule + basic lineup builder (no AI) | 4 weeks |
| **Beta** | AI practice plans + full lineup with position tracking | +4 weeks (8 total) |
| **v1.0 Launch** | Polish, accessibility audit, App Store submission | +2 weeks (10 total) |
| **v1.1** | Schedule import, roster export, drill preference learning | +4 weeks |
| **v2.0** | CloudKit sync, iPad support, second sport (soccer/lacrosse) | +8 weeks |
