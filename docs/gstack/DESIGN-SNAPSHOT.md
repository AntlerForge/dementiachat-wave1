# Design Snapshot (GSTACK)

Source: `/office-hours` artifact, then implementation updates.

## Problem and user model

Build a one-to-one, persistent, asynchronous communication app for a son ("Tony") and his dad with dementia:

- Dad gets an ultra-simple, calm interface.
- Caregiver side holds controls and safety settings.
- Chat must work when local caregiver machine is offline.

## Core product thesis

Not just messaging: a trust-journey system that can progress safely from:

1. Manual
2. Suggested AI
3. Delayed auto-response
4. Priority escalation (deferred)
5. Coordinated backup (deferred)

## Wave 1 design scope (implemented baseline)

- Persistent single thread
- Dad/Caregiver split experience
- Caregiver moderation (edit/hide with revision safety)
- Remote dad UI controls with preview-before-apply
- Image sending with display-size controls
- Offline outbox reliability behavior

## Wave 1 implementation sitrep

- Deployed and operational with no known active defects at current handoff.
- Reliability improvements landed for outbox recovery, cache freshness, and sync behavior.
- Push/notification plumbing exists in schema/functions for later activation.

## Wave 2 design direction

- Add AI confidence and human handoff policy.
- Add timeline context (appointments/check-ins/notes).
- Activate escalation rails with observability.
- Add backup caregiver readiness without increasing dad-side UI complexity.
