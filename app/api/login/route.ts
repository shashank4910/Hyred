import { NextRequest, NextResponse } from 'next/server';
import { comparePasswords, getAppPassword, signSession, COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const supplied = body.password ?? '';
  let expected: string;
  try {
    expected = getAppPassword();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!comparePasswords(supplied, expected)) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }
  const token = await signSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE.name, token, COOKIE.options);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE.name, '', { ...COOKIE.options, maxAge: 0 });
  return res;
}
