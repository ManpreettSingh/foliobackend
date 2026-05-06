# Folio Backend

This is the backend service for the Folio platform, built with Node.js, Express, and Prisma (PostgreSQL).

## Deployment on Railway

1. Push this code to your GitHub repository.
2. In Railway, click **New Project** → **Deploy from GitHub repo** and select this repository.
3. Add the following Environment Variables in Railway:
   - `DATABASE_URL`: Your PostgreSQL connection string.
   - `JWT_SECRET`: A strong secret key for token signing.
   - `PORT`: (Auto-assigned by Railway, optional).
4. Set the Start Command (if not automatically detected) to `npm run start`.
5. Ensure your build/deploy process runs `npx prisma db push` or `npx prisma migrate deploy` to sync the database schema.
