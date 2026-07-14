import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const DEMO_USERS = [
  { username: "blazeitplays", email: "blaze@example.com", bio: "FPS mains and midnight snacks. 420-friendly, always." },
  { username: "couchlocked", email: "couch@example.com", bio: "Couch co-op, cozy games, and heavy indica energy." },
  { username: "sativa_speedruns", email: "sativa@example.com", bio: "Speedruns, but make them chill. PBs and pre-rolls." },
] as const;

const DEMO_VIDEOS = [
  {
    username: "blazeitplays",
    title: "Blazed & Confused: Elden Ring blind run pt. 1",
    description: "First time in the Lands Between. Took a fat rip and immediately died to the tutorial boss. It gets better. Probably.",
    category: "High-Score RPGs",
    views: 420,
  },
  {
    username: "couchlocked",
    title: "Couch co-op night: Overcooked 2 chaos with the crew",
    description: "Four controllers, one kitchen, zero coordination. The onions did not survive.",
    category: "Couch Co-op & Chill",
    views: 137,
  },
  {
    username: "sativa_speedruns",
    title: "Sesh & speedrun: Celeste any% attempts (new PB!)",
    description: "Chapter 3 splits were smooth as butter tonight. Strawberry count: irrelevant. Vibe count: maximum.",
    category: "Speedruns & Sesh",
    views: 89,
  },
  {
    username: "blazeitplays",
    title: "Retro rips: beating Doom 1993 on Ultra-Violence",
    description: "Classic Doom, classic strain, classic Saturday.",
    category: "Retro Rips",
    views: 256,
  },
] as const;

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function generateSampleVideo(outPath: string, label: number) {
  // 5s test-pattern clip; tiny and universally playable (H.264 + AAC).
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f", "lavfi", "-i", `testsrc=duration=5:size=640x360:rate=24`,
      "-f", "lavfi", "-i", `sine=frequency=${200 + label * 60}:duration=5`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
      "-c:a", "aac", "-shortest",
      outPath,
    ],
    { stdio: "ignore" }
  );
}

async function main() {
  const passwordHash = await bcrypt.hash("password420", 10);

  const users: Record<string, { id: string }> = {};
  for (const demo of DEMO_USERS) {
    users[demo.username] = await db.user.upsert({
      where: { username: demo.username },
      update: {},
      create: { ...demo, passwordHash },
    });
  }
  console.log(`Seeded ${DEMO_USERS.length} users (password: password420)`);

  // Cross-subscriptions between the demo users.
  const names = DEMO_USERS.map((u) => u.username);
  for (const a of names) {
    for (const b of names) {
      if (a === b) continue;
      await db.subscription.upsert({
        where: {
          subscriberId_channelId: {
            subscriberId: users[a].id,
            channelId: users[b].id,
          },
        },
        update: {},
        create: { subscriberId: users[a].id, channelId: users[b].id },
      });
    }
  }

  if (!hasFfmpeg()) {
    console.log(
      "ffmpeg not found — skipping sample videos. Sign in as a demo user and upload one to fill the feed."
    );
    return;
  }

  fs.mkdirSync(path.join(UPLOAD_DIR, "videos"), { recursive: true });

  let index = 0;
  for (const demo of DEMO_VIDEOS) {
    index += 1;
    const existing = await db.video.findFirst({ where: { title: demo.title } });
    if (existing) continue;

    const video = await db.video.create({
      data: {
        title: demo.title,
        description: demo.description,
        category: demo.category,
        views: demo.views,
        userId: users[demo.username].id,
      },
    });

    const filePath = `videos/${video.id}.mp4`;
    generateSampleVideo(path.join(UPLOAD_DIR, filePath), index);
    await db.video.update({ where: { id: video.id }, data: { filePath } });

    // A few cross-user likes and comments so the pages aren't bare.
    for (const name of names.filter((n) => n !== demo.username)) {
      await db.videoLike.upsert({
        where: {
          userId_videoId: { userId: users[name].id, videoId: video.id },
        },
        update: {},
        create: { userId: users[name].id, videoId: video.id },
      });
    }
    await db.comment.create({
      data: {
        content: "Certified sesh classic. 🌿",
        userId: users[names.find((n) => n !== demo.username)!].id,
        videoId: video.id,
      },
    });
  }
  console.log(`Seeded ${DEMO_VIDEOS.length} sample videos with likes/comments`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
