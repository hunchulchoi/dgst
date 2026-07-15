-- Prisma's PostgreSQL driver adapter must read timestamptz values in UTC. With an Asia/Seoul
-- database session it interpreted an already-correct instant as a UTC wall-clock value, adding
-- nine hours again in application responses.

ALTER DATABASE "dgstdb" SET timezone TO 'UTC';
