/** Dictionnaire français — source unique des chaînes UI. */
export const fr = {
  app: {
    title: 'CrewGantt',
    tagline: 'Qui fait quoi, cette semaine et sur la durée.',
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
    confirmDiscard: 'Des modifications ne sont pas enregistrées. Continuer et les abandonner ?',
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
  tasks: {
    newName: 'Nouvelle tâche',
    columns: {
      name: 'Tâche',
      project: 'Projet',
      estimate: 'Estim',
      effort: 'Effort',
      remaining: 'Reste',
      assignees: 'Affectés',
      start: 'Début',
      end: 'Fin',
      status: 'Statut',
    },
    status: {
      todo: 'À faire',
      in_progress: 'En cours',
      done: 'Terminé',
      blocked: 'Bloqué',
    },
    type: { task: 'Tâche', milestone: 'Jalon', group: 'Groupe' },
    addTask: 'Ajouter une tâche',
    addMilestone: 'Ajouter un jalon',
    addGroup: 'Ajouter un groupe',
    addChild: 'Ajouter une sous-tâche',
    addAfter: 'Insérer une tâche après',
    delete: 'Supprimer',
    confirmDelete: 'Supprimer « {name} » et toutes ses sous-tâches ?',
    noProject: 'Aucun projet — créez-en un dans Paramètres.',
    emptyPlan: 'Plan vide. Ajoutez une première tâche ou un groupe.',
  },
  gantt: {
    zoom: { day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre' },
    today: "Aujourd'hui",
    allProjects: 'Tous les projets',
    cutHere: 'Couper ici',
    mergeNext: 'Fusionner avec le bloc suivant',
    addBlock: 'Ajouter un bloc de travail ici',
    deleteBlock: 'Supprimer ce bloc',
    blockOf: 'Bloc de « {name} »',
    newLinkTo: 'Lier vers…',
    linkCreated: 'Lien créé',
    dragLinkHint: 'Relâcher sur la tâche cible',
    week: 'S{num}',
  },
  links: {
    title: 'Liens (prédécesseurs)',
    type: {
      'after-end': 'Après la fin de',
      'with-start': 'Avec le début de',
      'after-progress': 'Après N jours de travail de',
    },
    lag: 'Délai (j ouvrés)',
    progressDays: 'N jours travaillés',
    add: 'Ajouter un lien',
    remove: 'Retirer ce lien',
    cycleRefused:
      'Lien refusé : il créerait un cycle de dépendances (A attend B qui attend A). Réorganisez les liens existants d’abord.',
    earliest: 'Au plus tôt : {date}',
  },
  panel: {
    edit: 'Édition',
    description: 'Description',
    requirements: 'Prérequis (compétences, conditions…)',
    requirementsHint: 'Affiché au moment d’affecter.',
    scheduling: 'Planification',
    schedulingEffort: 'Pilotée par l’effort',
    schedulingFixed: 'Dates fixées à la main',
    estimate: 'Estim (vendu, j-h)',
    effort: 'Effort prévu (j-h)',
    remaining: 'Reste à faire (j-h)',
    progress: 'Avancement',
    initFromEstimate: 'Initialiser l’effort depuis l’estim',
    deadline: 'Deadline',
    milestoneDate: 'Date du jalon',
    suggestedDate: 'Date dérivée des liens : {date}',
    applySuggested: 'Reprendre cette date',
    blocks: 'Blocs de travail',
    blockFrom: 'Du',
    blockTo: 'Au',
    blockOpenEnd: 'fin calculée',
    assignments: 'Affectations',
    addAssignment: 'Affecter quelqu’un',
    unitsLabel: '% du temps projet',
    perWeek: '≈ {days} j/sem',
    notes: 'Notes datées',
    addNote: 'Ajouter une note',
    close: 'Fermer',
    delete: 'Supprimer la tâche',
    gap: 'écart {value}',
  },
  conflicts: {
    title: 'Conflits',
    none: 'Aucun conflit. Plan sain.',
    ignore: 'Ignorer',
    unignore: 'Réactiver',
    ignored: 'Conflits ignorés',
    cycle: 'Cycle de liens détecté entre : {tasks}',
    types: {
      'link-violated': 'Lien violé',
      'project-overload': 'Surcharge projet',
      'no-capacity': 'Travail sans capacité',
      'effort-overflow': 'Effort non casé',
      deadline: 'Deadline menacée',
      'milestone-untenable': 'Jalon intenable',
      unassigned: 'Tâche non affectée',
    },
    messages: {
      'link-violated': '« {task} » démarre avant son point autorisé ({date}).',
      'project-overload': '{resource} dépasse 100 % de sa part « {project} » (+{amount} %) à partir du {date}.',
      'no-capacity': '{resource} est indisponible pendant un bloc de « {task} » (autour du {date}).',
      'effort-overflow': 'Le reste à faire de « {task} » ne tient pas dans ses blocs ({amount} j-h en trop).',
      deadline: '« {task} » finit {amount} j après sa deadline ({date}).',
      'milestone-untenable': 'Le jalon « {task} » est posé avant sa date au plus tôt ({date}).',
      unassigned: '« {task} » n’a personne sur son travail à venir.',
    },
    overEngagement: 'Sur-engagement',
    overEngagementMsg:
      '{resource} cumule plus de 100 % de présence du {from} au {to} (pic ×{peak}). Peut être voulu.',
  },
  settings: {
    title: 'Paramètres',
    calendar: 'Calendrier global',
    workingDays: 'Jours ouvrés',
    holidays: 'Jours fériés',
    addHoliday: 'Ajouter',
    prefillHolidays: 'Préremplir les fériés français {year}–{nextYear}',
    holidayCount: '{count} fériés',
    projects: 'Projets',
    addProject: 'Nouveau projet',
    projectName: 'Nom',
    projectColor: 'Couleur',
    archived: 'Archivé',
    archive: 'Archiver',
    unarchive: 'Réactiver',
    deleteProject: 'Supprimer',
    confirmDeleteProject:
      'Supprimer le projet « {name} » ? Impossible : des tâches y sont rattachées.',
    weekdaysShort: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
  },
  common: {
    days: 'j',
    daysHuman: '{count} j-h',
    add: 'Ajouter',
    remove: 'Retirer',
    cancel: 'Annuler',
    apply: 'Appliquer',
    name: 'Nom',
    none: '—',
  },
} as const;

type DeepDict = { [k: string]: string | readonly string[] | DeepDict };

type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends readonly string[]
      ? K
      : T[K] extends object
        ? `${K}.${DotPaths<T[K]>}`
        : never;
}[keyof T & string];

export type TranslationKey = DotPaths<typeof fr>;

/** t('file.save') · t('file.savedIn', { name }) — clés vérifiées à la compilation. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let node: string | readonly string[] | DeepDict = fr;
  for (const part of key.split('.')) {
    if (typeof node === 'string' || Array.isArray(node)) break;
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

/** Accès direct aux listes (jours de semaine…). */
export function tList(_key: 'settings.weekdaysShort'): readonly string[] {
  return fr.settings.weekdaysShort;
}
