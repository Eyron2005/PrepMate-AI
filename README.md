# React + Vite

## Admin management database setup

Before using Staff Management, OJT Management, or Backup & Restore, apply
[`supabase/migrations/20261020224000_admin_management.sql`](./supabase/migrations/20261020224000_admin_management.sql)
to the connected Supabase project using the Supabase SQL Editor. It creates the staff and OJT
tables with admin-only row-level security and adds the transactional restore function.

If your `public.staff` table already exists with `full_name`, `email`, `position`, and
`department` columns, also apply
[`supabase/migrations/20261020230000_staff_table_access.sql`](./supabase/migrations/20261020230000_staff_table_access.sql).
It grants authenticated admins table access, configures row-level security, and refreshes the
PostgREST schema cache.

If adding a staff row still reports that it violates row-level security, apply
[`supabase/migrations/20261020231000_fix_staff_rls.sql`](./supabase/migrations/20261020231000_fix_staff_rls.sql).
It replaces existing `staff` policies with a single admin-only policy that checks the current
authenticated user through a restricted database function.

Staff Management sends invitations through the existing `create-staff-account` Edge Function.
Apply [`supabase/migrations/20261028020000_staff_invitations.sql`](./supabase/migrations/20261028020000_staff_invitations.sql)
and deploy the updated `create-staff-account` function and new `accept-staff-invitation` function.
The production Edge Function secret `STAFF_INVITATION_REDIRECT_URL` must be set to
`https://www.prepmate.site/accept-staff-invitation`. This fixed destination prevents invitations
created from a local development session from redirecting to localhost. For local testing,
override the secret with a localhost URL only in a separate development Supabase project.
In Supabase Dashboard > Authentication > URL Configuration, set Site URL to
`https://www.prepmate.site` and add `https://www.prepmate.site/**` to Redirect URLs. Keep
localhost entries only for local development. Supabase Auth rejects invitation redirects not
on that allowlist. The service-role key is used only by the invitation Edge Function; never
add it to the Vite environment or frontend code.

Configure Supabase Auth > Email Templates > Invite user with a dedicated staff message. Use
`{{ .ConfirmationURL }}` for its acceptance link and `{{ .Data.full_name }}` for the invitee's
name. For example:

```html
<h2>You've been invited to join Prepmate as a staff member</h2>
<p>Hello {{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}there{{ end }},</p>
<p>An administrator has invited you to join Prepmate as a staff member.</p>
{{ if .Data.position }}<p>Position: {{ .Data.position }}</p>{{ end }}
{{ if .Data.department }}<p>Department: {{ .Data.department }}</p>{{ end }}
<p><a href="{{ .ConfirmationURL }}">Accept your staff invitation</a></p>
<p>This secure invitation expires in one hour. If you weren't expecting this invitation, contact your administrator or ignore this email.</p>
```

Set Supabase Auth's email invitation link expiry to one hour to match the database invitation
expiry. The mobile app's signup/OTP email template and verification endpoints are unchanged.
Staff access remains disabled until the authenticated, email-verified invitee sets a password
and accepts the invitation. Existing Auth accounts are not duplicated; with Supabase's built-in
invitation template alone, invitations to those addresses are deferred and the Admin Panel
reports why. Sending invitations to existing accounts requires a configured email sender that
can send to an already registered user.

Apply
[`supabase/migrations/20261020233000_staff_auth_account_link.sql`](./supabase/migrations/20261020233000_staff_auth_account_link.sql)
to remove any generated UUID default from `staff.id`, which must reference the newly created
Auth account.

Apply
[`supabase/migrations/20261020235000_staff_dashboard_access.sql`](./supabase/migrations/20261020235000_staff_dashboard_access.sql)
to add the staff dashboard's profile access and initial OJT policies. The role-scoped migration
below replaces those initial policies with assignment-based access.

Apply
[`supabase/migrations/20261021010000_role_scoped_staff_access.sql`](./supabase/migrations/20261021010000_role_scoped_staff_access.sql)
to enable the role-based feature access. It removes stale policies that reference the missing
`public.administrations` relation, gives staff access only to assigned student profiles, interview
results, and OJT records, and keeps account, backup, and question-management access admin-only.
Use Staff Assignments in the admin panel to grant or revoke student access.

OJT Management uses the existing `public.ojt_records` columns `student_name`, `student_number`,
`course`, and `company_name`.

Backups include `questions`, `staff`, and `ojt_records`. User profiles and authentication
accounts are excluded. Restoring replaces rows in these tables after an in-app confirmation.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
