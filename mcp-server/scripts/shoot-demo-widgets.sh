#!/usr/bin/env bash
# Render every widget fixture (src/demo-data.ts) to a PNG via the headless
# mcp-use inspector. Requires the dev server running with MCP_DEMO_WIDGETS=1:
#
#   cd mcp-server && MCP_DEMO_WIDGETS=1 npm run dev
#   ./scripts/shoot-demo-widgets.sh [dark|light]
#
# Output: mcp-server/demo-shots/<theme>/<widget>--<variant>.png
set -uo pipefail

THEME="${1:-dark}"
MCP="${MCP_URL:-http://localhost:3000/mcp}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/demo-shots/$THEME"
mkdir -p "$OUT"

# tool:variant:height — tall widgets get more room so nothing is cut off.
SHOTS=(
  "lms_demo_course_dashboard:default:1200"
  "lms_demo_course_dashboard:empty:600"
  "lms_demo_course_dashboard:long-titles:900"
  "lms_demo_course_detail:default:1300"
  "lms_demo_course_detail:empty:700"
  "lms_demo_lesson_preview:default:1600"
  "lms_demo_lesson_preview:bare:700"
  "lms_demo_lesson_viewer:default:1600"
  "lms_demo_lesson_viewer:completed:900"
  "lms_demo_lesson_viewer:broken-mdx:800"
  "lms_demo_lesson_viewer:locked:700"
  "lms_demo_my_learning:default:1000"
  "lms_demo_my_learning:finished:700"
  "lms_demo_my_learning:empty:600"
  "lms_demo_course_catalog:subscriber:1100"
  "lms_demo_course_catalog:no-plan:800"
  "lms_demo_course_catalog:empty:600"
  "lms_demo_exam_submissions:default:1000"
  "lms_demo_exam_submissions:empty:600"
  "lms_demo_submission_grader:default:1500"
  "lms_demo_my_exam_results:default:1000"
  "lms_demo_my_exam_results:empty:600"
  "lms_demo_gamification_profile:default:1200"
  "lms_demo_gamification_profile:new:700"
  "lms_demo_gamification_profile:maxed:900"
  "lms_demo_exam_readiness:default:1300"
  "lms_demo_exam_readiness:no-signal:800"
  "lms_demo_exam_readiness:ready:1100"
  "lms_demo_practice_player:all-types:900"
  "lms_demo_practice_player:mixed:900"
  "lms_demo_flashcards:default:800"
  "lms_demo_flashcards:empty:600"
  "lms_demo_study_plan:default:1200"
  "lms_demo_study_plan:done:800"
  "lms_demo_study_plan:empty:700"
  "lms_demo_school_overview:default:1400"
  "lms_demo_school_overview:new-school:800"
  "lms_demo_student_progress_roster:default:1200"
  "lms_demo_student_progress_roster:empty:600"
  "lms_demo_artifact_sandbox:default:1200"
  "lms_demo_landing_page_preview:published:1600"
  "lms_demo_landing_page_preview:draft-warnings:900"
)

i=0
for entry in "${SHOTS[@]}"; do
  IFS=':' read -r tool variant height <<< "$entry"
  i=$((i + 1))
  name="${tool#lms_demo_}--${variant}"
  printf '[%2d/%d] %s (%s)\n' "$i" "${#SHOTS[@]}" "$name" "$THEME"
  npx mcp-use client screenshot \
    --mcp "$MCP" \
    --tool "$tool" "variant=$variant" \
    --width 1100 --height "$height" --theme "$THEME" \
    --output "$OUT/$name.png" >/dev/null 2>&1 \
    || echo "      FAILED: $name"
done

echo "Done → $OUT"
