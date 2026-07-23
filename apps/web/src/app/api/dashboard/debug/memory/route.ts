import { auth } from "@/lib/auth/admin";
import { _debugPoolCacheSize } from "@/lib/project-db";
import { _debugTaskCount, _debugRunningJobCount } from "@/lib/scheduler";

export async function GET() {
  const session = await auth();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mem = process.memoryUsage();

  return Response.json({
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
      arrayBuffersMb: Math.round(mem.arrayBuffers / 1024 / 1024),
    },
    inMemoryState: {
      projectPoolCacheSize: _debugPoolCacheSize(),
      scheduledCronTaskCount: _debugTaskCount(),
      runningCronJobCount: _debugRunningJobCount(),
    },
  });
}
