FROM postgres:16

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    postgresql-server-dev-16 \
    && rm -rf /var/lib/apt/lists/*

# Install pg_cron from official repo
RUN curl -sSL https://install.citusdata.com/community/deb.sh | bash \
    && apt-get install -y postgresql-16-cron \
    && rm -rf /var/lib/apt/lists/*

# Install pgmq from Tembo apt repo
RUN curl -sSL https://pgt.e43.eu/keys/server.asc | gpg --dearmor -o /usr/share/keyrings/pgt.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgt.gpg] https://pgt.e43.eu/ $(lsb_release -cs) main" \
       > /etc/apt/sources.list.d/pgt.list \
    && apt-get update && apt-get install -y postgresql-16-pgmq \
    && rm -rf /var/lib/apt/lists/*

# Enable pg_cron (must be in shared_preload_libraries)
RUN echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample \
    && echo "cron.database_name = 'postbase'" >> /usr/share/postgresql/postgresql.conf.sample
