export const LS = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): boolean {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  available(): boolean {
    try {
      localStorage.setItem("__t", "1");
      localStorage.removeItem("__t");
      return true;
    } catch {
      return false;
    }
  },
};
