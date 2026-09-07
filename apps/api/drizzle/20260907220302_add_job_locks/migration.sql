CREATE TABLE "job_locks" (
	"name" text PRIMARY KEY,
	"locked_until" timestamp NOT NULL,
	"holder" text NOT NULL
);
