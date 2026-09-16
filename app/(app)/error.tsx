'use client';

// Shell-level boundary: the nav stays, the stack never shows. A submitted attempt is already committed by
// record_attempt before any render runs, so retrying loses nothing.
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('app segment error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="space-y-4" role="alert">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="text-sm text-muted-foreground">
        Your progress is safe. If this keeps happening the database may be paused after a week of inactivity — opening
        it once in the Supabase dashboard wakes it.
      </p>
      <Button onClick={reset}>Try again</Button>
      {error.digest ? <p className="text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
    </div>
  );
}
