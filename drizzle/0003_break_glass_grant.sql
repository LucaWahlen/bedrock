CREATE TABLE "break_glass_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "break_glass_grant" ADD CONSTRAINT "break_glass_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_grant" ADD CONSTRAINT "break_glass_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "break_glass_grant_userId_idx" ON "break_glass_grant" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "break_glass_grant_open_uidx" ON "break_glass_grant" USING btree ("user_id","organization_id") WHERE "break_glass_grant"."ended_at" is null;