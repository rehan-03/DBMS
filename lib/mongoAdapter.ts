import { getDb } from './mongodb';
import { ObjectId } from 'mongodb';

// ─── ID Configuration ──────────────────────────────────────────────────────
// Tables that need an auto-generated custom ID field on insert
const CUSTOM_ID_FIELD: Record<string, string> = {
  group_activities: 'id',
  event_proposals: 'id',
  broadcasts: 'id',
  broadcast_rsvps: 'id',
  student_activities: 'activity_id',
  staff_activities: 'activity_id',
};

function generateId(): string {
  return new ObjectId().toHexString();
}

// ─── Join Relationships ────────────────────────────────────────────────────
// Maps Supabase nested-select aliases to MongoDB $lookup config
const JOIN_RELATIONS: Record<
  string,
  Array<{
    localField: string;
    from: string;
    foreignField: string;
    as: string;
    isArray: boolean; // true = keep as array (one-to-many), false = unwrap to single object
  }>
> = {
  activity_participants: [
    {
      localField: 'activity_id',
      from: 'group_activities',
      foreignField: 'id',
      as: 'group_activities',
      isArray: false,
    },
  ],
  activity_mentors: [
    {
      localField: 'activity_id',
      from: 'group_activities',
      foreignField: 'id',
      as: 'group_activities',
      isArray: false,
    },
  ],
  staff_activity_comentors: [
    {
      localField: 'activity_id',
      from: 'staff_activities',
      foreignField: 'activity_id',
      as: 'staff_activities',
      isArray: false,
    },
  ],
  group_activities: [
    {
      localField: 'id',
      from: 'activity_participants',
      foreignField: 'activity_id',
      as: 'activity_participants',
      isArray: true,
    },
    {
      localField: 'id',
      from: 'activity_mentors',
      foreignField: 'activity_id',
      as: 'activity_mentors',
      isArray: true,
    },
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Remove MongoDB _id and optionally inject an `id` field from it */
function normalizeDoc(doc: any): any {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  // Only inject `id` from `_id` when no `id` field exists in the document
  if (_id !== undefined && rest.id === undefined) {
    return { id: _id.toString(), ...rest };
  }
  return rest;
}

/** Split a Supabase select string by top-level commas (ignoring commas inside parentheses) */
function splitTopLevel(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of str) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current);
  return result;
}

/** Parse a Supabase select string into scalar fields and join descriptors */
function parseSelect(selectStr: string): {
  fields: string[];
  joins: Array<{ alias: string; fields: string[]; subJoins: Array<{ alias: string; fields: string[] }>; isAll: boolean }>;
  selectAll: boolean;
} {
  if (!selectStr || selectStr.trim() === '*') {
    return { fields: [], joins: [], selectAll: true };
  }

  const parts = splitTopLevel(selectStr.trim());
  const fields: string[] = [];
  const joins: any[] = [];
  let selectAll = false;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed === '*') { selectAll = true; continue; }

    const parenIdx = trimmed.indexOf('(');
    if (parenIdx !== -1) {
      const alias = trimmed.substring(0, parenIdx).trim();
      const inner = trimmed.substring(parenIdx + 1, trimmed.lastIndexOf(')')).trim();
      const innerParts = splitTopLevel(inner);

      const joinFields: string[] = [];
      const subJoins: any[] = [];

      for (const ip of innerParts) {
        const it = ip.trim();
        if (!it || it === '*') continue;
        const iparenIdx = it.indexOf('(');
        if (iparenIdx !== -1) {
          const subAlias = it.substring(0, iparenIdx).trim();
          const subInner = it.substring(iparenIdx + 1, it.lastIndexOf(')')).trim();
          subJoins.push({
            alias: subAlias,
            fields: subInner === '*' ? [] : subInner.split(',').map((f: string) => f.trim()).filter(Boolean),
            isAll: subInner === '*' || subInner === '',
          });
        } else {
          joinFields.push(it);
        }
      }

      joins.push({ alias, fields: joinFields, subJoins, isAll: inner === '*' || inner === '' });
    } else {
      fields.push(trimmed);
    }
  }

  return { fields, joins, selectAll };
}

