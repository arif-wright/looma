import { getPersonaSummary } from '$lib/server/persona';

const DEFAULT_PERSONA = {
  archetype: 'Neutral',
  traits: { empathy: 2, curiosity: 2, structure: 2 },
  pacing: { explanations: 'gentle', choices: 1 }
};

export async function buildAIContext(userId: string | null | undefined) {
  const persona = (await getPersonaSummary(userId ?? null)) ?? DEFAULT_PERSONA;
  return {
    persona
  };
}
