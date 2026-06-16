import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { redo, undo, useAppStore, type TabId } from '@/state/store';
import { clearHistory } from '@/state/store';
import { useStore } from 'zustand';
import { t } from '@/i18n/fr';
import { useConflicts, useSchedule } from '@/state/schedule';
import { proposalKey, useProposal } from '@/state/proposalActions';
import { useUiStore } from '@/state/uiStore';
import { useNotifications } from '@/state/notifications';
import { useFileActions } from './useFileActions';
import { HelpButton } from './HelpButton';
import {
  IconBell,
  IconExchange,
  IconFolder,
  IconPlus,
  IconRedo,
  IconSave,
  IconUndo,
  IconWarning,
} from '@/ui/common/icons';
import { downloadBlob, exportGanttPng, exportTasksCsv } from '@/io/export';
import { defaultFileName } from '@/io/fileAccess';
import { exportGanttProjectXml, ganttProjectSlug, importGanttProjectXml } from '@/io/ganttproject';

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
  const schedule = useSchedule();
  const file = useAppStore((s) => s.file);
  const replaceFile = useAppStore((s) => s.replaceFile);
  const [ioMenuOpen, setIoMenuOpen] = useState(false);
  const ioButtonRef = useRef<HTMLButtonElement>(null);

  const handleExportGp = () => {
    setIoMenuOpen(false);
    const xml = exportGanttProjectXml(file, schedule);
    const blob = new Blob([xml], { type: 'application/xml' });
    downloadBlob(blob, `${ganttProjectSlug(file.team.name)}.gan`);
  };

  const baseName = () => defaultFileName(file.team.name).replace('.crewgantt.json', '');

  const handleExportPng = () => {
    setIoMenuOpen(false);
    const svg = document.getElementById('gantt-chart-svg');
    if (svg instanceof SVGSVGElement) void exportGanttPng(svg, `${baseName()}-gantt.png`);
  };

  const handleExportCsv = () => {
    setIoMenuOpen(false);
    exportTasksCsv(file, schedule, `${baseName()}-taches.csv`);
  };

  const handleImportGp = () => {
    setIoMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gan,.xml';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = importGanttProjectXml(reader.result as string);
          if (dirty && !window.confirm(t('file.confirmDiscard'))) return;
          replaceFile(imported, null);
          clearHistory();
        } catch {
          window.alert(t('io.importError'));
        }
      };
      reader.readAsText(f, 'utf-8');
    };
    input.click();
  };

  const pastStates = useStore(useAppStore.temporal, (s) => s.pastStates.length);
  const futureStates = useStore(useAppStore.temporal, (s) => s.futureStates.length);

  const { active: activeConflicts } = useConflicts();
  const proposal = useProposal();
  const dismissedProposal = useUiStore((s) => s.dismissedProposal);
  const proposalVisible = proposal !== null && proposalKey(proposal) !== dismissedProposal;
  const { togglePanel } = useUiStore();

  const notifications = useNotifications((s) => s.items);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const iconBtn =
    'rounded-md p-1 text-ink-soft transition enabled:hover:bg-paper-deep enabled:hover:text-ink disabled:opacity-35';

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 shadow-[0_1px_0_rgb(33_31_26/0.03)]">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[16px] font-bold tracking-tight text-ink">
          Crew<span className="text-accent">Gantt</span>
        </span>
      </div>

      <span className="h-5 w-px bg-line" />

      <input
        className="w-40 rounded-md border border-transparent bg-transparent px-2 py-0.5 font-display text-sm font-semibold text-ink outline-none transition hover:border-line focus:border-accent focus:bg-surface"
        value={teamName}
        title={t('team.name')}
        onChange={(e) => mutate((f) => void (f.team.name = e.target.value))}
      />

      <nav className="mx-auto flex items-center gap-0.5 rounded-lg bg-paper-deep p-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition ${
              activeTab === tab.id
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(33_31_26/0.1)]'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Boutons de contexte : conflits, proposition, messages, aide */}
      <div className="flex items-center gap-1">
        <button
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium transition ${
            activeConflicts.length > 0
              ? 'bg-danger-wash text-danger hover:brightness-95'
              : 'text-ink-soft hover:bg-paper-deep hover:text-ink'
          }`}
          title={t('conflicts.title')}
          onClick={() => togglePanel('conflicts')}
        >
          <IconWarning size={12} />
          <span>{activeConflicts.length}</span>
        </button>

        {proposalVisible && proposal && (
          <button
            className="flex items-center gap-1 rounded-md bg-accent-wash px-1.5 py-1 text-[11.5px] font-medium text-accent-deep transition hover:brightness-95"
            title={t('proposal.button')}
            onClick={() => togglePanel('impacts')}
          >
            {t('proposal.button')}
          </button>
        )}

        {unreadCount > 0 && (
          <button
            className="relative rounded-md p-1 text-ink-soft transition hover:bg-paper-deep hover:text-ink"
            title={t('notifications.title')}
            onClick={() => togglePanel('messages' as Parameters<typeof togglePanel>[0])}
          >
            <IconBell size={13} />
            <span className="absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-accent px-0.5 text-center text-[8px] font-bold leading-3.5 text-white">
              {unreadCount}
            </span>
          </button>
        )}

        <HelpButton />
      </div>

      <span className="h-5 w-px bg-line" />

      <div className="flex items-center gap-1">
        <button
          className={iconBtn}
          onClick={() => undo()}
          disabled={pastStates === 0}
          title={`${t('undo.undo')} (Ctrl+Z)`}
        >
          <IconUndo size={14} />
        </button>
        <button
          className={iconBtn}
          onClick={() => redo()}
          disabled={futureStates === 0}
          title={`${t('undo.redo')} (Ctrl+Y)`}
        >
          <IconRedo size={14} />
        </button>
      </div>

      <span className="h-5 w-px bg-line" />

      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dirty ? 'bg-warn' : 'bg-ok'}`}
          title={dirty ? t('file.unsaved') : t('file.saved')}
        />
        <span className="max-w-44 truncate text-[10px] text-ink-faint" title={fileName ?? ''}>
          {fileName ?? t('file.noFile')}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          className={iconBtn}
          onClick={newFile}
          title={t('file.new')}
          aria-label={t('file.new')}
        >
          <IconPlus size={14} />
        </button>
        <button
          className={iconBtn}
          onClick={() => void openFile()}
          title={t('file.open')}
          aria-label={t('file.open')}
        >
          <IconFolder size={14} />
        </button>
        <button
          ref={ioButtonRef}
          className={iconBtn}
          onClick={() => setIoMenuOpen((v) => !v)}
          title={t('io.menu')}
          aria-label={t('io.menu')}
        >
          <IconExchange size={14} />
        </button>
        <button
          className="rounded-md bg-accent p-1 text-white transition hover:bg-accent-deep"
          onClick={(e) => void save({ saveAs: e.ctrlKey || e.metaKey })}
          onContextMenu={(e) => {
            e.preventDefault();
            void save({ saveAs: true });
          }}
          title={`${t('file.save')} (Ctrl+S) — Ctrl+clic ou clic droit : ${t('file.saveAs')}`}
          aria-label={t('file.save')}
        >
          <IconSave size={14} />
        </button>
      </div>
      {ioMenuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIoMenuOpen(false)} />
          <div
            className="fixed z-50 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-float text-[12.5px]"
            style={{
              right: ioButtonRef.current
                ? window.innerWidth - ioButtonRef.current.getBoundingClientRect().right
                : 16,
              top: ioButtonRef.current
                ? ioButtonRef.current.getBoundingClientRect().bottom + 4
                : 44,
            }}
          >
            <button
              className="w-full rounded-md px-3 py-1.5 text-left text-ink hover:bg-paper-deep"
              onClick={handleImportGp}
            >
              {t('io.importGp')}
            </button>
            <div className="my-1 h-px bg-line" />
            <button
              className="w-full rounded-md px-3 py-1.5 text-left text-ink hover:bg-paper-deep"
              onClick={handleExportGp}
            >
              {t('io.exportGp')}
            </button>
            <button
              className="w-full rounded-md px-3 py-1.5 text-left text-ink hover:bg-paper-deep disabled:opacity-40"
              onClick={handleExportPng}
              disabled={activeTab !== 'gantt'}
              title={activeTab !== 'gantt' ? t('io.pngNeedsGantt') : undefined}
            >
              {t('export.pngTitle')}
            </button>
            <button
              className="w-full rounded-md px-3 py-1.5 text-left text-ink hover:bg-paper-deep"
              onClick={handleExportCsv}
            >
              {t('export.csvTitle')}
            </button>
          </div>
        </>,
        document.body,
      )}
    </header>
  );
}
