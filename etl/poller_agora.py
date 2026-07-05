# poller_agora.py — SIMULADOR de compras en tiempo real para el ETL (Project #07)
# Autor: Raúl Cetina · UPY · Data Engineering
#
# ¿Qué hace? Cada N segundos decide (con probabilidad ponderada por la hora del
# día y por el índice UV real de Mérida) si un estudiante compra agua o
# electrolitos en el Café UPY de la plataforma compartida (Ágora Campus), e
# INSERTA esa compra como una orden real y entregada en la base de datos.
# Así el notebook del ETL puede demostrar extracción con POLLING sobre datos
# que crecen "en vivo".
#
# Las compras simuladas son identificables y purgables:
#   - comprador: etl.simulador@upy.edu.mx
#   - referencia de pago con prefijo "SIM-"
#   - SKUs ETL-AGUA-600 / ETL-ELECTRO-625
#
# Uso:
#   pip install psycopg2-binary requests
#   python poller_agora.py --iteraciones 12 --intervalo 8
import argparse
import random
import time
import uuid
from datetime import datetime, timezone

import psycopg2
import requests

# Conexión a la BD compartida de la plataforma (Neon, endpoint pooler).
DB_URL = (
    "postgresql://neondb_owner:npg_Fr2iLGS8tZHm"
    "@ep-delicate-hat-atmk8wg6-pooler.c-9.us-east-1.aws.neon.tech/neondb"
    "?sslmode=require"
)

EMAIL_SIMULADOR = "etl.simulador@upy.edu.mx"
SKUS = {"ETL-AGUA-600": 0.7, "ETL-ELECTRO-625": 0.3}  # agua 70% / electrolitos 30%

# Peso de compra por hora local de Mérida (UTC-6): picos tras el traslado
# matutino (7-9) y tras el mediodía de sol fuerte (13-15).
PESO_HORA = {7: 0.9, 8: 1.0, 9: 0.8, 10: 0.5, 11: 0.4, 12: 0.6,
             13: 0.9, 14: 0.8, 15: 0.6, 16: 0.4, 17: 0.3, 18: 0.3}
PESO_BASE = 0.2  # resto de horas


def uv_hoy_merida() -> float:
    """Índice UV máximo de HOY en Mérida (Open-Meteo, sin API key)."""
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": 20.97, "longitude": -89.62,
                    "daily": "uv_index_max", "timezone": "America/Merida",
                    "forecast_days": 1},
            timeout=10,
        )
        return float(r.json()["daily"]["uv_index_max"][0])
    except Exception:
        return 8.0  # Mérida sin dato: asume UV alto (es lo habitual)


def cargar_referencias(cur):
    """Resuelve ids de comprador, vendor y variantes UNA vez al inicio."""
    cur.execute("select id from users where email = %s", (EMAIL_SIMULADOR,))
    comprador_id = cur.fetchone()[0]
    variantes = {}
    for sku in SKUS:
        cur.execute(
            """select pv.id, coalesce(pv.precio_comunidad, pv.precio), p.vendor_id
               from product_variants pv join products p on p.id = pv.product_id
               where pv.sku = %s""",
            (sku,),
        )
        vid, precio, vendor_id = cur.fetchone()
        variantes[sku] = {"variant_id": vid, "precio": precio, "vendor_id": vendor_id}
    return comprador_id, variantes


def insertar_compra(cur, comprador_id, variantes) -> str:
    """Inserta orden entregada + item + pago verificado. Devuelve descripción."""
    sku = random.choices(list(SKUS), weights=list(SKUS.values()))[0]
    v = variantes[sku]
    qty = random.choice([1, 1, 1, 2])
    total = float(v["precio"]) * qty
    ref = f"SIM-{uuid.uuid4().hex[:8].upper()}"

    cur.execute(
        """insert into orders (comprador_id, vendor_id, estado, total,
                               referencia_pago, metodo_entrega, aula)
           values (%s, %s, 'entregado', %s, %s, 'punto', 'Cafetería UPY')
           returning id""",
        (comprador_id, v["vendor_id"], total, ref),
    )
    order_id = cur.fetchone()[0]
    cur.execute(
        """insert into order_items (order_id, variant_id, cantidad, precio_unit)
           values (%s, %s, %s, %s)""",
        (order_id, v["variant_id"], qty, v["precio"]),
    )
    cur.execute(
        """insert into payments (order_id, metodo, referencia, monto_declarado,
                                 estado, verificado_en)
           values (%s, 'efectivo', %s, %s, 'verificado', now())""",
        (order_id, ref, total),
    )
    return f"{qty}x {sku} (${total:.2f}) ref={ref}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Poller de compras simuladas")
    parser.add_argument("--iteraciones", type=int, default=12)
    parser.add_argument("--intervalo", type=float, default=8.0)
    args = parser.parse_args()

    uv = uv_hoy_merida()
    factor_uv = min(uv / 8.0, 1.5)  # más UV ⇒ más sed ⇒ más compras
    print(f"[poller] UV máx hoy en Mérida: {uv:.1f} -> factor de sed {factor_uv:.2f}")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    comprador_id, variantes = cargar_referencias(cur)
    print(f"[poller] listo: comprador={comprador_id[:8]}... "
          f"variantes={list(variantes)} — {args.iteraciones} iteraciones\n")

    insertadas = 0
    for i in range(1, args.iteraciones + 1):
        hora_local = (datetime.now(timezone.utc).hour - 6) % 24  # Mérida UTC-6
        prob = min(PESO_HORA.get(hora_local, PESO_BASE) * factor_uv, 0.95)
        marca = datetime.now(timezone.utc).strftime("%H:%M:%S")
        if random.random() < prob:
            detalle = insertar_compra(cur, comprador_id, variantes)
            conn.commit()
            insertadas += 1
            print(f"[{marca} UTC] iter {i:>2}: COMPRA -> {detalle}")
        else:
            print(f"[{marca} UTC] iter {i:>2}: sin compra "
                  f"(hora local {hora_local}h, prob {prob:.0%})")
        if i < args.iteraciones:
            time.sleep(args.intervalo)

    cur.close()
    conn.close()
    print(f"\n[poller] fin: {insertadas} compras insertadas "
          f"de {args.iteraciones} iteraciones.")


if __name__ == "__main__":
    main()
