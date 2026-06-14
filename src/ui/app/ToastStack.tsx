import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications, type Notification } from '@/state/notifications';
import { IconClose } from '@/ui/common/icons';

const AUTO_DISMISS_MS = 5000;

function Toast({ item }: { item: Notification }) {
  const dismiss = useNotifications((s) => s.dismiss);

  useEffect(() => {
    if (item.sticky) return;
    const t = setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [item.id, item.sticky, dismiss]);

  const borderColor = item.kind === 'warn' ? 'border-warn/40' : 'border-line';
  const bg = item.kind === 'warn' ? 'bg-warn-wash' : 'bg-surface';

  return (
    <div
      className={`flex min-w-72 max-w-96 items-start gap-3 rounded-lg border ${borderColor} ${bg} px-3 py-2.5 shadow-float`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink">{item.message}</p>
        {item.detail && <p className="mt-0.5 text-[11.5px] text-ink-soft">{item.detail}</p>}
        {item.actions && item.actions.length > 0 && (
          <div className="mt-2 flex gap-2">
            {item.actions.map((a, i) => (
              <button
                key={i}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${
                  a.primary
                    ? 'bg-accent text-white hover:bg-accent-deep'
                    : 'border border-line text-ink-soft hover:text-ink'
                }`}
                onClick={() => {
                  a.onClick();
                  dismiss(item.id);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="mt-0.5 shrink-0 text-ink-faint transition hover:text-ink"
        onClick={() => dismiss(item.id)}
        aria-label="Fermer"
      >
        <IconClose size={13} />
      </button>
    </div>
  );
}

export function ToastStack() {
  const items = useNotifications((s) => s.items);
  const visible = items.filter((i) => !i.read);
  if (visible.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col items-end gap-2">
      {visible.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <Toast item={item} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
