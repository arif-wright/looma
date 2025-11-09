import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			user: User | null;
			session?: Session | null;
			blockPeers?: Set<string>;
		}
		interface PageData {
			user?: User | null;
		}
	}
}

export {};
