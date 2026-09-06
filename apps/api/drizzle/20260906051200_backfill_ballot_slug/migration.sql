-- One-time backfill for ballots.slug (see the previous migration). Every
-- ballot that existed before slugs had only a uuid url, so this computes the
-- same string lib/ballot-slug.ts builds for a new one: the league slug, the
-- season display name, and the ballot name (minus a season prefix the name
-- already carries), each slugified, joined by dashes. Duplicates get the
-- same -2/-3 suffix generateUniqueBallotSlug appends, oldest ballot keeping
-- the bare slug.
with parts as (
	select
		b.id,
		b.created_at,
		trim(both '-' from regexp_replace(lower(l.slug), '[^a-z0-9]+', '-', 'g')) as league_part,
		trim(both '-' from regexp_replace(lower(s.display_name), '[^a-z0-9]+', '-', 'g')) as season_part,
		trim(both '-' from regexp_replace(lower(b.name), '[^a-z0-9]+', '-', 'g')) as name_part
	from ballots b
	join leagues l on l.id = b.league_id
	join seasons s on s.id = b.season_id
),
stripped as (
	select
		id,
		created_at,
		league_part,
		season_part,
		case
			when season_part <> '' and name_part like season_part || '-%'
				then substr(name_part, length(season_part) + 2)
			else name_part
		end as name_part
	from parts
),
based as (
	select
		id,
		created_at,
		array_to_string(
			array_remove(
				array[nullif(league_part, ''), nullif(season_part, ''), nullif(name_part, '')],
				null
			),
			'-'
		) as base
	from stripped
),
numbered as (
	select
		id,
		base,
		row_number() over (partition by base order by created_at, id) as n
	from based
)
update ballots
set slug = case when numbered.n = 1 then numbered.base else numbered.base || '-' || numbered.n end
from numbered
where ballots.id = numbered.id;
