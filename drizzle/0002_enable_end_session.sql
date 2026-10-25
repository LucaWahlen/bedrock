-- Applications registered before end-session was enabled refuse RP-initiated
-- logout. Every application may end the session it signed someone in with.
UPDATE "oauth_client" SET "enable_end_session" = true WHERE "enable_end_session" IS NOT TRUE;
