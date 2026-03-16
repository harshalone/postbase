import type {
  PostbaseClient,
  QueryBuilder,
  QueryResult,
  SingleResult,
  AuthClient,
  StorageClient,
  StorageBucketClient,
  Session,
  AuthUser,
  Filter,
  FilterOperator,
} from "./types";

// ─── Query Builder ────────────────────────────────────────────────────────────

class QueryBuilderImpl<T> implements QueryBuilder<T> {
  private _columns: string[] = [];
  private _filters: Filter[] = [];
  private _order?: { column: string; ascending?: boolean };
  private _limit?: number;
  private _offset?: number;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private table: string
  ) {}

  private clone(): QueryBuilderImpl<T> {
    const q = new QueryBuilderImpl<T>(this.baseUrl, this.apiKey, this.table);
    q._columns = [...this._columns];
    q._filters = [...this._filters];
    q._order = this._order;
    q._limit = this._limit;
    q._offset = this._offset;
    return q;
  }

  select(...columns: string[]): QueryBuilder<T> {
    const q = this.clone();
    q._columns = columns;
    return q;
  }

  private addFilter(column: string, operator: FilterOperator, value: unknown): QueryBuilder<T> {
    const q = this.clone();
    q._filters = [...q._filters, { column, operator, value }];
    return q;
  }

  eq(column: string, value: unknown) { return this.addFilter(column, "eq", value); }
  neq(column: string, value: unknown) { return this.addFilter(column, "neq", value); }
  gt(column: string, value: unknown) { return this.addFilter(column, "gt", value); }
  gte(column: string, value: unknown) { return this.addFilter(column, "gte", value); }
  lt(column: string, value: unknown) { return this.addFilter(column, "lt", value); }
  lte(column: string, value: unknown) { return this.addFilter(column, "lte", value); }
  like(column: string, pattern: string) { return this.addFilter(column, "like", pattern); }
  in(column: string, values: unknown[]) { return this.addFilter(column, "in", values); }
  is(column: string, value: null | "not null") { return this.addFilter(column, "is", value); }

  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T> {
    const q = this.clone();
    q._order = { column, ascending: options?.ascending };
    return q;
  }

  limit(count: number): QueryBuilder<T> {
    const q = this.clone();
    q._limit = count;
    return q;
  }

  offset(count: number): QueryBuilder<T> {
    const q = this.clone();
    q._offset = count;
    return q;
  }

  private async executeSelect(): Promise<QueryResult<T>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          operation: "select",
          table: this.table,
          columns: this._columns.length > 0 ? this._columns : undefined,
          filters: this._filters.length > 0 ? this._filters : undefined,
          order: this._order,
          limit: this._limit,
          offset: this._offset,
        }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Query failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }

  // Make the builder thenable so you can `await postbase.from('x').eq('id', 1)`
  get then() {
    return this.executeSelect().then.bind(this.executeSelect());
  }

  insert(data: Partial<T>) {
    return new InsertBuilderImpl<T>(this.baseUrl, this.apiKey, this.table, data);
  }

  update(data: Partial<T>) {
    return new UpdateBuilderImpl<T>(this.baseUrl, this.apiKey, this.table, data, this._filters);
  }

  delete() {
    return new DeleteBuilderImpl<T>(this.baseUrl, this.apiKey, this.table, this._filters);
  }
}

class InsertBuilderImpl<T> {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private table: string,
    private data: Partial<T>
  ) {}

  async returning(...columns: string[]): Promise<QueryResult<T>> {
    return this.execute(columns);
  }

  private async execute(returning?: string[]): Promise<QueryResult<T>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          operation: "insert",
          table: this.table,
          data: this.data,
          returning,
        }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Insert failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }

  get then() { return this.execute().then.bind(this.execute()); }
}

class UpdateBuilderImpl<T> {
  private _filters: Filter[];

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private table: string,
    private data: Partial<T>,
    filters: Filter[]
  ) {
    this._filters = [...filters];
  }

  eq(column: string, value: unknown): UpdateBuilderImpl<T> {
    const u = new UpdateBuilderImpl<T>(this.baseUrl, this.apiKey, this.table, this.data, this._filters);
    u._filters = [...this._filters, { column, operator: "eq", value }];
    return u;
  }

  async returning(...columns: string[]): Promise<QueryResult<T>> {
    return this.execute(columns);
  }

  private async execute(returning?: string[]): Promise<QueryResult<T>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          operation: "update",
          table: this.table,
          data: this.data,
          filters: this._filters,
          returning,
        }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Update failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }

  get then() { return this.execute().then.bind(this.execute()); }
}

