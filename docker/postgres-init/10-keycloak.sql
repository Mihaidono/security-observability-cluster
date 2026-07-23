DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') THEN
    CREATE ROLE keycloak LOGIN PASSWORD 'keycloak-dev-password-change-me';
  ELSE
    ALTER ROLE keycloak WITH LOGIN PASSWORD 'keycloak-dev-password-change-me';
  END IF;
END
$$;

SELECT 'CREATE DATABASE keycloak OWNER keycloak'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak')
\gexec

ALTER DATABASE keycloak OWNER TO keycloak;
