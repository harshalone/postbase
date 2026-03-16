export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "in"
  | "is";

export interface Filter {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

export interface QueryResult<T = Record<string, unknown>> {
  data: T[] | null;
  count: number | null;
  error: string | null;
}

export interface SingleResult<T = Record<string, unknown>> {
  data: T | null;
  error: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

export interface Session {
  user: AuthUser;
  expires: string;
}

export interface AuthClient {
  /** Sign in with a provider */
  signIn(provider: string, options?: { callbackUrl?: string }): Promise<void>;
  /** Sign out */
  signOut(options?: { callbackUrl?: string }): Promise<void>;
  /** Sign up with email + password */
  signUp(email: string, password: string): Promise<SingleResult<AuthUser>>;
  /** Get the current session */
  getSession(): Promise<Session | null>;
  /** Listen to auth state changes */
  onAuthStateChange(callback: (session: Session | null) => void): () => void;
}

export interface QueryBuilder<T = Record<string, unknown>> {
  select(...columns: string[]): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  neq(column: string, value: unknown): QueryBuilder<T>;
  gt(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  is(column: string, value: null | "not null"): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  /** Execute as SELECT */
  then: Promise<QueryResult<T>>["then"];
  /** Insert rows */
  insert(data: Partial<T>): InsertBuilder<T>;
  /** Update rows */
  update(data: Partial<T>): UpdateBuilder<T>;
  /** Delete rows */
  delete(): DeleteBuilder<T>;
}

export interface InsertBuilder<T> {
  returning(...columns: string[]): Promise<QueryResult<T>>;
  then: Promise<QueryResult<T>>["then"];
}

export interface UpdateBuilder<T> {
  eq(column: string, value: unknown): UpdateBuilder<T>;
  returning(...columns: string[]): Promise<QueryResult<T>>;
  then: Promise<QueryResult<T>>["then"];
}

export interface DeleteBuilder<T> {
  eq(column: string, value: unknown): DeleteBuilder<T>;
  returning(...columns: string[]): Promise<QueryResult<T>>;
  then: Promise<QueryResult<T>>["then"];
}

export interface StorageBucketClient {
  upload(path: string, file: File | Blob | Buffer, options?: { contentType?: string; upsert?: boolean }): Promise<SingleResult<{ path: string }>>;
  download(path: string): Promise<{ data: Blob | null; error: string | null }>;
  remove(paths: string[]): Promise<QueryResult>;
  list(prefix?: string): Promise<QueryResult<{ name: string; size: number; updatedAt: string }>>;
  getPublicUrl(path: string): string;
}

export interface StorageClient {
  from(bucket: string): StorageBucketClient;
  createBucket(name: string, options?: { public?: boolean }): Promise<SingleResult<{ name: string }>>;
  listBuckets(): Promise<QueryResult<{ id: string; name: string; public: boolean }>>;
}

export interface PostbaseClient {
  auth: AuthClient;
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  storage: StorageClient;
  /** The raw base URL of the postbase instance */
  url: string;
  /** The API key in use */
  key: string;
}
