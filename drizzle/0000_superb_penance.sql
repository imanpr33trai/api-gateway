CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"label" text DEFAULT 'default' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_name" text NOT NULL,
	"portal_base_url" text DEFAULT '' NOT NULL,
	"inference_base_url" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"refresh_token" text,
	"region" text,
	"obtained_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"expires_in" integer DEFAULT 0 NOT NULL,
	"last_auth_error" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_provider_name_unique" UNIQUE("provider_name")
);
--> statement-breakpoint
CREATE TABLE "provider_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_name" text NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'fallback' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "provider_models_provider_name_unique" UNIQUE("provider_name")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_mode" text DEFAULT 'chat_completions' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"signup_url" text DEFAULT '' NOT NULL,
	"env_vars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"models_url" text DEFAULT '' NOT NULL,
	"auth_type" text DEFAULT 'api_key' NOT NULL,
	"supports_health_check" boolean DEFAULT true NOT NULL,
	"hostname" text DEFAULT '' NOT NULL,
	"fallback_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fixed_temperature" real,
	"default_max_tokens" integer,
	"default_aux_model" text DEFAULT '' NOT NULL,
	"oauth_config" jsonb,
	"api_key" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"portal_base_url" text DEFAULT '' NOT NULL,
	"inference_base_url" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"refresh_token" text,
	"region" text,
	"obtained_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"expires_in" integer DEFAULT 0 NOT NULL,
	"last_auth_error" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_unique" ON "user_credentials" USING btree ("user_id","provider_name");