class DeleteBuilderImpl<T> {
  private _filters: Filter[];

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private table: string,
    filters: Filter[]
  ) {
    this._filters = [...filters];
  }

  eq(column: string, value: unknown): DeleteBuilderImpl<T> {
    const d = new DeleteBuilderImpl<T>(this.baseUrl, this.apiKey, this.table, this._filters);
    d._filters = [...this._filters, { column, operator: "eq", value }];
    return d;
  }

  async returning(...columns: string[]): Promise<QueryResult<T>> {
    return this.execute(columns);
  }

  private async execute(returning?: string[]): Promise<QueryResult<T>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          operation: "delete",
          table: this.table,
          filters: this._filters,
          returning,
        }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Delete failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }

  get then() { return this.execute().then.bind(this.execute()); }
}

// ─── Auth Client ──────────────────────────────────────────────────────────────

function createAuthClient(baseUrl: string, apiKey: string): AuthClient {
  const listeners: Array<(session: Session | null) => void> = [];

  return {
    async signIn(provider, options) {
      if (typeof window === "undefined") return;
      const callbackUrl = options?.callbackUrl ?? window.location.href;
      window.location.href = `${baseUrl}/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    },

    async signOut(options) {
      if (typeof window === "undefined") return;
      const callbackUrl = options?.callbackUrl ?? window.location.href;
      await fetch(`${baseUrl}/api/auth/signout`, { method: "POST" });
      listeners.forEach((fn) => fn(null));
      window.location.href = callbackUrl;
    },

    async signUp(email, password): Promise<SingleResult<AuthUser>> {
      try {
        const res = await fetch(`${baseUrl}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Sign up failed" };
        return { data: json.user, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },

    async getSession(): Promise<Session | null> {
      try {
        const res = await fetch(`${baseUrl}/api/auth/session`);
        if (!res.ok) return null;
        const json = await res.json();
        return json?.user ? json : null;
      } catch {
        return null;
      }
    },

    onAuthStateChange(callback) {
      listeners.push(callback);
      // Poll session every 30s (replace with SSE/websocket for realtime)
      const interval = setInterval(async () => {
        const session = await this.getSession();
        callback(session);
      }, 30_000);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx > -1) listeners.splice(idx, 1);
        clearInterval(interval);
      };
    },
  };
}

// ─── Storage Client ───────────────────────────────────────────────────────────

function createStorageClient(baseUrl: string, apiKey: string): StorageClient {
  const headers = { Authorization: `Bearer ${apiKey}` };

  function bucketClient(bucket: string): StorageBucketClient {
    return {
      async upload(path, file, options) {
        try {
          const form = new FormData();
          form.append("file", file as Blob);
          form.append("path", path);
          if (options?.upsert) form.append("upsert", "true");
          const res = await fetch(`${baseUrl}/api/storage/${bucket}/upload`, {
            method: "POST",
            headers,
            body: form,
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: json.error ?? "Upload failed" };
          return { data: { path }, error: null };
        } catch (err) {
          return { data: null, error: String(err) };
        }
      },

      async download(path) {
        try {
          const res = await fetch(
            `${baseUrl}/api/storage/${bucket}/object/${encodeURIComponent(path)}`,
            { headers }
          );
          if (!res.ok) return { data: null, error: "Download failed" };
          return { data: await res.blob(), error: null };
        } catch (err) {
          return { data: null, error: String(err) };
        }
      },

      async remove(paths) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/${bucket}/objects`, {
            method: "DELETE",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
          });
          const json = await res.json();
          if (!res.ok) return { data: null, count: null, error: json.error ?? "Delete failed" };
          return { data: json.data, count: json.count, error: null };
        } catch (err) {
          return { data: null, count: null, error: String(err) };
        }
      },

      async list(prefix) {
        try {
          const url = new URL(`${baseUrl}/api/storage/${bucket}/list`);
          if (prefix) url.searchParams.set("prefix", prefix);
          const res = await fetch(url.toString(), { headers });
          const json = await res.json();
          if (!res.ok) return { data: null, count: null, error: json.error ?? "List failed" };
          return { data: json.data, count: json.count, error: null };
        } catch (err) {
          return { data: null, count: null, error: String(err) };
        }
      },

      getPublicUrl(path) {
        return `${baseUrl}/api/storage/${bucket}/public/${encodeURIComponent(path)}`;
      },
    };
  }

  return {
    from: bucketClient,

    async createBucket(name, options) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/buckets`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name, public: options?.public ?? false }),
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Create failed" };
        return { data: { name }, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },

    async listBuckets() {
      try {
        const res = await fetch(`${baseUrl}/api/storage/buckets`, { headers });
        const json = await res.json();
        if (!res.ok) return { data: null, count: null, error: json.error ?? "List failed" };
        return { data: json.data, count: json.count, error: null };
      } catch (err) {
        return { data: null, count: null, error: String(err) };
      }
    },
  };
}

// ─── Main factory ─────────────────────────────────────────────────────────────

export function createClient(url: string, key: string): PostbaseClient {
  const baseUrl = url.replace(/\/$/, "");

  return {
    url: baseUrl,
    key,
    auth: createAuthClient(baseUrl, key),
    from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
      return new QueryBuilderImpl<T>(baseUrl, key, table);
    },
    storage: createStorageClient(baseUrl, key),
  };
}
