export const formatJoined = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'long',
        year: 'numeric'
      })
    : '';
