// scripts/generate-sample-data.mjs
// Generador de datos de muestra para Ágora Campus (marketplace interno UPY).
// Produce datos COHERENTES con el esquema Drizzle (src/db/schema) en 3 formatos:
//   - CSV   -> data/samples/csv/<entidad>.csv
//   - JSON  -> data/samples/json/<entidad>.json  (+ agora-sample-data.json combinado)
//   - Excel -> data/samples/excel/agora-sample-data.xlsx  (una hoja por entidad)
//
// Uso:  node scripts/generate-sample-data.mjs
// Es DETERMINISTA (semilla fija) para que el dataset sea reproducible en cada corrida.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "samples");

/* ----------------------------- Utilidades RNG ----------------------------- */
// mulberry32: PRNG determinista (semilla fija => mismo dataset siempre).
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260619);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const id = (prefix, n, w = 3) => `${prefix}_${String(n).padStart(w, "0")}`;
const pad2 = (n) => String(n).padStart(2, "0");
const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
// Fecha determinista: 2026-03-01 + d días (sin depender del reloj del sistema).
const fecha = (d) =>
  new Date(Date.UTC(2026, 2, 1) + d * 86400000).toISOString().slice(0, 19).replace("T", " ");

/* ------------------------------- Catálogos -------------------------------- */
const nombres = ["Sofía","Mateo","Valentina","Diego","Regina","Santiago","Ximena","Emiliano",
  "Camila","Leonardo","Renata","Daniel","Frida","Andrés","Paola","Iker","Valeria","Raúl",
  "Daniela","Carlos","Fernanda","Luis","Mariana","Gael"];
// Apellidos de origen maya yucateco (UPY está en Mérida, Yucatán).
const apellidos = ["Pool","Canul","Chan","Uc","May","Cetina","Couoh","Dzul","Euán","Tuz",
  "Ek","Balam","Cocom","Pat","Caamal","Noh","Ucán","Kuyoc","Poot","Mena"];

/* ----------------------------- 1. Institución ----------------------------- */
const institutions = [{
  id: "inst_01",
  nombre: "Universidad Politécnica de Yucatán",
  siglas: "UPY",
  dominios: "alumno.upy.edu.mx;upy.edu.mx",
  ciudad: "Mérida, Yucatán, México",
}];

/* ------------------------------- 2. Usuarios ------------------------------ */
const users = Array.from({ length: 60 }, (_, i) => {
  const nom = pick(nombres), ap1 = pick(apellidos), ap2 = pick(apellidos);
  const rol = i === 0 ? "superadmin" : i % 9 === 0 ? "vendor" : "comprador";
  return {
    id: id("usr", i + 1),
    nombre: `${nom} ${ap1} ${ap2}`,
    email: `${slugify(nom)}.${slugify(ap1)}${int(10, 99)}@alumno.upy.edu.mx`,
    rol_global: rol,
    institution_id: "inst_01",
    verificado: pick(["true", "true", "true", "false"]),
    created_at: fecha(int(0, 40)),
  };
});

/* ------------------------------- 3. Vendedores ---------------------------- */
const vendorSeed = [
  ["Club de Robótica UPY", "club"],
  ["Sociedad de Alumnos de Datos", "club"],
  ["Facultad de Ingeniería en Datos", "facultad"],
  ["Café UPY", "emprendimiento"],
  ["Club de Videojuegos", "club"],
  ["Mecatrónica Store", "emprendimiento"],
  ["Grupo Cultural UPY", "club"],
  ["Club Deportivo Jaguares", "club"],
];
const vendors = vendorSeed.map((v, i) => ({
  id: id("ven", i + 1, 2),
  slug: slugify(v[0]),
  nombre: v[0],
  tipo: v[1],
  // CLABE de EJEMPLO (18 dígitos). El dinero va directo a la CLABE de cada vendedor.
  clabe: "0218" + Array.from({ length: 14 }, () => int(0, 9)).join(""),
  estado: pick(["activo", "activo", "activo", "pendiente"]),
  aula_default: pick(["Lab-IDAT", "A-203", "B-110", "Lab-Mecatronica", "C-201", "Aula Magna"]),
}));

/* ------------------------------- 4. Productos ----------------------------- */
const catalogo = ["Hoodie UPY","Playera UPY","Taza termica","Sticker pack","Tote bag",
  "Gorra bordada","Libreta de notas","Termo 600ml","Kit Arduino","Entrada Hackathon",
  "Pin metalico","Sudadera con cierre","Llavero 3D","Mousepad XL"];
