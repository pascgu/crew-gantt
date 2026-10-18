import { nanoid } from 'nanoid';

/**
 * Identité de cette instance de l'app (une fenêtre / un programme). Sert à ranger la sauvegarde de
 * secours d'un document jamais enregistré, et à reconnaître ses propres messages ci-dessous.
 */
export const instanceId = nanoid(10);

/**
 * « Un programme par fichier » (T6) : rien n'empêche d'ouvrir deux fois le même .cgan. Les fenêtres
 * de l'app partagent le même profil web (WebView2 / navigateur) : elles se parlent par un
 * BroadcastChannel pour savoir si un fichier est déjà ouvert ailleurs, et prévenir l'utilisateur.
 */
type Message =
  | { type: 'who-has'; key: string; from: string }
  | { type: 'has'; key: string; from: string; to: string };

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('crewgantt-instances') : null;

/** Clé du document ouvert ici (null : rien de partageable, ex. démo jamais enregistrée). */
let myDocument: string | null = null;
const pending = new Map<string, (found: boolean) => void>();

channel?.addEventListener('message', (e: MessageEvent<Message>) => {
  const msg = e.data;
  if (msg.type === 'who-has' && msg.from !== instanceId && msg.key === myDocument) {
    channel.postMessage({ type: 'has', key: msg.key, from: instanceId, to: msg.from } satisfies Message);
  } else if (msg.type === 'has' && msg.to === instanceId) {
    pending.get(msg.key)?.(true);
  }
});

/** Déclare le document ouvert dans cette instance. */
export function setOpenDocument(key: string | null): void {
  myDocument = key;
}

/** Une autre instance a-t-elle ce document ouvert ? (réponse attendue au plus `timeoutMs`) */
export function isOpenElsewhere(key: string, timeoutMs = 400): Promise<boolean> {
  if (!channel) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (found: boolean) => {
      pending.delete(key);
      clearTimeout(timer);
      resolve(found);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    pending.set(key, done);
    channel.postMessage({ type: 'who-has', key, from: instanceId } satisfies Message);
  });
}
