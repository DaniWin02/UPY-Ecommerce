CREATE TYPE "public"."analytics_event_tipo" AS ENUM('busqueda', 'vista_tienda', 'vista_producto', 'click_producto', 'add_carrito', 'orden_creada', 'pago_verificado');--> statement-breakpoint
CREATE TYPE "public"."device_tipo" AS ENUM('mobile', 'desktop', 'tablet', 'desconocido');--> statement-breakpoint
CREATE TYPE "public"."preorder_estado" AS ENUM('abierta', 'alcanzada', 'produciendo', 'cerrada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."rol_global" AS ENUM('comprador', 'vendor', 'superadmin');--> statement-breakpoint
CREATE TYPE "public"."vendor_estado" AS ENUM('pendiente', 'activo', 'suspendido');--> statement-breakpoint
CREATE TYPE "public"."vendor_rol" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."vendor_tipo" AS ENUM('facultad', 'club', 'emprendimiento');--> statement-breakpoint
CREATE TYPE "public"."product_estado" AS ENUM('borrador', 'activo', 'agotado', 'archivado');--> statement-breakpoint
CREATE TYPE "public"."product_tipo" AS ENUM('fisico', 'preventa', 'drop');--> statement-breakpoint
CREATE TYPE "public"."metodo_entrega" AS ENUM('aula', 'punto');--> statement-breakpoint
CREATE TYPE "public"."order_estado" AS ENUM('pendiente_pago', 'comprobante_enviado', 'pago_verificado', 'rechazado', 'preparando', 'listo_entrega', 'entregado', 'expirado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'spei');--> statement-breakpoint
CREATE TYPE "public"."pago_estado" AS ENUM('pendiente', 'enviado', 'verificado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."group_buy_estado" AS ENUM('abierta', 'meta_alcanzada', 'cerrada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."ip_accion" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."ip_scope" AS ENUM('global', 'admin', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."remitente_rol" AS ENUM('comprador', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."reporte_estado" AS ENUM('pendiente', 'revisado', 'descartado');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "analytics_event_tipo" NOT NULL,
	"user_id" uuid,
	"session_id" text NOT NULL,
	"vendor_id" uuid,
	"product_id" uuid,
	"order_id" uuid,
	"ruta" text NOT NULL,
	"referrer_interno" text,
	"query" text,
	"device" "device_tipo" DEFAULT 'desconocido' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_producto_diario" (
	"fecha" date NOT NULL,
	"product_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"vistas" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"adds_carrito" integer DEFAULT 0 NOT NULL,
	"ordenes_creadas" integer DEFAULT 0 NOT NULL,
	"unidades_verificadas" integer DEFAULT 0 NOT NULL,
	"ingreso_verificado" numeric(12, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "analytics_producto_diario_fecha_product_id_pk" PRIMARY KEY("fecha","product_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_vendor_diario" (
	"fecha" date NOT NULL,
	"vendor_id" uuid NOT NULL,
	"visitas_tienda" integer DEFAULT 0 NOT NULL,
	"vistas_producto" integer DEFAULT 0 NOT NULL,
	"adds_carrito" integer DEFAULT 0 NOT NULL,
	"ordenes_creadas" integer DEFAULT 0 NOT NULL,
	"ordenes_pago_verificado" integer DEFAULT 0 NOT NULL,
	"ingreso_verificado" numeric(12, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "analytics_vendor_diario_fecha_vendor_id_pk" PRIMARY KEY("fecha","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "drop_products" (
	"drop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "drop_products_drop_id_product_id_pk" PRIMARY KEY("drop_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"inicia_en" timestamp with time zone NOT NULL,
	"termina_en" timestamp with time zone,
	"stock_total" integer,
	"reglas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preorders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"meta_unidades" integer NOT NULL,
	"fecha_limite" timestamp with time zone,
	"estado" "preorder_estado" DEFAULT 'abierta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlists" (
	"variant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlists_variant_id_user_id_pk" PRIMARY KEY("variant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"dominios" text[] DEFAULT '{}' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"rol_global" "rol_global" DEFAULT 'comprador' NOT NULL,
	"institution_id" uuid,
	"verificado_en" timestamp with time zone,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "vendor_members" (
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rol" "vendor_rol" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_members_vendor_id_user_id_pk" PRIMARY KEY("vendor_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "vendor_tipo" NOT NULL,
	"clabe" text,
	"estado" "vendor_estado" DEFAULT 'pendiente' NOT NULL,
	"aula_default" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"reservado" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_reservado_valido" CHECK ("inventory"."reservado" >= 0 AND "inventory"."reservado" <= "inventory"."stock")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"precio_comunidad" numeric(12, 2),
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"estado" "product_estado" DEFAULT 'borrador' NOT NULL,
	"tipo" "product_tipo" DEFAULT 'fisico' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unit" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comprador_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"estado" "order_estado" DEFAULT 'pendiente_pago' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"referencia_pago" text,
	"metodo_entrega" "metodo_entrega" DEFAULT 'aula' NOT NULL,
	"aula" text,
	"punto" text,
	"expira_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_referencia_pago_unique" UNIQUE("referencia_pago")
);
--> statement-breakpoint
CREATE TABLE "stock_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"referencia" text,
	"comprobante_url" text,
	"monto_declarado" numeric(12, 2),
	"estado" "pago_estado" DEFAULT 'pendiente' NOT NULL,
	"verificado_por" uuid,
	"verificado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_vendor_id_pk" PRIMARY KEY("user_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "group_buy_members" (
	"group_buy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_buy_members_group_buy_id_user_id_pk" PRIMARY KEY("group_buy_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_buys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"aula" text NOT NULL,
	"lider_id" uuid NOT NULL,
	"meta_cantidad" integer NOT NULL,
	"fecha_limite" timestamp with time zone,
	"estado" "group_buy_estado" DEFAULT 'abierta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"leido" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_collaborators" (
	"wishlist_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "wishlist_collaborators_wishlist_id_user_id_pk" PRIMARY KEY("wishlist_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "ip_scope" NOT NULL,
	"cidr" text NOT NULL,
	"accion" "ip_accion" NOT NULL,
	"prioridad" integer DEFAULT 0 NOT NULL,
	"vendor_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comprador_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"product_id" uuid,
	"order_id" uuid,
	"ultimo_mensaje_en" timestamp with time zone,
	"ultimo_mensaje_preview" text,
	"no_leidos_comprador" integer DEFAULT 0 NOT NULL,
	"no_leidos_vendor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid,
	"conversation_id" uuid,
	"message_id" uuid,
	"motivo" text NOT NULL,
	"estado" "reporte_estado" DEFAULT 'pendiente' NOT NULL,
	"revisado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"autor_rol" "remitente_rol" NOT NULL,
	"cuerpo" text NOT NULL,
	"leido_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_producto_diario" ADD CONSTRAINT "analytics_producto_diario_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_producto_diario" ADD CONSTRAINT "analytics_producto_diario_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_vendor_diario" ADD CONSTRAINT "analytics_vendor_diario_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_products" ADD CONSTRAINT "drop_products_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_products" ADD CONSTRAINT "drop_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_comprador_id_users_id_fk" FOREIGN KEY ("comprador_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_holds" ADD CONSTRAINT "stock_holds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_holds" ADD CONSTRAINT "stock_holds_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verificado_por_users_id_fk" FOREIGN KEY ("verificado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_members" ADD CONSTRAINT "group_buy_members_group_buy_id_group_buys_id_fk" FOREIGN KEY ("group_buy_id") REFERENCES "public"."group_buys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_members" ADD CONSTRAINT "group_buy_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_members" ADD CONSTRAINT "group_buy_members_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_lider_id_users_id_fk" FOREIGN KEY ("lider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_collaborators" ADD CONSTRAINT "wishlist_collaborators_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_collaborators" ADD CONSTRAINT "wishlist_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_rules" ADD CONSTRAINT "ip_rules_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_comprador_id_users_id_fk" FOREIGN KEY ("comprador_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_revisado_por_users_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_autor_id_users_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_event_type_created_at_idx" ON "analytics_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_product_id_created_at_idx" ON "analytics_events" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_vendor_id_created_at_idx" ON "analytics_events" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analytics_producto_diario_vendor_id_fecha_idx" ON "analytics_producto_diario" USING btree ("vendor_id","fecha");--> statement-breakpoint
CREATE INDEX "stock_holds_expira_en_idx" ON "stock_holds" USING btree ("expira_en");--> statement-breakpoint
CREATE INDEX "conversations_comprador_id_ultimo_mensaje_en_idx" ON "conversations" USING btree ("comprador_id","ultimo_mensaje_en");--> statement-breakpoint
CREATE INDEX "conversations_vendor_id_ultimo_mensaje_en_idx" ON "conversations" USING btree ("vendor_id","ultimo_mensaje_en");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_comprador_vendor_general_uq" ON "conversations" USING btree ("comprador_id","vendor_id") WHERE product_id IS NULL AND order_id IS NULL;--> statement-breakpoint
CREATE INDEX "message_reports_estado_idx" ON "message_reports" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");