-- Keep every image an email carried, not just the first one. A signature logo
-- travels in `attachments` exactly like a real photo, so staff pick which is
-- the person; the chosen key is swapped into "imagePath".
ALTER TABLE "PhotoSubmission" ADD COLUMN "altImagePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
