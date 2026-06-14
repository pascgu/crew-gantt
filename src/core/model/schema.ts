import { z } from 'zod';
import type { TeamFile } from './types';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00`).getTime()), 'Date invalide');

const weekday = z.number().int().min(1).max(7) as z.ZodType<1 | 2 | 3 | 4 | 5 | 6 | 7>;

const percent = z.number().min(0).max(1000);

const globalCalendarSchema = z.object({
  workingDays: z.array(weekday).default([1, 2, 3, 4, 5]),
  holidays: z.array(isoDate).default([]),
});

const teamSchema = z.object({
  name: z.string().default('Équipe'),
  calendar: globalCalendarSchema.default({ workingDays: [1, 2, 3, 4, 5], holidays: [] }),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string().default('#4f8ef7'),
  archived: z.boolean().default(false),
  notes: z.string().default(''),
  defaultScheduling: z.enum(['effort', 'fixed']).optional(),
});

const calendarExceptionSchema = z.object({
  from: isoDate,
  to: isoDate.optional(),
  percent: percent.max(100).default(0),
  reason: z.string().optional(),
});

const projectShareSchema = z.object({
  projectId: z.string().min(1),
  from: isoDate,
  to: isoDate.optional(),
  percent: percent,
});

const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['person', 'material']).default('person'),
  workingDays: z.array(weekday).optional(),
  exceptions: z.array(calendarExceptionSchema).default([]),
  projectShares: z.array(projectShareSchema).default([]),
  avatarColor: z.string().optional(),
  avatarInitials: z.string().max(2).optional(),
});

const taskLinkSchema = z.object({
  on: z.string().min(1),
  type: z.enum(['after-end', 'with-start', 'after-progress']),
  lag: z.number().int().default(0),
  progressDays: z.number().min(0).optional(),
});

const assignmentSchema = z.object({
  resourceId: z.string().min(1),
  units: percent.default(100),
});

const blockSchema = z.object({
  id: z.string().min(1),
  from: isoDate,
  to: isoDate.nullable().default(null),
  assignments: z.array(assignmentSchema).default([]),
});

const taskNoteSchema = z.object({
  date: isoDate,
  text: z.string(),
});

const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  parentId: z.string().nullable().default(null),
  order: z.number().default(0),
  name: z.string(),
  description: z.string().default(''),
  type: z.enum(['task', 'milestone', 'group']).default('task'),
  scheduling: z.enum(['effort', 'fixed']).default('effort'),
  estimate: z.number().min(0).nullable().default(null),
  effort: z.number().min(0).default(0),
  remaining: z.number().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'cancelled']).default('todo'),
  requirements: z.string().default(''),
  links: z.array(taskLinkSchema).default([]),
  deadline: isoDate.nullable().default(null),
  date: isoDate.nullable().default(null),
  blocks: z.array(blockSchema).default([]),
  notes: z.array(taskNoteSchema).default([]),
});

const baselineSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: isoDate,
  active: z.boolean().default(false),
  tasks: z
    .record(
      z.string(),
      z.object({
        blocks: z.array(z.object({ from: isoDate, to: isoDate })),
        effort: z.number().min(0).default(0),
      }),
    )
    .default({}),
  milestones: z.record(z.string(), isoDate).default({}),
});

const journalEntrySchema = z.object({
  date: isoDate,
  type: z.enum(['meeting', 'note']).default('note'),
  summary: z.array(z.string()).default([]),
  note: z.string().default(''),
  remainingTotal: z.number().min(0).optional(),
});

const uiFileStateSchema = z.object({
  zoom: z.enum(['day', 'week', 'month', 'quarter']).default('week'),
  projectFilter: z.array(z.string()).nullable().default(null),
  collapsed: z.array(z.string()).default([]),
  ignoredConflicts: z.array(z.string()).default([]),
});

export const teamFileSchema = z.object({
  formatVersion: z.number().int().min(1),
  app: z.literal('CrewGantt'),
  team: teamSchema,
  projects: z.array(projectSchema).default([]),
  resources: z.array(resourceSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  baselines: z.array(baselineSchema).default([]),
  journal: z.array(journalEntrySchema).default([]),
  ui: uiFileStateSchema.default({
    zoom: 'week',
    projectFilter: null,
    collapsed: [],
    ignoredConflicts: [],
  }),
});

export type ParsedTeamFile = z.infer<typeof teamFileSchema>;

/** Défauts croisés que Zod ne sait pas exprimer champ à champ. */
export function normalizeTeamFile(parsed: ParsedTeamFile): TeamFile {
  return {
    ...parsed,
    tasks: parsed.tasks.map((t) => ({
      ...t,
      remaining: t.remaining ?? (t.status === 'done' ? 0 : t.effort),
      progress: t.progress ?? (t.status === 'done' ? 1 : 0),
    })),
  };
}
