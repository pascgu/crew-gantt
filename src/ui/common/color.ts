/** Petites manipulations de couleurs hex pour teinter blocs, liaisons et jauges. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mélange vers le noir (amount 0..1). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.round(v * (1 - amount));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Mélange vers le blanc (amount 0..1). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Texte lisible (noir/blanc) sur une couleur donnée. */
export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#211f1a' : '#ffffff';
}
