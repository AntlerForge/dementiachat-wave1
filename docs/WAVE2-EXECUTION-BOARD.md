# Wave 2 Execution Board

Date: 2026-03-26  
Status: Ready to start

This board is the implementation plan for Wave 2. It is intentionally operational: each milestone has concrete deliverables, tests, and ship gates.

## Outcomes to hit

1. Add confidence-aware AI with safe human handoff.
2. Add caregiver context timeline (appointments/check-ins/notes).
3. Activate escalation delivery with observable reliability.
4. Add backup caregiver takeover flow without increasing Dad UI complexity.

## Milestones

## M1 - Confidence Routing Foundation

### Deliverables

- Define confidence policy model in DB (thresholds, required handoff cases, rule versioning).
- Add AI response metadata fields to messages/events (confidence, reason tags, model/version).
- Add caregiver-side review UI for low-confidence and sensitive-topic responses.
- Add explicit "human required" decision path before any auto-send behavior.

### SQL tasks

- Add table: `ai_policy_rules` (per conversation policy).
- Add table: `ai_decision_events` (audit trail for each AI decision).
- Add migration to connect policy version to message metadata.
- Add RLS policies so only caregiver/admin can manage policy; dad gets no policy controls.

### App tasks

- Add confidence badge and explanation chip in caregiver thread.
- Add "Require manual reply" override control.
- Add timeline-compatible event model in local state for future milestones.

### Function tasks

- Update delayed-auto logic to consult policy rules before send.
- Log each policy evaluation to `ai_decision_events`.

### Tests / gate

- Unit: confidence threshold routing.
- Integration: low-confidence path always requires human.
- Gate: no autonomous sends bypassing policy controls.

## M2 - Context Timeline

### Deliverables

- Timeline data model for appointments/check-ins/notes.
- Caregiver timeline panel with add/edit/archive actions.
- AI prompt builder reads active timeline context by date window.

### SQL tasks

- Add table: `context_timeline_entries`.
- Add table: `context_timeline_tags`.
- Add indexes for conversation/date queries.
- Add RLS so only authorized caregiver roles can edit; dad view remains read-only/no controls.

### App tasks

- Add caregiver timeline tab/section.
- Add date/time input, note type, urgency, and linked message reference.
- Add filters: upcoming, recent, unresolved.

### Function tasks

- Add helper query for "timeline context bundle" for AI use.
- Add sanitization step so only approved fields enter prompt context.

### Tests / gate

- Integration: timeline entries appear consistently across devices.
- Edge: offline create/update syncs safely on reconnect.
- Gate: context fetch latency stays acceptable on mobile network.

## M3 - Escalation Operations

### Deliverables

- Define escalation classes (`info`, `important`, `urgent`).
- Turn push job pipeline into policy-driven delivery behavior.
- Add caregiver observability panel (pending, sent, failed, retries).

### SQL tasks

- Extend `notification_jobs` with class, attempt count, failure reason, next retry policy.
- Add delivery audit view/RPC for caregiver diagnostics.
- Add quiet-hours and suppression policy table.

### App tasks

- Add escalation policy controls in caregiver settings.
- Add notification status list with retry button for failed jobs.
- Add subscription-health indicators (active/stale) per caregiver device.

### Function tasks

- Update `push-dispatcher` for retry/backoff matrix by escalation class.
- Add dead-letter handling after max attempts.

### Tests / gate

- Integration: urgent alerts bypass low-priority throttling safely.
- Load: job backlog drains within target window.
- Gate: end-to-end trace exists for every failed notification.

## M4 - Backup Caregiver Takeover

### Deliverables

- Backup caregiver role model with scoped permissions.
- One-click briefing packet from latest messages + timeline highlights.
- Time-bounded takeover mode and clean hand-back.

### SQL tasks

- Add role mapping for backup caregivers per conversation.
- Add takeover session record table (start/end/reason/operator).
- Add RLS constraints preventing policy/admin mutation by backups unless explicitly granted.

### App tasks

- Add "handoff to backup" flow in caregiver UI.
- Add briefing packet preview and send action.
- Add visible takeover state banner.

### Function tasks

- Generate briefing packet summary payload.
- Trigger handoff notifications to backup recipients.

### Tests / gate

- Permission tests for backup boundaries.
- Recovery tests for interrupted handoff.
- Gate: handoff completion under 5 minutes in scripted run.

## Cross-cutting work

- **Security:** maintain strict RLS and auditability for policy and escalation actions.
- **Performance:** keep polling/function calls efficient for mobile battery/network.
- **Resilience:** preserve offline draft/send behavior while adding new metadata.
- **UX discipline:** no additional complexity in Dad UI.

## Proposed implementation order

1. M1 (confidence routing)
2. M2 (timeline)
3. M3 (escalation operations)
4. M4 (backup takeover)

This order reduces risk by establishing safety controls first, then context quality, then delivery operations, then coordination complexity.

## Ship checklist template (per milestone)

- [ ] SQL migration written and replay-tested on clean project
- [ ] RLS policies verified with real role accounts
- [ ] App UX states covered (loading/empty/error/success/partial)
- [ ] Function logs and error paths validated
- [ ] Cross-device test pass (desktop + mobile + dad device)
- [ ] Rollback plan documented

## Definition of done for Wave 2

- Confidence and handoff behavior is auditable and safe.
- Timeline improves response quality and reduces repeated confusion loops.
- Escalation pipeline has operational visibility and predictable retries.
- Backup handoff can be executed quickly without role confusion or privilege leaks.
