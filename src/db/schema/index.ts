// Barrel del esquema de Ágora Campus: re-exporta todos los dominios.
// El orden sigue las dependencias lógicas (usuarios → vendors → ... → reglas de IP).
// Debe casar con docs/ERD.md y con la lista de tablas de PLAN.md §4.
export * from "./users";
export * from "./vendors";
export * from "./products";
export * from "./orders";
export * from "./payments";
export * from "./drops";
export * from "./social";
export * from "./ip-rules";

// Fin del barrel del esquema.