// ─── Query Builder ─────────────────────────────────────────────────────────

type FilterEntry = { type: string; column?: string; value: any };

export class MongoQueryBuilder {
  readonly collection: string;

  _selectStr: string = '*';
  _selectOptions: any = {};
  _filters: FilterEntry[] = [];
  _sort: Record<string, 1 | -1> = {};
  _limit: number | null = null;
  _skip: number = 0;
  _rangeEnd: number | null = null;
  _single: boolean = false;
  _maybeSingle: boolean = false;

  _insertPayload: any = null;
  _updatePayload: any = null;
  _deleteMode: boolean = false;
  _upsertPayload: any = null;
  _upsertConflict: string | null = null;

  constructor(collection: string) {
    this.collection = collection;
  }

  select(columns: string = '*', options?: any): this {
    this._selectStr = columns;
    if (options) this._selectOptions = options;
    return this;
  }

  eq(column: string, value: any): this {
    this._filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any): this {
    this._filters.push({ type: 'neq', column, value });
    return this;
  }

  ilike(column: string, value: any): this {
    this._filters.push({ type: 'ilike', column, value });
    return this;
  }

  in(column: string, values: any[]): this {
    this._filters.push({ type: 'in', column, value: values });
    return this;
  }

  or(filterStr: string): this {
    this._filters.push({ type: 'or', value: filterStr });
    return this;
  }

  match(filters: Record<string, any>): this {
    for (const [col, val] of Object.entries(filters)) {
      this._filters.push({ type: 'eq', column: col, value: val });
    }
    return this;
  }

  order(column: string, config: { ascending?: boolean } = {}): this {
    this._sort[column] = config.ascending === false ? -1 : 1;
    return this;
  }

