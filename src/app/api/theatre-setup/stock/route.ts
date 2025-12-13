import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mock stock data - in production, this would fetch from inventory
    // You can integrate with your existing inventory system
    const stock = {
      spirit: 100,
      savlon: 100,
      povidone: 100,
      faceMask: 500,
      nursesCap: 500,
      cssdGauze: 200,
      cssdCotton: 200,
      surgicalBlades: 150,
      suctionTubbings: 100,
      disposables: 300,
    };

    return NextResponse.json(stock);
  } catch (error) {
    console.error('Failed to fetch stock:', error);
    return NextResponse.json({ error: 'Failed to fetch stock' }, { status: 500 });
  }
}
