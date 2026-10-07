FROM postgres:15-alpine

COPY init.sql /docker-entrypoint-initdb.d/

ENV POSTGRES_DB=bankdb
ENV POSTGRES_USER=bankuser
ENV POSTGRES_PASSWORD=bankpass
