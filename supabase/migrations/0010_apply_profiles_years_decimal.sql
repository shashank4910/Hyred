-- apply_profiles.years_experience: allow one decimal (e.g. 7.7 years)
alter table apply_profiles
  alter column years_experience type numeric(4, 1)
  using years_experience::numeric(4, 1);
