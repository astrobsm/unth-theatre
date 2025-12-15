import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum([
    'ADMIN',
    'SYSTEM_ADMINISTRATOR',
    'THEATRE_MANAGER',
    'THEATRE_CHAIRMAN',
    'SURGEON',
    'ANAESTHETIST',
    'SCRUB_NURSE',
    'RECOVERY_ROOM_NURSE',
    'THEATRE_STORE_KEEPER',
    'PORTER',
    'ANAESTHETIC_TECHNICIAN',
    'BIOMEDICAL_ENGINEER',
    'CLEANER',
    'PROCUREMENT_OFFICER'
  ]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Registration attempt:', { username: body.username, role: body.role });
    
    const validatedData = registerSchema.parse(body);

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: validatedData.username }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 }
      );
    }

    // Check if email already exists (if provided)
    if (validatedData.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      if (existingEmail) {
        return NextResponse.json(
          { error: "Email already exists" },
          { status: 400 }
        );
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: validatedData.username,
        email: validatedData.email || null,
        password: hashedPassword,
        fullName: validatedData.fullName,
        role: validatedData.role,
        status: 'PENDING', // Requires admin approval
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        status: true,
      }
    });

    return NextResponse.json({
      message: "Registration successful. Awaiting admin approval.",
      user
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return NextResponse.json(
        { error: "Invalid input data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
