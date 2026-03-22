"use strict";
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
var src_exports = {};
__export(src_exports, {
  createClient: () => createClient
});
module.exports = __toCommonJS(src_exports);

// src/client.ts
var SESSION_STORAGE_KEY = "postbase_session";
function getStorageKey(options) {
  return options?.auth?.storageKey ?? SESSION_STORAGE_KEY;
}
function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
async function executeQuery(state) {
  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.apiKey}`,
      ...state.customHeaders
    };
    if (state.cookieAdapter) {
      const cookies = await state.cookieAdapter.getAll();
      const sessionCookie = cookies.find((c) => c.name.startsWith("postbase-session") || c.name === "next-auth.session-token" || c.name === "__Secure-next-auth.session-token");
      if (sessionCookie) {
        headers["X-Postbase-Session"] = sessionCookie.value;
      }
    }
    const body = {
      operation: state.operation === "upsert" ? "upsert" : state.operation,
      table: state.table
    };
    if (state.operation === "select") {
      if (state.columns && state.columns !== "*") {
        body.columns = state.columns.split(",").map((c) => c.trim());
      }
      body.count = state.selectOptions.count;
      body.head = state.selectOptions.head;
    }
    if (["select", "update", "delete"].includes(state.operation)) {
      const filters = [...state.filters];
      if (filters.length) body.filters = filters;
      if (state.orFilters.length) body.orFilters = state.orFilters;
      if (state.notFilters.length) body.notFilters = state.notFilters;
    }
    if (state.operation === "insert" || state.operation === "upsert") {
      body.data = state.insertData;
      if (state.upsertOnConflict) body.onConflict = state.upsertOnConflict;
    }
    if (state.operation === "update") {
      body.data = state.updateData;
    }
    if (state.orderBy.length) body.order = state.orderBy;
    if (state._limit !== void 0) body.limit = state._limit;
    if (state._offset !== void 0) body.offset = state._offset;
    if (state._range) body.range = state._range;
    if (state.returning) body.returning = state.returning;
    const res = await fetch(`${state.baseUrl}/api/db/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) return { data: null, count: null, error: json.error ?? "Query failed" };
    return { data: json.data, count: json.count ?? null, error: null };
  } catch (err) {
    return { data: null, count: null, error: String(err) };
  }
}
var QueryBuilderImpl = class _QueryBuilderImpl {
  constructor(state) {
    this.state = state;
  }
  clone(patch) {
    return new _QueryBuilderImpl({ ...this.state, ...patch });
  }
  select(columns = "*", options = {}) {
    return this.clone({ columns, selectOptions: options, operation: "select" });
  }
  addFilter(column, operator, value) {
    return this.clone({ filters: [...this.state.filters, { column, operator, value }] });
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
  ilike(column, pattern) {
    return this.addFilter(column, "ilike", pattern);
  }
  in(column, values) {
    return this.addFilter(column, "in", values);
  }
  is(column, value) {
    return this.addFilter(column, "is", value);
  }
  contains(column, value) {
    return this.addFilter(column, "contains", value);
  }
  overlaps(column, value) {
    return this.addFilter(column, "overlaps", value);
  }
  textSearch(column, query, options) {
    return this.addFilter(column, "textSearch", { query, config: options?.config });
  }
  or(filters) {
    return this.clone({ orFilters: [...this.state.orFilters, filters] });
  }
  not(column, operator, value) {
    return this.clone({ notFilters: [...this.state.notFilters, { column, operator, value }] });
  }
  order(column, options) {
    return this.clone({
      orderBy: [...this.state.orderBy, { column, ascending: options?.ascending, nullsFirst: options?.nullsFirst }]
    });
  }
  limit(count) {
    return this.clone({ _limit: count });
  }
  offset(count) {
    return this.clone({ _offset: count });
  }
  range(from, to) {
    return this.clone({ _range: { from, to }, _limit: to - from + 1, _offset: from });
  }
  insert(data, options) {
    return new InsertBuilderImpl({
      ...this.state,
      operation: "insert",
      insertData: data,
      returning: options?.returning ?? "*"
    });
  }
  upsert(data, options) {
    return new InsertBuilderImpl({
      ...this.state,
      operation: "upsert",
      insertData: data,
      upsertOnConflict: options?.onConflict,
      returning: options?.returning ?? "*"
    });
  }
  update(data) {
    return new UpdateBuilderImpl({
      ...this.state,
      operation: "update",
      updateData: data,
      returning: "*"
    });
  }
  delete() {
    return new DeleteBuilderImpl({
      ...this.state,
      operation: "delete",
      returning: "*"
    });
  }
  async single() {
    const result = await executeQuery(this.clone({ _limit: 1 }).state);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    if (rows.length === 0) return { data: null, error: "No rows returned" };
    if (rows.length > 1) return { data: null, error: "Multiple rows returned" };
    return { data: rows[0], error: null };
  }
  async maybeSingle() {
    const result = await executeQuery(this.clone({ _limit: 1 }).state);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    return { data: rows[0] ?? null, error: null };
  }
  // Thenable — make the builder awaitable directly
  get then() {
    const promise = executeQuery(this.state);
    return promise.then.bind(promise);
  }
};
var InsertBuilderImpl = class _InsertBuilderImpl {
  constructor(state) {
    this.state = state;
  }
  select(columns = "*") {
    return new _InsertBuilderImpl({ ...this.state, returning: columns });
  }
  async single() {
    const result = await executeQuery(this.state);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    return { data: rows[0] ?? null, error: null };
  }
  get then() {
    const promise = executeQuery(this.state);
    return promise.then.bind(promise);
  }
};
var UpdateBuilderImpl = class _UpdateBuilderImpl {
  constructor(state) {
    this.state = state;
  }
  addFilter(column, operator, value) {
    return new _UpdateBuilderImpl({ ...this.state, filters: [...this.state.filters, { column, operator, value }] });
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
  in(column, values) {
    return this.addFilter(column, "in", values);
  }
  select(columns = "*") {
    return new _UpdateBuilderImpl({ ...this.state, returning: columns });
  }
  async single() {
    const result = await executeQuery(this.state);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    return { data: rows[0] ?? null, error: null };
  }
  get then() {
    const promise = executeQuery(this.state);
    return promise.then.bind(promise);
  }
};
var DeleteBuilderImpl = class _DeleteBuilderImpl {
  constructor(state) {
    this.state = state;
  }
  addFilter(column, operator, value) {
    return new _DeleteBuilderImpl({ ...this.state, filters: [...this.state.filters, { column, operator, value }] });
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
  in(column, values) {
    return this.addFilter(column, "in", values);
  }
  select(columns = "*") {
    return new _DeleteBuilderImpl({ ...this.state, returning: columns });
  }
  async single() {
    const result = await executeQuery(this.state);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    return { data: rows[0] ?? null, error: null };
  }
  get then() {
    const promise = executeQuery(this.state);
    return promise.then.bind(promise);
  }
};
function createAuthAdmin(baseUrl, apiKey, customHeaders) {
  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...customHeaders
  });
  return {
    async listUsers(options) {
      try {
        const url = new URL(`${baseUrl}/api/auth/v1/admin/users`);
        if (options?.page) url.searchParams.set("page", String(options.page));
        if (options?.perPage) url.searchParams.set("perPage", String(options.perPage));
        const res = await fetch(url.toString(), { headers: headers() });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Failed to list users" };
        return { data: { users: json.users, total: json.total }, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
    async getUserById(id) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/admin/users/${id}`, { headers: headers() });
        const json = await res.json();
        if (!res.ok) return { data: { user: null }, error: json.error ?? "User not found" };
        return { data: { user: json.user }, error: null };
      } catch (err) {
        return { data: { user: null }, error: String(err) };
      }
    },
    async createUser(options) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/admin/users`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(options)
        });
        const json = await res.json();
        if (!res.ok) return { data: { user: null }, error: json.error ?? "Failed to create user" };
        return { data: { user: json.user }, error: null };
      } catch (err) {
        return { data: { user: null }, error: String(err) };
      }
    },
    async updateUserById(id, attributes) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/admin/users/${id}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify(attributes)
        });
        const json = await res.json();
        if (!res.ok) return { data: { user: null }, error: json.error ?? "Failed to update user" };
        return { data: { user: json.user }, error: null };
      } catch (err) {
        return { data: { user: null }, error: String(err) };
      }
    },
    async deleteUser(id) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/admin/users/${id}`, {
          method: "DELETE",
          headers: headers()
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Failed to delete user" };
        return { data: null, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    }
  };
}
function createAuthClient(baseUrl, apiKey, options, cookieAdapter) {
  const storageKey = getStorageKey(options);
  const listeners = [];
  let refreshTimer = null;
  let currentSession = null;
  const customHeaders = options?.global?.headers;
  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...customHeaders
  });
  function persistSession(session) {
    if (!isBrowser()) return;
    if (options?.auth?.persistSession === false) return;
    if (session) {
      localStorage.setItem(storageKey, JSON.stringify(session));
    } else {
      localStorage.removeItem(storageKey);
    }
  }
  function loadPersistedSession() {
    if (!isBrowser()) return null;
    if (options?.auth?.persistSession === false) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (session.expiresAt && Date.now() / 1e3 > session.expiresAt) return null;
      return session;
    } catch {
      return null;
    }
  }
  function scheduleRefresh(session) {
    if (!isBrowser()) return;
    if (options?.auth?.autoRefreshToken === false) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    const expiresIn = session.expiresAt - Date.now() / 1e3;
    const refreshIn = Math.max((expiresIn - 60) * 1e3, 0);
    refreshTimer = setTimeout(async () => {
      if (session.refreshToken) {
        const result = await authClient.refreshSession(session.refreshToken);
        if (!result.error && result.data.session) {
          notifyListeners("TOKEN_REFRESHED", result.data.session);
        }
      }
    }, refreshIn);
  }
  function notifyListeners(event, session) {
    currentSession = session;
    persistSession(session);
    if (session) scheduleRefresh(session);
    listeners.forEach((fn) => fn(event, session));
  }
  const authClient = {
    async signUp({ email, password, options: signUpOptions }) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/signup`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ email, password, data: signUpOptions?.data })
        });
        const json = await res.json();
        if (!res.ok) return { data: { user: null, session: null }, error: json.error ?? "Sign up failed" };
        const session = json.session ?? null;
        const user = json.user ?? null;
        if (session) notifyListeners("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      } catch (err) {
        return { data: { user: null, session: null }, error: String(err) };
      }
    },
    async signInWithPassword({ email, password }) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/token`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ email, password, grant_type: "password" })
        });
        const json = await res.json();
        if (!res.ok) return { data: { user: null, session: null }, error: json.error ?? "Sign in failed" };
        const session = json.session;
        const user = json.user;
        notifyListeners("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      } catch (err) {
        return { data: { user: null, session: null }, error: String(err) };
      }
    },
    async signInWithOtp({ email, options: otpOptions }) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/v1/otp`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ email, redirectTo: otpOptions?.redirectTo })
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "OTP send failed" };
        return { data: null, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
    async signInWithOAuth({ provider, options: oauthOptions }) {
      if (!isBrowser()) return;
      const redirectTo = oauthOptions?.redirectTo ?? window.location.href;
      const url = new URL(`${baseUrl}/api/auth/${provider}`);
      url.searchParams.set("redirectTo", redirectTo);
      if (oauthOptions?.scopes) url.searchParams.set("scopes", oauthOptions.scopes);
      window.location.href = url.toString();
    },
    async signOut() {
      try {
        const session = currentSession ?? loadPersistedSession();
        await fetch(`${baseUrl}/api/auth/v1/logout`, {
          method: "POST",
          headers: {
            ...headers(),
            ...session ? { "X-Postbase-Token": session.accessToken } : {}
          }
        });
        if (refreshTimer) clearTimeout(refreshTimer);
        notifyListeners("SIGNED_OUT", null);
        return { error: null };
      } catch (err) {
        return { error: String(err) };
      }
    },
    async getSession() {
      try {
        if (cookieAdapter) {
          const cookies = await cookieAdapter.getAll();
          const sessionCookie = cookies.find(
            (c) => c.name.startsWith("postbase-session") || c.name === "next-auth.session-token" || c.name === "__Secure-next-auth.session-token"
          );
          if (!sessionCookie) return { data: { session: null }, error: null };
          const res2 = await fetch(`${baseUrl}/api/auth/v1/session`, {
            headers: { ...headers(), "X-Postbase-Session": sessionCookie.value }
          });
          if (!res2.ok) return { data: { session: null }, error: null };
          const json2 = await res2.json();
          return { data: { session: json2.session ?? null }, error: null };
        }
        if (isBrowser()) {
          const persisted = loadPersistedSession();
          if (persisted) {
            currentSession = persisted;
            return { data: { session: persisted }, error: null };
          }
        }
        const res = await fetch(`${baseUrl}/api/auth/v1/session`, { headers: headers() });
        if (!res.ok) return { data: { session: null }, error: null };
        const json = await res.json();
        return { data: { session: json.session ?? null }, error: null };
      } catch (err) {
        return { data: { session: null }, error: String(err) };
      }
    },
    async getUser(jwt) {
      try {
        const token = jwt ?? currentSession?.accessToken ?? loadPersistedSession()?.accessToken;
        const res = await fetch(`${baseUrl}/api/auth/v1/user`, {
          headers: {
            ...headers(),
            ...token ? { "X-Postbase-Token": token } : {}
          }
        });
        const json = await res.json();
        if (!res.ok) return { data: { user: null }, error: json.error ?? "Failed to get user" };
        return { data: { user: json.user }, error: null };
      } catch (err) {
        return { data: { user: null }, error: String(err) };
      }
    },
    async refreshSession(refreshToken) {
      try {
        const token = refreshToken ?? currentSession?.refreshToken ?? loadPersistedSession()?.refreshToken;
        const res = await fetch(`${baseUrl}/api/auth/v1/token`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ refresh_token: token, grant_type: "refresh_token" })
        });
        const json = await res.json();
        if (!res.ok) return { data: { user: null, session: null }, error: json.error ?? "Refresh failed" };
        const session = json.session;
        const user = json.user;
        notifyListeners("TOKEN_REFRESHED", session);
        return { data: { user, session }, error: null };
      } catch (err) {
        return { data: { user: null, session: null }, error: String(err) };
      }
    },
    onAuthStateChange(callback) {
      listeners.push(callback);
      const session = currentSession ?? loadPersistedSession();
      if (session) {
        setTimeout(() => callback("SIGNED_IN", session), 0);
        currentSession = session;
        scheduleRefresh(session);
      }
      return {
        data: {
          subscription: {
            unsubscribe() {
              const idx = listeners.indexOf(callback);
              if (idx > -1) listeners.splice(idx, 1);
            }
          }
        }
      };
    },
    admin: createAuthAdmin(baseUrl, apiKey, customHeaders)
  };
  return authClient;
}
function createStorageClient(baseUrl, apiKey, options) {
  const customHeaders = options?.global?.headers;
  const headers = () => ({ Authorization: `Bearer ${apiKey}`, ...customHeaders });
  function bucketClient(bucket) {
    return {
      async upload(path, file, uploadOptions) {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("path", path);
          if (uploadOptions?.upsert) form.append("upsert", "true");
          if (uploadOptions?.cacheControl) form.append("cacheControl", uploadOptions.cacheControl);
          const res = await fetch(`${baseUrl}/api/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
            method: uploadOptions?.upsert ? "PUT" : "POST",
            headers: headers(),
            body: form
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: json.error ?? "Upload failed" };
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        } catch (err) {
          return { data: null, error: String(err) };
        }
      },
      async download(path) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
            headers: headers()
          });
          if (!res.ok) return { data: null, error: "Download failed" };
          return { data: await res.blob(), error: null };
        } catch (err) {
          return { data: null, error: String(err) };
        }
      },
      async remove(paths) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/v1/object/${bucket}`, {
            method: "DELETE",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ prefixes: paths })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, count: null, error: json.error ?? "Delete failed" };
          return { data: json.data, count: json.data?.length ?? null, error: null };
        } catch (err) {
          return { data: null, count: null, error: String(err) };
        }
      },
      async list(prefix, listOptions) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/v1/object/list/${bucket}`, {
            method: "POST",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify({
              prefix: prefix ?? "",
              limit: listOptions?.limit ?? 100,
              offset: listOptions?.offset ?? 0,
              sortBy: listOptions?.sortBy
            })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, count: null, error: json.error ?? "List failed" };
          return { data: json.data, count: json.data?.length ?? null, error: null };
        } catch (err) {
          return { data: null, count: null, error: String(err) };
        }
      },
      getPublicUrl(path) {
        return {
          data: { publicUrl: `${baseUrl}/api/storage/v1/object/public/${bucket}/${encodeURIComponent(path)}` }
        };
      },
      async createSignedUrl(path, expiresIn) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/v1/object/sign/${bucket}/${encodeURIComponent(path)}`, {
            method: "POST",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ expiresIn })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: json.error ?? "Sign failed" };
          return { data: { signedUrl: `${baseUrl}${json.signedUrl}` }, error: null };
        } catch (err) {
          return { data: null, error: String(err) };
        }
      },
      async move(fromPath, toPath) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/v1/object/move`, {
            method: "POST",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ bucketId: bucket, sourceKey: fromPath, destinationKey: toPath })
          });
          const json = await res.json();
          if (!res.ok) return { error: json.error ?? "Move failed" };
          return { error: null };
        } catch (err) {
          return { error: String(err) };
        }
      },
      async copy(fromPath, toPath) {
        try {
          const res = await fetch(`${baseUrl}/api/storage/v1/object/copy`, {
            method: "POST",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ bucketId: bucket, sourceKey: fromPath, destinationKey: toPath })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: json.error ?? "Copy failed" };
          return { data: { path: toPath }, error: null };
        } catch (err) {
          return { data: null, error: String(err) };
        }
      }
    };
  }
  return {
    from: bucketClient,
    async createBucket(name, bucketOptions) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/v1/bucket`, {
          method: "POST",
          headers: { ...headers(), "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            id: name,
            public: bucketOptions?.public ?? false,
            file_size_limit: bucketOptions?.fileSizeLimit,
            allowed_mime_types: bucketOptions?.allowedMimeTypes
          })
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Create bucket failed" };
        return { data: json.data, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
    async getBucket(id) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/v1/bucket/${id}`, { headers: headers() });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Get bucket failed" };
        return { data: json.data, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
    async listBuckets() {
      try {
        const res = await fetch(`${baseUrl}/api/storage/v1/bucket`, { headers: headers() });
        const json = await res.json();
        if (!res.ok) return { data: null, count: null, error: json.error ?? "List buckets failed" };
        return { data: json.data, count: json.data?.length ?? null, error: null };
      } catch (err) {
        return { data: null, count: null, error: String(err) };
      }
    },
    async updateBucket(id, bucketOptions) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/v1/bucket/${id}`, {
          method: "PUT",
          headers: { ...headers(), "Content-Type": "application/json" },
          body: JSON.stringify({
            public: bucketOptions.public,
            file_size_limit: bucketOptions.fileSizeLimit,
            allowed_mime_types: bucketOptions.allowedMimeTypes
          })
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: json.error ?? "Update bucket failed" };
        return { data: json.data, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
    async deleteBucket(id) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/v1/bucket/${id}`, {
          method: "DELETE",
          headers: headers()
        });
        const json = await res.json();
        if (!res.ok) return { error: json.error ?? "Delete bucket failed" };
        return { error: null };
      } catch (err) {
        return { error: String(err) };
      }
    },
    async emptyBucket(id) {
      try {
        const res = await fetch(`${baseUrl}/api/storage/v1/bucket/${id}/empty`, {
          method: "POST",
          headers: headers()
        });
        const json = await res.json();
        if (!res.ok) return { error: json.error ?? "Empty bucket failed" };
        return { error: null };
      } catch (err) {
        return { error: String(err) };
      }
    }
  };
}
var RealtimeChannelImpl = class {
  constructor(baseUrl, apiKey, channelName) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.channelName = channelName;
    this.handlers = [];
    this.ws = null;
  }
  on(event, callback) {
    this.handlers.push({ event, callback });
    return this;
  }
  subscribe(callback) {
    if (typeof window === "undefined") return this;
    this.statusCallback = callback;
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    try {
      this.ws = new WebSocket(`${wsUrl}/api/realtime?channel=${encodeURIComponent(this.channelName)}&apikey=${this.apiKey}`);
      this.ws.onopen = () => {
        this.statusCallback?.("SUBSCRIBED");
      };
      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handlers.forEach(({ event: eventType, callback: callback2 }) => {
            if (eventType === "*" || eventType === payload.eventType) {
              callback2(payload);
            }
          });
        } catch {
        }
      };
      this.ws.onerror = () => {
        this.statusCallback?.("CHANNEL_ERROR");
      };
      this.ws.onclose = () => {
        this.statusCallback?.("CLOSED");
      };
    } catch {
      this.statusCallback?.("CHANNEL_ERROR");
    }
    return this;
  }
  unsubscribe() {
    this.ws?.close();
    this.ws = null;
  }
};
var channels = /* @__PURE__ */ new Set();
function createClient(url, key, options) {
  const baseUrl = url.replace(/\/$/, "");
  const cookieAdapter = options?.cookies;
  const makeQueryState = (table) => ({
    baseUrl,
    apiKey: key,
    table,
    columns: "*",
    selectOptions: {},
    filters: [],
    orFilters: [],
    notFilters: [],
    orderBy: [],
    operation: "select",
    customHeaders: options?.global?.headers,
    cookieAdapter
  });
  return {
    url: baseUrl,
    key,
    auth: createAuthClient(baseUrl, key, options, cookieAdapter),
    storage: createStorageClient(baseUrl, key, options),
    from(table) {
      return new QueryBuilderImpl(makeQueryState(table));
    },
    async rpc(fn, args, rpcOptions) {
      try {
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...options?.global?.headers
        };
        if (cookieAdapter) {
          const cookies = await cookieAdapter.getAll();
          const sessionCookie = cookies.find(
            (c) => c.name.startsWith("postbase-session") || c.name === "next-auth.session-token" || c.name === "__Secure-next-auth.session-token"
          );
          if (sessionCookie) headers["X-Postbase-Session"] = sessionCookie.value;
        }
        const res = await fetch(`${baseUrl}/api/rpc/${fn}`, {
          method: rpcOptions?.head ? "HEAD" : "POST",
          headers,
          body: JSON.stringify({ args: args ?? {}, count: rpcOptions?.count })
        });
        const json = await res.json();
        if (!res.ok) return { data: null, count: null, error: json.error ?? "RPC failed" };
        return { data: json.data, count: json.count ?? null, error: null };
      } catch (err) {
        return { data: null, count: null, error: String(err) };
      }
    },
    channel(name) {
      const ch = new RealtimeChannelImpl(baseUrl, key, name);
      channels.add(ch);
      return ch;
    },
    removeChannel(channel) {
      channel.unsubscribe();
      channels.delete(channel);
    },
    removeAllChannels() {
      channels.forEach((ch) => ch.unsubscribe());
      channels.clear();
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createClient
});
//# sourceMappingURL=index.js.map