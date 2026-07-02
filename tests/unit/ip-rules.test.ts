import { describe, it, expect, afterEach, vi } from "vitest";
import { ipInCidr, isIpAllowed } from "@/lib/ip-rules";

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
