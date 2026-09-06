# Deploy Postbase to Cloud Run

This walks through provisioning a Cloud SQL Postgres instance and deploying Postbase to Cloud Run. It takes about 10 minutes — most of that is Cloud SQL instance creation.

## 1. Confirm your project

```sh
gcloud config get-value project
```

If this is empty or wrong:

```sh
gcloud config set project YOUR_PROJECT_ID
```

## 2. Run the setup script

```sh
chmod +x gcp/setup.sh
./gcp/setup.sh us-central1
```

This will:

- Enable the Cloud Run, Cloud Build, Artifact Registry, Cloud SQL, and Secret Manager APIs
- Create an Artifact Registry Docker repo
- Create a Cloud SQL for PostgreSQL 16 instance, database, and user
- Generate `AUTH_SECRET` and store it (plus the database connection string) in Secret Manager
- Build `Dockerfile.railway` and deploy it to Cloud Run, wired to Cloud SQL via the Cloud SQL Auth Proxy

## 3. Open your app

The script prints the Cloud Run URL when it finishes. Open it and finish setup from the Postbase dashboard.

## Redeploying after a code change

```sh
gcloud builds submit --config=gcp/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE=postbase,_REPO=postbase,_INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe postbase-db --format='value(connectionName)') \
  .
```

See [GCP.md](../GCP.md) for the full reference.
