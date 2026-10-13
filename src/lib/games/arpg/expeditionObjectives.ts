import { AREAS, type Expedition } from './expedition';

/** Presentation only. This snapshot cannot establish account rewards or a saved result. */
export type ExpeditionProgress = Readonly<Pick<Expedition, 'area' | 'floorKills' | 'outcome'>>;

export type ExpeditionObjective = Readonly<{
  title: string;
  detail: string;
  announcement: string;
  wardens: Readonly<{ defeated: number; total: number; remaining: number }> | null;
}>;

/** Missing or inconsistent observations stay unknown instead of inventing progress. */
export function describeExpeditionObjective(progress: ExpeditionProgress | null): ExpeditionObjective | null {
  if (!progress || !Number.isInteger(progress.area) || progress.area < 0 || progress.area >= AREAS.length ||
      !Number.isInteger(progress.floorKills) || progress.floorKills < 0) return null;
  const area = AREAS[progress.area];
  if (progress.floorKills > area.enemies) return null;
  if (progress.area === 0) {
    const details = {
      preparing: 'Enter the ruins when you’re ready.',
      retreated: 'You returned to town before clearing both floors.',
      rescued: 'You were rescued back to town.',
      completed: 'You cleared both floors and returned to town.'
    } as const;
    if (!Object.hasOwn(details, progress.outcome)) return null;
    const detail = details[progress.outcome as keyof typeof details];
    const title = progress.outcome === 'preparing' ? 'Prepare in town' : 'Expedition ended';
    return Object.freeze({ title, detail, announcement: `${title}. ${detail}`, wardens: null });
  }
  if (progress.outcome !== 'exploring') return null;
  const remaining = area.enemies - progress.floorKills;
  const detail = remaining > 0
    ? progress.area === 1 ? 'Clear the wardens to open the stair.' : 'Clear the wardens to open the way home.'
    : progress.area === 1 ? 'Stair open. Choose Descend or press E at the stair.' : 'Way home open. Return to town.';
  const title = `Floor ${progress.area} of ${AREAS.length - 1} · ${area.name}`;
  return Object.freeze({ title, detail, announcement: `${title}. ${detail}`,
    wardens: Object.freeze({ defeated: progress.floorKills, total: area.enemies, remaining }) });
}
