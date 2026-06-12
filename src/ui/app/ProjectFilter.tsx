import { useAppStore } from '@/state/store';
import { setProjectFilter } from '@/state/taskActions';
import { rgba } from '@/ui/common/color';
import { t } from '@/i18n/fr';

/** Filtre par projet(s), commun à toutes les vues : un, plusieurs ou tous. */
export function ProjectFilter() {
  const projects = useAppStore((s) => s.file.projects);
  const filter = useAppStore((s) => s.file.ui.projectFilter);
  const visible = projects.filter((p) => !p.archived);

  const toggle = (id: string) => {
    if (filter === null) {
      // tous → ne garder que celui-ci
      setProjectFilter([id]);
    } else if (filter.includes(id)) {
      const next = filter.filter((f) => f !== id);
      setProjectFilter(next.length === 0 ? null : next);
    } else {
      const next = [...filter, id];
      setProjectFilter(next.length === visible.length ? null : next);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition ${
          filter === null
            ? 'bg-ink text-paper'
            : 'border border-line text-ink-soft hover:text-ink'
        }`}
        onClick={() => setProjectFilter(null)}
      >
        {t('gantt.allProjects')}
      </button>
      {visible.map((p) => {
        const active = filter === null || filter.includes(p.id);
        return (
          <button
            key={p.id}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition"
            style={
              active
                ? { background: rgba(p.color, 0.14), borderColor: p.color, color: '#211f1a' }
                : { borderColor: 'var(--color-line)', color: 'var(--color-ink-faint)' }
            }
            onClick={() => toggle(p.id)}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: active ? p.color : 'var(--color-line-strong)' }}
            />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
