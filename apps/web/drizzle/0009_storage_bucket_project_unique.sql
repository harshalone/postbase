-- Bucket names were only unique in practice, never enforced — two projects
-- could both create a public bucket named e.g. "lonare". The public,
-- unauthenticated object-serving route matched buckets by name only, so it
-- could resolve to the wrong project's bucket and 404 on objects that
-- actually exist. This constraint makes that collision impossible going
-- forward; the app-level query in the public route was also fixed to join
-- through storage_objects so it can no longer cross projects even for
-- pre-existing duplicate names.
CREATE UNIQUE INDEX IF NOT EXISTS "storage_buckets_project_name_idx" ON "_postbase"."storage_buckets" ("project_id", "name");
