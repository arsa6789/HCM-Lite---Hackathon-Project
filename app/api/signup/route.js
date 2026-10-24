import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/app/lib/db";
import User from "@/app/models/User";

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export async function POST(request) {
  try {
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

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    // 2. Connect to the database
    await connectDB();

    // 3. Check for an existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // 4. Hash the password (12 salt rounds is a good balance of speed and security)
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5. Create the user
    const user = await User.create({ email, password: hashedPassword });

    return NextResponse.json(
      {
        message: "Account created successfully! You can now log in.",
        user: { id: user._id, email: user.email },
      },
      { status: 201 }
    );
  } catch (error) {
    // Duplicate key error (race condition: two signups at the same time)
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
