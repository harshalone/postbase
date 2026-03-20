FROM postgres:18.3

# Install build dependencies and pg_cron
RUN apt-get update && apt-get install -y \
    build-essential \
    postgresql-server-dev-18 \
    libssl-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pg_cron
RUN cd /tmp \
    && git clone --depth 1 --branch v1.6.7 https://github.com/citusdata/pg_cron.git \
    && cd pg_cron \
    && make && make install \
    && cd /tmp && rm -rf pg_cron

# Install pgmq (Makefile lives in pgmq-extension/ subdirectory since v1.4.x)
RUN cd /tmp \
    && git clone --depth 1 --branch v1.11.0 https://github.com/pgmq/pgmq.git \
    && cd pgmq/pgmq-extension \
    && make && make install \
    && cd /tmp && rm -rf pgmq

# Enable pg_cron via shared_preload_libraries
RUN echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample \
    && echo "cron.database_name = 'postbase'" >> /usr/share/postgresql/postgresql.conf.sample
