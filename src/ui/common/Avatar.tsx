import type { Resource } from '@/core/model/types';

const PALETTE = [
  '#4f8ef7', '#f74f4f', '#4fd97a', '#f7a24f', '#a24ff7',
  '#4fd7e8', '#f74fb5', '#7ef74f', '#e8c04f', '#5554d6',
];

function hashColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length]!;
}

function defaultInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function resourceAvatar(resource: Resource): { color: string; label: string } {
  return {
    color: resource.avatarColor ?? hashColor(resource.name),
    label: resource.avatarInitials ?? defaultInitials(resource.name),
  };
}

const SIZE_CLASS = {
  xs: 'h-4 w-4 text-[7px]',
  sm: 'h-5 w-5 text-[9px]',
  md: 'h-8 w-8 text-[11px]',
  lg: 'h-9 w-9 text-sm',
} as const;

export function Avatar({
  resource,
  size = 'md',
}: {
  resource: Resource;
  size?: keyof typeof SIZE_CLASS;
}) {
  const { color, label } = resourceAvatar(resource);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${SIZE_CLASS[size]}`}
      style={{ background: color }}
      title={resource.name}
    >
      {label}
    </span>
  );
}

/**
 * Avatar éditable : clic sur les initiales = éditer le texte,
 * clic ailleurs dans le rond = ouvrir le sélecteur de couleur.
 */
export function EditableAvatar({
  resource,
  onChangeColor,
  onChangeInitials,
}: {
  resource: Resource;
  onChangeColor: (color: string) => void;
  onChangeInitials: (initials: string | undefined) => void;
}) {
  const { color, label } = resourceAvatar(resource);
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full font-display font-bold select-none"
      style={{ background: color }}
      title={resource.name}
    >
      {/* input couleur invisible — couvre tout le fond, capte le clic "ailleurs dans le rond" */}
      <input
        type="color"
        value={resource.avatarColor ?? color}
        className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
        onChange={(e) => onChangeColor(e.target.value)}
        tabIndex={-1}
      />
      {/* input initiales centré — z-10, stopPropagation empêche le color picker */}
      <input
        type="text"
        maxLength={2}
        value={resource.avatarInitials ?? ''}
        placeholder={label}
        className="relative z-10 w-8 cursor-text bg-transparent text-center text-[13px] font-bold text-white placeholder-white/70 outline-none"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChangeInitials(e.target.value.toUpperCase() || undefined)}
      />
    </div>
  );
}
