import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  chart: string;
  className?: string;
  /** true (défaut) : scale le SVG via max-height (défaut 11rem) + max-width:100%.
   *  false : rendu à la taille naturelle — utiliser un conteneur overflow-auto autour. */
  fit?: boolean;
  /** Remplace la contrainte max-height quand fit=true (ex. '5rem'). */
  maxHeight?: string;
}

let initialized = false;

export function Mermaid({ chart, className, fit = true, maxHeight }: Props) {
  const uid = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const idRef = useRef(`mermaid-${uid}`);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const m = (await import('mermaid')).default;
        if (!initialized) {
          m.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
          initialized = true;
        }
        const id = idRef.current;
        const { svg: rendered } = await m.render(id, chart);
        let responsive: string;
        if (fit) {
          const mh = maxHeight ?? '11rem';
          const s = `max-width:100%;max-height:${mh};display:block;`;
          responsive = rendered
            .replace(/(<svg\b[^>]*)\s+style="[^"]*"/i, `$1 style="${s}"`)
            .replace(/(<svg\b(?![^>]*style=)[^>]*)>/i, `$1 style="${s}">`);
        } else {
          // Conserve le max-width naturel de Mermaid, ajoute seulement display:block
          responsive = rendered
            .replace(/(<svg\b[^>]*)\s+style="([^"]*)"/i, '$1 style="display:block;$2"')
            .replace(/(<svg\b(?![^>]*style=)[^>]*)>/i, '$1 style="display:block;">');
        }
        if (!cancelled) setSvg(responsive);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) return <pre className="text-xs text-red-500">{error}</pre>;
  if (!svg) return null;
  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid library output
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
