import { NextResponse } from 'next/server';
import { currentStaff } from './auth';
import { can } from './roles';

/** Staff with "upload resumes / edit profiles" rights (Admin, HR, Intern) may import applicants. */
export async function importUser() {
  const me = await currentStaff();
  if (!me) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!can(me, 'candidates.edit')) return { error: NextResponse.json({ error: "Your role can't import candidates." }, { status: 403 }) };
  return { me };
}
