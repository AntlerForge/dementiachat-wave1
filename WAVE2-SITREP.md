# Wave 1 Sitrep and Wave 2 Draft

Date: 2026-03-26  
Project: `AntlerForge/dementiachat-wave1`

## Sitrep

Current state is strong for Wave 1 goals:

- App deploys and runs in production-like use with no known active bugs.
- Persistent two-device chat is working with history and moderation.
- Dad UI remains simple while caregiver controls advanced behavior remotely.
- Reliability work has improved cache freshness, message sync recovery, and outbox behavior.
- Push and alert plumbing is now scaffolded in schema/functions for next-stage activation.

## What changed recently (from GitHub history)

- Reliability hardening:
  - startup failure fallback UI
  - duplicate `client_msg_id` recovery path
  - safer local persistence when storage quota is tight
  - stronger polling/outbox in-flight guards
- Sync correctness:
  - shared conversation re-join protections
  - stale local cache and service-worker fixes
  - explicit message refresh behavior improvements
- Image pipeline:
  - larger photo intake support
  - client-side resize/compression before send
  - optional Supabase Storage-backed image delivery
  - caregiver inline image purge path
- Notifications:
  - push subscriptions + notification job tables
  - push-dispatcher edge function scaffold
  - client config key for VAPID public key

## Wave 2 objective

Ship "assisted reliability" without increasing Dad-side complexity.

### Proposed scope

1. **AI confidence + handoff**
   - Add confidence scoring and caregiver-only auto-handoff thresholds.
   - Require human confirmation when confidence is low or topic is sensitive.
2. **Care context timeline**
   - Structured timeline for appointments, routines, and noteworthy events.
   - Make timeline visible in caregiver flow and available to AI prompt context.
3. **Escalation delivery**
   - Promote push scaffolding to production policy: retries, quiet hours, urgency classes.
   - Add operational visibility (job backlog, delivery failures, stale subscriptions).
4. **Backup caregiver readiness**
   - Role model and permission matrix for temporary takeovers.
   - Build briefing packet generation from recent thread + timeline context.

## Suggested Wave 2 phases

- **Phase A (low risk):** Confidence gating + observability (no autonomous sending changes).
- **Phase B:** Timeline model and caregiver timeline UI.
- **Phase C:** Escalation policy activation and push reliability tuning.
- **Phase D:** Backup caregiver handoff and permission boundaries.

## Exit criteria for Wave 2

- Confidence policy reduces low-quality auto-actions without delaying urgent responses.
- Timeline improves response quality and reduces repeated confusion loops.
- Escalation jobs are auditable end-to-end with predictable retry outcomes.
- Backup takeover can be executed safely in under 5 minutes.
