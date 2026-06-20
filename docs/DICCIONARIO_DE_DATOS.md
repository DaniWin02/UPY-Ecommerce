# Diccionario de datos — Ágora Campus

> 🚧 Pendiente de documentar.

## institutions

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único de la institución. |
| name | VARCHAR(255) | No | Nombre oficial de la institución. |
| domain | VARCHAR(255) | Sí | Dominio de correo institucional permitido. |
| logo_url | TEXT | Sí | URL del logotipo de la institución. |
| created_at | TIMESTAMP | No | Fecha de creación del registro. |
| updated_at | TIMESTAMP | No | Fecha de última actualización. |

## users

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único del usuario. |
| institution_id | UUID | No | Institución a la que pertenece el usuario. |
| name | VARCHAR(255) | No | Nombre completo del usuario. |
| email | VARCHAR(255) | No | Correo electrónico del usuario. |
| password_hash | TEXT | No | Contraseña cifrada del usuario. |
| phone | VARCHAR(20) | Sí | Número telefónico de contacto. |
| role | ENUM | No | Rol del usuario (student, vendor, admin). |
| avatar_url | TEXT | Sí | Imagen de perfil del usuario. |
| created_at | TIMESTAMP | No | Fecha de creación del registro. |
| updated_at | TIMESTAMP | No | Fecha de última actualización. |

## vendors

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único del vendedor. |
| institution_id | UUID | No | Institución donde opera el vendedor. |
| name | VARCHAR(255) | No | Nombre del negocio o tienda. |
| description | TEXT | Sí | Descripción del vendedor. |
| logo_url | TEXT | Sí | Imagen o logotipo del negocio. |
| status | ENUM | No | Estado del vendedor (active, inactive, suspended). |
| created_at | TIMESTAMP | No | Fecha de creación. |
| updated_at | TIMESTAMP | No | Fecha de última actualización. |

## vendor_members

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único de la relación. |
| vendor_id | UUID | No | Vendedor asociado. |
| user_id | UUID | No | Usuario miembro del negocio. |
| role | ENUM | No | Rol dentro del negocio (owner, manager, staff). |
| created_at | TIMESTAMP | No | Fecha de creación del registro. |

## products

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único del producto. |
| vendor_id | UUID | No | Vendedor propietario del producto. |
| name | VARCHAR(255) | No | Nombre del producto. |
| description | TEXT | Sí | Descripción detallada del producto. |
| category | VARCHAR(100) | Sí | Categoría del producto. |
| base_price | DECIMAL(10,2) | No | Precio base del producto. |
| image_url | TEXT | Sí | Imagen principal del producto. |
| status | ENUM | No | Estado del producto (active, inactive). |
| created_at | TIMESTAMP | No | Fecha de creación. |
| updated_at | TIMESTAMP | No | Fecha de última actualización. |

## product_variants

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único de la variante. |
| product_id | UUID | No | Producto al que pertenece. |
| sku | VARCHAR(100) | No | Código SKU de la variante. |
| name | VARCHAR(255) | No | Nombre de la variante. |
| price | DECIMAL(10,2) | No | Precio específico de la variante. |
| attributes | JSON | Sí | Atributos como talla, color o presentación. |
| created_at | TIMESTAMP | No | Fecha de creación. |
| updated_at | TIMESTAMP | No | Fecha de última actualización. |

## inventory

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador del inventario. |
| product_variant_id | UUID | No | Variante asociada. |
| quantity_available | INTEGER | No | Cantidad disponible en stock. |
| quantity_reserved | INTEGER | No | Cantidad reservada temporalmente. |
| updated_at | TIMESTAMP | No | Fecha de última actualización del inventario. |

## stock_holds

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador de la reserva temporal. |
| product_variant_id | UUID | No | Variante reservada. |
| user_id | UUID | No | Usuario que realizó la reserva. |
| quantity | INTEGER | No | Cantidad retenida. |
| expires_at | TIMESTAMP | No | Momento en que expira la reserva. |
| created_at | TIMESTAMP | No | Fecha de creación. |

## orders

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador único del pedido. |
| user_id | UUID | No | Usuario que realizó la compra. |
| vendor_id | UUID | No | Vendedor asociado al pedido. |
| total_amount | DECIMAL(10,2) | No | Importe total del pedido. |
| status | ENUM | No | Estado del pedido (pending, paid, delivered, cancelled). |
| payment_status | ENUM | No | Estado del pago. |
| created_at | TIMESTAMP | No | Fecha de creación. |
| updated_at | TIMESTAMP | No | Fecha de última actualización. |

## order_items

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador del detalle del pedido. |
| order_id | UUID | No | Pedido al que pertenece. |
| product_variant_id | UUID | No | Variante comprada. |
| quantity | INTEGER | No | Cantidad adquirida. |
| unit_price | DECIMAL(10,2) | No | Precio unitario al momento de la compra. |
| subtotal | DECIMAL(10,2) | No | Importe parcial del artículo. |

## payments

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
| id | UUID | No | Identificador del pago. |
| order_id | UUID | No | Pedido asociado al pago. |
| amount | DECIMAL(10,2) | No | Monto pagado. |
| method | ENUM | No | Método de pago utilizado. |
| status | ENUM | No | Estado del pago (pending, completed, failed). |
| transaction_id | VARCHAR(255) | Sí | Identificador de la transacción externa. |
| created_at | TIMESTAMP | No | Fecha del pago. |
## waitlists

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## group_buys

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## group_buy_members

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## wishlists

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## follows

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## notifications

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## ip_rules

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |

## audit_log

| Columna | Tipo | Nulo | Descripción |
| --- | --- | --- | --- |
