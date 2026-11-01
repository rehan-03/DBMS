// Client-side MongoDB adapter.
// Since MongoDB cannot run in the browser, this thin wrapper calls the
// /api/mongo Next.js API route and returns the same { data, error } shape
// that Supabase clients produce — so every existing client component works unchanged.

type FilterEntry = { type: string; column?: string; value: any };
type SortEntry = { column: string; ascending: boolean };

const pendingReads = new Map<string, Promise<{ data: any; error: any; count?: number }>>();

class ClientQueryBuilder {
  private _collection: string;
  private _selectStr: string = '*';
  private _selectOptions: any = {};
  private _filters: FilterEntry[] = [];
  private _sort: SortEntry[] = [];
  private _limit: number | null = null;
  private _skip: number = 0;
  private _rangeEnd: number | null = null;
  private _single: boolean = false;
  private _maybeSingle: boolean = false;

  constructor(collection: string) {
    this._collection = collection;
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
    this._sort.push({ column, ascending: config.ascending !== false });
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

  single(): Promise<{ data: any; error: any }> {
    this._single = true;
    return this._fetch();
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this._maybeSingle = true;
    return this._fetch();
  }

  // Write operations should use server actions instead.
  // These stubs prevent crashes if called accidentally.
  insert(_payload: any): this {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[ClientAdapter] insert() called on client — use a server action instead.');
    }
    return this;
  }
  update(_payload: any): this { return this; }
  delete(): this { return this; }
  upsert(_payload: any, _config?: any): this { return this; }

  /** Allows `await builder` without .single() / .maybeSingle() */
  then(
    resolve: (value: { data: any; error: any; count?: number }) => void,
    reject: (reason: any) => void
  ) {
    return this._fetch().then(resolve, reject);
  }

  private async _fetch(): Promise<{ data: any; error: any; count?: number }> {
    const body = JSON.stringify({
      collection: this._collection, select: this._selectStr,
      selectOptions: this._selectOptions, filters: this._filters,
      sort: this._sort, limit: this._limit, skip: this._skip,
      rangeEnd: this._rangeEnd, single: this._single, maybeSingle: this._maybeSingle,
    });
    let pending = pendingReads.get(body);
    if (!pending) {
      pending = fetch('/api/mongo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) return { data: null, error: {
          message: typeof result.error === 'string' ? result.error : result.error?.message || 'Could not load this data.',
        } };
        return result;
      }).catch((error: Error) => ({ data: null, error: { message: error.message } }))
        .finally(() => { pendingReads.delete(body); });
      pendingReads.set(body, pending);
    }
    return pending;
  }
}

// ─── Storage stub (client-side) ─────────────────────────────────────────────
const storageStub = {
  storage: {
    from: (_bucket: string) => ({
      upload: async (_path: string, _file: any) => {
        console.warn('[ClientAdapter] File storage is not supported with MongoDB.');
        return { data: null, error: { message: 'File storage not supported.' } };
      },
      getPublicUrl: (_path: string) => ({ data: { publicUrl: '' } }),
    }),
  },
};

export const supabase = {
  from: (collection: string) => new ClientQueryBuilder(collection),
  ...storageStub,
};
