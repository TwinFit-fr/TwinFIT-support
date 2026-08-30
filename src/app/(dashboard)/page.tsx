import Link from "next/link";
import { Card } from "@/components/ui/primitives";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operations dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          User support, exercise catalog administration, and Lab dataset ops.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <h2 className="font-medium">User support</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Look up accounts by email or @username, review subscription and activity,
            run admin actions.
          </p>
          <Link href="/support" className="mt-4 inline-block text-sm font-medium underline">
            Open support
          </Link>
        </Card>
        <Card>
          <h2 className="font-medium">Exercise catalog</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Browse, create, edit, and deactivate system catalog exercises and manage
            taxonomy lookups.
          </p>
          <Link href="/catalog" className="mt-4 inline-block text-sm font-medium underline">
            Open catalog
          </Link>
        </Card>
        <Card>
          <h2 className="font-medium">Lab dataset</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Review labelled capture stats, browse sets, manage the exercise pool for TwinFIT-Lab,
            and link catalog exercises to the sensor dataset.
          </p>
          <Link href="/lab" className="mt-4 inline-block text-sm font-medium underline">
            Open lab
          </Link>
        </Card>
      </div>
    </div>
  );
}
