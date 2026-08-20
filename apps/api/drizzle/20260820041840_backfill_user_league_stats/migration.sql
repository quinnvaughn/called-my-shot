-- One-time backfill for user_league_stats (see the previous migration).
-- Every call/selection resolved before this table existed never went
-- through castCall's/resolveQuestionInternal's delta-tracking, so this
-- computes the same per-(user, league) totals aggregatePointsByUser would
-- have summed live and inserts them once.
with scored as (
	select
		calls.user_id as user_id,
		q.league_id as league_id,
		cs.result_points as points,
		(cs.result_points is not null) as resolved,
		(cs.result_points is not null and qo.is_correct) as correct,
		calls.id as call_id
	from call_selections cs
	join calls on calls.id = cs.call_id
	join question_options qo on qo.id = cs.option_id
	join questions q on q.id = calls.question_id
	where q.type != 'numeric_guess'
	union all
	select
		calls.user_id as user_id,
		q.league_id as league_id,
		calls.result_points as points,
		(calls.result_points is not null) as resolved,
		(calls.result_points is not null and calls.hit_tolerance) as correct,
		calls.id as call_id
	from calls
	join questions q on q.id = calls.question_id
	where q.type = 'numeric_guess'
)
insert into user_league_stats (user_id, league_id, points, resolved_call_count, correct_count, call_count)
select
	user_id,
	league_id,
	coalesce(sum(points) filter (where resolved), 0) as points,
	count(*) filter (where resolved) as resolved_call_count,
	count(*) filter (where correct) as correct_count,
	count(distinct call_id) as call_count
from scored
group by user_id, league_id;
