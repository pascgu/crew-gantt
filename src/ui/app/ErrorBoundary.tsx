import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n/fr';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Garde-fou global : si l'UI plante, les données restent intactes
 * (backup IndexedDB automatique) et on propose de recharger.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('CrewGantt UI crash', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-line bg-surface p-8 shadow-panel">
          <h1 className="font-display text-xl font-semibold text-ink">
            {t('errors.boundaryTitle')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t('errors.boundaryBody')}</p>
          <pre className="mt-4 max-h-32 overflow-auto rounded bg-paper-deep p-3 font-mono text-xs text-ink-soft">
            {this.state.error.message}
          </pre>
          <button
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-deep"
            onClick={() => window.location.reload()}
          >
            {t('errors.reload')}
          </button>
        </div>
      </div>
    );
  }
}