  range(from: number, to: number): this {
    this._skip = from;
    this._rangeEnd = to;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  /** Used by API route to set skip independently */
  skip(n: number): this {
    this._skip = n;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this._single = true;
    return this._run();
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this._maybeSingle = true;
    return this._run();
  }

  insert(payload: any): this {
    this._insertPayload = payload;
    return this;
  }

  update(payload: any): this {
    this._updatePayload = payload;
    return this;
  }

  delete(): this {
    this._deleteMode = true;
    return this;
  }

  upsert(payload: any, config?: { onConflict?: string }): this {
    this._upsertPayload = payload;
    this._upsertConflict = config?.onConflict || null;
    return this;
  }

  /** Allows `await builder` without .single() / .maybeSingle() */
  then(
    resolve: (value: { data: any; error: any; count?: number }) => void,
    reject: (reason: any) => void
  ) {
    return this._run().then(resolve, reject);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  buildFilter(): Record<string, any> {
    const base: Record<string, any> = {};
    const orParts: any[] = [];

    for (const f of this._filters) {
      if (f.type === 'eq') {
        base[f.column!] = f.value;
      } else if (f.type === 'neq') {
        base[f.column!] = { $ne: f.value };
      } else if (f.type === 'ilike') {
        // Supabase ilike uses SQL LIKE patterns: %value%
        const pattern = '^' + String(f.value)
          .split('%').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*') + '$';
        base[f.column!] = { $regex: pattern, $options: 'i' };
      } else if (f.type === 'in') {
        base[f.column!] = { $in: f.value };
      } else if (f.type === 'or') {
        // Parses "col.is.null,col.gt.value" format
        const segments = String(f.value).split(',');
        for (const seg of segments) {
          const s = seg.trim();
          if (s.includes('.eq.')) {
            const idx = s.indexOf('.eq.');
            orParts.push({ [s.substring(0, idx)]: s.substring(idx + 4) });
          } else if (s.includes('.is.null')) {
            const col = s.replace('.is.null', '').trim();
            orParts.push({ [col]: null });
          } else if (s.includes('.gt.')) {
            const idx = s.indexOf('.gt.');
            orParts.push({ [s.substring(0, idx)]: { $gt: s.substring(idx + 4) } });
          } else if (s.includes('.gte.')) {
            const idx = s.indexOf('.gte.');
            orParts.push({ [s.substring(0, idx)]: { $gte: s.substring(idx + 5) } });
          } else if (s.includes('.lt.')) {
            const idx = s.indexOf('.lt.');
            orParts.push({ [s.substring(0, idx)]: { $lt: s.substring(idx + 4) } });
          }
        }
      }
    }

    if (orParts.length > 0) {
      return { ...base, $or: orParts };
    }
    return base;
  }

  async _run(): Promise<{ data: any; error: any; count?: number }> {
    try {
      const db = await getDb();
      const coll = db.collection(this.collection);

      if (this._insertPayload !== null) return await this._doInsert(coll);
      if (this._updatePayload !== null) return await this._doUpdate(coll);
      if (this._deleteMode) return await this._doDelete(coll);
      if (this._upsertPayload !== null) return await this._doUpsert(coll);
      return await this._doSelect(coll);
    } catch (err: any) {
      console.error(`[MongoAdapter] Error on "${this.collection}":`, err.message);
      return { data: null, error: { message: err.message } };
    }
  }

  private async _doSelect(coll: any): Promise<{ data: any; error: any; count?: number }> {
    const filter = this.buildFilter();
    const parsed = parseSelect(this._selectStr);

    if (parsed.joins.length > 0) {
      return this._doSelectWithJoins(coll, filter, parsed);
    }

    // Build projection
    let projection: Record<string, number> | null = null;
    if (!parsed.selectAll && parsed.fields.length > 0) {
      projection = { _id: 0 };
      for (const f of parsed.fields) projection[f] = 1;
    }

    let count: number | undefined;
    if (this._selectOptions?.count === 'exact') {
      count = await coll.countDocuments(filter);
    }

    let cursor = coll.find(filter);
    if (projection) cursor = cursor.project(projection);
    if (Object.keys(this._sort).length > 0) cursor = cursor.sort(this._sort);
    if (this._skip > 0) cursor = cursor.skip(this._skip);

    if (this._rangeEnd !== null) {
      cursor = cursor.limit(this._rangeEnd - this._skip + 1);
    } else if (this._limit !== null) {
      cursor = cursor.limit(this._limit);
    }

    if (this._single || this._maybeSingle) {
      const doc = await cursor.next();
      if (!doc && this._single) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      }
      return { data: normalizeDoc(doc), error: null };
    }

    const docs = await cursor.toArray();
    const result: any = { data: docs.map(normalizeDoc), error: null };
    if (count !== undefined) result.count = count;
    return result;
  }

  private async _doSelectWithJoins(
    coll: any,
    filter: Record<string, any>,
    parsed: ReturnType<typeof parseSelect>
  ): Promise<{ data: any; error: any }> {
    const pipeline: any[] = [];

    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }

    const collJoins = JOIN_RELATIONS[this.collection] || [];

    for (const join of parsed.joins) {
      const rel = collJoins.find(r => r.as === join.alias);
      if (!rel) {
        console.warn(`[MongoAdapter] No join found for "${join.alias}" on "${this.collection}"`);
        continue;
      }

      // Build nested pipeline for sub-joins
      const subPipeline: any[] = [];
      for (const subJoin of join.subJoins || []) {
        const subCollJoins = JOIN_RELATIONS[rel.from] || [];
        const subRel = subCollJoins.find(r => r.as === subJoin.alias);
        if (!subRel) continue;

        subPipeline.push({
          $lookup: {
            from: subRel.from,
            localField: subRel.localField,
            foreignField: subRel.foreignField,
            as: subRel.as,
          },
        });
        // Sub-joins that are to-many stay as arrays; to-one get unwrapped
        if (!subRel.isArray) {
          subPipeline.push({ $addFields: { [subRel.as]: { $first: `$${subRel.as}` } } });
        }
      }

      const lookupStage: any = {
        $lookup: {
          from: rel.from,
          localField: rel.localField,
          foreignField: rel.foreignField,
          as: rel.as,
        },
      };
      if (subPipeline.length > 0) lookupStage.$lookup.pipeline = subPipeline;
      pipeline.push(lookupStage);

      // Unwrap many-to-one joins to a single object
      if (!rel.isArray) {
        pipeline.push({ $addFields: { [rel.as]: { $first: `$${rel.as}` } } });
      }
    }

    if (Object.keys(this._sort).length > 0) pipeline.push({ $sort: this._sort });
    if (this._skip > 0) pipeline.push({ $skip: this._skip });
    if (this._limit !== null) pipeline.push({ $limit: this._limit });

    // Strip MongoDB internal _id
    pipeline.push({ $project: { _id: 0 } });

    const docs = await coll.aggregate(pipeline).toArray();
    const normalized = docs.map(normalizeDoc);

    if (this._single || this._maybeSingle) {
      if (!normalized[0] && this._single) {
        return { data: null, error: { message: 'Row not found' } };
      }
      return { data: normalized[0] || null, error: null };
    }

    return { data: normalized, error: null };
  }

