-- Invite links belonging to someone who is no longer in the group.
DELETE FROM "group_invites" gi
WHERE NOT EXISTS (
	SELECT 1 FROM "group_members" gm
	WHERE gm."group_id" = gi."group_id" AND gm."user_id" = gi."created_by"
);
