import { describe, it, expect, afterEach, vi } from "vitest";
import {
  extraerIpCliente,
  ipEnCampus,
  ipInCidr,
  isIpAllowed,
} from "@/lib/ip-rules";

describe("ipInCidr", () => {
  describe("máscaras /24 y /16", () => {
    it("acepta IP dentro de un /24", () => {
      expect(ipInCidr("10.0.0.42", "10.0.0.0/24")).toBe(true);
    });

    it("rechaza IP fuera de un /24", () => {
      expect(ipInCidr("10.0.1.42", "10.0.0.0/24")).toBe(false);
    });

    it("acepta IP dentro de un /16", () => {
      expect(ipInCidr("172.16.200.9", "172.16.0.0/16")).toBe(true);
    });

    it("rechaza IP fuera de un /16", () => {
      expect(ipInCidr("172.17.0.1", "172.16.0.0/16")).toBe(false);
    });
  });

  describe("máscara /32 e IP suelta", () => {
    it("acepta coincidencia exacta con /32", () => {
      expect(ipInCidr("192.168.1.50", "192.168.1.50/32")).toBe(true);
    });

    it("rechaza otra IP con /32", () => {
      expect(ipInCidr("192.168.1.51", "192.168.1.50/32")).toBe(false);
    });

    it("trata una IP suelta sin máscara como /32 (coincide)", () => {
      expect(ipInCidr("192.168.1.50", "192.168.1.50")).toBe(true);
    });

    it("trata una IP suelta sin máscara como /32 (no coincide)", () => {
      expect(ipInCidr("192.168.1.51", "192.168.1.50")).toBe(false);
    });
  });

  describe("máscara /0", () => {
    it("acepta cualquier IP con /0", () => {
      expect(ipInCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
      expect(ipInCidr("255.255.255.255", "0.0.0.0/0")).toBe(true);
    });
  });

  describe("límites de red en /24", () => {
    it("acepta la dirección de red (.0)", () => {
      expect(ipInCidr("10.0.0.0", "10.0.0.0/24")).toBe(true);
    });

    it("acepta la dirección de broadcast (.255)", () => {
      expect(ipInCidr("10.0.0.255", "10.0.0.0/24")).toBe(true);
    });
  });

  describe("IPv4 mapeada en IPv6 (::ffff:)", () => {
    // Node suele reportar IPs de clientes como "::ffff:x.x.x.x".
    it("acepta ::ffff:IP cuando la IPv4 cae dentro del CIDR", () => {
      expect(ipInCidr("::ffff:10.0.0.5", "10.0.0.0/24")).toBe(true);
    });

    it("rechaza ::ffff:IP cuando la IPv4 cae fuera del CIDR", () => {
      expect(ipInCidr("::ffff:10.0.1.5", "10.0.0.0/24")).toBe(false);
    });
  });

  describe("entradas inválidas -> false (nunca lanzar)", () => {
    it("rechaza octeto fuera de rango (300)", () => {
      expect(ipInCidr("10.0.0.300", "10.0.0.0/24")).toBe(false);
    });

    it("rechaza máscara fuera de rango (/33)", () => {
      expect(ipInCidr("10.0.0.1", "10.0.0.0/33")).toBe(false);
    });

    it("rechaza basura no-IP", () => {
      expect(ipInCidr("abc", "10.0.0.0/24")).toBe(false);
      expect(ipInCidr("10.0.0.1", "abc")).toBe(false);
    });

    it("rechaza CIDR con IP incompleta (10.0.0/24)", () => {
      expect(ipInCidr("10.0.0.1", "10.0.0/24")).toBe(false);
    });

    it("rechaza IPv6 real (no mapeada)", () => {
      expect(ipInCidr("2001:db8::1", "10.0.0.0/24")).toBe(false);
    });

    it("rechaza cadenas vacías", () => {
      expect(ipInCidr("", "10.0.0.0/24")).toBe(false);
      expect(ipInCidr("10.0.0.1", "")).toBe(false);
    });
  });
});

describe("isIpAllowed", () => {
  // isIpAllowed lee process.env en CADA llamada, así que stubEnv por test
  // + unstubAllEnvs en afterEach garantiza aislamiento total.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("gate apagado -> siempre true", () => {
    it("permite cualquier IP si IP_GATE_ENABLED no está definida", async () => {
      vi.stubEnv("IP_GATE_ENABLED", undefined);
      await expect(isIpAllowed("8.8.8.8", "global")).resolves.toBe(true);
    });

    it('permite cualquier IP si IP_GATE_ENABLED es "false"', async () => {
      vi.stubEnv("IP_GATE_ENABLED", "false");
      vi.stubEnv("CAMPUS_CIDRS", "10.10.0.0/16");
      await expect(isIpAllowed("8.8.8.8", "global")).resolves.toBe(true);
    });
  });

  describe("gate encendido con CAMPUS_CIDRS", () => {
    it("permite IP dentro de alguno de los CIDRs (con espacios tras la coma)", async () => {
      vi.stubEnv("IP_GATE_ENABLED", "true");
      vi.stubEnv("CAMPUS_CIDRS", "10.10.0.0/16, 192.168.1.0/24");
      await expect(isIpAllowed("10.10.55.3", "global")).resolves.toBe(true);
      await expect(isIpAllowed("192.168.1.77", "global")).resolves.toBe(true);
    });

    it("rechaza IP fuera de todos los CIDRs", async () => {
      vi.stubEnv("IP_GATE_ENABLED", "true");
      vi.stubEnv("CAMPUS_CIDRS", "10.10.0.0/16, 192.168.1.0/24");
      await expect(isIpAllowed("8.8.8.8", "global")).resolves.toBe(false);
    });
  });

  describe("gate encendido sin CIDRs configurados", () => {
    it("rechaza toda IP si CAMPUS_CIDRS está vacío (fail-closed)", async () => {
      vi.stubEnv("IP_GATE_ENABLED", "true");
      vi.stubEnv("CAMPUS_CIDRS", "");
      await expect(isIpAllowed("10.10.0.1", "global")).resolves.toBe(false);
    });
  });
});

