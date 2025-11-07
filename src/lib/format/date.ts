const joinedFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric'
});

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatJoined = (value: string | Date | null | undefined): string => {
  const parsed = toDate(value);
  if (!parsed) return 'Joined —';
  return `Joined ${joinedFormatter.format(parsed)}`;
};
