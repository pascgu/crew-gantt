import { useEffect, useState, type ReactNode } from 'react';
import { redo, undo, useAppStore } from '@/state/store';
import { t } from '@/i18n/fr';
import { useUiStore } from '@/state/uiStore';
import { useNotifications } from '@/state/notifications';
import { useProposal } from '@/state/proposalActions';
import { DashboardTab } from '@/ui/dashboard/DashboardTab';
import { GanttTab } from '@/ui/gantt/GanttTab';
import { MeetingTab } from '@/ui/meeting/MeetingTab';
import { SettingsTab } from '@/ui/settings/SettingsTab';
import { TeamTab } from '@/ui/team/TeamTab';
import { HelpTab } from '@/ui/help/HelpTab';
import { ImpactsPanel } from '@/ui/proposal/ImpactsPanel';
import { ConflictsPanel } from '@/ui/proposal/ConflictsPanel';
import { IconClose } from '@/ui/common/icons';
import { TopBar } from './TopBar';
import { ToastStack } from './ToastStack';
import { useFileActions } from './useFileActions';
import { BackupPrompt } from './BackupPrompt';

const TAB_CONTENT: Record<string, () => ReactNode> = {
  gantt: () => <GanttTab />,
  meeting: () => <MeetingTab />,
  dashboard: () => <DashboardTab />,
  team: () => <TeamTab />,
  settings: () => <SettingsTab />,
  help: () => <HelpTab />,
};

export function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const selectTask = useAppStore((s) => s.selectTask);
  const { openDropped, save } = useFileActions();
  const [dropping, setDropping] = useState(false);

  const { panel, closePanel } = useUiStore();
  const notifications = useNotifications((s) => s.items);
  const unread = notifications.filter((n) => !n.read);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const clear = useNotifications((s) => s.clear);

  const proposal = useProposal();

  // Glisser-déposer d'un fichier .cgan n'importe où dans la fenêtre.
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

  // Raccourcis globaux : Ctrl+S (enregistrer), Ctrl+Z / Ctrl+Y (annuler/rétablir).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void save({ saveAs: e.shiftKey });
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (typing) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
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

      {/* Panneaux flottants ancrés en haut à droite */}
      {panel === 'conflicts' && (
        <ConflictsPanel
          onClose={closePanel}
          onSelectTask={(id) => selectTask(id)}
        />
      )}
      {panel === 'impacts' && proposal && (
        <ImpactsPanel
          proposal={proposal}
          onClose={closePanel}
          onSelectTask={(id) => {
            selectTask(id);
            useUiStore.getState().scrollToTask(id);
          }}
        />
      )}
      {panel === 'messages' && (
        <div className="fixed right-4 top-14 z-50 w-80 rounded-xl border border-line bg-surface shadow-float">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[12.5px] font-semibold text-ink">{t('notifications.title')}</span>
            <div className="flex items-center gap-2">
              {unread.length > 0 && (
                <button className="text-[11px] text-ink-faint transition hover:text-ink" onClick={markAllRead}>
                  {t('notifications.clear')}
                </button>
              )}
              <button className="text-ink-faint hover:text-ink" onClick={closePanel}>
                <IconClose size={13} />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-[12px] text-ink-faint">{t('notifications.empty')}</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`mb-1 rounded-md px-3 py-2 text-[12px] ${n.read ? 'opacity-60' : ''}`}>
                  <p className="font-medium text-ink">{n.message}</p>
                  {n.detail && <p className="mt-0.5 text-ink-soft">{n.detail}</p>}
                  {n.actions && (
                    <div className="mt-1.5 flex gap-2">
                      {n.actions.map((a, i) => (
                        <button
                          key={i}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium ${a.primary ? 'bg-accent text-white' : 'border border-line text-ink-soft hover:text-ink'}`}
                          onClick={() => { a.onClick(); useNotifications.getState().dismiss(n.id); }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {notifications.length > 0 && (
            <div className="border-t border-line p-2">
              <button className="w-full rounded-md px-3 py-1 text-center text-[11.5px] text-ink-faint transition hover:text-ink" onClick={clear}>
                {t('notifications.clear')}
              </button>
            </div>
          )}
        </div>
      )}

      <ToastStack />

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
