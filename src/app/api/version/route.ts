import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_GIT_HASH || 'unknown',
    timestamp: new Date().toISOString(),
  });
}
