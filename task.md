# Smart CV Sender progress

## Completed and verified

- Supabase Auth session checks and candidate-owned RLS policies are present.
- Private PDF CV upload/review flow exists; extraction remains an explicit mock fallback.
- Opportunity/application creation now supplies the schema-required company and recipient fields.
- Phase 5 draft editor supports recipient, subject, body, and private CV selection.
- Saving invalidates approval. Approval re-reads the stored values and candidate-owned attachment, then stores a snapshot hash including the resume storage path.
- Duplicate applications are blocked in the action and by the database unique constraint.
- Dashboard application totals and recent status tracking are data-backed.
- Disabled email provider boundary and database fields for send idempotency/provider event deduplication are present.
- Security and integration-readiness audit completed (`SECURITY_AUDIT.md`), adding schema fixes (profile trigger, storage update policy, opportunities location, unique email drafts), pre-send validation gate (`src/lib/send-validation.ts`), middleware route guards, and security unit tests.

## Remaining setup and implementation

- Configure Supabase URL/key and apply all migrations in a local/staging project.
- Replace demo draft generation and mock CV extraction with reviewed provider adapters.
- Choose and implement one email provider OAuth/API adapter, server-side token storage, queue, rate limits, bounded retries, and the approved-send worker. Keep sending disabled until explicitly enabled.
- Add inbox sync using provider thread/message identifiers, manual association for ambiguous replies, and server-created notifications.
- Add notification read/unread UI, pagination/export, reminders, deletion/export workflows, and multi-account RLS integration tests.
