import type { PageServerLoad } from './$types';
import { pageRequest } from '#lib/server/page-request.js';
export const load: PageServerLoad = ({ url }) => pageRequest(url);
