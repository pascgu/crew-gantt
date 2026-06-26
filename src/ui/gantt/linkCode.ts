import type { TaskLink } from '@/core/model/types';

/**
 * Code compact d'un lien pour l'infobulle : [ancre prédécesseur][délai][ancre successeur][délai].
 * F = fin, D = début, P = après N j travaillés. Délais en j ouvrés, 0 omis.
 * Ex. : FD (fin→début), F1D3 (fin+1→début+3), DD1 (début→début+1), P2+1D (après 2 j travaillés +1 j).
 */
export function linkCode(link: TaskLink): string {
  let pred: string;
  if (link.type === 'with-start') pred = 'D';
  else if (link.type === 'after-progress') pred = `P${link.progressDays ?? 0}`;
  else pred = 'F';
  if (link.lag) {
    // 0 omis ; signe conservé pour les délais négatifs. « + » explicite pour un délai positif
    // lorsque l'ancre se termine déjà par un chiffre (P2 + 1 → « P2+1D », sinon « P21D » prête à confusion).
    const plus = link.lag > 0 && /\d$/.test(pred) ? '+' : '';
    pred += `${plus}${link.lag}`;
  }
  let succ = 'D';
  if (link.targetDays) succ += `${link.targetDays}`;
  return pred + succ;
}