  private async _doInsert(coll: any): Promise<{ data: any; error: any }> {
    const docs: any[] = Array.isArray(this._insertPayload)
      ? this._insertPayload
      : [this._insertPayload];

    // Auto-generate custom ID field if needed
    const idField = CUSTOM_ID_FIELD[this.collection];
    for (const doc of docs) {
      if (idField && !doc[idField]) doc[idField] = generateId();
      // SQL supplied this default before the MongoDB migration.
      if (idField && !doc.created_at) doc.created_at = new Date().toISOString();
    }

    if (docs.length === 1) {
      const result = await coll.insertOne({ ...docs[0] });
      const inserted = normalizeDoc({ ...docs[0], _id: result.insertedId });
      return { data: this._single ? inserted : [inserted], error: null };
    }

    await coll.insertMany(docs.map((d: any) => ({ ...d })));
    return { data: docs.map(normalizeDoc), error: null };
  }

  private async _doUpdate(coll: any): Promise<{ data: any; error: any }> {
    const filter = this.buildFilter();
    await coll.updateMany(filter, { $set: this._updatePayload });
    return { data: null, error: null };
  }

  private async _doDelete(coll: any): Promise<{ data: any; error: any }> {
    const filter = this.buildFilter();
    const result = await coll.deleteMany(filter);
    return { data: { count: result.deletedCount }, error: null };
  }

  private async _doUpsert(coll: any): Promise<{ data: any; error: any }> {
    const docs: any[] = Array.isArray(this._upsertPayload)
      ? this._upsertPayload
      : [this._upsertPayload];

    const idField = CUSTOM_ID_FIELD[this.collection];

    for (const doc of docs) {
      if (idField && !doc[idField]) doc[idField] = generateId();

      let conflictFilter: Record<string, any> = {};
      if (this._upsertConflict) {
        const keys = this._upsertConflict.split(',').map((k: string) => k.trim());
        for (const k of keys) {
          if (doc[k] !== undefined) conflictFilter[k] = doc[k];
        }
      }

      if (Object.keys(conflictFilter).length > 0) {
        await coll.replaceOne(conflictFilter, { ...doc }, { upsert: true });
      } else {
        await coll.insertOne({ ...doc });
      }
    }

    return { data: null, error: null };
  }
}

// ─── Storage Stub ──────────────────────────────────────────────────────────
// MongoDB is not a file-store. This stub prevents crashes if storage is called.
const storageSub = {
  storage: {
    from: (_bucket: string) => ({
      upload: async (_path: string, _file: any) => {
        console.warn('[MongoAdapter] File storage is not supported with MongoDB. Skipping upload.');
        return { data: null, error: { message: 'File storage not supported in MongoDB mode.' } };
      },
      getPublicUrl: (_path: string) => {
        return { data: { publicUrl: '' } };
      },
    }),
  },
};

// ─── Factory ───────────────────────────────────────────────────────────────

export function createAdapter() {
  return {
    from: (collection: string) => new MongoQueryBuilder(collection),
    ...storageSub,
  };
}
