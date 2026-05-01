var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createClient: () => createClient
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var QueryBuilderImpl = class _QueryBuilderImpl {
  constructor(baseUrl, apiKey, table) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.table = table;
  }
  _columns = [];
  _filters = [];
  _order;
  _limit;
  _offset;
  clone() {
    const q = new _QueryBuilderImpl(this.baseUrl, this.apiKey, this.table);
    q._columns = [...this._columns];
    q._filters = [...this._filters];
    q._order = this._order;
    q._limit = this._limit;
    q._offset = this._offset;
    return q;
  }
  select(...columns) {
    const q = this.clone();
    q._columns = columns;
    return q;
  }
  addFilter(column, operator, value) {
    const q = this.clone();
    q._filters = [...q._filters, { column, operator, value }];
    return q;
  }
  eq(column, value) {
    return this.addFilter(column, "eq", value);
  }
  neq(column, value) {
    return this.addFilter(column, "neq", value);
  }
  gt(column, value) {
    return this.addFilter(column, "gt", value);
  }
  gte(column, value) {
    return this.addFilter(column, "gte", value);
  }
  lt(column, value) {
    return this.addFilter(column, "lt", value);
  }
  lte(column, value) {
    return this.addFilter(column, "lte", value);
  }
  like(column, pattern) {
    return this.addFilter(column, "like", pattern);
  }
  in(column, values) {
    return this.addFilter(column, "in", values);
  }
  is(column, value) {
    return this.addFilter(column, "is", value);
  }
  order(column, options) {
    const q = this.clone();
    q._order = { column, ascending: options == null ? void 0 : options.ascending };
    return q;
  }
  limit(count) {
    const q = this.clone();
    q._limit = count;
    return q;
  }
  offset(count) {
    const q = this.clone();
    q._offset = count;
    return q;
  }
  async executeSelect() {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          operation: "select",
          table: this.table,
          columns: this._columns.length > 0 ? this._columns : void 0,
          filters: this._filters.length > 0 ? this._filters : void 0,
          order: this._order,
          limit: this._limit,
          offset: this._offset
        })
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
  insert(data) {
    return new InsertBuilderImpl(this.baseUrl, this.apiKey, this.table, data);
  }
  update(data) {
    return new UpdateBuilderImpl(this.baseUrl, this.apiKey, this.table, data, this._filters);
  }
  delete() {
    return new DeleteBuilderImpl(this.baseUrl, this.apiKey, this.table, this._filters);
  }
};
var InsertBuilderImpl = class {
  constructor(baseUrl, apiKey, table, data) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.table = table;
    this.data = data;
  }
  async returning(...columns) {
    return this.execute(columns);
  }
  async execute(returning) {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          operation: "insert",
          table: this.table,
          data: this.data,
          returning
        })
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Insert failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }
  get then() {
    return this.execute().then.bind(this.execute());
  }
};
var UpdateBuilderImpl = class _UpdateBuilderImpl {
  constructor(baseUrl, apiKey, table, data, filters) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.table = table;
    this.data = data;
    this._filters = [...filters];
  }
  _filters;
  eq(column, value) {
    const u = new _UpdateBuilderImpl(this.baseUrl, this.apiKey, this.table, this.data, this._filters);
    u._filters = [...this._filters, { column, operator: "eq", value }];
    return u;
  }
  async returning(...columns) {
    return this.execute(columns);
  }
  async execute(returning) {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          operation: "update",
          table: this.table,
          data: this.data,
          filters: this._filters,
          returning
        })
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Update failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }
  get then() {
    return this.execute().then.bind(this.execute());
  }
};
var DeleteBuilderImpl = class _DeleteBuilderImpl {
  constructor(baseUrl, apiKey, table, filters) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.table = table;
    this._filters = [...filters];
  }
  _filters;
  eq(column, value) {
    const d = new _DeleteBuilderImpl(this.baseUrl, this.apiKey, this.table, this._filters);
    d._filters = [...this._filters, { column, operator: "eq", value }];
    return d;
  }
  async returning(...columns) {
    return this.execute(columns);
  }
  async execute(returning) {
    try {
      const res = await fetch(`${this.baseUrl}/api/db/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          operation: "delete",
          table: this.table,
          filters: this._filters,
          returning
        })
      });
      const json = await res.json();
      if (!res.ok) return { data: null, count: null, error: json.error ?? "Delete failed" };
      return { data: json.data, count: json.count, error: null };
    } catch (err) {
      return { data: null, count: null, error: String(err) };
    }
  }
  get then() {
    return this.execute().then.bind(this.execute());
  }
};
function createAuthClient(baseUrl, apiKey) {
  const listeners = [];
  return {
    async signIn(provider, options) {
      if (typeof window === "undefined") return;
      const callbackUrl = (options == null ? void 0 : options.callbackUrl) ?? window.location.href;
      window.location.href = `${baseUrl}/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    },
    async signOut(options) {
      if (typeof window === "undefined") return;
      const callbackUrl = (options == null ? void 0 : options.callbackUrl) ?? window.location.href;
      await fetch(`${baseUrl}/api/auth/signout`, { method: "POST" });
      listeners.forEach((fn) => fn(null));
      window.location.href = callbackUrl;
    },
    async signUp(email, password) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ email, password })
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Sign up failed" };
        return { data: json.user, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
    async getSession() {
      try {
        const res = await fetch(`${baseUrl}/api/auth/session`);
        if (!res.ok) return null;
        const json = await res.json();
        return (json == null ? void 0 : json.user) ? json : null;
      } catch {
        return null;
      }
    },
    onAuthStateChange(callback) {
      listeners.push(callback);
      const interval = setInterval(async () => {
        const session = await this.getSession();
        callback(session);
      }, 3e4);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx > -1) listeners.splice(idx, 1);
        clearInterval(interval);
      };
    }
  };
}
function createStorageClient(baseUrl, apiKey) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  function bucketClient(bucket) {
    return {
      async upload(path, file, options) {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("path", path);
          if (options == null ? void 0 : options.upsert) form.append("upsert", "true");
          const res = await fetch(`${baseUrl}/api/storage/${bucket}/upload`, {
            method: "POST",
            headers,
            body: form
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
            body: JSON.stringify({ paths })
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
      }
    };
  }
  return {
    from: bucketClient,
    async createBucket(name, options) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/buckets`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name, public: (options == null ? void 0 : options.public) ?? false })
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
    }
  };
}
function createClient(url, key) {
  const baseUrl = url.replace(/\/$/, "");
  return {
    url: baseUrl,
    key,
    auth: createAuthClient(baseUrl, key),
    from(table) {
      return new QueryBuilderImpl(baseUrl, key, table);
    },
    storage: createStorageClient(baseUrl, key)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createClient
});
