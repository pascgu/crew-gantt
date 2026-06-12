import { redo, undo, useAppStore, type TabId } from '@/state/store';
import { useStore } from 'zustand';
import { t } from '@/i18n/fr';
import { useFileActions } from './useFileActions';
import { IconFolder, IconPlus, IconRedo, IconSave, IconUndo } from '@/ui/common/icons';

const TABS: { id: TabId; label: string }[] = [
  { id: 'gantt', label: t('tabs.gantt') },
  { id: 'meeting', label: t('tabs.meeting') },
  { id: 'dashboard', label: t('tabs.dashboard') },
  { id: 'team', label: t('tabs.team') },
  { id: 'settings', label: t('tabs.settings') },
];

export function TopBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const teamName = useAppStore((s) => s.file.team.name);
  const fileName = useAppStore((s) => s.fileName);
  const dirty = useAppStore((s) => s.dirty);
  const mutate = useAppStore((s) => s.mutate);
  const { newFile, openFile, save } = useFileActions();

  const pastStates = useStore(useAppStore.temporal, (s) => s.pastStates.length);
  const futureStates = useStore(useAppStore.temporal, (s) => s.futureStates.length);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 shadow-[0_1px_0_rgb(33_31_26/0.03)]">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[17px] font-bold tracking-tight text-ink">
          Crew<span className="text-accent">Gantt</span>
        </span>
      </div>

      <span className="h-5 w-px bg-line" />

      <input
        className="w-44 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-sm font-semibold text-ink outline-none transition hover:border-line focus:border-accent focus:bg-surface"
        value={teamName}
        title={t('team.name')}
        onChange={(e) => mutate((f) => void (f.team.name = e.target.value))}
      />

      <nav className="mx-auto flex items-center gap-0.5 rounded-lg bg-paper-deep p-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition ${
              activeTab === tab.id
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(33_31_26/0.1)]'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-1">
        <button
          className="rounded-md p-1.5 text-ink-soft transition enabled:hover:bg-paper-deep enabled:hover:text-ink disabled:opacity-35"
          onClick={() => undo()}
          disabled={pastStates === 0}
          title={`${t('undo.undo')} (Ctrl+Z)`}
        >
          <IconUndo />
        </button>
        <button
          className="rounded-md p-1.5 text-ink-soft transition enabled:hover:bg-paper-deep enabled:hover:text-ink disabled:opacity-35"
          onClick={() => redo()}
          disabled={futureStates === 0}
          title={`${t('undo.redo')} (Ctrl+Y)`}
        >
          <IconRedo />
        </button>
      </div>

      <span className="h-5 w-px bg-line" />

      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dirty ? 'bg-warn' : 'bg-ok'}`}
          title={dirty ? t('file.unsaved') : t('file.saved')}
        />
        <span className="max-w-44 truncate font-mono text-xs text-ink-faint">
          {fileName ?? t('file.noFile')}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="rounded-md p-1.5 text-ink-soft transition hover:bg-paper-deep hover:text-ink"
          onClick={newFile}
          title={t('file.new')}
          aria-label={t('file.new')}
        >
          <IconPlus size={15} />
        </button>
        <button
          className="rounded-md p-1.5 text-ink-soft transition hover:bg-paper-deep hover:text-ink"
          onClick={() => void openFile()}
          title={t('file.open')}
          aria-label={t('file.open')}
        >
          <IconFolder size={15} />
        </button>
        <button
          className="rounded-md bg-accent p-1.5 text-white transition hover:bg-accent-deep"
          onClick={() => void save()}
          onContextMenu={(e) => {
            e.preventDefault();
            void save({ saveAs: true });
          }}
          title={`${t('file.save')} (Ctrl+S) — clic droit : ${t('file.saveAs')}`}
          aria-label={t('file.save')}
        >
          <IconSave size={15} />
        </button>
      </div>
    </header>
  );
}
