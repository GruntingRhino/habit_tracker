<claude-mem-context>
# Memory Context

# [habit_tracker] recent context, 2026-05-19 2:57pm EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,957t read) | 704,787t work | 97% savings

### May 11, 2026
357 3:01p 🔵 Zod Validation Gap: habits, meals, projects POST Routes Use Manual Checks
361 " 🔵 Full Validation Gap Map: Weights and Project Tasks Routes Also Lack Zod
362 " 🔵 Scoring Engine Is Pure, Deterministic — Ideal Unit Test Target
363 3:02p 🟣 In-Memory Rate Limiter Implemented for Auth Brute-Force Protection
364 " 🟣 Error Monitoring Utility Implemented with Discord Webhook Alerting
365 " 🔴 Auth Brute-Force Protection Wired Into NextAuth Authorize Callback
366 " 🔴 change-password Route Gets Rate Limiting and Monitoring
367 3:03p 🔴 Habits Route Upgraded to Strict Zod Validation with Monitoring
368 " 🔴 Meals Route Upgraded to Strict Zod Validation — Fixes parseInt Bug
369 " 🔴 Projects Route Upgraded to Strict Zod Validation with ISO Datetime Deadline Check
370 " 🔴 Project Tasks Route Fully Zod-Validated with Three Distinct Schemas
371 3:04p 🔴 Weights Routines Route Upgraded to Zod Validation and Error Handling
372 " 🔴 Weights Exercises Route Fully Validated — Bulk Replace Capped at 50 Items
373 " 🔴 Workout Sessions Route Fully Validated — Nested exerciseLogs Schema Eliminates Type Cast
374 3:05p 🟣 Vitest Installed and Configured as Test Runner
### May 12, 2026
393 9:08p ✅ Removed claude-mem agents and markdown files from pa.py project
394 9:13p ✅ Cleanup of claude-mem agents and markdown config files for pa.py project
395 " ✅ Uninstalled claude-mem plugin and deleted agent markdown files from RTB project
S30 Redesign habit tracker Projects section: rename, simplify filters, auto-sort, hover checkmark completion with animation, new frontend design from Claude Design artifact, validate homepage for fake data (May 12 at 9:14 PM)
S28 Remove claude-mem agents, CLAUDE.md, and other markdown instruction files from pa.py personal AI project, and uninstall claude-mem plugin (May 12 at 9:14 PM)
### May 13, 2026
396 12:15p 🔵 Habit Tracker AI Architecture: Groq + Ollama Dual Backend
397 " 🔵 Invalid Groq Model Name Is Root Cause of AI Malfunction
398 12:16p 🔵 AI Routes to Ollama/llama3 — Groq Key Empty, JSON Reliability Is Likely Failure Point
399 " 🔵 Coach Has Robust Deterministic Fallback — Dev Server Not Running
400 12:17p 🔵 Weak Admin Credentials in .env; Seed/Provision Endpoints Unconfigured
401 " 🔵 Dev Server Running on Next.js 16.2.6 with Turbopack
402 " 🔵 Curl Login to NextAuth Credentials Endpoint Fails to Establish Session
403 " 🔵 Authentication Confirmed Working — Admin Login Successful via Curl
404 " 🔵 AI Coach IS Working — Ollama Returns Dynamic Context-Aware Response
405 12:18p 🔵 Admin User Habit Logs Are Sparse — All 100% Completion But Very Few Entries
406 " 🔵 Category Scores Stale Since March 18, 2026 — No Daily Entries for ~2 Months
407 " 🔴 RateLimitBucket Table Missing from Database — Migration Not Applied
408 " 🔵 AI Coach POST Confirmed Working — 75-Second Total Latency Is Core "Not Working" Issue
409 12:19p 🔵 Ollama Baseline 2.5s But Coach POST Takes 51s — Frontend Has No Timeout or Progress
410 " ✅ Added OLLAMA_TIMEOUT_MS Config to ai-config.ts
411 " 🔴 Fixed AI Latency: Compact Context + 12s Abort Timeout Added to Coach Ollama Calls
412 " ⚖️ User Confirmed AI Fix Scope: Full Data Read + Targeted Personal Responses
413 12:32p 🔵 Coach Fallback Path Triggers Incorrectly: shouldUseDeterministicNoDataPhysicalResponse Gates LLM
414 " 🟣 Added CoachIntent Detection and Weak-Area Helper Functions to coach.ts
415 " 🔴 Refactored buildFallbackCoachResponse with Intent-Routing and Specialized Response Builders
### May 19, 2026
464 1:15p 🟣 Projects Section Renamed and Redesigned as Priority-Sorted Task Manager
465 " 🟣 New Frontend Design Implemented from Design File with Fake-Data Validation
466 " 🔵 Habit Tracker Projects Page: Current State Before Redesign
S29 Redesign habit tracker Projects section: rename section, simplify filters to Active/Completed, auto-sort by priority+due date, add hover checkmark completion with animation, implement new Claude Design frontend, and validate homepage for fake data (May 19 at 1:16 PM)
467 1:17p 🔵 Claude Design Artifact is a tar.gz Archive, Not Inline HTML
468 " 🔵 Full Projects Page and Task Detail UI Mapped — All Targets for Redesign Confirmed
469 " 🔵 Prisma Schema: Project and ProjectTask Models Confirmed
470 1:18p 🔵 Claude Design Bundle Contents Fully Mapped — Design Conflicts With User Requirements Identified
471 " 🔵 Design Token System and CSS Architecture Extracted from Bundle
472 " 🔵 Projects and Tasks API: Priority Supports "urgent" Level, markCoachContextDirty Called on All Mutations
473 1:19p 🔵 All "Projects" Label Locations Mapped Across Codebase — Multiple Files Require Rename
474 " ✅ projects/page.tsx Deleted in Preparation for Full Replacement
475 " ⚖️ Session Reset: Switched to Implementing app.html Design Instead of index.html

Access 705k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>