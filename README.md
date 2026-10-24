# Hackathon Auth Starter

Next.js (App Router) + Tailwind CSS + MongoDB (Mongoose) + bcryptjs + JWT cookie auth.
Single repo, frontend and backend together.

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your env file (either `.env` or `.env.local` works):

   ```bash
   cp .env.example .env
   ```

3. Open `.env` and fill in:

   - `MONGODB_URI`: your MongoDB Atlas connection string (free M0 tier is enough).
     In Atlas, add a database user and allow your IP under Network Access.
   - `JWT_SECRET`: generate one with:

     ```bash
     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
     ```

4. Run it:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000, sign up, then log in.

## Project structure

```text
.
├── app/
│   ├── api/
│   │   ├── login/route.js     POST /api/login  (verify password, issue JWT cookie)
│   │   └── signup/route.js    POST /api/signup (validate, hash password, save user)
│   ├── lib/db.js              Cached Mongoose connection
│   ├── models/User.js         User schema (email + hashed password)
│   ├── globals.css            Tailwind directives
│   ├── layout.js              Root layout + metadata
│   └── page.js                Login / Signup UI
├── .env.example
├── next.config.mjs
├── postcss.config.mjs
├── tailwind.config.js
├── jsconfig.json
└── package.json
```

## Notes

- Passwords are hashed with bcrypt (12 rounds) and never stored in plain text.
- The JWT is stored in an httpOnly cookie named `token` (secure flag on in production).
- The login page also displays the token so you can see it while developing.
  Remove that in a real app.
- `dotenv` and `cors` are not needed: Next.js loads env files itself, and the
  frontend and API share one origin. `crypto` is built into Node.js.
- Never commit `.env`. It is already in `.gitignore`.

## Ideas for next steps

- `app/api/me/route.js`: read the cookie, `jwt.verify`, return the current user
- `app/api/logout/route.js`: clear the cookie (`maxAge: 0`)
- `middleware.js`: protect pages like `/dashboard`
- Rate limiting on `/api/login`
