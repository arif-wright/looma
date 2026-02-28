import { redirect } from '@sveltejs/kit';

export const load = async (event: any) => {
  const id = event.params.id;
  throw redirect(302, `/app/companions?focus=${encodeURIComponent(id)}`);
};
