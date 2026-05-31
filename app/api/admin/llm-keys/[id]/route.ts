import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { updateLlmKey, deleteLlmKey } from '@/lib/llm-keys';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/llm-keys/[id] — update a key (toggle active, change limit, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { label, is_active, daily_token_limit, priority, model, base_url } = body as {
    label?: string;
    is_active?: boolean;
    daily_token_limit?: number;
    priority?: number;
    model?: string;
    base_url?: string;
  };

  const patch: Record<string, unknown> = {};
  if (label !== undefined) patch.label = label;
  if (is_active !== undefined) patch.is_active = is_active;
  if (daily_token_limit !== undefined) patch.daily_token_limit = daily_token_limit;
  if (priority !== undefined) patch.priority = priority;
  if (model !== undefined) patch.model = model;
  if (base_url !== undefined) patch.base_url = base_url;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    await updateLlmKey(id, patch as Parameters<typeof updateLlmKey>[1]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/llm-keys/[id] — remove a key
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    await deleteLlmKey(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
