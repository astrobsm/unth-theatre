import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission, UserRole } from './permissions';
import { NextResponse } from 'next/server';

/**
 * CORS headers for all API responses
 */
export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleCorsPreFlight() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

/**
 * Verify user has required permissions for API route
 */
export async function requirePermission(
  module: Parameters<typeof hasPermission>[1],
  action: Parameters<typeof hasPermission>[2]
) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 }),
      session: null,
    };
  }

  const userRole = session.user.role as UserRole;

  if (!hasPermission(userRole, module, action)) {
    return {
      error: NextResponse.json(
        { error: `Forbidden - You don't have permission to ${action} ${module}` },
        { status: 403 }
      ),
      session: null,
    };
  }

  return {
    error: null,
    session,
  };
}

/**
 * Check if user is authenticated
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 }),
      session: null,
    };
  }

  return {
    error: null,
    session,
  };
}

/**
 * Check if user has specific role(s)
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 }),
      session: null,
    };
  }

  const userRole = session.user.role as UserRole;

  if (!allowedRoles.includes(userRole)) {
    return {
      error: NextResponse.json(
        { error: `Forbidden - Required role: ${allowedRoles.join(' or ')}` },
        { status: 403 }
      ),
      session: null,
    };
  }

  return {
    error: null,
    session,
  };
}

/**
 * User interface for middleware
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
  email?: string;
}
