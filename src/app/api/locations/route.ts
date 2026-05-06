import { NextResponse } from 'next/server';
import { LOCATIONS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(LOCATIONS);
}
