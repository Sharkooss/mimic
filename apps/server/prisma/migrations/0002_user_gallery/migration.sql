-- CreateTable
CREATE TABLE "UserArtwork" (
    "userId" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "timesPlayed" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserArtwork_pkey" PRIMARY KEY ("userId","artworkId")
);

-- CreateIndex
CREATE INDEX "UserArtwork_userId_idx" ON "UserArtwork"("userId");

-- AddForeignKey
ALTER TABLE "UserArtwork" ADD CONSTRAINT "UserArtwork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArtwork" ADD CONSTRAINT "UserArtwork_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
