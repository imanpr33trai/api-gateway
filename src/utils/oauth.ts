import crypto from "node:crypto";
import { parseISOTimestamp } from "./utils";
export const hasUsableSecret = (value: unknown, minLength = 4): boolean => {
     if (typeof value !== "string") {
          return false;
     }
     const cleaned = value.trim();
     if (cleaned.length < minLength) return false;

     const placeholders = new Set([
          "*",
          "**",
          "***",
          "changeme",
          "your_api_key",
          "your-api-key",
          "placeholder",
          "example",
          "dummy",
          "null",
          "none",
     ]);
     return !placeholders.has(cleaned.toLowerCase());
};

export const isExpiring = (
     expiresAtISO: unknown,
     skewSeconds: number,
): boolean => {
     const epoch = parseISOTimestamp(expiresAtISO);
     if (epoch === null) {
          return true; // if we can't parse the expiration, assume it's expiring
     }

     return epoch <= Date.now() / 1000 + skewSeconds;
};

export const tokenFingerpring = (token: unknown): string | null => {
     if (typeof token !== "string" || !token.trim()) {
          return null;
     }
     return crypto
          .createHash("sha256")
          .update(token.trim())
          .digest("hex")
          .slice(0, 12);
};
