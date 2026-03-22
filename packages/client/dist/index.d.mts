type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is" | "contains" | "overlaps" | "textSearch";
interface Filter {
    column: string;
    operator: FilterOperator;
    value: unknown;
}
interface QueryResult<T = Record<string, unknown>> {
    data: T[] | null;
    count: number | null;
    error: string | null;
}
interface SingleResult<T = Record<string, unknown>> {
    data: T | null;
    error: string | null;
}
interface AuthUser {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: boolean;
    phone?: string | null;
    role?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
}
interface Session {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    user: AuthUser;
}
interface AuthResponse {
    data: {
        user: AuthUser | null;
        session: Session | null;
    };
    error: string | null;
}
interface AuthClient {
    /** Sign up with email + password */
    signUp(options: {
        email: string;
        password: string;
        options?: {
            data?: Record<string, unknown>;
        };
    }): Promise<AuthResponse>;
    /** Sign in with email + password */
    signInWithPassword(options: {
        email: string;
        password: string;
    }): Promise<AuthResponse>;
    /** Send magic link / OTP to email */
    signInWithOtp(options: {
        email: string;
        options?: {
            redirectTo?: string;
        };
    }): Promise<{
        data: null;
        error: string | null;
    }>;
    /** Sign in with OAuth provider (browser redirect) */
    signInWithOAuth(options: {
        provider: string;
        options?: {
            redirectTo?: string;
            scopes?: string;
        };
    }): Promise<void>;
    /** Sign out the current user */
    signOut(): Promise<{
        error: string | null;
    }>;
    /** Get the current session (from cookie / storage) */
    getSession(): Promise<{
        data: {
            session: Session | null;
        };
        error: string | null;
    }>;
    /** Get the current user (server-verified) */
    getUser(jwt?: string): Promise<{
        data: {
            user: AuthUser | null;
        };
        error: string | null;
    }>;
    /** Refresh the session using a refresh token */
    refreshSession(refreshToken?: string): Promise<AuthResponse>;
    /** Listen to auth state changes (browser only) */
    onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
        data: {
            subscription: {
                unsubscribe: () => void;
            };
        };
    };
    /** Admin methods — require service role key */
    admin: AuthAdminClient;
}
type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";
interface AuthAdminClient {
    /** List all users (service role only) */
    listUsers(options?: {
        page?: number;
        perPage?: number;
    }): Promise<{
        data: {
            users: AuthUser[];
            total: number;
        } | null;
        error: string | null;
    }>;
    /** Get a user by id (service role only) */
    getUserById(id: string): Promise<{
        data: {
            user: AuthUser | null;
        };
        error: string | null;
    }>;
    /** Create a user (service role only) */
    createUser(options: {
        email: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
    }): Promise<{
        data: {
            user: AuthUser | null;
        };
        error: string | null;
    }>;
    /** Update a user (service role only) */
    updateUserById(id: string, attributes: {
        email?: string;
        password?: string;
        user_metadata?: Record<string, unknown>;
    }): Promise<{
        data: {
            user: AuthUser | null;
        };
        error: string | null;
    }>;
    /** Delete a user (service role only) */
    deleteUser(id: string): Promise<{
        data: null;
        error: string | null;
    }>;
}
interface SelectOptions {
    count?: "exact" | "planned" | "estimated";
    head?: boolean;
}
interface QueryBuilder<T = Record<string, unknown>> {
    /** Select columns. Pass '*' for all. */
    select(columns?: string, options?: SelectOptions): QueryBuilder<T>;
    /** Filter: column = value */
    eq(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column != value */
    neq(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column > value */
    gt(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column >= value */
    gte(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column < value */
    lt(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column <= value */
    lte(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column LIKE pattern */
    like(column: string, pattern: string): QueryBuilder<T>;
    /** Filter: column ILIKE pattern (case-insensitive) */
    ilike(column: string, pattern: string): QueryBuilder<T>;
    /** Filter: column IN (values) */
    in(column: string, values: unknown[]): QueryBuilder<T>;
    /** Filter: column IS NULL or IS NOT NULL */
    is(column: string, value: null | boolean): QueryBuilder<T>;
    /** Filter: column @> value (array/jsonb contains) */
    contains(column: string, value: unknown): QueryBuilder<T>;
    /** Filter: column && value (array overlaps) */
    overlaps(column: string, value: unknown[]): QueryBuilder<T>;
    /** Full-text search */
    textSearch(column: string, query: string, options?: {
        config?: string;
    }): QueryBuilder<T>;
    /** Combine filters with OR */
    or(filters: string): QueryBuilder<T>;
    /** Negate the next filter */
    not(column: string, operator: string, value: unknown): QueryBuilder<T>;
    /** Order results */
    order(column: string, options?: {
        ascending?: boolean;
        nullsFirst?: boolean;
    }): QueryBuilder<T>;
    /** Limit number of rows */
    limit(count: number): QueryBuilder<T>;
    /** Offset rows */
    offset(count: number): QueryBuilder<T>;
    /** Return a range of rows */
    range(from: number, to: number): QueryBuilder<T>;
    /** Execute and return a single row (error if not exactly one) */
    single(): Promise<SingleResult<T>>;
    /** Execute and return a single row or null */
    maybeSingle(): Promise<SingleResult<T>>;
    /** Execute as SELECT (thenable) */
    then: Promise<QueryResult<T>>["then"];
    /** Insert row(s) */
    insert(data: Partial<T> | Partial<T>[], options?: {
        returning?: string;
    }): InsertBuilder<T>;
    /** Upsert row(s) — insert or update on conflict */
    upsert(data: Partial<T> | Partial<T>[], options?: {
        onConflict?: string;
        returning?: string;
    }): InsertBuilder<T>;
    /** Update rows */
    update(data: Partial<T>): UpdateBuilder<T>;
    /** Delete rows */
    delete(): DeleteBuilder<T>;
}
interface InsertBuilder<T> {
    select(columns?: string): InsertBuilder<T>;
    single(): Promise<SingleResult<T>>;
    then: Promise<QueryResult<T>>["then"];
}
interface UpdateBuilder<T> {
    eq(column: string, value: unknown): UpdateBuilder<T>;
    neq(column: string, value: unknown): UpdateBuilder<T>;
    gt(column: string, value: unknown): UpdateBuilder<T>;
    gte(column: string, value: unknown): UpdateBuilder<T>;
    lt(column: string, value: unknown): UpdateBuilder<T>;
    lte(column: string, value: unknown): UpdateBuilder<T>;
    in(column: string, values: unknown[]): UpdateBuilder<T>;
    select(columns?: string): UpdateBuilder<T>;
    single(): Promise<SingleResult<T>>;
    then: Promise<QueryResult<T>>["then"];
}
interface DeleteBuilder<T> {
    eq(column: string, value: unknown): DeleteBuilder<T>;
    neq(column: string, value: unknown): DeleteBuilder<T>;
    gt(column: string, value: unknown): DeleteBuilder<T>;
    gte(column: string, value: unknown): DeleteBuilder<T>;
    lt(column: string, value: unknown): DeleteBuilder<T>;
    lte(column: string, value: unknown): DeleteBuilder<T>;
    in(column: string, values: unknown[]): DeleteBuilder<T>;
    select(columns?: string): DeleteBuilder<T>;
    single(): Promise<SingleResult<T>>;
    then: Promise<QueryResult<T>>["then"];
}
interface StorageObject {
    name: string;
    size: number;
    contentType: string;
    updatedAt: string;
    createdAt: string;
}
interface Bucket {
    id: string;
    name: string;
    public: boolean;
    fileSizeLimit?: number;
    allowedMimeTypes?: string[];
    createdAt: string;
    updatedAt: string;
}
interface StorageBucketClient {
    upload(path: string, file: File | Blob | Buffer | ArrayBuffer, options?: {
        contentType?: string;
        upsert?: boolean;
        cacheControl?: string;
    }): Promise<SingleResult<{
        path: string;
        fullPath: string;
    }>>;
    download(path: string): Promise<{
        data: Blob | null;
        error: string | null;
    }>;
    remove(paths: string[]): Promise<QueryResult<{
        name: string;
    }>>;
    list(prefix?: string, options?: {
        limit?: number;
        offset?: number;
        sortBy?: {
            column: string;
            order?: "asc" | "desc";
        };
    }): Promise<QueryResult<StorageObject>>;
    getPublicUrl(path: string): {
        data: {
            publicUrl: string;
        };
    };
    createSignedUrl(path: string, expiresIn: number): Promise<SingleResult<{
        signedUrl: string;
    }>>;
    move(fromPath: string, toPath: string): Promise<{
        error: string | null;
    }>;
    copy(fromPath: string, toPath: string): Promise<SingleResult<{
        path: string;
    }>>;
}
interface StorageClient {
    from(bucket: string): StorageBucketClient;
    createBucket(name: string, options?: {
        public?: boolean;
        fileSizeLimit?: number;
        allowedMimeTypes?: string[];
    }): Promise<SingleResult<Bucket>>;
    getBucket(id: string): Promise<SingleResult<Bucket>>;
    listBuckets(): Promise<QueryResult<Bucket>>;
    updateBucket(id: string, options: {
        public?: boolean;
        fileSizeLimit?: number;
        allowedMimeTypes?: string[];
    }): Promise<SingleResult<Bucket>>;
    deleteBucket(id: string): Promise<{
        error: string | null;
    }>;
    emptyBucket(id: string): Promise<{
        error: string | null;
    }>;
}
interface RpcOptions {
    head?: boolean;
    count?: "exact" | "planned" | "estimated";
}
type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";
interface RealtimePayload<T = Record<string, unknown>> {
    eventType: RealtimeEvent;
    new: T | null;
    old: T | null;
    schema: string;
    table: string;
    commitTimestamp: string;
}
interface RealtimeChannel {
    on<T = Record<string, unknown>>(event: RealtimeEvent, callback: (payload: RealtimePayload<T>) => void): RealtimeChannel;
    subscribe(callback?: (status: "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR") => void): RealtimeChannel;
    unsubscribe(): void;
}
interface PostbaseClientOptions {
    auth?: {
        persistSession?: boolean;
        autoRefreshToken?: boolean;
        detectSessionInUrl?: boolean;
        storageKey?: string;
    };
    global?: {
        headers?: Record<string, string>;
        fetch?: typeof fetch;
    };
    cookies?: CookieAdapter;
}
interface CookieAdapter {
    getAll(): Array<{
        name: string;
        value: string;
    }> | Promise<Array<{
        name: string;
        value: string;
    }>>;
    setAll(cookies: Array<{
        name: string;
        value: string;
        options?: Record<string, unknown>;
    }>): void | Promise<void>;
}
interface PostbaseClient {
    auth: AuthClient;
    from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
    storage: StorageClient;
    rpc<T = Record<string, unknown>>(fn: string, args?: Record<string, unknown>, options?: RpcOptions): Promise<QueryResult<T>>;
    channel(name: string): RealtimeChannel;
    removeChannel(channel: RealtimeChannel): void;
    removeAllChannels(): void;
    /** The raw base URL */
    url: string;
    /** The API key in use */
    key: string;
}

declare function createClient(url: string, key: string, options?: PostbaseClientOptions): PostbaseClient;

export { type AuthAdminClient, type AuthChangeEvent, type AuthClient, type AuthResponse, type AuthUser, type Bucket, type CookieAdapter, type Filter, type FilterOperator, type PostbaseClient, type PostbaseClientOptions, type QueryBuilder, type QueryResult, type RealtimeChannel, type RealtimeEvent, type RealtimePayload, type Session, type SingleResult, type StorageBucketClient, type StorageClient, type StorageObject, createClient };
