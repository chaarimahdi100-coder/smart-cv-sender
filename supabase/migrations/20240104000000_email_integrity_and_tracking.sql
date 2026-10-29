-- Phase 5 integrity and tracking fields. This migration does not send mail.
alter table email_drafts add column if not exists approved_attachment_hash text;
alter table applications add column if not exists send_idempotency_key text;

create unique index if not exists unique_application_send_key
  on applications (send_idempotency_key)
  where send_idempotency_key is not null;

create unique index if not exists unique_email_event_provider_id
  on email_events (provider_id)
  where provider_id is not null;
