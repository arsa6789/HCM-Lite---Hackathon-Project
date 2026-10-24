import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import connectDB from "@/app/lib/db";
import User from "@/app/models/User";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

export async function POST(request) {
  try {
    if (!JWT_SECRET) {
      console.error("JWT_SECRET is not defined in environment variables");
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    // 1. Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // 2. Connect and find the user
    await connectDB();
    const user = await User.findOne({ email });

    // Same message for "no user" and "wrong password" so attackers
    // can't discover which emails are registered.
    const invalidMessage = "Invalid email or password.";

    if (!user) {
      return NextResponse.json({ error: invalidMessage }, { status: 401 });
    }

    // 3. Compare the password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: invalidMessage }, { status: 401 });
    }

    // 4. Create the JWT
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: TOKEN_MAX_AGE }
    );

    // 5. Send the response and set a secure cookie
    const response = NextResponse.json(
      {
        message: "Logged in successfully!",
        token,
        user: { id: user._id, email: user.email },
      },
      { status: 200 }
    );

    response.cookies.set("token", token, {
      httpOnly: true, // JavaScript in the browser cannot read it (protects against XSS)
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "lax", // helps protect against CSRF
      path: "/",
      maxAge: TOKEN_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
