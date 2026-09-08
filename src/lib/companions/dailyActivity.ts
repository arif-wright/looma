type ActivityRow = {
  created_at?: string;
  source_type?: string;
  meta_json?: Record<string, unknown> | null;
};

/** Use the same UTC day as persisted daily arcs. Automatic notices are not activities. */
export const dailyActivityEvidence = (care: ActivityRow[], journal: ActivityRow[], now = new Date()) => {
  const start = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const today = (row: ActivityRow) => {
    const stamp = Date.parse(row.created_at ?? '');
    return stamp >= start && stamp <= now.getTime();
  };
  const entries = journal.filter(today);
  const checkins = entries.filter(row => row.meta_json?.generatedBy === 'home_reconnect');
  const social = entries.filter(row => ['post', 'message', 'circle_announcement'].includes(row.source_type ?? ''));
  const sanctuary = entries.filter(row => row.meta_json?.category === 'sanctuary');
  return {
    hasDailyCheckin: checkins.length > 0,
    hasCareMoment: care.some(today),
    hasSocialMoment: social.length > 0,
    hasJournalMoment: checkins.length + social.length + sanctuary.length > 0
  };
};