const tipoProd = ["fisico", "fisico", "fisico", "preventa", "drop"];
const products = [];
let pCount = 0;
for (const v of vendors) {
  for (let k = 0, n = int(3, 6); k < n; k++) {
    pCount++;
    products.push({
      id: id("prd", pCount),
      vendor_id: v.id,
      nombre: `${pick(catalogo)} · ${v.nombre.split(" ")[0]}`,
      tipo: pick(tipoProd),
      estado: pick(["publicado", "publicado", "publicado", "borrador"]),
      precio_base: int(60, 650),
      created_at: fecha(int(0, 50)),
    });
  }
}

/* --------------------------- 5. Variantes de producto --------------------- */
const tallas = ["CH", "M", "G", "XG", "Unica"];
const colores = ["Negro", "Blanco", "Azul marino", "Verde", "Guinda", "Gris"];
const variants = [];
const variantsByVendor = {};
let vCount = 0;
for (const p of products) {
  for (let k = 0, n = int(1, 3); k < n; k++) {
    vCount++;
    const precio = Math.max(40, p.precio_base + int(-20, 80));
    const variant = {
      id: id("var", vCount),
      product_id: p.id,
      sku: `${p.id.toUpperCase()}-${pad2(k + 1)}`,
      talla: pick(tallas),
      color: pick(colores),
      precio,
      precio_comunidad: Math.round(precio * 0.85), // descuento comunidad verificada
      stock: int(0, 120),
    };
    variants.push(variant);
    (variantsByVendor[p.vendor_id] ||= []).push(variant);
  }
}

/* ------------------- 6. Pedidos + 7. Items + 8. Pagos --------------------- */
const compradores = users.filter((u) => u.rol_global === "comprador");
const vendorsConStock = vendors.filter((v) => (variantsByVendor[v.id] || []).length > 0);
const estadosPedido = ["pendiente_pago","comprobante_enviado","pago_verificado",
  "preparando","listo_entrega","entregado","cancelado"];
const orders = [], orderItems = [], payments = [];
let oiCount = 0;
for (let i = 0; i < 50; i++) {
  const v = pick(vendorsConStock);
  const pool = variantsByVendor[v.id];
  const oid = id("ord", i + 1);
  const estado = pick(estadosPedido);
  let total = 0;
  for (let k = 0, n = int(1, 3); k < n; k++) {
    oiCount++;
    const variant = pick(pool);
    const cant = int(1, 3);
    total += variant.precio_comunidad * cant;
    orderItems.push({
      id: id("oit", oiCount),
      order_id: oid,
      variant_id: variant.id,
      cantidad: cant,
      precio_unit: variant.precio_comunidad,
    });
  }
  const ref = `AGORA-${oid.toUpperCase()}-${int(1000, 9999)}`;
  const metodo = pick(["spei", "spei", "efectivo"]);
  orders.push({
    id: oid,
    comprador_id: pick(compradores).id,
    vendor_id: v.id,
    estado,
    total,
    referencia_pago: ref,
    metodo_entrega: pick(["aula", "aula", "punto"]),
    aula_entrega: pick(["Lab-IDAT", "A-203", "Punto Cafeteria", "B-110"]),
    created_at: fecha(int(20, 80)),
  });
  const estadoPago =
    estado === "pendiente_pago" ? "pendiente"
    : estado === "comprobante_enviado" ? "enviado"
    : estado === "cancelado" ? "rechazado"
    : "verificado";
  payments.push({
    id: id("pay", i + 1),
    order_id: oid,
    metodo,
    referencia: ref,
    monto_declarado: total,
    estado: estadoPago,
    comprobante_url:
      metodo === "spei" && estadoPago !== "pendiente"
        ? `https://storage.upy.local/comprobantes/${oid}.jpg` : "",
  });
}

/* ------------------------------ Serialización ----------------------------- */
const datasets = {
  institutions, users, vendors, products,
  product_variants: variants, orders, order_items: orderItems, payments,
};

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h]).toString()).join(","))]
    .join("\n") + "\n";
}

mkdirSync(join(OUT, "csv"), { recursive: true });
mkdirSync(join(OUT, "json"), { recursive: true });
mkdirSync(join(OUT, "excel"), { recursive: true });

const wb = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(datasets)) {
  writeFileSync(join(OUT, "csv", `${name}.csv`), toCSV(rows));
  writeFileSync(join(OUT, "json", `${name}.json`), JSON.stringify(rows, null, 2));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
}
writeFileSync(join(OUT, "json", "agora-sample-data.json"), JSON.stringify(datasets, null, 2));
writeFileSync(
  join(OUT, "excel", "agora-sample-data.xlsx"),
  XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
);

/* --------------------------------- Resumen -------------------------------- */
console.log("✓ Datos de muestra generados en data/samples/ (csv · json · excel)");
for (const [name, rows] of Object.entries(datasets)) {
  console.log(`  - ${name.padEnd(18)} ${rows.length} registros`);
}
