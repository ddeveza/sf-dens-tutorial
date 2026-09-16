'use client';

// Last resort: the root layout itself failed, so there is no shell, no Tailwind guarantee and no shadcn. Inline
// styles only. `digest` is the server-side correlation id; the message never reaches the page.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '3rem 1.5rem' }}>
        <main style={{ maxWidth: '32rem', margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something broke</h1>
          <p style={{ color: '#52525b', marginBottom: '1.5rem' }}>
            The page could not be rendered. Your last answer was saved before the screen failed.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ border: '1px solid #d4d4d8', borderRadius: '0.5rem', padding: '0.5rem 1rem', background: '#fff', cursor: 'pointer' }}
          >
            Reload
          </button>
          {error.digest ? <p style={{ color: '#a1a1aa', fontSize: '0.75rem', marginTop: '1.5rem' }}>Reference: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
