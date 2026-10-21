# React + Vite

## Admin management database setup

Before using Staff Management, OJT Management, System Settings, or Backup & Restore, apply
[`supabase/migrations/20261020224000_admin_management.sql`](./supabase/migrations/20261020224000_admin_management.sql)
to the connected Supabase project using the Supabase SQL Editor. It creates the staff, OJT, and
settings tables with admin-only row-level security and adds the transactional restore function.

If your `public.staff` table already exists with `full_name`, `email`, `position`, and
`department` columns, also apply
[`supabase/migrations/20261020230000_staff_table_access.sql`](./supabase/migrations/20261020230000_staff_table_access.sql).
It grants authenticated admins table access, configures row-level security, and refreshes the
PostgREST schema cache.

If adding a staff row still reports that it violates row-level security, apply
[`supabase/migrations/20261020231000_fix_staff_rls.sql`](./supabase/migrations/20261020231000_fix_staff_rls.sql).
It replaces existing `staff` policies with a single admin-only policy that checks the current
authenticated user through a restricted database function.

Staff Management creates a Supabase Auth account by invitation, then links the staff profile to
that account using its UUID as `staff.id`. Deploy the `create-staff-account` Edge Function with
`supabase functions deploy create-staff-account`. The function verifies the caller is an active
admin and uses the Supabase service-role key only on the server; never add that key to the Vite
environment or frontend code. Configure Supabase Auth email/SMTP and the project Site URL so
staff can receive and complete their invitation.

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
results, and OJT records, allows staff to view a limited set of settings, and keeps account,
backup, question-management, and settings-write access admin-only. Use Staff Assignments in the
admin panel to grant or revoke student access.

OJT Management uses the existing `public.ojt_records` columns `student_name`, `student_number`,
`course`, and `company_name`. It does not require the separate `system_settings` table to load
or manage OJT records.

Backups include `questions`, `staff`, `ojt_records`, and `system_settings`. User profiles and
authentication accounts are excluded. Restoring replaces rows in these four tables after an
in-app confirmation.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
