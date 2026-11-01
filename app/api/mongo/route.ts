import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { MongoQueryBuilder } from '@/lib/mongoAdapter';

// Allowlist of collections that can be read through this endpoint
const ALLOWED_COLLECTIONS = new Set([
  'students', 'staff', 'hods',
  'departments', 'academic_years', 'class_coordinators',
  'student_activities', 'group_activities',
  'activity_participants', 'activity_mentors',
  'staff_activities', 'staff_activity_comentors', 'staff_activity_participants',
  'event_proposals', 'broadcasts', 'broadcast_rsvps',
]);

export async function POST(req: NextRequest) {
  try {
    // Every client read still requires a valid session
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      collection,
      select,
      selectOptions,
      filters = [],
      sort = [],
      limit,
      skip = 0,
      rangeEnd,
      single,
      maybeSingle,
    } = body;

    if (!collection || !ALLOWED_COLLECTIONS.has(collection)) {
      return NextResponse.json(
        { error: `Collection "${collection}" is not allowed.` },
        { status: 400 }
      );
    }

    // Reconstruct the query using the server-side builder
    const qb = new MongoQueryBuilder(collection);

    if (select) qb.select(select, selectOptions || {});

    for (const f of filters) {
      switch (f.type) {
        case 'eq':    qb.eq(f.column, f.value);    break;
        case 'neq':   qb.neq(f.column, f.value);   break;
        case 'ilike': qb.ilike(f.column, f.value); break;
        case 'in':    qb.in(f.column, f.value);    break;
        case 'or':    qb.or(f.value);               break;
      }
    }

    for (const s of sort) {
      qb.order(s.column, { ascending: s.ascending });
    }

    if (rangeEnd !== null && rangeEnd !== undefined) {
      qb.range(skip || 0, rangeEnd);
    } else {
      if (skip > 0) qb.skip(skip);
      if (limit !== null && limit !== undefined) qb.limit(limit);
    }

    let result;
    if (single) result = await qb.single();
    else if (maybeSingle) result = await qb.maybeSingle();
    else result = await qb;

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[/api/mongo] Error:', err.message);
    return NextResponse.json({ data: null, error: { message: err.message } }, { status: 500 });
  }
}
