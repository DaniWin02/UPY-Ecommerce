// Tests unitarios de "@/lib/auth-domains" (Fase 2 — autenticación).
//
// El módulo es PURO: lee process.env.ALLOWED_EMAIL_DOMAINS en CADA llamada,
// así que basta con vi.stubEnv por test y vi.unstubAllEnvs en afterEach
// (sin resetear módulos ni mocks).
import { describe, it, expect, afterEach, vi } from "vitest";
import { allowedEmailDomains, isEmailDomainAllowed } from "@/lib/auth-domains";

afterEach(() => {
  // Restaura ALLOWED_EMAIL_DOMAINS (y cualquier otro stub) tras cada caso.
  vi.unstubAllEnvs();
});

describe("allowedEmailDomains", () => {
  it("sin env devuelve el fallback institucional (alumnos + staff)", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", undefined);
    expect(allowedEmailDomains()).toEqual(["alumno.upy.edu.mx", "upy.edu.mx"]);
  });

  it("normaliza espacios, mayúsculas y '@' inicial en la env", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", " @Uni.Mx , otra.edu ");
    expect(allowedEmailDomains()).toEqual(["uni.mx", "otra.edu"]);
  });

  it("relee la env en cada llamada (sin caché)", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "primero.mx");
    expect(allowedEmailDomains()).toEqual(["primero.mx"]);
    // Cambiamos la env a mitad de test: la siguiente llamada debe reflejarlo.
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "segundo.mx");
    expect(allowedEmailDomains()).toEqual(["segundo.mx"]);
  });
});

describe("isEmailDomainAllowed — fallback sin env", () => {
  it("acepta correos @alumno.upy.edu.mx", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", undefined);
    expect(isEmailDomainAllowed("estudiante@alumno.upy.edu.mx")).toBe(true);
  });

  it("acepta correos @upy.edu.mx", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", undefined);
    expect(isEmailDomainAllowed("profesor@upy.edu.mx")).toBe(true);
  });

  it("rechaza correos de dominios externos (gmail.com)", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", undefined);
    expect(isEmailDomainAllowed("alguien@gmail.com")).toBe(false);
  });
});

describe("isEmailDomainAllowed — env normalizada", () => {
  it("acepta el primer dominio normalizado de la env sucia", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", " @Uni.Mx , otra.edu ");
    expect(isEmailDomainAllowed("a@uni.mx")).toBe(true);
  });

  it("acepta el segundo dominio normalizado de la env sucia", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", " @Uni.Mx , otra.edu ");
    expect(isEmailDomainAllowed("a@otra.edu")).toBe(true);
  });
});

describe("isEmailDomainAllowed — entradas inválidas", () => {
  it("rechaza null", () => {
    expect(isEmailDomainAllowed(null)).toBe(false);
  });

  it("rechaza undefined", () => {
    expect(isEmailDomainAllowed(undefined)).toBe(false);
  });

  it("rechaza cadena vacía", () => {
    expect(isEmailDomainAllowed("")).toBe(false);
  });

  it("rechaza un correo sin arroba", () => {
    expect(isEmailDomainAllowed("sin-arroba")).toBe(false);
  });

  it("rechaza 'a@' (dominio vacío tras la arroba)", () => {
    expect(isEmailDomainAllowed("a@")).toBe(false);
  });
});

describe("isEmailDomainAllowed — casos adversarios", () => {
  it("es case-insensitive con el dominio del email (A@UPY.EDU.MX)", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "upy.edu.mx");
    expect(isEmailDomainAllowed("A@UPY.EDU.MX")).toBe(true);
  });

  it("con multi-arroba valida contra el ÚLTIMO dominio (lastIndexOf)", () => {
    // "a@upy.edu.mx@evil.com" tiene como dominio real evil.com: debe rechazarse
    // aunque el texto contenga un dominio permitido antes.
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "upy.edu.mx");
    expect(isEmailDomainAllowed("a@upy.edu.mx@evil.com")).toBe(false);
  });

  it("NO acepta subdominios: la comparación es exacta", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "upy.edu.mx");
    expect(isEmailDomainAllowed("a@sub.upy.edu.mx")).toBe(false);
  });
});
