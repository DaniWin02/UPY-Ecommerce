ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "imagenes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "products_vendor_id_estado_idx" ON "products" USING btree ("vendor_id","estado");