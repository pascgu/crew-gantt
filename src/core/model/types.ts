/** Date ISO locale `"YYYY-MM-DD"` — la seule représentation de date du modèle. */
export type IsoDate = string;

/** Jour de semaine ISO : 1 = lundi … 7 = dimanche. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface GlobalCalendar {
  /** Jours ouvrés de l'équipe (défaut lun–ven). */
  workingDays: Weekday[];
  holidays: IsoDate[];
}

export interface Team {
  name: string;
  calendar: GlobalCalendar;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  /** Notes libres de la fiche projet (tableau de bord). */
  notes: string;
  /** Mode de planification par défaut pour les nouvelles tâches du projet. */
  defaultScheduling?: SchedulingMode;
}

/**
 * Exception datée du calendrier personnel — prime sur tout (fériés, motif hebdo).
 * `to` omis = un seul jour. `percent` 0 = absent (défaut), 50 = demi-journée,
 * 100 = jour normalement chômé mais travaillé.
 */
export interface CalendarException {
  from: IsoDate;
  to?: IsoDate;
  percent: number;
  reason?: string;
}

/**
 * Part du temps d'une ressource dédiée à un projet, par période.
 * La dernière entrée du tableau couvrant la date s'applique, projet par projet.
 * Absence d'entrée pour un projet = 100 %.
 */
export interface ProjectShare {
  projectId: string;
  from: IsoDate;
  to?: IsoDate;
  percent: number;
}

export type ResourceKind = 'person' | 'material';

export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  /** Motif hebdomadaire de jours travaillés ; absent = jours ouvrés du calendrier global. */
  workingDays?: Weekday[];
  exceptions: CalendarException[];
  projectShares: ProjectShare[];
  /** Couleur personnalisée du rond d'avatar (ex. '#4f8ef7'). */
  avatarColor?: string;
  /** Initiales affichées dans l'avatar (1-2 caractères). */
  avatarInitials?: string;
}

/** Trois types de liens, tous « au plus tôt » (liens faibles, jamais un aimant). */
export type LinkType = 'after-end' | 'with-start' | 'after-progress';

export interface TaskLink {
  /** Id de la tâche prédécesseur. */
  on: string;
  type: LinkType;
  /** Délai en jours ouvrés (positif ou négatif). */
  lag: number;
  /** Pour `after-progress` : ancre en jours travaillés du prédécesseur. */
  progressDays?: number;
}

export interface Assignment {
  resourceId: string;
  /** % de la part projet de la ressource pendant ce bloc (100 = tout son temps projet). */
  units: number;
}

/**
 * Bloc de travail daté. `to: null` sur le dernier bloc d'une tâche en mode
 * effort = fin calculée (le bloc absorbe le reste à faire).
 */
export interface Block {
  id: string;
  from: IsoDate;
  to: IsoDate | null;
  assignments: Assignment[];
}

export type TaskType = 'task' | 'milestone' | 'group';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];
export type SchedulingMode = 'effort' | 'fixed';

export interface TaskNote {
  date: IsoDate;
  text: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  order: number;
  name: string;
  description: string;
  type: TaskType;
  scheduling: SchedulingMode;
  /** Jours-homme vendus au devis — informatif. */
  estimate: number | null;
  /** Jours-homme prévus (mode effort). */
  effort: number;
  /** Jours-homme restants — pilote le recalcul. */
  remaining: number;
  /** Avancement visuel (0..1), indépendant du reste à faire. */
  progress: number;
  status: TaskStatus;
  /** Compétences/conditions nécessaires, texte libre. */
  requirements: string;
  links: TaskLink[];
  deadline: IsoDate | null;
  /** Date posée d'un jalon. */
  date: IsoDate | null;
  blocks: Block[];
  notes: TaskNote[];
}

export interface BaselineBlock {
  from: IsoDate;
  to: IsoDate;
}

export interface BaselineTaskSnapshot {
  blocks: BaselineBlock[];
  effort: number;
}

export interface Baseline {
  id: string;
  name: string;
  createdAt: IsoDate;
  active: boolean;
  tasks: Record<string, BaselineTaskSnapshot>;
  milestones: Record<string, IsoDate>;
}

export type JournalEntryType = 'meeting' | 'note';

export interface JournalEntry {
  date: IsoDate;
  type: JournalEntryType;
  summary: string[];
  note: string;
  /** Σ reste à faire au moment de la clôture — alimente le burndown. */
  remainingTotal?: number;
}

export interface UiFileState {
  zoom: ZoomLevel;
  /** Ids de projets filtrés ; null = tous. */
  projectFilter: string[] | null;
  /** Ids de tâches (groupes) repliées. */
  collapsed: string[];
  /** Ids stables de conflits explicitement ignorés. */
  ignoredConflicts: string[];
}

export const FORMAT_VERSION = 1;

export interface TeamFile {
  formatVersion: number;
  app: 'CrewGantt';
  team: Team;
  projects: Project[];
  resources: Resource[];
  tasks: Task[];
  baselines: Baseline[];
  journal: JournalEntry[];
  ui: UiFileState;
}
