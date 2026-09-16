import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppNotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nothing here</h1>
      <p className="text-sm text-muted-foreground">That slug is not in the curriculum registry (or it was retired).</p>
      <Button asChild variant="outline">
        <Link href="/world">Back to the world map</Link>
      </Button>
    </div>
  );
}
