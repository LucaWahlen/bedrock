CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"topic" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_topic_check" CHECK ("notification"."topic" in ('security', 'sign_in', 'membership', 'invitations', 'member_activity', 'break_glass'))
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"kind" text NOT NULL,
	"email" boolean,
	"in_app" boolean,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_nonempty_check" CHECK ("notification_preference"."email" is not null or "notification_preference"."in_app" is not null),
	CONSTRAINT "notification_preference_kind_check" CHECK ("notification_preference"."kind" in ('new_sign_in', 'password_changed', 'email_change_requested', 'email_changed', 'two_factor_enabled', 'two_factor_disabled', 'backup_codes_regenerated', 'passkey_added', 'passkey_removed', 'account_enabled', 'member_added', 'member_role_changed', 'member_removed', 'invitation_accepted', 'member_joined', 'member_left', 'user_signed_up', 'break_glass_started')),
	CONSTRAINT "notification_preference_org_kind_check" CHECK ("notification_preference"."organization_id" is null or "notification_preference"."kind" in ('member_added', 'member_role_changed', 'member_removed', 'invitation_accepted', 'member_joined', 'member_left', 'user_signed_up', 'break_glass_started')),
	CONSTRAINT "notification_preference_mandatory_email_check" CHECK ("notification_preference"."kind" not in ('password_changed', 'email_change_requested', 'email_changed', 'two_factor_enabled', 'two_factor_disabled', 'backup_codes_regenerated', 'passkey_added', 'passkey_removed', 'account_enabled', 'break_glass_started') or "notification_preference"."email" is distinct from false)
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_userId_createdAt_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_userId_unread_idx" ON "notification" USING btree ("user_id") WHERE "notification"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notification_organizationId_idx" ON "notification" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_createdAt_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_global_uidx" ON "notification_preference" USING btree ("user_id","kind") WHERE "notification_preference"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_org_uidx" ON "notification_preference" USING btree ("user_id","organization_id","kind") WHERE "notification_preference"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "notification_preference_organizationId_idx" ON "notification_preference" USING btree ("organization_id");