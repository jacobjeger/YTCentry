-- Remember each reader's password scheme. Probing costs a failed login attempt
-- and the readers lock out after three, so a door whose scheme is discovered by
-- trial must never be re-discovered on every connection.
ALTER TABLE "Device" ADD COLUMN "loginScheme" TEXT;
