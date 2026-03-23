import type { PageServerLoad } from "./$types";

type Instrument = {
  id: number;
  name: string;
};

export const load: PageServerLoad = async ({ locals }) => {
  const { data, error } = await locals.supabase
    .from("instruments")
    .select("id, name");

  if (error) {
    console.error("Error loading instruments:", error.message);
    return { instruments: [] as Instrument[] };
  }
  return {
    instruments: (data ?? []) as Instrument[],
  };
};
