-- Stamps resolution_method on already-settled questions.

-- resolveGameWinner is the one automatic resolver, and it always writes this note.
UPDATE "questions" SET "resolution_method" = 'system'
WHERE "status" IN ('resolved', 'disputed')
	AND "resolution_note" = 'Resolved automatically from ESPN''s final score.';
--> statement-breakpoint

-- An overturned dispute means an admin wrote the current result.
UPDATE "questions" q SET "resolution_method" = 'admin'
WHERE q."resolution_method" IS NULL
	AND q."status" IN ('resolved', 'disputed')
	AND EXISTS (
		SELECT 1 FROM "resolution_disputes" d
		WHERE d."question_id" = q."id" AND d."status" = 'overturned'
	);
--> statement-breakpoint

-- Official questions are posted and settled by admins.
UPDATE "questions" SET "resolution_method" = 'admin'
WHERE "resolution_method" IS NULL
	AND "status" IN ('resolved', 'disputed')
	AND "is_official";
--> statement-breakpoint

-- The rest went through the creator's own resolve. An admin resolving a user
-- question from the queue is indistinguishable here, so a few of these may be
-- admin resolutions.
UPDATE "questions" SET "resolution_method" = 'creator', "resolved_by_user_id" = "creator_id"
WHERE "resolution_method" IS NULL
	AND "status" IN ('resolved', 'disputed')
	AND NOT "is_official"
	AND "creator_id" IS NOT NULL;
--> statement-breakpoint

-- The real moment these games went final wasn't recorded. Start plus four
-- hours puts each one past any settling window a job waits out.
UPDATE "games" SET "finalized_at" = "starts_at" + interval '4 hours'
WHERE "status" = 'final' AND "finalized_at" IS NULL;
