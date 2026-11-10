-- Use simple, user-friendly descriptions for seeded Industries & Job Roles

update public.interview_industries
set description = 'Software, website, and mobile app jobs in tech.'
where lower(btrim(name)) = 'technology';

update public.interview_job_roles
set description = 'Builds the screens, buttons, and visual parts of websites that users see and use.'
where lower(btrim(name)) = 'frontend developer';

update public.interview_job_roles
set description = 'Builds the server logic, data storage, and behind-the-scenes features of an app.'
where lower(btrim(name)) = 'backend developer';

update public.interview_job_roles
set description = 'Builds mobile apps for Android phones and tablets.'
where lower(btrim(name)) = 'android developer';
