// ============================================================
// The gate on every owner route
// ------------------------------------------------------------
// One helper rather than a role check copied into six route files, because the
// checks that get copied are the checks that drift. The capability split itself
// lives in ./access.ts; this only applies it to a request.
//
// hasModuleAccess() is consulted as well as the role, so a deputy granted
// 'policy-review' in /dashboard/admin/access actually gets in. A role list that
// ignores admin grants is why access editors stop being believed.
// ============================================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { hasModuleAccess } from '@/lib/modules';

import { canOwnPolicyReview, policyRoleOf, type PolicyRole } from './access';

export interface PolicyActor {
  id: string;
  name: string;
  role: string;
  extraModules: string[];
  who: PolicyRole;
}

type Guarded<T> = { error: NextResponse; actor: null } | { error: null; actor: T };

async function actorFromSession(): Promise<PolicyActor | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name?.trim() || 'Unnamed user',
    role: user.role ?? '',
    extraModules: user.extraModules ?? [],
    who: policyRoleOf(user.role, user.extraModules),
  };
}

/** Import, open or close a round, invite, analyse, decide, export. */
export async function requirePolicyOwner(): Promise<Guarded<PolicyActor>> {
  const actor = await actorFromSession();
  if (!actor) {
    return {
      error: NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 }),
      actor: null,
    };
  }
  if (!canOwnPolicyReview(actor.role, actor.extraModules)) {
    return {
      error: NextResponse.json(
        {
          error:
            'Only the Chairman of the Theatre Users Committee, or a deputy an '
            + 'administrator has named, may run a policy review.',
        },
        { status: 403 },
      ),
      actor: null,
    };
  }
  return { error: null, actor };
}

/**
 * Read the round. Owners and observers both pass; what each may SEE of
 * individual responses is decided separately by attributionFor(), because an
 * observer reading the participation figures is fine and an observer reading
 * what a named head of department wrote is not.
 */
export async function requirePolicyViewer(): Promise<Guarded<PolicyActor>> {
  const actor = await actorFromSession();
  if (!actor) {
    return {
      error: NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 }),
      actor: null,
    };
  }
  const allowed = actor.who !== 'none'
    || hasModuleAccess(actor.role, actor.extraModules, 'policy-review');
  if (!allowed) {
    return {
      error: NextResponse.json({ error: 'You do not have access to the policy review' }, { status: 403 }),
      actor: null,
    };
  }
  return { error: null, actor };
}