describe("extraerIpCliente", () => {
  // XFF = "cliente, proxy1, proxy2, ...": los últimos `confianza` saltos los
  // pusieron NUESTROS proxies; la IP del cliente se toma desde la derecha
  // saltando `confianza` entradas.

  it("confianza 0 → toma la ÚLTIMA (la puso el peer TCP directo)", () => {
    expect(extraerIpCliente("1.1.1.1, 2.2.2.2, 3.3.3.3", 0)).toBe("3.3.3.3");
  });

  it('confianza 1 con "cliente, proxy" → toma la del cliente', () => {
    expect(extraerIpCliente("203.0.113.9, 10.0.0.1", 1)).toBe("203.0.113.9");
  });

  it("confianza 2 con 3 saltos → toma la primera", () => {
    expect(extraerIpCliente("203.0.113.9, 10.0.0.1, 10.0.0.2", 2)).toBe(
      "203.0.113.9"
    );
  });

  it("confianza mayor que la lista → la más a la IZQUIERDA disponible", () => {
    // Comportamiento elegido (documentado en ip-rules.ts): con más proxies
    // confiables que entradas, el cliente no envió XFF y toda la cadena la
    // pusieron nuestros proxies → la más a la izquierda es la más cercana
    // al cliente real (clamp del índice negativo a 0).
    expect(extraerIpCliente("10.0.0.1, 10.0.0.2", 5)).toBe("10.0.0.1");
    expect(extraerIpCliente("198.51.100.7", 3)).toBe("198.51.100.7");
  });

  it("limpia espacios y entradas vacías antes de indexar", () => {
    expect(extraerIpCliente("  203.0.113.9 , , 10.0.0.1 ,", 1)).toBe(
      "203.0.113.9"
    );
    expect(extraerIpCliente("1.1.1.1,,2.2.2.2,", 0)).toBe("2.2.2.2");
  });

  it("null, undefined y cadena vacía → null", () => {
    expect(extraerIpCliente(null, 0)).toBeNull();
    expect(extraerIpCliente(undefined, 1)).toBeNull();
    expect(extraerIpCliente("", 0)).toBeNull();
  });

  it("cadena de solo separadores/espacios → null", () => {
    expect(extraerIpCliente(" , ,, ", 0)).toBeNull();
  });

  it("confianza negativa o NaN se sanea a 0 → la más a la DERECHA", () => {
    expect(extraerIpCliente("1.1.1.1, 2.2.2.2", -3)).toBe("2.2.2.2");
    expect(extraerIpCliente("1.1.1.1, 2.2.2.2", Number.NaN)).toBe("2.2.2.2");
  });
});

describe("ipEnCampus", () => {
  // ipEnCampus lee CAMPUS_CIDRS en cada llamada e IGNORA IP_GATE_ENABLED.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("true si la IP cae en algún CIDR, aun con el gate global APAGADO", () => {
    vi.stubEnv("IP_GATE_ENABLED", "false");
    vi.stubEnv("CAMPUS_CIDRS", "10.10.0.0/16, 192.168.1.0/24");
    expect(ipEnCampus("10.10.42.7")).toBe(true);
    expect(ipEnCampus("192.168.1.200")).toBe(true);
  });

  it("false si la IP queda fuera o no hay CIDRs configurados", () => {
    vi.stubEnv("CAMPUS_CIDRS", "10.10.0.0/16");
    expect(ipEnCampus("8.8.8.8")).toBe(false);

    vi.stubEnv("CAMPUS_CIDRS", "");
    expect(ipEnCampus("10.10.0.1")).toBe(false); // fail-closed
  });
});
