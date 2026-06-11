import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/state/store';
import { t } from '@/i18n/fr';
import { TopBar } from './TopBar';
import { BackupPrompt } from './BackupPrompt';
import { useFileActions } from './useFileActions';

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint">
      <span className="font-display text-2xl font-semibold">{label}</span>
      <span className="text-sm">{t('placeholders.emptyTab')}</span>
    </div>
  );
}

const TAB_CONTENT: Record<string, () => ReactNode> = {
  gantt: () => <Placeholder label={t('tabs.gantt')} />,
  meeting: () => <Placeholder label={t('tabs.meeting')} />,
  dashboard: () => <Placeholder label={t('tabs.dashboard')} />,
  team: () => <Placeholder label={t('tabs.team')} />,
  settings: () => <Placeholder label={t('tabs.settings')} />,
};

export function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const { openDropped, save } = useFileActions();
  const [dropping, setDropping] = useState(false);

  // Glisser-déposer d'un fichier .crewgantt.json n'importe où dans la fenêtre.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setDropping(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropping(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDropping(false);
      const file = e.dataTransfer?.files[0];
      if (file) void openDropped(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [openDropped]);

  // Ctrl+S — l'undo/redo clavier arrive avec les raccourcis globaux (phase 6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save({ saveAs: e.shiftKey });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const renderTab = TAB_CONTENT[activeTab] ?? TAB_CONTENT['gantt']!;

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <BackupPrompt />
      <main className="relative min-h-0 flex-1">{renderTab()}</main>
      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
          <div className="rounded-xl border-2 border-dashed border-accent bg-surface px-8 py-6 font-display text-lg font-semibold text-accent shadow-float">
            {t('file.dropHint')}
          </div>
        </div>
      )}
    </div>
  );
}
