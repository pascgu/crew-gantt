/** Dictionnaire français — source unique des chaînes UI. */
export const fr = {
  app: {
    title: 'CrewGantt',
    tagline: "Qui fait quoi, cette semaine et sur la durée.",
  },
  tabs: {
    gantt: 'Gantt',
    meeting: 'Réunion',
    dashboard: 'Tableau de bord',
    team: 'Équipe',
    settings: 'Paramètres',
  },
  file: {
    new: 'Nouveau',
    open: 'Ouvrir…',
    save: 'Enregistrer',
    saveAs: 'Enregistrer sous…',
    unsaved: 'Modifications non enregistrées',
    saved: 'Enregistré',
    savedIn: 'Enregistré — {name}',
    noFile: 'Aucun fichier lié',
    demoLoaded: 'Équipe de démonstration',
    confirmDiscard:
      'Des modifications ne sont pas enregistrées. Continuer et les abandonner ?',
    openError: "Impossible d'ouvrir ce fichier",
    dropHint: 'Déposer un fichier .crewgantt.json',
    fsUnavailable:
      'Enregistrement direct indisponible dans ce navigateur : le fichier sera téléchargé.',
  },
  backup: {
    title: 'Sauvegarde de secours détectée',
    body: "Une sauvegarde automatique plus récente que le dernier fichier ouvert a été trouvée ({date}). Voulez-vous la restaurer ?",
    restore: 'Restaurer la sauvegarde',
    discard: 'Ignorer et repartir du fichier',
  },
  undo: { undo: 'Annuler', redo: 'Rétablir' },
  errors: {
    boundaryTitle: "L'affichage a rencontré un problème",
    boundaryBody:
      "Vos données sont intactes (sauvegarde de secours automatique). Vous pouvez recharger l'application.",
    reload: "Recharger l'application",
  },
  placeholders: {
    emptyTab: 'Cet écran arrive dans une phase suivante.',
  },
  team: { name: "Nom de l'équipe" },
} as const;

type DeepDict = { [k: string]: string | DeepDict };

type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`;
}[keyof T & string];

export type TranslationKey = DotPaths<typeof fr>;

/** t('file.save') · t('file.savedIn', { name }) — clés vérifiées à la compilation. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let node: string | DeepDict = fr;
  for (const part of key.split('.')) {
    if (typeof node === 'string') break;
    node = (node as DeepDict)[part] ?? key;
  }
  let text = typeof node === 'string' ? node : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
