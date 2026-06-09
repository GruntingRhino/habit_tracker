import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const XP_PER_LEVEL = 100;
const MOOD_DECAY_HOURS = 6;

function calculateLevel(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function calculateMood(lastFed: Date): string {
  const hoursSinceFed = (Date.now() - lastFed.getTime()) / (1000 * 60 * 60);
  if (hoursSinceFed > MOOD_DECAY_HOURS * 2) return "sleepy";
  if (hoursSinceFed > MOOD_DECAY_HOURS) return "hungry";
  return "happy";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  let pet = await prisma.userPet.findUnique({
    where: { userId },
  });

  if (!pet) {
    pet = await prisma.userPet.create({
      data: {
        userId,
        name: "Buddy",
        species: "cat",
        xp: 0,
        level: 1,
        mood: "happy",
      },
    });
  }

  const mood = calculateMood(pet.lastFed);

  return NextResponse.json({
    ...pet,
    mood,
    xpToNextLevel: XP_PER_LEVEL - (pet.xp % XP_PER_LEVEL),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, name, species } = await request.json();
  const userId = session.user.id;

  const pet = await prisma.userPet.findUnique({
    where: { userId },
  });

  if (!pet) {
    if (action === "create") {
      const newPet = await prisma.userPet.create({
        data: {
          userId,
          name: name || "Buddy",
          species: species || "cat",
          xp: 0,
          level: 1,
          mood: "happy",
        },
      });
      return NextResponse.json(newPet);
    }
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  switch (action) {
    case "feed":
      const fedPet = await prisma.userPet.update({
        where: { userId },
        data: {
          lastFed: new Date(),
          mood: "happy",
        },
      });
      return NextResponse.json(fedPet);

    case "add-xp": {
      const { amount } = await request.json();
      const newXP = pet.xp + (amount || 10);
      const newLevel = calculateLevel(newXP);
      const leveledUp = newLevel > pet.level;

      const updatedPet = await prisma.userPet.update({
        where: { userId },
        data: {
          xp: newXP,
          level: newLevel,
          mood: leveledUp ? "excited" : pet.mood,
        },
      });
      return NextResponse.json({ ...updatedPet, leveledUp });
    }

    case "rename": {
      const { name: newName } = await request.json();
      const renamedPet = await prisma.userPet.update({
        where: { userId },
        data: { name: newName },
      });
      return NextResponse.json(renamedPet);
    }

    case "change-species": {
      const { species: newSpecies } = await request.json();
      const speciesPet = await prisma.userPet.update({
        where: { userId },
        data: { species: newSpecies },
      });
      return NextResponse.json(speciesPet);
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
