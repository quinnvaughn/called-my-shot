-- The system account that owns every isOfficial question (see
-- createQuestion in graphql/types/question.ts, which sets creatorId to this
-- account whenever isOfficial is true, instead of the admin who clicked
-- "post"). password_hash is deliberately not a real argon2 hash - this
-- account can never pass verifyPassword, so it can never be signed into,
-- regardless of what password someone guesses for its email.
INSERT INTO "users" ("name", "username", "email", "password_hash", "is_admin", "email_verified")
VALUES ('Called My Shot', 'calledmyshot', 'official@calledmyshot.com', 'NO_LOGIN_OFFICIAL_ACCOUNT', false, false)
ON CONFLICT ("username") DO NOTHING;
