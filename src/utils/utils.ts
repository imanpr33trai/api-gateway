export const parseISOTimestamp = (value: unknown): number | null => {
     if (typeof value !== "string") {
          return null;
     }
     try {
          const d = new Date(value);
          const t = d.getTime();
          return isNaN(t) ? null : t / 1000;
     } catch {
          return null;
     }
};

export const generateUUID = (): string => {
     return crypto.randomUUID();
};
